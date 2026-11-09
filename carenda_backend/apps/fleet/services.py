import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.bot.tasks import send_payment_receipt_notification_task
from apps.fleet.models import Car, Contract, Driver, Payment
from apps.users.models import User, UserSetting


def invalidate_tenant_cache(owner_id: int, telegram_id: int | None = None) -> None:
    """
    Clears cached dashboard and car lists for the given tenant owner,
    and optionally clears auth cache for the user's telegram_id.
    """
    try:
        today_str = timezone.localdate().isoformat()
        direct_keys = [
            f"tenant_dashboard:{owner_id}:{today_str}",
            f"tenant_cars_list:{owner_id}",
            f"tenant_bootstrap:{owner_id}:{today_str}",
        ]
        if telegram_id:
            direct_keys.append(f"auth_user:{telegram_id}")

        for k in direct_keys:
            cache.delete(k)

        if hasattr(cache, "delete_pattern"):
            try:
                cache.delete_pattern(f"tenant_dashboard:{owner_id}:*")
                cache.delete_pattern(f"tenant_bootstrap:{owner_id}:*")
                cache.delete_pattern("user_bootstrap:*")
            except Exception:
                pass
    except Exception:
        pass


def calculate_contract_totals(
    *,
    car_price: Decimal,
    initial_payment: Decimal,
    annual_percent: Decimal,
    months_count: int,
) -> dict:
    """
    Calculates principal amount, total markup, total contract amount, and monthly payment amount in USD.
    Quantizes values to 2 decimal places using ROUND_HALF_UP.
    """
    if car_price <= Decimal("0.00"):
        raise ValidationError("Mashina narxi 0 dan katta bo'lishi kerak.")
    if initial_payment < Decimal("0.00"):
        raise ValidationError("Boshlang'ich to'lov manfiy bo'lishi mumkin emas.")
    if initial_payment >= car_price:
        raise ValidationError("Boshlang'ich to'lov mashina narxidan kam bo'lishi kerak.")
    if months_count < 1:
        raise ValidationError("Muddat kamida 1 oy bo'lishi kerak.")
    if annual_percent < Decimal("0.00"):
        raise ValidationError("Yillik foiz manfiy bo'lishi mumkin emas.")

    cents = Decimal("0.01")
    principal_amount = (car_price - initial_payment).quantize(cents, rounding=ROUND_HALF_UP)
    years = Decimal(months_count) / Decimal("12.00")
    total_markup = principal_amount * (annual_percent / Decimal("100.00")) * years
    total_amount = (principal_amount + total_markup).quantize(cents, rounding=ROUND_HALF_UP)
    monthly_amount = (total_amount / Decimal(months_count)).quantize(cents, rounding=ROUND_HALF_UP)

    return {
        "principal_amount": principal_amount,
        "total_amount": total_amount,
        "monthly_amount": monthly_amount,
    }


@transaction.atomic
def create_car_service(
    *,
    owner: User,
    name: str,
    plate_number: str,
    default_price: Decimal = Decimal("0.00"),
    year: int | None = None,
    notes: str = "",
) -> Car:
    """
    Validates tenant subscription and vehicle limits before creating a new car.
    """
    if not owner.is_subscription_active:
        raise ValidationError("Obuna muddatingiz tugagan.")

    can_create, err = owner.check_can_create_contract()
    if not can_create:
        raise ValidationError(err)

    if owner.cars.count() >= owner.cars_limit:
        raise ValidationError("Tarif bo'yicha mashinalar limiti to'lgan.")

    normalized_plate = plate_number.strip().upper()

    car = Car.objects.create(
        owner=owner,
        name=name.strip(),
        plate_number=normalized_plate,
        default_price=default_price,
        year=year,
        notes=notes.strip() if notes else "",
        status=Car.Status.AVAILABLE,
    )
    invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))
    return car


@transaction.atomic
def create_contract_service(
    *,
    owner: User,
    car: Car | None = None,
    car_name: str | None = None,
    plate_number: str | None = None,
    car_year: int | None = None,
    car_notes: str | None = None,
    driver: Driver,
    car_price: Decimal,
    initial_payment: Decimal,
    months_count: int,
    payment_day: int,
    start_date: date,
    annual_percent: Decimal | None = None,
) -> Contract:
    """
    Validates multi-tenant ownership and car availability, computes financial breakdown,
    creates the contract, sets car status to 'rented', and schedules monthly payments safely.
    Supports either passing an existing available car or inline car_name and plate_number.
    """
    can_create, err = owner.check_can_create_contract()
    if not can_create:
        raise ValidationError(err)

    if car is None:
        if not car_name or not car_name.strip():
            raise ValidationError("Mashina nomi kiritilishi shart.")
        if not plate_number or not plate_number.strip():
            raise ValidationError("Mashina davlat raqami kiritilishi shart.")

        normalized_plate = plate_number.strip().upper()
        existing_car = Car.objects.filter(owner=owner, plate_number=normalized_plate).first()
        if existing_car:
            if (
                existing_car.status == Car.Status.RENTED
                or Contract.objects.filter(car=existing_car, is_active=True).exists()
            ):
                raise ValidationError("Bu davlat raqamli mashinada faol shartnoma mavjud.")

            # Reuse existing available car
            existing_car.name = car_name.strip()
            existing_car.default_price = car_price
            existing_car.status = Car.Status.AVAILABLE
            update_fields = ["name", "default_price", "status"]
            if car_year is not None:
                existing_car.year = car_year
                update_fields.append("year")
            if car_notes is not None:
                existing_car.notes = car_notes.strip()
                update_fields.append("notes")
            existing_car.save(update_fields=update_fields)
            car = existing_car
        else:
            car = create_car_service(
                owner=owner,
                name=car_name.strip(),
                plate_number=normalized_plate,
                default_price=car_price,
                year=car_year,
                notes=car_notes or "",
            )
    else:
        if car.owner_id != owner.id or driver.owner_id != owner.id:
            raise ValidationError("Avtomobil yoki haydovchi sizga tegishli emas.")

        if car.status != Car.Status.AVAILABLE:
            raise ValidationError("Avtomobil band yoki ta'mirda.")

        if Contract.objects.filter(car=car, is_active=True).exists():
            raise ValidationError("Ushbu avtomobil bo'yicha faol shartnoma mavjud.")

        # Update car year and notes if provided
        car_update_fields = []
        if car_year is not None and car.year != car_year:
            car.year = car_year
            car_update_fields.append("year")
        if car_notes is not None and car.notes != car_notes.strip():
            car.notes = car_notes.strip()
            car_update_fields.append("notes")
        if car_update_fields:
            car.save(update_fields=car_update_fields)

    if driver.owner_id != owner.id:
        raise ValidationError("Avtomobil yoki haydovchi sizga tegishli emas.")

    if annual_percent is None:
        user_setting, _ = UserSetting.objects.get_or_create(owner=owner)
        annual_percent = user_setting.default_annual_percent

    totals = calculate_contract_totals(
        car_price=car_price,
        initial_payment=initial_payment,
        annual_percent=annual_percent,
        months_count=months_count,
    )

    contract = Contract.objects.create(
        owner=owner,
        car=car,
        driver=driver,
        car_price=car_price,
        initial_payment=initial_payment,
        annual_percent=annual_percent,
        months_count=months_count,
        payment_day=payment_day,
        principal_amount=totals["principal_amount"],
        total_amount=totals["total_amount"],
        monthly_amount=totals["monthly_amount"],
        start_date=start_date,
        is_active=True,
    )

    car.status = Car.Status.RENTED
    car.save(update_fields=["status"])

    payments = []
    for month_idx in range(1, months_count + 1):
        target = start_date + relativedelta(months=month_idx)
        max_days = calendar.monthrange(target.year, target.month)[1]
        clamped_day = min(payment_day, max_days)
        due_date = date(target.year, target.month, clamped_day)

        payments.append(
            Payment(
                contract=contract,
                month_number=month_idx,
                due_date=due_date,
                expected_amount=totals["monthly_amount"],
                paid_amount=Decimal("0.00"),
                status=Payment.Status.PENDING,
            )
        )

    Payment.objects.bulk_create(payments)
    invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))
    return contract


@transaction.atomic
def record_payment_service(
    *,
    owner: User,
    payment: Payment,
    amount: Decimal,
    comment: str = "",
) -> Payment:
    """
    Safely records a partial or full payment on a tenant contract installment.
    """
    if payment.contract.owner_id != owner.id:
        raise ValidationError("Ushbu to'lov sizga tegishli emas.")

    if payment.status in (Payment.Status.PAID, Payment.Status.CANCELLED):
        raise ValidationError("To'langan yoki bekor qilingan to'lovga pul qabul qilib bo'lmaydi.")

    if amount <= Decimal("0.00"):
        raise ValidationError("To'lov summasi 0 dan katta bo'lishi kerak.")

    # Ensure all previous installments for this contract are paid
    has_unpaid_prior_months = Payment.objects.filter(
        contract=payment.contract,
        month_number__lt=payment.month_number,
    ).exclude(status=Payment.Status.PAID).exists()

    if has_unpaid_prior_months:
        raise ValidationError(
            f"{payment.month_number}-oy to'lovini amalga oshirishdan oldin undan oldingi oylarning to'lovi to'liq yopilishi kerak."
        )

    payment.paid_amount += amount
    if payment.paid_amount >= payment.expected_amount:
        payment.status = Payment.Status.PAID
    else:
        payment.status = Payment.Status.PARTIAL

    payment.paid_at = timezone.now()
    if comment:
        payment.comment = comment.strip()

    payment.save(update_fields=["paid_amount", "status", "paid_at", "comment"])
    invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))

    try:
        payment_id = payment.id
        amount_str = str(amount)

        def _safe_dispatch():
            try:
                send_payment_receipt_notification_task.apply_async(
                    args=(payment_id, amount_str),
                    retry=False,
                )
            except Exception:
                pass

        transaction.on_commit(_safe_dispatch)
    except Exception:
        pass

    return payment


@transaction.atomic
def postpone_contract_payments_service(
    *,
    owner: User,
    payment: Payment,
    comment: str = "",
) -> list[Payment]:
    """
    Shifts the current unpaid installment and all subsequent unpaid installments
    forward by exactly 1 calendar month, clamping to the contract payment day.
    Appends a postponement note to the triggered payment's comment.
    """
    if payment.contract.owner_id != owner.id:
        raise ValidationError("Ushbu to'lov sizga tegishli emas.")

    if not payment.contract.is_active:
        raise ValidationError("Yopilgan shartnoma to'lovlarini surib bo'lmaydi.")

    if payment.status in (Payment.Status.PAID, Payment.Status.CANCELLED):
        raise ValidationError("Faqat kutilayotgan yoki qisman to'langan to'lovlarni surish mumkin.")

    if payment.is_postponed or "[1 oyga surildi]" in (payment.comment or ""):
        raise ValidationError(
            "Ushbu oy to'lovi allaqachon 1 marta surilgan. Har bir oy to'lovini faqat bir marta surishga ruxsat berilgan."
        )

    has_unpaid_prior_months = Payment.objects.filter(
        contract=payment.contract,
        month_number__lt=payment.month_number,
    ).exclude(status=Payment.Status.PAID).exists()

    if has_unpaid_prior_months:
        raise ValidationError(
            f"{payment.month_number}-oy to'lovini surishdan oldin undan oldingi oylarning to'lovi to'liq yopilishi kerak."
        )

    payments_to_shift = list(
        Payment.objects.filter(
            contract=payment.contract,
            status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
            month_number__gte=payment.month_number,
        ).order_by("month_number")
    )

    if not payments_to_shift:
        raise ValidationError("Surish uchun to'lovlar topilmadi.")

    contract_day = payment.contract.payment_day
    for p in payments_to_shift:
        target = p.due_date + relativedelta(months=1)
        max_days = calendar.monthrange(target.year, target.month)[1]
        p.due_date = date(target.year, target.month, min(contract_day, max_days))

    clean_comment = (comment or "").strip()
    note = f"[1 oyga surildi] {clean_comment}" if clean_comment else "[1 oyga surildi]"
    for p in payments_to_shift:
        if p.id == payment.id:
            p.is_postponed = True
            if p.comment:
                p.comment = f"{p.comment} | {note}" if note not in p.comment else p.comment
            else:
                p.comment = note
            payment.comment = p.comment
            payment.is_postponed = True

    Payment.objects.bulk_update(payments_to_shift, ["due_date", "comment", "is_postponed"])
    invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))
    return payments_to_shift


@transaction.atomic
def close_contract_service(
    *,
    owner: User,
    contract: Contract,
    close_note: str = "",
) -> Contract:
    """
    Closes an active contract, frees the linked car to 'available', and cancels pending payments.
    """
    if contract.owner_id != owner.id:
        raise ValidationError("Ushbu shartnoma sizga tegishli emas.")

    if not contract.is_active:
        raise ValidationError("Shartnoma allaqachon yopilgan.")

    contract.payments.filter(status=Payment.Status.PENDING).update(
        status=Payment.Status.CANCELLED
    )

    contract.is_active = False
    contract.closed_at = timezone.now()
    contract.close_note = close_note.strip()
    contract.save(update_fields=["is_active", "closed_at", "close_note"])

    contract.car.status = Car.Status.AVAILABLE
    contract.car.save(update_fields=["status"])
    invalidate_tenant_cache(owner.id, getattr(owner, "telegram_id", None))

    return contract
