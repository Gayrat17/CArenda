import asyncio
import logging
from decimal import Decimal

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from asgiref.sync import sync_to_async
from django.conf import settings
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
            status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
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


async def send_daily_overdue_notifications(bot: Bot) -> int:
    """
    Iterates through active subscribers with linked Telegram IDs and dispatches
    overdue alerts with rate-limit delays.
    """
    @sync_to_async
    def get_active_users_with_alerts():
        try:
            active_users = User.objects.filter(
                is_active=True,
                expires_at__gt=timezone.now(),
                telegram_id__isnull=False,
                role__in=[User.RoleChoices.ARENDATOR, "owner"],
            )
            user_alerts = []
            for u in active_users:
                text = build_overdue_summary_text(u)
                if text:
                    user_alerts.append((u.telegram_id, text))

            # Alerts for onboarded Ijarachi clients
            from datetime import timedelta
            from apps.fleet.models import Contract, Payment
            today = timezone.localdate()
            ijarachi_contracts = (
                Contract.objects.filter(
                    is_active=True,
                    driver__user__isnull=False,
                    driver__user__telegram_id__isnull=False,
                    driver__user__is_onboarded=True,
                )
                .select_related("driver__user", "car", "owner")
                .prefetch_related("payments")
            )
            for c in ijarachi_contracts:
                driver_user = c.driver.user
                phone = getattr(driver_user, "phone_number", None) or getattr(driver_user, "phone", None)
                if not phone:
                    continue
                # Check overdue or due today/in next 3 days
                pending_p = (
                    c.payments.filter(
                        status__in=[Payment.Status.PENDING, Payment.Status.PARTIAL],
                        due_date__lte=today + timedelta(days=3),
                    )
                    .order_by("due_date")
                    .first()
                )
                if pending_p:
                    days_overdue = (today - pending_p.due_date).days
                    if days_overdue > 0:
                        status_str = f"⚠️ {days_overdue} kun kechikkan"
                    elif days_overdue == 0:
                        status_str = "📌 To'lov muddati: BUGUN"
                    else:
                        status_str = f"⏳ To'lov muddati: {pending_p.due_date}"

                    driver_text = (
                        f"🚗 <b>{c.car.name} ({c.car.plate_number})</b>\n"
                        f"Hurmatli <b>{c.driver.full_name}</b>, navbatdagi to'lov haqida eslatma:\n\n"
                        f"📅 Holat: <b>{status_str}</b>\n"
                        f"💵 To'lov summasi: <b>${pending_p.remaining_amount:.2f}</b>\n\n"
                        f"To'lov jadvali va to'liq ma'lumotlarni ilovamizda ko'rishingiz mumkin:"
                    )
                    user_alerts.append((driver_user.telegram_id, driver_text))

            return user_alerts
        finally:
            from django.db import connections
            connections.close_all()

    alerts = await get_active_users_with_alerts()
    notified_count = 0

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
