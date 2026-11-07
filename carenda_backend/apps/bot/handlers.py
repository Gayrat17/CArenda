from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import (
    BufferedInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from asgiref.sync import sync_to_async
from django.conf import settings

from apps.bot.services import build_overdue_summary_text
from apps.fleet.excel import generate_tenant_excel_report
from apps.users.models import User, UserSetting

router = Router()


def get_main_reply_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🚨 Qarzdorlar ro'yxati"),
                KeyboardButton(text="📥 Excel hisobot"),
            ],
            [
                KeyboardButton(text="📊 Mening obunam"),
            ],
        ],
        resize_keyboard=True,
    )


def get_miniapp_inline_keyboard() -> InlineKeyboardMarkup:
    webapp_url = getattr(settings, "WEBAPP_URL", "http://localhost:3000")
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Carenda Mini App'ni ochish",
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )


@sync_to_async
def get_or_create_bot_user(from_user):
    tg_id = from_user.id
    first_name = from_user.first_name or ""
    last_name = from_user.last_name or ""
    full_name = f"{first_name} {last_name}".strip() or (from_user.username or f"tg_{tg_id}")
    username = from_user.username or f"tg_{tg_id}"

    user, created = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={
            "username": username,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
        },
    )

    if not created:
        updated = False
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            updated = True
        if username and user.username != username:
            user.username = username
            updated = True
        if updated:
            user.save(update_fields=["full_name", "username"])

    UserSetting.objects.get_or_create(owner=user)
    return user


@router.message(CommandStart())
async def handle_start(message: Message):
    if not message.from_user:
        return

    user = await get_or_create_bot_user(message.from_user)

    welcome_text = (
        f"Assalomu alaykum, <b>{user.full_name}</b>!\n\n"
        f"<b>Carenda</b> — avtomobil ijarasi (arenda) boshqaruvi platformasiga xush kelibsiz.\n\n"
        f"📱 Avtoparkingizni boshqarish, yangi shartnomalar tuzish va to'lovlarni kiritish uchun "
        f"quyidagi tugma orqali <b>Telegram Mini App</b>'ni oching:"
    )

    await message.answer(
        welcome_text,
        parse_mode="HTML",
        reply_markup=get_main_reply_keyboard(),
    )
    await message.answer(
        "Mini App'ni ishga tushirish:",
        reply_markup=get_miniapp_inline_keyboard(),
    )


@router.message(F.text == "🚨 Qarzdorlar ro'yxati")
async def handle_overdue_list(message: Message):
    if not message.from_user:
        return

    user = await get_or_create_bot_user(message.from_user)
    summary_text = await sync_to_async(build_overdue_summary_text)(user)

    if not summary_text:
        await message.answer(
            "🎉 <b>Hozircha kechikkan yoki bugungi to'lovlar mavjud emas!</b>\n"
            "Barcha to'lovlar to'liq va o'z vaqtida amalga oshirilgan.",
            parse_mode="HTML",
            reply_markup=get_miniapp_inline_keyboard(),
        )
    else:
        await message.answer(
            summary_text,
            parse_mode="HTML",
            reply_markup=get_miniapp_inline_keyboard(),
        )


@router.message(F.text == "📥 Excel hisobot")
async def handle_excel_export(message: Message):
    if not message.from_user:
        return

    user = await get_or_create_bot_user(message.from_user)
    await message.answer("⏳ Hisobot tayyorlanmoqda, iltimos kuting...")

    excel_bytes = await sync_to_async(generate_tenant_excel_report)(user)
    document = BufferedInputFile(excel_bytes, filename="carenda_hisobot.xlsx")

    await message.answer_document(
        document=document,
        caption="📊 <b>Carenda</b> — Mashinalar, shartnomalar va to'lovlar jadvali hisoboti.",
        parse_mode="HTML",
    )


@router.message(F.text == "📊 Mening obunam")
async def handle_subscription_info(message: Message):
    if not message.from_user:
        return

    @sync_to_async
    def get_user_sub_details():
        user = User.objects.get(telegram_id=message.from_user.id)
        setting, _ = UserSetting.objects.get_or_create(owner=user)
        return {
            "full_name": user.full_name,
            "plan": user.plan.title(),
            "cars_count": user.cars.count(),
            "cars_limit": user.cars_limit,
            "percent": setting.default_annual_percent,
            "expires_at": user.expires_at.strftime("%d.%m.%Y %H:%M")
            if user.expires_at
            else "Cheksiz",
            "is_active": user.is_subscription_active,
        }

    info = await get_user_sub_details()
    sub_text = (
        f"📊 <b>Mening Obuna Ma'lumotlarim:</b>\n\n"
        f"👤 Arendator: <b>{info['full_name']}</b>\n"
        f"📦 Tarif: <b>{info['plan']}</b> ({'✅ Faol' if info['is_active'] else '❌ Tugagan'})\n"
        f"🚗 Mashinalar: <b>{info['cars_count']} / {info['cars_limit']} ta</b>\n"
        f"📈 Standart yillik foiz: <b>{info['percent']}%</b>\n"
        f"⏳ Amal qilish muddati: <b>{info['expires_at']}</b>"
    )

    await message.answer(
        sub_text,
        parse_mode="HTML",
        reply_markup=get_miniapp_inline_keyboard(),
    )
