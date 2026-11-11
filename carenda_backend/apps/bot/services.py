import asyncio
import logging
from datetime import date, timedelta
from decimal import Decimal

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import connections
from django.db.models import F, Q
from django.utils import timezone

from apps.fleet.models import Payment
from apps.users.models import User

logger = logging.getLogger(__name__)


def get_webapp_url() -> str:
    """
    Returns current WebApp URL.
    Checks .env directly for zero-restart live tunnel updates,
    falling back to settings.WEBAPP_URL.
    """
    try:
        from pathlib import Path
        import re

        env_file = settings.BASE_DIR / ".env"
        if env_file.exists():
            content = env_file.read_text(encoding="utf-8")
            m = re.search(r"^WEBAPP_URL=['\"]?([^'\"\s]+)['\"]?", content, re.MULTILINE)
            if m and m.group(1).startswith("https://"):
                return m.group(1).strip()
    except Exception:
        pass
    return getattr(settings, "WEBAPP_URL", "http://localhost:3000")



def build_overdue_summary_text(owner: User) -> str | None:
    """
    Builds a structured Uzbek alert message listing overdue or due-today payments for the tenant.
    Returns None if no overdue or due-today payments exist.
    """
    today = timezone.localdate()

    overdue_qs = (
        Payment.objects.filter(
            contract__owner=owner,
            contract__is_active=True,
            status__in=Payment.OPEN_STATUSES,
            due_date__lte=today,
        )
        .select_related("contract__car", "contract__driver")
        .order_by("due_date")
    )

    if not overdue_qs.exists():
        return None

    lines = [
        "🚨 <b>Diqqat! To'lovi kechikkan / bugungi to'lovlar mavjud:</b>\n"
    ]

    total_overdue = Decimal("0.00")
    for idx, p in enumerate(overdue_qs, start=1):
        days_overdue = (today - p.due_date).days
        status_label = (
            f"⚠️ {days_overdue} kun kechikkan" if days_overdue > 0 else "📌 Bugun to'lanishi kerak"
        )
        total_overdue += p.remaining_amount

        lines.append(
            f"{idx}. 🚗 <b>{p.contract.car.name}</b> ({p.contract.car.plate_number})\n"
            f"   👤 Haydovchi: {p.contract.driver.full_name} ({p.contract.driver.phone})\n"
            f"   📅 Sana: {p.due_date} ({status_label})\n"
            f"   💵 Qarz: <b>${p.remaining_amount:.2f}</b>\n"
        )

    lines.append(f"💰 <b>Jami undirilishi kerak: ${total_overdue:.2f}</b>")
    lines.append("\nTo'lovlarni qabul qilish uchun quyidagi tugma orqali ilovani oching:")

    return "\n".join(lines)


def format_ijarachi_payment_notification(
    payment: Payment,
    today: date | None = None,
) -> tuple[str, str] | None:
    """
    Formats the Uzbek Telegram reminder for an unpaid Ijarachi installment.
    Returns `(kind, text)` for 7-days-before, due-today, or overdue; otherwise `None`.
    """
    target_today = today or timezone.localdate()
    if payment.status in (Payment.Status.PAID, Payment.Status.CANCELLED):
        return None

    remaining = payment.remaining_amount
    if remaining <= Decimal("0.00"):
        return None

    contract = payment.contract
    driver_user = getattr(contract.driver, "user", None)
    client_name = (
        getattr(contract.driver, "full_name", "")
        or getattr(driver_user, "full_name", "")
        or "Mijoz"
    )
    car_model = contract.car.name
    car_plate = contract.car.plate_number
    arendator_name = contract.owner.full_name or contract.owner.username or "Arendator"
    arendator_phone = (
        getattr(contract.owner, "phone", None)
        or getattr(contract.owner, "phone_number", None)
        or "—"
    )
    remaining_str = f"{remaining:.2f}"

    if payment.due_date == target_today + timedelta(days=7):
        if payment.notified_7days_before:
            return None
        return (
            "7days",
            f"🔔 Eslatma!\n\n"
            f"Hurmatli {client_name}, {car_model} ({car_plate}) avtomobili uchun navbatdagi to'lov sanasiga 7 kun qoldi.\n\n"
            f"📅 To'lov sanasi: {payment.due_date}\n"
            f"💵 To'lov summasi: ${remaining_str}\n"
            f"👤 Arendator: {arendator_name} ({arendator_phone})",
        )

    if payment.due_date == target_today:
        return (
            "today",
            f"📅 Bugun to'lov kuni!\n\n"
            f"Hurmatli {client_name}, bugun {car_model} ({car_plate}) avtomobili uchun oylik to'lovni amalga oshirish kuni.\n\n"
            f"💵 To'lanishi kerak: ${remaining_str}\n"
            f"👤 Arendator: {arendator_name} ({arendator_phone})",
        )

    if payment.due_date < target_today:
        overdue_days = (target_today - payment.due_date).days
        return (
            "overdue",
            f"⚠️ To'lov muddati o'tib ketdi!\n\n"
            f"Hurmatli {client_name}, {car_model} ({car_plate}) avtomobili uchun {payment.due_date} sanadagi to'lovingiz {overdue_days} kunga kechikmoqda.\n\n"
            f"❗ Qarzdorlik summasi: ${remaining_str}\n"
            f"Iltimos, to'lovni tezroq amalga oshiring!\n"
            f"👤 Arendator: {arendator_name} ({arendator_phone})",
        )

    return None


def collect_ijarachi_payment_notifications(today: date | None = None) -> list[dict]:
    """
    Marks past-due unpaid installments on active contracts as 'overdue' and
    collects eligible Ijarachi notifications respecting daily deduplication.
    """
    target_today = today or timezone.localdate()
    seven_days_later = target_today + timedelta(days=7)

    # Mark all past-due unpaid installments on active contracts as OVERDUE
    Payment.objects.filter(
        contract__is_active=True,
        status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
        paid_amount__lt=F("expected_amount"),
        due_date__lt=target_today,
    ).update(status=Payment.Status.OVERDUE)

    payments_qs = (
        Payment.objects.filter(
            contract__is_active=True,
            contract__owner__is_frozen=False,
            status__in=Payment.OPEN_STATUSES,
            paid_amount__lt=F("expected_amount"),
            contract__driver__user__isnull=False,
            contract__driver__user__telegram_id__isnull=False,
            contract__driver__user__is_onboarded=True,
        )
        .filter(Q(last_notified_date__isnull=True) | ~Q(last_notified_date=target_today))
        .filter(Q(due_date__lte=target_today) | Q(due_date=seven_days_later))
        .select_related("contract__car", "contract__driver__user", "contract__owner")
        .order_by("due_date", "contract_id", "month_number")
    )

    notifications = []
    for payment in payments_qs:
        driver_user = payment.contract.driver.user
        driver_phone = (
            getattr(driver_user, "phone_number", None)
            or getattr(driver_user, "phone", None)
            or ""
        ).strip()
        if not driver_phone:
            continue

        formatted = format_ijarachi_payment_notification(payment, target_today)
        if not formatted:
            continue

        kind, text = formatted
        notifications.append(
            {
                "payment_id": payment.id,
                "telegram_id": driver_user.telegram_id,
                "kind": kind,
                "text": text,
                "prev_last_notified_date": payment.last_notified_date,
            }
        )

    return notifications


def _close_idle_connections() -> None:
    """Safely closes obsolete DB connections without disrupting TestCase atomic blocks."""
    for conn in connections.all():
        if not getattr(conn, "in_atomic_block", False):
            conn.close_if_unusable_or_obsolete()


@sync_to_async
def _collect_ijarachi_notifications_sync(today: date) -> list[dict]:
    _close_idle_connections()
    try:
        return collect_ijarachi_payment_notifications(today=today)
    finally:
        _close_idle_connections()


@sync_to_async
def _claim_payment_notification_sync(payment_id: int, today: date, mark_7days: bool) -> bool:
    try:
        update_kwargs = {"last_notified_date": today}
        if mark_7days:
            update_kwargs["notified_7days_before"] = True
        updated = (
            Payment.objects.filter(id=payment_id)
            .filter(Q(last_notified_date__isnull=True) | ~Q(last_notified_date=today))
            .update(**update_kwargs)
        )
        return updated > 0
    finally:
        _close_idle_connections()


@sync_to_async
def _release_payment_notification_sync(
    payment_id: int,
    today: date,
    prev_date: date | None,
    unmark_7days: bool,
) -> None:
    try:
        update_kwargs = {"last_notified_date": prev_date}
        if unmark_7days:
            update_kwargs["notified_7days_before"] = False
        Payment.objects.filter(id=payment_id, last_notified_date=today).update(
            **update_kwargs
        )
    finally:
        _close_idle_connections()


async def send_ijarachi_payment_notifications(
    bot: Bot,
    today: date | None = None,
) -> int:
    """
    Sends 7-day, due-today, and daily overdue notifications to onboarded Ijarachi users.
    """
    target_today = today or timezone.localdate()
    notifications = await _collect_ijarachi_notifications_sync(target_today)
    if not notifications:
        return 0

    client_url = f"{get_webapp_url().rstrip('/')}/client"
    client_keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚗 Shartnomani ko'rish (Mini App)",
                    web_app=WebAppInfo(url=client_url),
                )
            ]
        ]
    )

    sent_count = 0
    for item in notifications:
        is_7days = item["kind"] == "7days"
        claimed = await _claim_payment_notification_sync(
            item["payment_id"], target_today, is_7days
        )
        if not claimed:
            continue

        try:
            await bot.send_message(
                chat_id=item["telegram_id"],
                text=item["text"],
                reply_markup=client_keyboard,
            )
            sent_count += 1
            await asyncio.sleep(0.05)
        except Exception as e:
            await _release_payment_notification_sync(
                item["payment_id"],
                target_today,
                item["prev_last_notified_date"],
                is_7days,
            )
            logger.error(
                "Failed to send Ijarachi notification for payment %s to %s: %s",
                item["payment_id"],
                item["telegram_id"],
                e,
            )

    return sent_count


async def send_arendator_overdue_notifications(bot: Bot) -> int:
    """
    Iterates through active Arendators with linked Telegram IDs and dispatches
    daily overdue summary alerts.
    """
    @sync_to_async
    def _get_active_arendator_alerts():
        _close_idle_connections()
        try:
            active_users = User.objects.filter(
                is_active=True,
                is_frozen=False,
                expires_at__gt=timezone.now(),
                telegram_id__isnull=False,
                role__in=[User.RoleChoices.ARENDATOR, "owner"],
            )
            user_alerts = []
            for u in active_users:
                text = build_overdue_summary_text(u)
                if text:
                    user_alerts.append((u.telegram_id, text))
            return user_alerts
        finally:
            _close_idle_connections()

    alerts = await _get_active_arendator_alerts()
    if not alerts:
        return 0

    webapp_url = get_webapp_url()
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Ilovani ochish (To'lovni kiritish)",
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )

    notified_count = 0
    for telegram_id, text in alerts:
        try:
            await bot.send_message(
                chat_id=telegram_id,
                text=text,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
            notified_count += 1
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.error(
                f"Failed to send overdue notification to {telegram_id}: {e}"
            )

    return notified_count


async def send_daily_overdue_notifications(bot: Bot) -> int:
    """
    Dispatches daily overdue and reminder alerts to both Arendators and Ijarachi clients.
    """
    arendator_count = await send_arendator_overdue_notifications(bot)
    ijarachi_count = await send_ijarachi_payment_notifications(bot)
    return arendator_count + ijarachi_count
