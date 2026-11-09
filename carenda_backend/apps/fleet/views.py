import calendar
import re
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Prefetch, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.excel import (
    generate_single_contract_excel_report,
    generate_tenant_excel_report,
)
from apps.fleet.models import Car, Contract, Driver, Payment, normalize_phone
from apps.fleet.serializers import (
    CalculateContractSerializer,
    CarCreateUpdateSerializer,
    CarDetailSerializer,
    CarListSerializer,
    CloseContractSerializer,
    ContractCreateSerializer,
    ContractDetailSerializer,
    ContractSummarySerializer,
    DriverSerializer,
    PaymentSerializer,
    RecordPaymentSerializer,
)
from apps.fleet.services import (
    calculate_contract_totals,
    close_contract_service,
    create_car_service,
    create_contract_service,
    invalidate_tenant_cache,
    postpone_contract_payments_service,
    record_payment_service,
)
from apps.users.models import User, UserSetting
from apps.users.serializers import UserMeSerializer


class IsArendator(BasePermission):
    """Allows access only to Arendator owners or superadmins (blocks user drivers)."""
    message = "Ushbu amalni bajarish uchun sizda arendator huquqi yo'q."

    def has_permission(self, request, view):
        role = (getattr(request.user, "role", "") or "").lower()
        return bool(
            request.user
            and request.user.is_authenticated
            and role in (User.RoleChoices.ARENDATOR, "owner", User.RoleChoices.SUPERADMIN)
        )


def get_dashboard_data_for_owner(owner, today=None):
    if today is None:
        today = timezone.localdate()
    cache_key = f"tenant_dashboard:{owner.id}:{today.isoformat()}"
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    car_stats = owner.cars.aggregate(
        total=Count("id"),
        available=Count("id", filter=Q(status=Car.Status.AVAILABLE)),
        rented=Count("id", filter=Q(status=Car.Status.RENTED)),
        maintenance=Count("id", filter=Q(status=Car.Status.MAINTENANCE)),
    )
    total_cars = car_stats["total"] or 0
    available_cars = car_stats["available"] or 0
    rented_cars = car_stats["rented"] or 0
    maintenance_cars = car_stats["maintenance"] or 0

    # Contract stats
    contract_stats = Contract.objects.filter(owner=owner).aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        completed=Count("id", filter=Q(is_active=False)),
    )
    total_contracts_count = contract_stats["total"] or 0
    active_contracts_count = contract_stats["active"] or 0
    completed_contracts_count = contract_stats["completed"] or 0

    # Financial totals across active contracts
    active_payments = Payment.objects.filter(
        contract__owner=owner, contract__is_active=True
    )
    sums = active_payments.aggregate(
        expected=Sum("expected_amount"), paid=Sum("paid_amount")
    )
    total_expected_usd = sums["expected"] or Decimal("0.00")
    total_collected_usd = sums["paid"] or Decimal("0.00")
    total_remaining_usd = max(
        Decimal("0.00"), total_expected_usd - total_collected_usd
    )

    # Current Calendar Month stats (start of month to end of month)
    start_of_month = date(today.year, today.month, 1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    end_of_month = date(today.year, today.month, last_day)

    month_payments = active_payments.filter(
        due_date__gte=start_of_month, due_date__lte=end_of_month
    )
    month_sums = month_payments.aggregate(
        expected=Sum("expected_amount"), paid=Sum("paid_amount")
    )
    this_month_expected_usd = month_sums["expected"] or Decimal("0.00")
    this_month_collected_usd = month_sums["paid"] or Decimal("0.00")
    this_month_remaining_usd = max(
        Decimal("0.00"), this_month_expected_usd - this_month_collected_usd
    )

    if this_month_expected_usd > Decimal("0.00"):
        collection_rate = float(
            min(Decimal("100.0"), (this_month_collected_usd / this_month_expected_usd) * Decimal("100.0"))
        )
    else:
        collection_rate = 100.0 if this_month_collected_usd > Decimal("0.00") else 0.0

    # Overdue payments (due_date <= today and not fully paid)
    overdue_qs = (
        Payment.objects.filter(
            contract__owner=owner,
            contract__is_active=True,
            status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
            due_date__lte=today,
        )
        .select_related("contract__car", "contract__driver")
        .order_by("due_date")
    )

    total_overdue_usd = Decimal("0.00")
    overdue_payments_data = []
    for p in overdue_qs:
        rem = p.remaining_amount
        total_overdue_usd += rem
        days_overdue = (today - p.due_date).days
        has_prior_unpaid = Payment.objects.filter(
            contract_id=p.contract_id,
            month_number__lt=p.month_number,
        ).exclude(status=Payment.Status.PAID).exists()
        overdue_payments_data.append(
            {
                "id": p.id,
                "contract_id": p.contract_id,
                "month_number": p.month_number,
                "car_name": p.contract.car.name,
                "plate_number": p.contract.car.plate_number,
                "driver_name": p.contract.driver.full_name,
                "driver_phone": p.contract.driver.phone,
                "due_date": str(p.due_date),
                "expected_amount": f"{p.expected_amount:.2f}",
                "paid_amount": f"{p.paid_amount:.2f}",
                "remaining_amount": f"{rem:.2f}",
                "days_overdue": max(0, days_overdue),
                "comment": p.comment or "",
                "can_pay": not has_prior_unpaid,
                "is_postponed": bool(p.is_postponed or "[1 oyga surildi]" in (p.comment or "")),
            }
        )

    # Upcoming payments (due_date > today and due_date <= today + 7 days)
    next_7_days = today + timedelta(days=7)
    upcoming_qs = (
        Payment.objects.filter(
            contract__owner=owner,
            contract__is_active=True,
            status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
            due_date__gt=today,
            due_date__lte=next_7_days,
        )
        .select_related("contract__car", "contract__driver")
        .order_by("due_date")
    )

    total_upcoming_usd = Decimal("0.00")
    upcoming_payments_data = []
    for p in upcoming_qs:
        rem = p.remaining_amount
        total_upcoming_usd += rem
        days_until_due = (p.due_date - today).days
        has_prior_unpaid = Payment.objects.filter(
            contract_id=p.contract_id,
            month_number__lt=p.month_number,
        ).exclude(status=Payment.Status.PAID).exists()
        upcoming_payments_data.append(
            {
                "id": p.id,
                "contract_id": p.contract_id,
                "month_number": p.month_number,
                "car_name": p.contract.car.name,
                "plate_number": p.contract.car.plate_number,
                "driver_name": p.contract.driver.full_name,
                "driver_phone": p.contract.driver.phone,
                "due_date": str(p.due_date),
                "expected_amount": f"{p.expected_amount:.2f}",
                "paid_amount": f"{p.paid_amount:.2f}",
                "remaining_amount": f"{rem:.2f}",
                "days_until_due": days_until_due,
                "comment": p.comment or "",
                "can_pay": not has_prior_unpaid,
                "is_postponed": bool(p.is_postponed or "[1 oyga surildi]" in (p.comment or "")),
            }
        )

    data = {
        # Legacy fields for test compatibility
        "total_cars": total_cars,
        "available_cars": available_cars,
        "rented_cars": rented_cars,
        "maintenance_cars": maintenance_cars,

        # Contract KPIs
        "active_contracts_count": active_contracts_count,
        "completed_contracts_count": completed_contracts_count,
        "total_contracts_count": total_contracts_count,

        # Portfolio Financials
        "total_expected_usd": f"{total_expected_usd:.2f}",
        "total_collected_usd": f"{total_collected_usd:.2f}",
        "total_remaining_usd": f"{total_remaining_usd:.2f}",

        # Current Month Collection Rate
        "this_month_expected_usd": f"{this_month_expected_usd:.2f}",
        "this_month_collected_usd": f"{this_month_collected_usd:.2f}",
        "this_month_remaining_usd": f"{this_month_remaining_usd:.2f}",
        "this_month_collection_rate": round(collection_rate, 1),

        # Overdue stats & list
        "overdue_count": len(overdue_payments_data),
        "total_overdue_usd": f"{total_overdue_usd:.2f}",
        "overdue_payments": overdue_payments_data,

        # Upcoming stats & list (next 7 days)
        "upcoming_count": len(upcoming_payments_data),
        "total_upcoming_usd": f"{total_upcoming_usd:.2f}",
        "upcoming_payments": upcoming_payments_data,
    }
    cache.set(cache_key, data, 60)
    return data


def get_cars_data_for_owner(owner):
    cache_key = f"tenant_cars_list:{owner.id}"
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    active_contracts_prefetch = Prefetch(
        "contracts",
        queryset=Contract.objects.filter(is_active=True)
        .select_related("driver")
        .prefetch_related(
            Prefetch(
                "payments",
                queryset=Payment.objects.filter(
                    status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL]
                ).order_by("due_date"),
                to_attr="pending_payments",
            )
        ),
        to_attr="active_contracts_list",
    )
    cars = (
        owner.cars.all()
        .order_by("-created_at")
        .prefetch_related(active_contracts_prefetch)
    )
    serializer = CarListSerializer(cars, many=True)
    cache.set(cache_key, serializer.data, 60)
    return serializer.data


def get_user_schedule_data(user):
    driver = (
        Driver.objects.filter(user=user)
        .select_related("owner")
        .first()
    )
    if not driver and user.phone:
        normalized_user_phone = normalize_phone(user.phone)
        if normalized_user_phone:
            drivers_qs = Driver.objects.filter(owner_id=user.parent_owner_id or 0)
            for d in drivers_qs:
                norm_phones = [normalize_phone(p) for p in d.all_phones]
                if normalized_user_phone in norm_phones:
                    driver = d
                    if not d.user_id:
                        d.user = user
                        d.save(update_fields=["user"])
                    break

    if not driver:
        return []

    today = timezone.localdate()
    contracts = (
        Contract.objects.filter(driver=driver)
        .select_related("car", "owner")
        .prefetch_related("payments")
        .order_by("-is_active", "-created_at")
    )

    results = []
    for c in contracts:
        payments_qs = c.payments.all().order_by("month_number")
        paid_total = sum(p.paid_amount for p in payments_qs)
        remaining_total = sum(p.remaining_amount for p in payments_qs)
        next_p = payments_qs.filter(
            status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL]
        ).first()

        payments_list = []
        for p in payments_qs:
            days_overdue = 0
            if p.status != Payment.Status.PAID and p.due_date < today:
                days_overdue = (today - p.due_date).days
            payments_list.append(
                {
                    "id": p.id,
                    "month_number": p.month_number,
                    "due_date": str(p.due_date),
                    "expected_amount": f"{p.expected_amount:.2f}",
                    "paid_amount": f"{p.paid_amount:.2f}",
                    "remaining_amount": f"{p.remaining_amount:.2f}",
                    "status": p.status,
                    "paid_at": str(p.paid_at) if p.paid_at else None,
                    "comment": p.comment,
                    "days_overdue": max(0, days_overdue),
                }
            )

        results.append(
            {
                "id": c.id,
                "is_active": c.is_active,
                "driver_name": driver.full_name,
                "driver_phone": driver.phone,
                "car_name": c.car.name,
                "plate_number": c.car.plate_number,
                "owner_name": c.owner.full_name or c.owner.username or "Arendator",
                "owner_phone": c.owner.phone,
                "car_price": f"{c.car_price:.2f}",
                "initial_payment": f"{c.initial_payment:.2f}",
                "principal_amount": f"{c.principal_amount:.2f}",
                "total_amount": f"{c.total_amount:.2f}",
                "monthly_amount": f"{c.monthly_amount:.2f}",
                "annual_percent": f"{int(round(c.annual_percent))}",
                "months_count": c.months_count,
                "payment_day": c.payment_day,
                "start_date": str(c.start_date),
                "paid_total_usd": f"{paid_total:.2f}",
                "remaining_total_usd": f"{remaining_total:.2f}",
                "next_due_date": str(next_p.due_date) if next_p else None,
                "next_due_amount": (
                    f"{next_p.remaining_amount:.2f}" if next_p else None
                ),
                "payments": payments_list,
            }
        )

    return results


class BootstrapAPIView(APIView):
    """
    Single-request bootstrap endpoint returning:
    - me: serialized current user
    - dashboard: cached owner dashboard metrics (or null for user role)
    - cars: cached owner cars list (or [] for user role)
    - user_schedule: driver's contracts and payment schedule (or null for owner role)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        owner = request.user.tenant_owner if hasattr(request.user, "tenant_owner") else request.user
        cache_key = f"tenant_bootstrap:{owner.id}:{today.isoformat()}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        me_data = UserMeSerializer(request.user).data

        role = (request.user.role or "").lower()
        if role in (User.RoleChoices.ARENDATOR, "owner", User.RoleChoices.SUPERADMIN):
            dashboard_data = get_dashboard_data_for_owner(owner, today)
            cars_data = get_cars_data_for_owner(owner)
            user_schedule_data = None
        else:
            dashboard_data = None
            cars_data = []
            user_schedule_data = get_user_schedule_data(request.user)

        data = {
            "me": me_data,
            "dashboard": dashboard_data,
            "cars": cars_data,
            "user_schedule": user_schedule_data,
        }
        cache.set(cache_key, data, 60)
        return Response(data)


class DashboardAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        data = get_dashboard_data_for_owner(owner)
        return Response(data)


class CarListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        data = get_cars_data_for_owner(owner)
        return Response(data)

    def post(self, request):
        owner = request.user.tenant_owner
        can_create, err = owner.check_can_create_contract()
        if not can_create:
            return Response(
                {"detail": err, "code": "subscription_limit_reached"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CarCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            car = create_car_service(
                owner=owner,
                name=data["name"],
                plate_number=data["plate_number"],
                default_price=data.get("default_price", Decimal("0.00")),
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CarDetailSerializer(car).data, status=status.HTTP_201_CREATED)


class CarDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get_object(self, request, pk):
        owner = request.user.tenant_owner
        return get_object_or_404(Car, pk=pk, owner=owner)

    def get(self, request, pk):
        car = self.get_object(request, pk)
        return Response(CarDetailSerializer(car).data)

    def patch(self, request, pk):
        car = self.get_object(request, pk)
        serializer = CarCreateUpdateSerializer(car, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data.get("status")
        if new_status and new_status != car.status:
            if car.status == Car.Status.RENTED and car.contracts.filter(is_active=True).exists():
                return Response(
                    {"detail": "Faol shartnomasi bor avtomobil holatini o'zgartirib bo'lmaydi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if "plate_number" in serializer.validated_data:
            serializer.validated_data["plate_number"] = (
                serializer.validated_data["plate_number"].strip().upper()
            )

        updated_car = serializer.save()
        invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))
        return Response(CarDetailSerializer(updated_car).data)

    def delete(self, request, pk):
        owner = request.user.tenant_owner
        car = self.get_object(request, pk)
        if car.contracts.exists():
            return Response(
                {"detail": "Shartnomasi mavjud bo'lgan avtomobilni o'chirib bo'lmaydi."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        car.delete()
        invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        drivers = owner.drivers.all().order_by("-created_at")
        return Response(DriverSerializer(drivers, many=True).data)

    def post(self, request):
        owner = request.user.tenant_owner
        serializer = DriverSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        driver = serializer.save(owner=owner)
        return Response(DriverSerializer(driver).data, status=status.HTTP_201_CREATED)


class DriverDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get_object(self, request, pk):
        owner = request.user.tenant_owner
        return get_object_or_404(Driver, pk=pk, owner=owner)

    def get(self, request, pk):
        driver = self.get_object(request, pk)
        return Response(DriverSerializer(driver).data)

    def patch(self, request, pk):
        driver = self.get_object(request, pk)
        serializer = DriverSerializer(driver, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updated_driver = serializer.save()
        return Response(DriverSerializer(updated_driver).data)


class ContractCalculateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def post(self, request):
        owner = request.user.tenant_owner
        serializer = CalculateContractSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        annual_percent = data.get("annual_percent")
        if annual_percent is None:
            setting, _ = UserSetting.objects.get_or_create(owner=owner)
            annual_percent = setting.default_annual_percent

        try:
            totals = calculate_contract_totals(
                car_price=data["car_price"],
                initial_payment=data.get("initial_payment", Decimal("0.00")),
                annual_percent=annual_percent,
                months_count=data["months_count"],
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        totals["annual_percent"] = str(annual_percent)
        totals["principal_amount"] = str(totals["principal_amount"])
        totals["total_amount"] = str(totals["total_amount"])
        totals["monthly_amount"] = str(totals["monthly_amount"])
        return Response(totals)


class ContractListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        qs = Contract.objects.filter(owner=owner).select_related(
            "car", "driver"
        ).order_by("-created_at")

        is_active_param = request.query_params.get("is_active")
        if is_active_param is not None:
            is_active = is_active_param.lower() in ("true", "1")
            qs = qs.filter(is_active=is_active)

        return Response(ContractSummarySerializer(qs, many=True).data)

    def post(self, request):
        owner = request.user.tenant_owner
        can_create, err = owner.check_can_create_contract()
        if not can_create:
            return Response(
                {"detail": err, "code": "subscription_limit_reached"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ContractCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        car_id = data.get("car_id")
        car = None
        if car_id:
            car = get_object_or_404(Car, id=car_id, owner=owner)

        driver_id = data.get("driver_id")
        driver_secondary_phone = (data.get("driver_secondary_phone") or "").strip()
        if driver_id:
            driver = get_object_or_404(Driver, id=driver_id, owner=owner)
            if driver_secondary_phone and not driver.secondary_phone:
                driver.secondary_phone = driver_secondary_phone
                driver.save(update_fields=["secondary_phone"])
        else:
            driver = Driver.objects.create(
                owner=owner,
                full_name=data["driver_full_name"].strip(),
                phone=data["driver_phone"].strip(),
                secondary_phone=driver_secondary_phone,
            )

        try:
            contract = create_contract_service(
                owner=owner,
                car=car,
                car_name=data.get("car_name"),
                plate_number=data.get("plate_number"),
                car_year=data.get("car_year"),
                car_notes=data.get("car_notes"),
                driver=driver,
                car_price=data["car_price"],
                initial_payment=data.get("initial_payment", Decimal("0.00")),
                months_count=data["months_count"],
                payment_day=data["payment_day"],
                start_date=data["start_date"],
                annual_percent=data.get("annual_percent"),
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            ContractDetailSerializer(contract).data, status=status.HTTP_201_CREATED
        )


class ContractDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request, pk):
        owner = request.user.tenant_owner
        contract = get_object_or_404(
            Contract.objects.select_related("car", "driver").prefetch_related("payments"),
            pk=pk,
            owner=owner,
        )
        return Response(ContractDetailSerializer(contract).data)


class ContractCloseAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def post(self, request, pk):
        owner = request.user.tenant_owner
        contract = get_object_or_404(Contract, pk=pk, owner=owner)
        serializer = CloseContractSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        close_note = serializer.validated_data.get("close_note", "")
        try:
            closed_contract = close_contract_service(
                owner=owner, contract=contract, close_note=close_note
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ContractSummarySerializer(closed_contract).data)


class OverduePaymentsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        today = timezone.localdate()
        overdue_qs = (
            Payment.objects.filter(
                contract__owner=owner,
                status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
                due_date__lte=today,
            )
            .select_related("contract__car", "contract__driver")
            .order_by("due_date")
        )

        results = []
        for p in overdue_qs:
            days_overdue = (today - p.due_date).days
            has_prior_unpaid = Payment.objects.filter(
                contract_id=p.contract_id,
                month_number__lt=p.month_number,
            ).exclude(status=Payment.Status.PAID).exists()
            results.append(
                {
                    "id": p.id,
                    "contract_id": p.contract_id,
                    "month_number": p.month_number,
                    "car_name": p.contract.car.name,
                    "plate_number": p.contract.car.plate_number,
                    "driver_name": p.contract.driver.full_name,
                    "driver_phone": p.contract.driver.phone,
                    "due_date": str(p.due_date),
                    "expected_amount": f"{p.expected_amount:.2f}",
                    "paid_amount": f"{p.paid_amount:.2f}",
                    "remaining_amount": f"{p.remaining_amount:.2f}",
                    "days_overdue": max(0, days_overdue),
                    "comment": p.comment or "",
                    "can_pay": not has_prior_unpaid,
                    "is_postponed": bool(p.is_postponed or "[1 oyga surildi]" in (p.comment or "")),
                }
            )
        return Response(results)


class PaymentPayAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def post(self, request, pk):
        owner = request.user.tenant_owner
        payment = get_object_or_404(
            Payment.objects.select_related("contract"),
            pk=pk,
            contract__owner=owner,
        )
        serializer = RecordPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data["amount"]
        comment = serializer.validated_data.get("comment", "")

        try:
            updated_payment = record_payment_service(
                owner=owner, payment=payment, amount=amount, comment=comment
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PaymentSerializer(updated_payment).data)


class PaymentPostponeAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def post(self, request, pk):
        owner = request.user.tenant_owner
        payment = get_object_or_404(
            Payment.objects.select_related("contract"),
            pk=pk,
            contract__owner=owner,
        )
        comment = (request.data.get("comment") or "").strip()

        try:
            updated_payments = postpone_contract_payments_service(
                owner=owner, payment=payment, comment=comment
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "detail": "To'lov jadvali 1 oy keyinga surildi.",
                "payments": PaymentSerializer(updated_payments, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class ExportExcelAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request):
        owner = request.user.tenant_owner
        excel_bytes = generate_tenant_excel_report(owner)
        filename = "carenda_hisobot.xlsx"

        sent_to_bot = False
        send_to_bot = (
            request.query_params.get("send_to_bot") in ("1", "true", "True")
            or bool(request.user.telegram_id and "tma " in request.headers.get("Authorization", "").lower())
        )
        if send_to_bot and request.user.telegram_id:
            bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
            if bot_token and bot_token != "dev_bot_token_123456":
                try:
                    import asyncio
                    from aiogram import Bot
                    from aiogram.types import BufferedInputFile

                    async def _send_doc():
                        bot = Bot(token=bot_token)
                        try:
                            doc = BufferedInputFile(excel_bytes, filename=filename)
                            caption = (
                                f"📊 <b>CArenda umumiy park hisoboti</b>\n"
                                f"🏢 Arendator: <b>{owner.full_name or owner.username}</b>"
                            )
                            await bot.send_document(
                                chat_id=request.user.telegram_id,
                                document=doc,
                                caption=caption,
                                parse_mode="HTML",
                            )
                            return True
                        finally:
                            await bot.session.close()

                    sent_to_bot = bool(asyncio.run(_send_doc()))
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("Failed to send tenant excel to bot: %s", e)

        response = HttpResponse(
            excel_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        if sent_to_bot:
            response["X-Sent-To-Bot"] = "1"
        return response


class ContractExcelExportAPIView(APIView):
    permission_classes = [IsAuthenticated, IsArendator]

    def get(self, request, pk):
        role = (getattr(request.user, "role", "") or "").lower()
        if role not in (User.RoleChoices.ARENDATOR, "owner", User.RoleChoices.SUPERADMIN):
            return Response(
                {"detail": "Ushbu amalni bajarish uchun sizda arendator huquqi yo'q."},
                status=status.HTTP_403_FORBIDDEN,
            )

        owner = request.user.tenant_owner
        contract = get_object_or_404(
            Contract.objects.select_related("car", "driver").prefetch_related("payments"),
            pk=pk,
            owner=owner,
        )

        excel_bytes = generate_single_contract_excel_report(contract)
        clean_plate = re.sub(r"\s+", "", contract.car.plate_number)
        filename = f"shartnoma_{clean_plate}_{contract.id}.xlsx"

        sent_to_bot = False
        send_to_bot = (
            request.query_params.get("send_to_bot") in ("1", "true", "True")
            or bool(request.user.telegram_id and "tma " in request.headers.get("Authorization", "").lower())
        )
        if send_to_bot and request.user.telegram_id:
            bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
            if bot_token and bot_token != "dev_bot_token_123456":
                try:
                    import asyncio
                    from aiogram import Bot
                    from aiogram.types import BufferedInputFile

                    async def _send_doc():
                        bot = Bot(token=bot_token)
                        try:
                            doc = BufferedInputFile(excel_bytes, filename=filename)
                            caption = (
                                f"📄 <b>Shartnoma hisoboti:</b> {contract.car.name} ({contract.car.plate_number})\n"
                                f"👤 Mijoz: <b>{contract.driver.full_name}</b>\n"
                                f"📅 Boshlangan sana: <b>{contract.start_date}</b>"
                            )
                            await bot.send_document(
                                chat_id=request.user.telegram_id,
                                document=doc,
                                caption=caption,
                                parse_mode="HTML",
                            )
                            return True
                        finally:
                            await bot.session.close()

                    sent_to_bot = bool(asyncio.run(_send_doc()))
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("Failed to send contract excel to bot: %s", e)

        response = HttpResponse(
            excel_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        if sent_to_bot:
            response["X-Sent-To-Bot"] = "1"
        return response


class UserScheduleAPIView(APIView):
    """
    Read-only endpoint for User (Driver) users to see their leased car contracts and payment schedules.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        results = get_user_schedule_data(request.user)
        return Response(results)


ClientMyContractsAPIView = UserScheduleAPIView
