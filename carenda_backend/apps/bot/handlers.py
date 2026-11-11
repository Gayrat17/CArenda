import logging
from datetime import timedelta

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
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

logger = logging.getLogger(__name__)
router = Router()


class RegistrationStates(StatesGroup):
    waiting_for_role = State()
    waiting_for_owner_phone = State()
    waiting_for_tenant_code = State()
    waiting_for_user_phone = State()


# Aliases for OnboardingState compatibility
RegistrationStates.waiting_for_code = RegistrationStates.waiting_for_tenant_code
RegistrationStates.waiting_for_phone = RegistrationStates.waiting_for_user_phone
OnboardingState = RegistrationStates


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
    client_url = f"{webapp_url.rstrip('/')}/client"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 To'lov jadvalimni ko'rish",
                    web_app=WebAppInfo(url=client_url),
                )
            ]
        ]
    )


@sync_to_async
def get_existing_user(user_or_id) -> User | None:
    if isinstance(user_or_id, int):
        tg_id = user_or_id
        from_user = None
    else:
        from_user = user_or_id
        tg_id = getattr(from_user, "id", None) if from_user else None

    if not tg_id:
        return None

    try:
        user = User.objects.get(telegram_id=tg_id)
    except User.DoesNotExist:
        return None

    if from_user:
        first_name = getattr(from_user, "first_name", "") or ""
        last_name = getattr(from_user, "last_name", "") or ""
        full_name = f"{first_name} {last_name}".strip()
        raw_username = getattr(from_user, "username", None)
        fields = []

        if full_name and user.full_name != full_name:
            user.full_name = full_name
            fields.append("full_name")
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            fields.append("first_name")
        if last_name and user.last_name != last_name:
            user.last_name = last_name
            fields.append("last_name")
        if raw_username and user.username != raw_username:
            if not User.objects.filter(username=raw_username).exclude(pk=user.pk).exists():
                user.username = raw_username
                fields.append("username")
        if fields:
            user.save(update_fields=fields)

    return user


def _normalize_code_variants(raw_code: str) -> list[str]:
    clean = raw_code.strip().upper().replace(" ", "")
    variants = [clean]
    if clean.startswith("AR") and "-" not in clean and len(clean) >= 5:
        variants.append(f"AR-{clean[2:]}")
    if clean.startswith("CR") and "-" in clean:
        variants.append(clean.replace("-", ""))
    return list(dict.fromkeys(variants))


@sync_to_async
def find_code_target(code: str) -> dict | None:
    if not code:
        return None
    from apps.fleet.models import Contract
    from django.db.models import Q

    for candidate in _normalize_code_variants(code):
        contract = (
            Contract.objects.filter(invite_code__iexact=candidate, is_active=True)
            .select_related("owner", "car", "driver")
            .first()
        )
        if contract:
            owner = contract.owner
            return {
                "type": "contract",
                "owner": owner,
                "contract": contract,
                "contract_id": contract.id,
                "car_name": contract.car.name if contract.car else None,
                "plate_number": contract.car.plate_number if contract.car else None,
                "driver_name": contract.driver.full_name if contract.driver else None,
                "code": candidate,
            }
        owner = User.objects.filter(
            Q(tenant_code__iexact=candidate) | Q(invite_code__iexact=candidate),
            role=User.RoleChoices.ARENDATOR,
        ).first()
        if owner:
            return {
                "type": "arendator",
                "owner": owner,
                "contract": None,
                "contract_id": None,
                "car_name": None,
                "plate_number": None,
                "driver_name": None,
                "code": candidate,
            }
    return None


@sync_to_async
def find_owner_by_code(code: str) -> User | None:
    if not code:
        return None
    clean = code.strip().upper()
    from apps.fleet.models import Contract
    from django.db.models import Q
    contract = Contract.objects.filter(invite_code__iexact=clean, is_active=True).select_related("owner").first()
    if contract:
        return contract.owner
    return User.objects.filter(
        Q(tenant_code__iexact=clean) | Q(invite_code__iexact=clean),
        role=User.RoleChoices.ARENDATOR,
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

    from apps.users.authentication import resolve_unique_username
    from apps.users.models import SubscriptionSettings
    sub_settings = SubscriptionSettings.get_settings()
    now = timezone.now()
    trial_end = now + timedelta(days=sub_settings.free_duration_days)
    safe_username = resolve_unique_username(username, tg_id)

    user, created = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={
            "username": safe_username,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "phone": cleaned_phone,
            "phone_number": cleaned_phone,
            "role": User.RoleChoices.ARENDATOR,
            "plan": User.Plan.FREE,
            "cars_limit": sub_settings.free_max_contracts,
            "is_registered": True,
            "is_onboarded": True,
            "trial_ends_at": trial_end,
            "expires_at": trial_end,
        },
    )

    user.phone = cleaned_phone
    user.phone_number = cleaned_phone
    user.role = User.RoleChoices.ARENDATOR
    user.is_registered = True
    user.is_onboarded = True
    fields = ["phone", "phone_number", "role", "is_registered", "is_onboarded"]
    if full_name and user.full_name != full_name:
        user.full_name = full_name
        fields.append("full_name")
    if first_name and user.first_name != first_name:
        user.first_name = first_name
        fields.append("first_name")
    if last_name and user.last_name != last_name:
        user.last_name = last_name
        fields.append("last_name")
    if from_user.username and user.username != from_user.username:
        if not User.objects.filter(username=from_user.username).exclude(pk=user.pk).exists():
            user.username = from_user.username
            fields.append("username")
    user.save(update_fields=fields)

    UserSetting.objects.get_or_create(owner=user)
    return user


@sync_to_async
def match_and_register_user_driver(
    from_user,
    phone_number: str,
    target_owner_id: int,
    target_contract_id: int | None = None,
    invite_code: str | None = None,
) -> tuple[User | None, str | None]:
    normalized_incoming = normalize_phone(phone_number)
    cleaned_phone = phone_number.strip()
    if not cleaned_phone.startswith("+"):
        cleaned_phone = f"+{cleaned_phone}"

    tg_id = from_user.id
    first_name = from_user.first_name or ""
    last_name = from_user.last_name or ""
    full_name = f"{first_name} {last_name}".strip()
    username = from_user.username or f"tg_{tg_id}"

    from apps.fleet.models import Contract
    matched_driver = None

    # 1. If target_contract_id was provided
    if target_contract_id:
        contract = (
            Contract.objects.filter(id=target_contract_id)
            .select_related("driver", "owner")
            .first()
        )
        if contract and contract.driver:
            matched_driver = contract.driver
            if not matched_driver.phone:
                matched_driver.phone = cleaned_phone
                matched_driver.save(update_fields=["phone"])

    # 2. If no contract or driver not matched yet, search by phone
    if not matched_driver and normalized_incoming:
        drivers = Driver.objects.filter(owner_id=target_owner_id)
        for d in drivers:
            driver_norm_phones = [normalize_phone(p) for p in d.all_phones]
            if normalized_incoming in driver_norm_phones:
                matched_driver = d
                break

    # 3. If invite_code provided and matches a contract
    if not matched_driver and invite_code:
        contract = (
            Contract.objects.filter(invite_code__iexact=invite_code.strip())
            .select_related("driver", "owner")
            .first()
        )
        if contract and contract.driver:
            matched_driver = contract.driver
            if not matched_driver.phone:
                matched_driver.phone = cleaned_phone
                matched_driver.save(update_fields=["phone"])

    if not matched_driver:
        return None, None

    if matched_driver and matched_driver.full_name:
        full_name = matched_driver.full_name
    elif not full_name:
        full_name = username

    from apps.users.authentication import resolve_unique_username
    safe_username = resolve_unique_username(username, tg_id)

    user, _ = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={
            "username": safe_username,
            "full_name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "phone": cleaned_phone,
            "phone_number": cleaned_phone,
            "role": User.RoleChoices.USER,
            "parent_owner_id": target_owner_id,
            "linked_arendator_id": target_owner_id,
            "is_registered": True,
            "is_onboarded": True,
        },
    )

    user.phone = cleaned_phone
    user.phone_number = cleaned_phone
    user.role = User.RoleChoices.USER
    user.parent_owner_id = target_owner_id
    user.linked_arendator_id = target_owner_id
    user.is_registered = True
    user.is_onboarded = True

    fields = [
        "phone",
        "phone_number",
        "role",
        "parent_owner_id",
        "linked_arendator_id",
        "is_registered",
        "is_onboarded",
    ]
    if full_name and user.full_name != full_name:
        user.full_name = full_name
        fields.append("full_name")
    if first_name and user.first_name != first_name:
        user.first_name = first_name
        fields.append("first_name")
    if last_name and user.last_name != last_name:
        user.last_name = last_name
        fields.append("last_name")
    if from_user.username and user.username != from_user.username:
        if not User.objects.filter(username=from_user.username).exclude(pk=user.pk).exists():
            user.username = from_user.username
            fields.append("username")
    user.save(update_fields=fields)

    if matched_driver:
        matched_driver.user = user
        matched_driver.save(update_fields=["user"])

    from apps.fleet.services import invalidate_tenant_cache
    invalidate_tenant_cache(target_owner_id, tg_id)

    return user, (matched_driver.full_name if matched_driver else full_name)


match_and_register_client_driver = match_and_register_user_driver


# -----------------------------------------------------------------------------
# Handlers
# -----------------------------------------------------------------------------

@router.message(CommandStart())
async def handle_start(message: Message, state: FSMContext):
    if not message.from_user:
        return

    tg_id = message.from_user.id
    user = await get_existing_user(message.from_user)

    # 1. Already registered user check
    if user and user.is_registered and user.phone:
        await state.clear()
        if user.role in (User.RoleChoices.USER, User.RoleChoices.IJARACHI):
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

@router.message(F.text.func(lambda t: bool(t and "arendator" in t.lower())))
async def handle_choose_owner(message: Message, state: FSMContext):
    try:
        await state.set_state(RegistrationStates.waiting_for_owner_phone)
        await message.answer(
            "Arendator sifatida ro'yxatdan o'tish uchun iltimos, "
            "pastdagi tugmani bosib telefon raqamingizni yuboring:",
            reply_markup=get_contact_request_keyboard(),
        )
    except Exception:
        logger.exception("Error in handle_choose_owner")
        await message.answer("Texnik xatolik yuz berdi. Iltimos, /start buyrug'ini bosing.")


@router.message(RegistrationStates.waiting_for_owner_phone, F.contact)
async def handle_owner_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return

    try:
        contact_user_id = getattr(message.contact, "user_id", None)
        if isinstance(contact_user_id, int) and contact_user_id != message.from_user.id:
            await message.answer(
                "⚠️ Iltimos, boshqa birovning emas, o'zingizning telefon raqamingizni yuboring:",
                reply_markup=get_contact_request_keyboard(),
            )
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
    except Exception:
        logger.exception("Error in handle_owner_contact")
        await message.answer("Texnik xatolik yuz berdi. Iltimos, /start buyrug'ini bosing.")


@router.message(RegistrationStates.waiting_for_owner_phone)
async def handle_owner_phone_non_contact(message: Message):
    await message.answer(
        "📱 Iltimos, telefon raqamingizni qo'lda yozmasdan, pastdagi <b>«📞 Telefon raqamni yuborish»</b> tugmasini bosing:",
        parse_mode="HTML",
        reply_markup=get_contact_request_keyboard(),
    )


# --- Flow B: User (Driver / Ijarachi) ---

@router.message(
    F.text.func(lambda t: bool(t and ("ijarachi" in t.lower() or "foydalanuvchiman" in t.lower())))
)
async def handle_choose_user(message: Message, state: FSMContext):
    try:
        await state.set_state(RegistrationStates.waiting_for_tenant_code)
        await message.answer(
            "🔑 Iltimos, arendatoringiz bergan maxsus kodni kiriting (masalan: AR-4829 yoki CR4829):",
            reply_markup=ReplyKeyboardRemove(),
        )
    except Exception:
        logger.exception("Error in handle_choose_user")
        await message.answer("Texnik xatolik yuz berdi. Iltimos, /start buyrug'ini bosing.")


handle_choose_client = handle_choose_user


@router.message(RegistrationStates.waiting_for_tenant_code, F.text)
async def handle_user_tenant_code(message: Message, state: FSMContext):
    try:
        code = (message.text or "").strip().upper()
        if not code:
            await message.answer(
                "❌ Iltimos, maxsus kodni matn ko'rinishida kiriting (masalan: AR-4829):"
            )
            return

        target_info = await find_code_target(code)

        if not target_info:
            await message.answer(
                "❌ Bunday kodli arendator topilmadi! Kiritilgan maxsus kod xato, iltimos tekshirib qaytadan kiriting:"
            )
            return

        owner = target_info["owner"]
        await state.update_data(
            target_owner_id=owner.id,
            target_owner_name=owner.full_name or owner.username,
            target_contract_id=target_info.get("contract_id"),
            target_code=target_info.get("code") or code,
        )
        await state.set_state(RegistrationStates.waiting_for_user_phone)

        car_msg = ""
        if target_info.get("car_name"):
            plate = f" ({target_info['plate_number']})" if target_info.get("plate_number") else ""
            car_msg = f"\n🚗 Shartnoma avtomobili: <b>{target_info['car_name']}{plate}</b>"

        await message.answer(
            f"✅ Kod tasdiqlandi! Arendator: <b>{owner.full_name or owner.username}</b>{car_msg}\n\n"
            f"Endi tizim va to'lov eslatmalari ishlashi uchun pastdagi tugma orqali telefon raqamingizni yuboring:",
            parse_mode="HTML",
            reply_markup=get_contact_request_keyboard(),
        )
    except Exception:
        logger.exception("Error in handle_user_tenant_code")
        await message.answer(
            "Texnik xatolik yuz berdi. Iltimos, /start buyrug'ini bosib qaytadan urinib ko'ring."
        )


handle_client_tenant_code = handle_user_tenant_code


@router.message(RegistrationStates.waiting_for_user_phone, F.contact)
async def handle_user_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return

    try:
        contact_user_id = getattr(message.contact, "user_id", None)
        if isinstance(contact_user_id, int) and contact_user_id != message.from_user.id:
            await message.answer(
                "⚠️ Iltimos, boshqa birovning emas, o'zingizning telefon raqamingizni pastdagi tugma orqali yuboring:",
                reply_markup=get_contact_request_keyboard(),
            )
            return

        data = await state.get_data()
        target_owner_id = data.get("target_owner_id")
        target_contract_id = data.get("target_contract_id")
        target_code = data.get("target_code")

        if not target_owner_id:
            await state.clear()
            await message.answer(
                "Xatolik yuz berdi. Iltimos, /start buyrug'ini bosib qaytadan boshlang.",
                reply_markup=ReplyKeyboardRemove(),
            )
            return

        raw_phone = message.contact.phone_number
        user, driver_name = await match_and_register_user_driver(
            message.from_user,
            raw_phone,
            target_owner_id,
            target_contract_id=target_contract_id,
            invite_code=target_code,
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
            f"🎉 Ro'yxatdan o'tish muvaffaqiyatli yakunlandi! "
            f"Shartnomangiz va to'lovlar jadvalini ko'rish uchun pastdagi tugmani bosing:"
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
    except Exception:
        logger.exception("Error in handle_user_contact")
        await message.answer(
            "Texnik xatolik yuz berdi. Iltimos, /start buyrug'ini bosib qaytadan urinib ko'ring.",
            reply_markup=ReplyKeyboardRemove(),
        )


handle_client_contact = handle_user_contact


@router.message(RegistrationStates.waiting_for_user_phone)
async def handle_user_phone_non_contact(message: Message):
    await message.answer(
        "📱 Iltimos, telefon raqamingizni qo'lda yozmasdan, pastdagi <b>«📞 Telefon raqamni yuborish»</b> tugmasini bosing:",
        parse_mode="HTML",
        reply_markup=get_contact_request_keyboard(),
    )


# --- Default Fallback Contact handler ---

@router.message(F.contact)
async def handle_general_contact(message: Message, state: FSMContext):
    if not message.from_user or not message.contact:
        return
    current_state = await state.get_state()
    if current_state == RegistrationStates.waiting_for_user_phone.state:
        await handle_user_contact(message, state)
        return
    if current_state == RegistrationStates.waiting_for_owner_phone.state:
        await handle_owner_contact(message, state)
        return

    # User sent contact without active state (e.g. from Mini App requestContact or direct share)
    contact_user_id = getattr(message.contact, "user_id", None)
    if isinstance(contact_user_id, int) and contact_user_id != message.from_user.id:
        await message.answer(
            "⚠️ Iltimos, boshqa birovning emas, o'zingizning telefon raqamingizni yuboring.",
        )
        return

    user = await get_existing_user(message.from_user.id)
    raw_phone = message.contact.phone_number.strip()
    cleaned_phone = raw_phone if raw_phone.startswith("+") else f"+{raw_phone}"

    if user:
        from apps.fleet.services import invalidate_tenant_cache
        owner_id = user.tenant_owner.id if user.tenant_owner else user.id

        # If user hasn't finished WebApp onboarding yet, ONLY save phone number!
        # Do NOT force is_onboarded=True or assume default Arendator role!
        if not user.is_onboarded:
            user.phone = cleaned_phone
            user.phone_number = cleaned_phone
            await sync_to_async(user.save)(update_fields=["phone", "phone_number"])
            await sync_to_async(invalidate_tenant_cache)(owner_id, user.telegram_id)
            await message.answer(
                f"✅ Telefon raqamingiz qabul qilindi: <b>{cleaned_phone}</b>.\n\n"
                "Endi Mini App ilovasiga qaytib ro'yxatdan o'tishni yakunlang.",
                parse_mode="HTML",
            )
            return

        user.phone = cleaned_phone
        user.phone_number = cleaned_phone
        await sync_to_async(user.save)(update_fields=["phone", "phone_number"])
        await sync_to_async(invalidate_tenant_cache)(owner_id, user.telegram_id)

        role = (user.role or "").lower()
        if role in (User.RoleChoices.IJARACHI, User.RoleChoices.USER):
            await message.answer(
                f"✅ Telefon raqamingiz muvaffaqiyatli yangilandi: <b>{cleaned_phone}</b>.\n\n"
                "Quyidagi tugma orqali to'lovlar jadvalingizni ko'rishingiz mumkin:",
                parse_mode="HTML",
                reply_markup=get_client_miniapp_inline_keyboard(),
            )
        else:
            await message.answer(
                f"✅ Telefon raqamingiz muvaffaqiyatli yangilandi: <b>{cleaned_phone}</b>.\n\n"
                "Mini App'ni ochishingiz mumkin:",
                parse_mode="HTML",
                reply_markup=get_miniapp_inline_keyboard(),
            )
        return

    # If user does NOT exist in DB at all, DO NOT default to owner! Prompt to choose role!
    await state.clear()
    await message.answer(
        "Assalomu alaykum! CArenda tizimiga xush kelibsiz.\n\n"
        "Iltimos, avval rolingizni tanlang:",
        reply_markup=get_role_selection_keyboard(),
    )


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

    if user.role in (User.RoleChoices.USER, User.RoleChoices.IJARACHI):
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

    if user.role in (User.RoleChoices.USER, User.RoleChoices.IJARACHI):
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

    if user.role in (User.RoleChoices.USER, User.RoleChoices.IJARACHI):
        await message.answer(
            f"👤 Foydalanuvchi: <b>{user.full_name}</b>\n\n"
            "Sizning shartnomangiz va to'lov jadvalingiz bilan quyidagi tugma orqali tanishishingiz mumkin:",
            parse_mode="HTML",
            reply_markup=get_client_miniapp_inline_keyboard(),
        )
        return

    @sync_to_async
    def get_user_sub_details():
        from apps.users.models import SubscriptionSettings
        owner = user.tenant_owner
        setting, _ = UserSetting.objects.get_or_create(owner=owner)
        sub_settings = SubscriptionSettings.get_settings()

        p = (owner.plan or "free").lower()
        if p in ("standard", "basic", "pro"):
            plan_label = "Standart (To'liq)"
            limit_str = "Cheksiz"
            exp_date = owner.subscription_expires_at or owner.expires_at
        else:
            plan_label = "Free (2 oylik sinov)"
            limit_str = f"{sub_settings.free_max_contracts} ta"
            exp_date = owner.trial_ends_at or owner.expires_at

        active_contracts = owner.contracts.filter(is_active=True).count()
        used_count = active_contracts if active_contracts > 0 else owner.cars.count()

        now = timezone.now()
        if owner.is_frozen:
            status_badge = "❄️ Muzlatilgan"
            remaining_str = "Muzlatilgan"
        elif owner.is_subscription_active:
            status_badge = "✅ Faol"
            if exp_date and exp_date > now:
                days_left = (exp_date - now).days
                remaining_str = f"{days_left} kun qoldi"
            else:
                remaining_str = "Muddatsiz"
        else:
            status_badge = "❌ Muddati tugagan"
            remaining_str = "Tugagan"

        date_str = (
            timezone.localtime(exp_date).strftime("%d.%m.%Y %H:%M")
            if exp_date
            else "Muddatsiz"
        )

        return {
            "full_name": user.full_name or user.username,
            "role": user.get_role_display(),
            "tenant_code": owner.tenant_code or "AR-XXXX",
            "plan_label": plan_label,
            "status_badge": status_badge,
            "usage": f"{used_count} / {limit_str}",
            "percent": int(round(setting.default_annual_percent)),
            "expires_at": f"{date_str} ({remaining_str})",
        }

    info = await get_user_sub_details()
    sub_text = (
        f"📊 <b>Mening Obuna Ma'lumotlarim:</b>\n\n"
        f"👤 Foydalanuvchi: <b>{info['full_name']}</b>\n"
        f"🛡 Rol: <b>{info['role']}</b>\n"
        f"🔑 Maxsus kod: <code>{info['tenant_code']}</code>\n"
        f"📦 Tarif: <b>{info['plan_label']}</b> ({info['status_badge']})\n"
        f"🚗 Shartnomalar: <b>{info['usage']}</b>\n"
        f"📈 Standart yillik foiz: <b>{info['percent']}%</b>\n"
        f"⏳ Amal qilish muddati: <b>{info['expires_at']}</b>"
    )

    await message.answer(
        sub_text,
        parse_mode="HTML",
        reply_markup=get_miniapp_inline_keyboard(),
    )


@router.callback_query(F.data.startswith("sub_approve:"))
async def handle_sub_approve_callback(callback: CallbackQuery):
    if not callback.from_user:
        return

    admin_tg_id = callback.from_user.id
    admin_username = callback.from_user.username or str(admin_tg_id)

    try:
        sub_id = int(callback.data.split(":")[1])
    except (ValueError, IndexError):
        await callback.answer("Noto'g'ri so'rov identifikatori.", show_alert=True)
        return

    @sync_to_async
    def do_approve():
        from apps.users.models import SubscriptionRequest, User
        from apps.users.services import process_subscription_approval

        cfg_admin_id = getattr(settings, "ADMIN_TELEGRAM_ID", None)
        is_cfg_admin = cfg_admin_id and cfg_admin_id == admin_tg_id
        is_db_admin = User.objects.filter(
            telegram_id=admin_tg_id,
            role=User.RoleChoices.SUPERADMIN,
        ).exists() or User.objects.filter(telegram_id=admin_tg_id, is_superuser=True).exists()

        if not (is_cfg_admin or is_db_admin):
            return "NO_PERMISSION", None

        try:
            sub_req = SubscriptionRequest.objects.select_related("user").get(id=sub_id)
        except SubscriptionRequest.DoesNotExist:
            return "NOT_FOUND", None

        if sub_req.status != SubscriptionRequest.Status.PENDING:
            return "ALREADY_PROCESSED", sub_req

        success = process_subscription_approval(
            sub_request=sub_req,
            reviewer_label=f"@{admin_username}",
        )
        return ("SUCCESS" if success else "FAILED"), sub_req

    status_res, sub_req = await do_approve()

    if status_res == "NO_PERMISSION":
        await callback.answer("Sizda ushbu amalni bajarish uchun admin huquqi yo'q!", show_alert=True)
        return
    elif status_res == "NOT_FOUND":
        await callback.answer("Obuna so'rovi topilmadi.", show_alert=True)
        return
    elif status_res == "ALREADY_PROCESSED":
        label = sub_req.get_status_display() if sub_req else ""
        await callback.answer(f"Bu so'rov allaqachon ko'rib chiqilgan ({label})!", show_alert=True)
        return

    await callback.answer("✅ Obuna 30 kunga faollashtirildi!", show_alert=False)
    orig_text = callback.message.text or "" if callback.message else ""
    updated_text = (
        f"{orig_text}\n\n"
        f"✅ <b>Tasdiqlandi (30 kun qo'shildi)</b>\n"
        f"👮‍♂️ Admin: @{admin_username}"
    )
    try:
        if callback.message:
            await callback.message.edit_text(updated_text, parse_mode="HTML", reply_markup=None)
    except Exception:
        pass


@router.callback_query(F.data.startswith("sub_reject:"))
async def handle_sub_reject_callback(callback: CallbackQuery):
    if not callback.from_user:
        return

    admin_tg_id = callback.from_user.id
    admin_username = callback.from_user.username or str(admin_tg_id)

    try:
        sub_id = int(callback.data.split(":")[1])
    except (ValueError, IndexError):
        await callback.answer("Noto'g'ri so'rov identifikatori.", show_alert=True)
        return

    @sync_to_async
    def do_reject():
        from apps.users.models import SubscriptionRequest, User
        from apps.users.services import process_subscription_rejection

        cfg_admin_id = getattr(settings, "ADMIN_TELEGRAM_ID", None)
        is_cfg_admin = cfg_admin_id and cfg_admin_id == admin_tg_id
        is_db_admin = User.objects.filter(
            telegram_id=admin_tg_id,
            role=User.RoleChoices.SUPERADMIN,
        ).exists() or User.objects.filter(telegram_id=admin_tg_id, is_superuser=True).exists()

        if not (is_cfg_admin or is_db_admin):
            return "NO_PERMISSION", None

        try:
            sub_req = SubscriptionRequest.objects.select_related("user").get(id=sub_id)
        except SubscriptionRequest.DoesNotExist:
            return "NOT_FOUND", None

        if sub_req.status != SubscriptionRequest.Status.PENDING:
            return "ALREADY_PROCESSED", sub_req

        success = process_subscription_rejection(
            sub_request=sub_req,
            reviewer_label=f"@{admin_username}",
        )
        return ("SUCCESS" if success else "FAILED"), sub_req

    status_res, sub_req = await do_reject()

    if status_res == "NO_PERMISSION":
        await callback.answer("Sizda ushbu amalni bajarish uchun admin huquqi yo'q!", show_alert=True)
        return
    elif status_res == "NOT_FOUND":
        await callback.answer("Obuna so'rovi topilmadi.", show_alert=True)
        return
    elif status_res == "ALREADY_PROCESSED":
        label = sub_req.get_status_display() if sub_req else ""
        await callback.answer(f"Bu so'rov allaqachon ko'rib chiqilgan ({label})!", show_alert=True)
        return

    await callback.answer("❌ Obuna so'rovi rad etildi.", show_alert=False)
    orig_text = callback.message.text or "" if callback.message else ""
    updated_text = (
        f"{orig_text}\n\n"
        f"❌ <b>Rad etildi</b>\n"
        f"👮‍♂️ Admin: @{admin_username}"
    )
    try:
        if callback.message:
            await callback.message.edit_text(updated_text, parse_mode="HTML", reply_markup=None)
    except Exception:
        pass


# --- Catch-All Fallback Handler (Prevents Silent Bot) ---

@router.message(F.text)
async def handle_fallback_text(message: Message, state: FSMContext):
    if not message.from_user or not message.text:
        return

    try:
        text = message.text.strip()
        # Check if user pasted a valid invite code directly (e.g. AR-V5WX or CRXUQA)
        if 4 <= len(text) <= 16 and any(ch.isalnum() for ch in text):
            target_info = await find_code_target(text)
            if target_info:
                await handle_user_tenant_code(message, state)
                return

        user = await get_existing_user(message.from_user.id)
        if user and user.is_registered and user.phone:
            if user.role in (User.RoleChoices.USER, User.RoleChoices.IJARACHI):
                await message.answer(
                    "To'lovlar jadvalingiz va shartnomangizni ko'rish uchun pastdagi tugmani bosing:",
                    reply_markup=get_client_miniapp_inline_keyboard(),
                )
            else:
                await message.answer(
                    "Boshqaruv panelini ochish uchun pastdagi tugmalardan foydalaning:",
                    reply_markup=get_miniapp_inline_keyboard(),
                )
            return

        await handle_start(message, state)
    except Exception:
        logger.exception("Error in handle_fallback_text")
        await message.answer(
            "Iltimos, davom etish uchun /start buyrug'ini bosing.",
            reply_markup=get_role_selection_keyboard(),
        )
