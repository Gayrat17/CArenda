from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.models import Car, Contract, Driver, Payment
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
    record_payment_service,
)
from apps.users.models import UserSetting


class DashboardAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()

        cars_qs = user.cars.all()
        total_cars = cars_qs.count()
        available_cars = cars_qs.filter(status=Car.Status.AVAILABLE).count()
        rented_cars = cars_qs.filter(status=Car.Status.RENTED).count()
        maintenance_cars = cars_qs.filter(status=Car.Status.MAINTENANCE).count()

        active_contracts_qs = Contract.objects.filter(owner=user, is_active=True)
        active_contracts_count = active_contracts_qs.count()

        active_payments = Payment.objects.filter(
            contract__owner=user, contract__is_active=True
        )
        sums = active_payments.aggregate(
            expected=Sum("expected_amount"), paid=Sum("paid_amount")
        )
        total_expected_usd = sums["expected"] or Decimal("0.00")
        total_collected_usd = sums["paid"] or Decimal("0.00")
        total_remaining_usd = max(Decimal("0.00"), total_expected_usd - total_collected_usd)

        overdue_qs = (
            Payment.objects.filter(
                contract__owner=user,
                status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
                due_date__lte=today,
            )
            .select_related("contract__car", "contract__driver")
            .order_by("due_date")
        )

        overdue_list = []
        for p in overdue_qs:
            days_overdue = (today - p.due_date).days
            overdue_list.append(
                {
                    "id": p.id,
                    "contract_id": p.contract_id,
                    "car_name": p.contract.car.name,
                    "plate_number": p.contract.car.plate_number,
                    "driver_name": p.contract.driver.full_name,
                    "driver_phone": p.contract.driver.phone,
                    "due_date": str(p.due_date),
                    "expected_amount": f"{p.expected_amount:.2f}",
                    "paid_amount": f"{p.paid_amount:.2f}",
                    "remaining_amount": f"{p.remaining_amount:.2f}",
                    "days_overdue": max(0, days_overdue),
                }
            )

        return Response(
            {
                "total_cars": total_cars,
                "available_cars": available_cars,
                "rented_cars": rented_cars,
                "maintenance_cars": maintenance_cars,
                "active_contracts_count": active_contracts_count,
                "total_expected_usd": f"{total_expected_usd:.2f}",
                "total_collected_usd": f"{total_collected_usd:.2f}",
                "total_remaining_usd": f"{total_remaining_usd:.2f}",
                "overdue_payments": overdue_list,
            }
        )


class CarListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cars = request.user.cars.all().order_by("-created_at")
        serializer = CarListSerializer(cars, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CarCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            car = create_car_service(
                owner=request.user,
                name=data["name"],
                plate_number=data["plate_number"],
                default_price=data.get("default_price", Decimal("0.00")),
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CarDetailSerializer(car).data, status=status.HTTP_201_CREATED)


class CarDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(Car, pk=pk, owner=request.user)

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
        return Response(CarDetailSerializer(updated_car).data)

    def delete(self, request, pk):
        car = self.get_object(request, pk)
        if car.contracts.exists():
            return Response(
                {"detail": "Shartnomasi mavjud bo'lgan avtomobilni o'chirib bo'lmaydi."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        car.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        drivers = request.user.drivers.all().order_by("-created_at")
        return Response(DriverSerializer(drivers, many=True).data)

    def post(self, request):
        serializer = DriverSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        driver = serializer.save(owner=request.user)
        return Response(DriverSerializer(driver).data, status=status.HTTP_201_CREATED)


class DriverDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(Driver, pk=pk, owner=request.user)

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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CalculateContractSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        annual_percent = data.get("annual_percent")
        if annual_percent is None:
            setting, _ = UserSetting.objects.get_or_create(owner=request.user)
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Contract.objects.filter(owner=request.user).select_related(
            "car", "driver"
        ).order_by("-created_at")

        is_active_param = request.query_params.get("is_active")
        if is_active_param is not None:
            is_active = is_active_param.lower() in ("true", "1")
            qs = qs.filter(is_active=is_active)

        return Response(ContractSummarySerializer(qs, many=True).data)

    def post(self, request):
        serializer = ContractCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        car = get_object_or_404(Car, id=data["car_id"], owner=request.user)

        driver_id = data.get("driver_id")
        if driver_id:
            driver = get_object_or_404(Driver, id=driver_id, owner=request.user)
        else:
            driver = Driver.objects.create(
                owner=request.user,
                full_name=data["driver_full_name"].strip(),
                phone=data["driver_phone"].strip(),
            )

        try:
            contract = create_contract_service(
                owner=request.user,
                car=car,
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
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        contract = get_object_or_404(
            Contract.objects.select_related("car", "driver").prefetch_related("payments"),
            pk=pk,
            owner=request.user,
        )
        return Response(ContractDetailSerializer(contract).data)


class ContractCloseAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = get_object_or_404(Contract, pk=pk, owner=request.user)
        serializer = CloseContractSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        close_note = serializer.validated_data.get("close_note", "")
        try:
            closed_contract = close_contract_service(
                owner=request.user, contract=contract, close_note=close_note
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ContractSummarySerializer(closed_contract).data)


class OverduePaymentsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        overdue_qs = (
            Payment.objects.filter(
                contract__owner=request.user,
                status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
                due_date__lte=today,
            )
            .select_related("contract__car", "contract__driver")
            .order_by("due_date")
        )

        results = []
        for p in overdue_qs:
            days_overdue = (today - p.due_date).days
            results.append(
                {
                    "id": p.id,
                    "contract_id": p.contract_id,
                    "car_name": p.contract.car.name,
                    "plate_number": p.contract.car.plate_number,
                    "driver_name": p.contract.driver.full_name,
                    "driver_phone": p.contract.driver.phone,
                    "due_date": str(p.due_date),
                    "expected_amount": f"{p.expected_amount:.2f}",
                    "paid_amount": f"{p.paid_amount:.2f}",
                    "remaining_amount": f"{p.remaining_amount:.2f}",
                    "days_overdue": max(0, days_overdue),
                }
            )
        return Response(results)


class PaymentPayAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        payment = get_object_or_404(
            Payment.objects.select_related("contract"),
            pk=pk,
            contract__owner=request.user,
        )
        serializer = RecordPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data["amount"]
        comment = serializer.validated_data.get("comment", "")

        try:
            updated_payment = record_payment_service(
                owner=request.user, payment=payment, amount=amount, comment=comment
            )
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") else str(e)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PaymentSerializer(updated_payment).data)
