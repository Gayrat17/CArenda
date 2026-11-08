from datetime import timedelta

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BufferedInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from asgiref.sync import sync_to_async
from django.conf import settings
from django.utils import timezone

from apps.bot.services import build_overdue_summary_text, get_webapp_url
from apps.fleet.excel import generate_tenant_excel_report
from apps.fleet.models import Driver, normalize_phone
from apps.users.models import User, UserSetting

router = Router()


class RegistrationStates(StatesGroup):
    waiting_for_role = State()
    waiting_for_owner_phone = State()
    waiting_for_tenant_code = State()
    waiting_for_user_phone = State()


def get_role_selection_keyboard() -> ReplyKeyboardMarkup:
    """Reply keyboard for role selection."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🚗 Men Arendatorman"),
                KeyboardButton(text="👤 Men Foydalanuvchiman (Ijarachi)"),
            ]
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


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


def get_client_miniapp_inline_keyboard() -> InlineKeyboardMarkup:
    webapp_url = get_webapp_url()
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 To'lov jadvalimni ko'rish",
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
def find_owner_by_code(code: str) -> User | None:
    if not code:
        return None
    return User.objects.filter(
        role=User.RoleChoices.OWNER,
        tenant_code__iexact=code.strip(),
    ).first()


@sync_to_async
def register_owner_user(from_user, phone_number: str) -> User:
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
            "is_registered": True,
            "expires_at": timezone.now() + timedelta(days=14),
        },
    )

    user.phone = cleaned_phone
    user.role = User.RoleChoices.OWNER
    user.is_registered = True
    if full_name:
        user.full_name = full_name
    user.save(update_fields=["phone", "role", "is_registered", "full_name"])

    UserSetting.objects.get_or_create(owner=user)
    return user


@sync_to_async
def match_and_register_user_driver(
    from_user, phone_number: str, target_owner_id: int
) -> tuple[User | None, str | None]:
    normalized_incoming = normalize_phone(phone_number)
    if not normalized_incoming:
        return None, None

    drivers = Driver.objects.filter(owner_id=target_owner_id)
    matched_driver = None
    for d in drivers:
        if normalize_phone(d.phone) == normalized_incoming:
            matched_driver = d
            break

    if not matched_driver:
        return None, None

    tg_id = from_user.id
    first_name = from_user.first_name or ""
    last_name = from_user.last_name or ""
    full_name = matched_driver.full_name or f"{first_name} {last_name}".strip()
    username = from_user.username or f"tg_{tg_id}"

    cleaned_phone = phone_number.strip()
    if not cleaned_phone.startswith("+"):
        cleaned_phone = f"+{cleaned_phone}"

    user, _ = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={
            "username": username,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "phone": cleaned_phone,
            "role": User.RoleChoices.USER,
            "parent_owner_id": target_owner_id,
            "is_registered": True,
        },
    )

    user.phone = cleaned_phone
    user.role = User.RoleChoices.USER
    user.parent_owner_id = target_owner_id
    user.is_registered = True
    if full_name:
        user.full_name = full_name
    user.save(update_fields=["phone", "role", "parent_owner_id", "is_registered", "full_name"])

    matched_driver.user = user
    matched_driver.save(update_fields=["user"])

    return user, matched_driver.full_name


match_and_register_client_driver = match_and_register_user_driver


# -----------------------------------------------------------------------------
# Handlers
# -----------------------------------------------------------------------------

@router.message(CommandStart())
async def handle_start(message: Message, state: FSMContext):
    if not message.from_user:
        return

    tg_id = message.from_user.id
    user = await get_existing_user(tg_id)

    # 1. Already registered user check
    if user and user.is_registered and user.phone:
        await state.clear()
        if user.role == User.RoleChoices.USER:
            welcome_text = (
                f"Assalomu alaykum, <b>{user.full_name}</b>!\n\n"
                f"Carenda ijarachi kabinetiga xush kelibsiz.\n"
                f"Pastdagi tugma orqali to'lovlar jadvalingiz va shartnomangizni ko'rishingiz mumkin:"
            )
            await message.answer(welcome_text, parse_mode="HTML")
            await message.answer(
                "Mijoz kabinetini ochish:",
                reply_markup=get_client_miniapp_inline_keyboard(),
            )
            return

        # Owner / Superadmin
        welcome_text = (
            f"Assalomu alaykum, <b>{user.full_name}</b>!\n\n"
            f"Carenda boshqaruv tizimiga xush kelibsiz.\n"
            f"🔑 Maxsus kod: <b>{user.tenant_code}</b>\n"
            f"<i>(Ushbu kodni haydovchilaringizga bering, ular tizimga ulanishi uchun)</i>\n\n"
            f"Pastdagi tugmani bosing:"
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
        return

    # 2. Not registered yet -> Ask role selection
    await state.clear()
    await state.set_state(RegistrationStates.waiting_for_role)
    prompt_text = (
        f"Assalomu alaykum, <b>{message.from_user.full_name}</b>!\n\n"
        f"Carenda platformasiga xush kelibsiz.\n"
        f"Iltimos, tizimdan foydalanish uchun o'z rolingizni tanlang:"
    )
    await message.answer(
        prompt_text,
        parse_mode="HTML",
        reply_markup=get_role_selection_keyboard(),
    )


# --- Flow A: Arendator ---

@router.message(F.text == "🚗 Men Arendatorman")
async def handle_choose_owner(message: Message, state: FSMContext):
    await state.set_state(RegistrationStates.waiting_for_owner_phone)
    await message.answer(
        "Arendator sifatida ro'yxatdan o'tish uchun iltimos, "
        "pastdagi tugmani bosib telefon raqamingizni yuboring:",
        reply_markup=get_contact_request_keyboard(),
    )


@router.message(RegistrationStates.waiting_for_owner_phone, F.contact)
async def handle_owner_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return

    user = await register_owner_user(message.from_user, message.contact.phone_number)
    await state.clear()

    success_text = (
        f"Rahmat, <b>{user.full_name}</b>! Siz Arendator sifatida muvaffaqiyatli ro'yxatdan o'tdingiz ✅\n\n"
        f"🔑 Sizning maxsus kodingiz: <b>{user.tenant_code}</b>\n"
        f"<i>Ushbu kodni haydovchilaringizga (ijarachilarga) bering, ular tizimga ulanishi uchun kerak bo'ladi.</i>\n\n"
        f"Quyidagi tugma orqali ilovani ochishingiz mumkin:"
    )
    await message.answer(
        success_text,
        parse_mode="HTML",
        reply_markup=get_main_reply_keyboard(),
    )
    await message.answer(
        "Mini App'ni ochish:",
        reply_markup=get_miniapp_inline_keyboard(),
    )


# --- Flow B: User (Driver / Ijarachi) ---

@router.message(F.text.in_(["👤 Men Foydalanuvchiman (Ijarachi)", "👤 Men Ijarachiman (Mijoz)"]))
async def handle_choose_user(message: Message, state: FSMContext):
    await state.set_state(RegistrationStates.waiting_for_tenant_code)
    await message.answer(
        "Arendatoringiz bergan maxsus kodni kiriting (masalan: AR-4829):",
        reply_markup=ReplyKeyboardRemove(),
    )


handle_choose_client = handle_choose_user


@router.message(RegistrationStates.waiting_for_tenant_code, F.text)
async def handle_user_tenant_code(message: Message, state: FSMContext):
    code = message.text.strip().upper()
    owner = await find_owner_by_code(code)

    if not owner:
        await message.answer(
            "❌ Bunday kodli arendator topilmadi. Qaytadan kiriting (masalan: AR-4829):"
        )
        return

    await state.update_data(
        target_owner_id=owner.id,
        target_owner_name=owner.full_name or owner.username,
    )
    await state.set_state(RegistrationStates.waiting_for_user_phone)
    await message.answer(
        f"✅ Arendator topildi: <b>{owner.full_name or owner.username}</b>!\n\n"
        f"Endi shaxsingizni tasdiqlash uchun pastdagi tugma orqali telefon raqamingizni yuboring:",
        parse_mode="HTML",
        reply_markup=get_contact_request_keyboard(),
    )


handle_client_tenant_code = handle_user_tenant_code


@router.message(RegistrationStates.waiting_for_user_phone, F.contact)
async def handle_user_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return

    data = await state.get_data()
    target_owner_id = data.get("target_owner_id")

    if not target_owner_id:
        await state.clear()
        await message.answer(
            "Xatolik yuz berdi. Iltimos, /start buyrug'ini bosib qaytadan boshlang.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    raw_phone = message.contact.phone_number
    user, driver_name = await match_and_register_user_driver(
        message.from_user, raw_phone, target_owner_id
    )

    if not user:
        await state.clear()
        await message.answer(
            "🚫 Bazada bunday foydalanuvchi yo'q! "
            "Avval arendatoringiz sizni o'z tizimiga kiritishi kerak.\n\n"
            "Boshidan boshlash uchun /start buyrug'ini bosing.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    await state.clear()
    success_text = (
        f"✅ Tasdiqlandi! Xush kelibsiz, <b>{driver_name}</b>.\n\n"
        f"Quyidagi tugma orqali shartnomangiz va to'lovlar jadvalini ko'rishingiz mumkin:"
    )
    await message.answer(
        success_text,
        parse_mode="HTML",
        reply_markup=ReplyKeyboardRemove(),
    )
    await message.answer(
        "Mijoz kabinetini ochish:",
        reply_markup=get_client_miniapp_inline_keyboard(),
    )


handle_client_contact = handle_user_contact


# --- Default Fallback Contact handler ---

@router.message(F.contact)
async def handle_general_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return
    current_state = await state.get_state()
    if current_state == RegistrationStates.waiting_for_user_phone.state:
        await handle_user_contact(message, state)
    else:
        await handle_owner_contact(message, state)


# --- Arendator Reply Keyboard Commands ---

@router.message(F.text == "🚨 Qarzdorlar ro'yxati")
async def handle_overdue_list(message: Message):
    if not message.from_user:
        return

    user = await get_existing_user(message.from_user.id)
    if not user or not user.is_registered or not user.phone:
        await message.answer(
            "Iltimos, avval /start buyrug'i orqali ro'yxatdan o'ting.",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    if user.role == User.RoleChoices.USER:
        await message.answer(
            "Siz foydalanuvchi (ijarachi) maqomidasiz. Ushbu amal faqat arendatorlar uchun mo'ljallangan.",
            reply_markup=get_client_miniapp_inline_keyboard(),
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
    if not user or not user.is_registered or not user.phone:
        await message.answer(
            "Iltimos, avval /start buyrug'i orqali ro'yxatdan o'ting.",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    if user.role == User.RoleChoices.USER:
        await message.answer(
            "Siz foydalanuvchi (ijarachi) maqomidasiz. Excel hisobot faqat arendatorlar uchun mo'ljallangan.",
            reply_markup=get_client_miniapp_inline_keyboard(),
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
    if not user or not user.is_registered or not user.phone:
        await message.answer(
            "Iltimos, avval /start buyrug'i orqali ro'yxatdan o'ting.",
            reply_markup=get_contact_request_keyboard(),
        )
        return

    if user.role == User.RoleChoices.USER:
        await message.answer(
            f"👤 Foydalanuvchi: <b>{user.full_name}</b>\n\n"
            "Sizning shartnomangiz va to'lov jadvalingiz bilan quyidagi tugma orqali tanishishingiz mumkin:",
            parse_mode="HTML",
            reply_markup=get_client_miniapp_inline_keyboard(),
        )
        return

    @sync_to_async
    def get_user_sub_details():
        owner = user.tenant_owner
        setting, _ = UserSetting.objects.get_or_create(owner=owner)
        return {
            "full_name": user.full_name,
            "role": user.get_role_display(),
            "tenant_code": owner.tenant_code or "AR-XXXX",
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
    sub_text = (
        f"📊 <b>Mening Obuna Ma'lumotlarim:</b>\n\n"
        f"👤 Foydalanuvchi: <b>{info['full_name']}</b>\n"
        f"🛡 Rol: <b>{info['role']}</b>\n"
        f"🔑 Maxsus kod: <b>{info['tenant_code']}</b>\n"
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
