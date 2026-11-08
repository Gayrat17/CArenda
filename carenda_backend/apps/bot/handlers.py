from datetime import timedelta

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import (
    BufferedInputFile,
    ContentType,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from asgiref.sync import sync_to_async
from django.conf import settings
from django.utils import timezone

from apps.bot.services import build_overdue_summary_text, get_webapp_url
from apps.fleet.excel import generate_tenant_excel_report
from apps.users.models import User, UserSetting

router = Router()


def get_contact_request_keyboard() -> ReplyKeyboardMarkup:
    """Reply keyboard with request_contact=True for mandatory phone registration."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="📞 Telefon raqamni yuborish",
                    request_contact=True,
                )
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


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
    webapp_url = get_webapp_url()
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Carenda",
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )


@sync_to_async
def get_existing_user(telegram_id: int) -> User | None:
    try:
        return User.objects.get(telegram_id=telegram_id)
    except User.DoesNotExist:
        return None


@sync_to_async
def register_or_update_contact_user(from_user, phone_number: str) -> User:
    tg_id = from_user.id
    first_name = from_user.first_name or ""
    last_name = from_user.last_name or ""
    full_name = f"{first_name} {last_name}".strip() or (from_user.username or f"tg_{tg_id}")
    username = from_user.username or f"tg_{tg_id}"

    cleaned_phone = phone_number.strip()
    if not cleaned_phone.startswith("+"):
        cleaned_phone = f"+{cleaned_phone}"

    user, created = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={
            "username": username,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "phone": cleaned_phone,
            "role": User.RoleChoices.OWNER,
            "plan": User.Plan.TRIAL,
            "cars_limit": 2,
            "expires_at": timezone.now() + timedelta(days=14),
        },
    )

    updated = False
    if not created:
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            updated = True
        if username and user.username != username:
            user.username = username
            updated = True

    if user.phone != cleaned_phone:
        user.phone = cleaned_phone
        updated = True

    if updated:
        user.save(update_fields=["full_name", "username", "phone"])

    UserSetting.objects.get_or_create(owner=user)
    return user


@router.message(CommandStart())
async def handle_start(message: Message):
    if not message.from_user:
        return

    tg_id = message.from_user.id
    user = await get_existing_user(tg_id)

    # If user does not exist or has no phone registered, request contact
    if not user or not user.phone:
        prompt_text = (
            "Assalomu alaykum! Carenda platformasidan foydalanish uchun "
            "iltimos, pastdagi tugmani bosib telefon raqamingizni yuboring."
        )
        await message.answer(
            prompt_text,
            reply_markup=get_contact_request_keyboard(),
        )
        return

    # Already registered user with phone
    welcome_text = (
        f"Assalomu alaykum, <b>{user.full_name}</b>!\n\n"
        f"Carenda boshqaruv tizimiga xush kelibsiz. Pastdagi tugmani bosing:"
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


@router.message(F.contact)
async def handle_contact(message: Message):
    if not message.from_user or not message.contact:
        return

    raw_phone = message.contact.phone_number
    user = await register_or_update_contact_user(message.from_user, raw_phone)

    success_text = (
        f"Rahmat! Siz muvaffaqiyatli ro'yxatdan o'tdingiz ✅\n\n"
        f"Endi quyidagi tugma orqali ilovani ochishingiz mumkin:"
    )

    await message.answer(
        success_text,
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

    user = await get_existing_user(message.from_user.id)
    if not user or not user.phone:
        await message.answer(
            "Iltimos, avval telefon raqamingizni yuborib ro'yxatdan o'ting:",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    tenant_owner = await sync_to_async(lambda: user.tenant_owner)()
    summary_text = await sync_to_async(build_overdue_summary_text)(tenant_owner)

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

    user = await get_existing_user(message.from_user.id)
    if not user or not user.phone:
        await message.answer(
            "Iltimos, avval telefon raqamingizni yuborib ro'yxatdan o'ting:",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    tenant_owner = await sync_to_async(lambda: user.tenant_owner)()
    await message.answer("⏳ Hisobot tayyorlanmoqda, iltimos kuting...")

    excel_bytes = await sync_to_async(generate_tenant_excel_report)(tenant_owner)
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

    user = await get_existing_user(message.from_user.id)
    if not user or not user.phone:
        await message.answer(
            "Iltimos, avval telefon raqamingizni yuborib ro'yxatdan o'ting:",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    @sync_to_async
    def get_user_sub_details():
        owner = user.tenant_owner
        setting, _ = UserSetting.objects.get_or_create(owner=owner)
        return {
            "full_name": user.full_name,
            "role": user.get_role_display(),
            "is_staff": user.role == User.RoleChoices.STAFF,
            "owner_name": owner.full_name if user.parent_owner else None,
            "plan": owner.plan.title(),
            "cars_count": owner.cars.count(),
            "cars_limit": owner.cars_limit,
            "percent": setting.default_annual_percent,
            "expires_at": (
                owner.expires_at.strftime("%d.%m.%Y %H:%M")
                if owner.expires_at
                else "Cheksiz"
            ),
            "is_active": owner.is_subscription_active,
        }

    info = await get_user_sub_details()
    role_note = (
        f"\n🏢 Tashkilot rahbari: <b>{info['owner_name']}</b>"
        if info["is_staff"] and info["owner_name"]
        else ""
    )
    sub_text = (
        f"📊 <b>Mening Obuna Ma'lumotlarim:</b>\n\n"
        f"👤 Foydalanuvchi: <b>{info['full_name']}</b>\n"
        f"🛡 Rol: <b>{info['role']}</b>{role_note}\n"
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
