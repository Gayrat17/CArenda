import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.fleet.models import Car, Contract, Driver, Payment
from apps.users.models import User, UserSetting


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
) -> Car:
    """
    Validates tenant subscription and vehicle limits before creating a new car.
    """
    if not owner.is_subscription_active:
        raise ValidationError("Obuna muddatingiz tugagan.")

    if owner.cars.count() >= owner.cars_limit:
        raise ValidationError("Tarif bo'yicha mashinalar limiti to'lgan.")

    normalized_plate = plate_number.strip().upper()

    return Car.objects.create(
        owner=owner,
        name=name.strip(),
        plate_number=normalized_plate,
        default_price=default_price,
        status=Car.Status.AVAILABLE,
    )


@transaction.atomic
def create_contract_service(
    *,
    owner: User,
    car: Car,
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
    """
    if car.owner_id != owner.id or driver.owner_id != owner.id:
        raise ValidationError("Avtomobil yoki haydovchi sizga tegishli emas.")

    if car.status != Car.Status.AVAILABLE:
        raise ValidationError("Avtomobil band yoki ta'mirda.")

    if Contract.objects.filter(car=car, is_active=True).exists():
        raise ValidationError("Ushbu avtomobil bo'yicha faol shartnoma mavjud.")

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

    payment.paid_amount += amount
    if payment.paid_amount >= payment.expected_amount:
        payment.status = Payment.Status.PAID
    else:
        payment.status = Payment.Status.PARTIAL

    payment.paid_at = timezone.now()
    if comment:
        payment.comment = comment.strip()

    payment.save(update_fields=["paid_amount", "status", "paid_at", "comment"])
    return payment


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

    return contract
