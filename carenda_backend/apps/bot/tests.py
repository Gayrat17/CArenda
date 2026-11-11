from unittest.mock import AsyncMock, MagicMock

from django.test import TestCase

from apps.bot.handlers import (
    RegistrationStates,
    find_owner_by_code,
    get_client_miniapp_inline_keyboard,
    get_contact_request_keyboard,
    get_existing_user,
    get_main_reply_keyboard,
    get_miniapp_inline_keyboard,
    get_role_selection_keyboard,
    handle_choose_owner,
    handle_choose_user,
    handle_owner_contact,
    handle_start,
    handle_user_contact,
    handle_user_tenant_code,
    match_and_register_user_driver,
    register_owner_user,
)
from apps.fleet.models import Driver
from apps.users.models import User, UserSetting


class MockFSMContext:
    def __init__(self):
        self.current_state = None
        self.data = {}

    async def clear(self):
        self.current_state = None
        self.data = {}

    async def set_state(self, state):
        self.current_state = state.state if hasattr(state, "state") else state

    async def get_state(self):
        return self.current_state

    async def update_data(self, **kwargs):
        self.data.update(kwargs)

    async def get_data(self):
        return self.data.copy()


class BotDualOnboardingTests(TestCase):
    def setUp(self):
        self.tg_user_mock = MagicMock()
        self.tg_user_mock.id = 111222333
        self.tg_user_mock.first_name = "Jamshid"
        self.tg_user_mock.last_name = "Karimov"
        self.tg_user_mock.username = "jamshid_tg"
        self.tg_user_mock.full_name = "Jamshid Karimov"

    async def test_start_unregistered_user_prompts_role_selection(self):
        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()
        state = MockFSMContext()

        await handle_start(message, state)

        # Should prompt for role selection
        message.answer.assert_called_once()
        args, kwargs = message.answer.call_args
        self.assertIn("o'z rolingizni tanlang", args[0])
        self.assertEqual(
            await state.get_state(), RegistrationStates.waiting_for_role.state
        )
        reply_markup = kwargs.get("reply_markup")
        self.assertIsNotNone(reply_markup)
        buttons = [b.text for row in reply_markup.keyboard for b in row]
        self.assertIn("🚗 Men Arendatorman", buttons)
        self.assertIn("👤 Men Foydalanuvchiman (Ijarachi)", buttons)

    async def test_start_registered_owner_greets_with_tenant_code(self):
        user = await User.objects.acreate(
            username="owner_user",
            telegram_id=111222333,
            full_name="Jamshid Karimov",
            phone="+998901234567",
            role=User.RoleChoices.ARENDATOR,
            tenant_code="AR-TEST",
            is_registered=True,
        )
        await UserSetting.objects.acreate(owner=user)

        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()
        state = MockFSMContext()

        await handle_start(message, state)

        self.assertEqual(message.answer.call_count, 2)
        first_call_args = message.answer.call_args_list[0][0]
        self.assertIn("AR-TEST", first_call_args[0])
        self.assertIn("Carenda boshqaruv tizimiga xush kelibsiz", first_call_args[0])

    async def test_start_registered_user_driver_greets_with_schedule_miniapp(self):
        owner = await User.objects.acreate(
            username="owner_user",
            full_name="Owner Bek",
            role=User.RoleChoices.ARENDATOR,
        )
        await User.objects.acreate(
            username="driver_user",
            telegram_id=111222333,
            full_name="Haydovchi Bobur",
            phone="+998909876543",
            role=User.RoleChoices.USER,
            parent_owner=owner,
            is_registered=True,
        )

        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()
        state = MockFSMContext()

        await handle_start(message, state)

        self.assertEqual(message.answer.call_count, 2)
        first_call_args = message.answer.call_args_list[0][0]
        self.assertIn("Carenda ijarachi kabinetiga xush kelibsiz", first_call_args[0])
        second_call_kwargs = message.answer.call_args_list[1][1]
        self.assertIsNotNone(second_call_kwargs.get("reply_markup"))

    async def test_owner_onboarding_flow(self):
        state = MockFSMContext()

        # Step 1: User clicks "Men Arendatorman"
        message_role = MagicMock()
        message_role.answer = AsyncMock()
        await handle_choose_owner(message_role, state)
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_owner_phone.state,
        )

        # Step 2: User shares contact
        contact_mock = MagicMock()
        contact_mock.phone_number = "998901234567"
        message_contact = MagicMock()
        message_contact.from_user = self.tg_user_mock
        message_contact.contact = contact_mock
        message_contact.answer = AsyncMock()

        await handle_owner_contact(message_contact, state)

        # Check DB
        user = await User.objects.aget(telegram_id=111222333)
        self.assertEqual(user.phone, "+998901234567")
        self.assertEqual(user.role, User.RoleChoices.ARENDATOR)
        self.assertTrue(user.is_registered)
        self.assertIsNotNone(user.tenant_code)
        self.assertTrue(user.tenant_code.startswith("AR-"))

        # UserSetting created
        setting_exists = await UserSetting.objects.filter(owner=user).aexists()
        self.assertTrue(setting_exists)

        # State cleared
        self.assertIsNone(await state.get_state())

    async def test_user_driver_onboarding_flow_success(self):
        # Setup: Owner and pre-registered Driver in DB
        owner = await User.objects.acreate(
            username="owner_salim",
            full_name="Salim Arendator",
            phone="+998901112233",
            role=User.RoleChoices.ARENDATOR,
            tenant_code="AR-7777",
            is_registered=True,
        )
        driver = await Driver.objects.acreate(
            owner=owner,
            full_name="Anvar Haydovchi",
            phone="+998 (90) 555-44-33",
            passport_info="AC1122334",
        )

        state = MockFSMContext()

        # Step 1: Choose user / driver
        msg_choose = MagicMock()
        msg_choose.answer = AsyncMock()
        await handle_choose_user(msg_choose, state)
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_tenant_code.state,
        )

        # Step 2: Input valid tenant code
        msg_code = MagicMock()
        msg_code.text = "ar-7777"  # case-insensitive test
        msg_code.answer = AsyncMock()
        await handle_user_tenant_code(msg_code, state)

        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_user_phone.state,
        )
        state_data = await state.get_data()
        self.assertEqual(state_data.get("target_owner_id"), owner.id)

        # Step 3: Share phone matching the pre-registered driver
        contact_mock = MagicMock()
        contact_mock.phone_number = "998905554433"  # normalized match
        msg_phone = MagicMock()
        msg_phone.from_user = self.tg_user_mock
        msg_phone.contact = contact_mock
        msg_phone.answer = AsyncMock()

        await handle_user_contact(msg_phone, state)

        # Verify user registered with role USER
        driver_user = await User.objects.aget(telegram_id=111222333)
        self.assertEqual(driver_user.role, User.RoleChoices.USER)
        self.assertEqual(driver_user.parent_owner_id, owner.id)
        self.assertTrue(driver_user.is_registered)

        # Verify Driver.user is linked
        driver_updated = await Driver.objects.aget(id=driver.id)
        self.assertEqual(driver_updated.user_id, driver_user.id)

        # Verify success message sent
        self.assertEqual(msg_phone.answer.call_count, 2)
        success_text = msg_phone.answer.call_args_list[0][0][0]
        self.assertIn("Tasdiqlandi! Xush kelibsiz", success_text)
        self.assertIn("Anvar Haydovchi", success_text)

    async def test_user_driver_onboarding_invalid_tenant_code(self):
        state = MockFSMContext()
        await state.set_state(RegistrationStates.waiting_for_tenant_code)

        msg = MagicMock()
        msg.text = "AR-0000"
        msg.answer = AsyncMock()

        await handle_user_tenant_code(msg, state)

        msg.answer.assert_called_once()
        self.assertIn(
            "Bunday kodli arendator topilmadi", msg.answer.call_args[0][0]
        )
        # Still in waiting_for_tenant_code state
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_tenant_code.state,
        )

    async def test_user_driver_onboarding_unmatched_phone_rejected(self):
        owner = await User.objects.acreate(
            username="owner_aziz",
            full_name="Aziz Arendator",
            tenant_code="AR-8888",
            role=User.RoleChoices.ARENDATOR,
            is_registered=True,
        )
        await Driver.objects.acreate(
            owner=owner,
            full_name="Boshqa Haydovchi",
            phone="+998901112233",
        )

        state = MockFSMContext()
        await state.set_state(RegistrationStates.waiting_for_user_phone)
        await state.update_data(target_owner_id=owner.id)

        contact_mock = MagicMock()
        contact_mock.phone_number = "998979999999"  # Does not match driver
        msg = MagicMock()
        msg.from_user = self.tg_user_mock
        msg.contact = contact_mock
        msg.answer = AsyncMock()

        await handle_user_contact(msg, state)

        msg.answer.assert_called_once()
        self.assertIn(
            "Bazada bunday foydalanuvchi yo'q", msg.answer.call_args[0][0]
        )
        # Should not create user
        user_exists = await User.objects.filter(
            telegram_id=111222333
        ).aexists()
        self.assertFalse(user_exists)

    def test_keyboards_structure(self):
        role_kb = get_role_selection_keyboard()
        self.assertEqual(len(role_kb.keyboard[0]), 2)

        contact_kb = get_contact_request_keyboard()
        self.assertTrue(contact_kb.keyboard[0][0].request_contact)

        main_kb = get_main_reply_keyboard()
        self.assertEqual(len(main_kb.keyboard), 2)

        miniapp_kb = get_miniapp_inline_keyboard()
        self.assertIn("Carenda", miniapp_kb.inline_keyboard[0][0].text)

        client_miniapp_kb = get_client_miniapp_inline_keyboard()
        self.assertIn(
            "To'lov jadvalimni ko'rish",
            client_miniapp_kb.inline_keyboard[0][0].text,
        )
        self.assertTrue(client_miniapp_kb.inline_keyboard[0][0].web_app.url.endswith("/client"))

    async def test_contract_code_ijarachi_onboarding_and_fallbacks(self):
        from decimal import Decimal
        from django.utils import timezone
        from asgiref.sync import sync_to_async
        from apps.fleet.models import Car
        from apps.fleet.services import create_contract_service
        from apps.bot.handlers import handle_fallback_text, handle_user_phone_non_contact

        owner = await User.objects.acreate(
            username="owner_contract_test",
            full_name="Contract Arendator",
            phone="+998901112200",
            role=User.RoleChoices.ARENDATOR,
            tenant_code="AR-9999",
            is_registered=True,
        )
        car = await Car.objects.acreate(
            owner=owner,
            name="Gentra",
            plate_number="01G777GG",
            default_price=Decimal("15000.00"),
            status=Car.Status.AVAILABLE,
        )
        driver = await Driver.objects.acreate(
            owner=owner,
            full_name="Sardor Client",
            phone="+998901239988",
        )
        contract = await sync_to_async(create_contract_service)(
            owner=owner,
            car=car,
            driver=driver,
            car_price=Decimal("15000.00"),
            initial_payment=Decimal("3000.00"),
            annual_percent=Decimal("20.00"),
            months_count=12,
            payment_day=10,
            start_date=timezone.localdate(),
        )

        # Even if user sends code directly without prior state (fallback handler catches it)
        state = MockFSMContext()
        msg_code = MagicMock()
        msg_code.from_user = self.tg_user_mock
        msg_code.text = contract.invite_code
        msg_code.answer = AsyncMock()

        await handle_fallback_text(msg_code, state)
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_user_phone.state,
        )
        reply_text = msg_code.answer.call_args[0][0]
        self.assertIn("Kod tasdiqlandi", reply_text)
        self.assertIn("Gentra", reply_text)

        # Typing text instead of pressing contact button reminds politely
        msg_text_phone = MagicMock()
        msg_text_phone.from_user = self.tg_user_mock
        msg_text_phone.text = "+998901239988"
        msg_text_phone.answer = AsyncMock()
        await handle_user_phone_non_contact(msg_text_phone)
        self.assertIn("tugmasini bosing", msg_text_phone.answer.call_args[0][0])

        # Sending someone else's contact card is rejected
        bad_contact = MagicMock()
        bad_contact.user_id = 999999999  # Different user
        bad_contact.phone_number = "998901239988"
        msg_bad_contact = MagicMock()
        msg_bad_contact.from_user = self.tg_user_mock
        msg_bad_contact.contact = bad_contact
        msg_bad_contact.answer = AsyncMock()
        await handle_user_contact(msg_bad_contact, state)
        self.assertIn("o'zingizning telefon raqamingizni", msg_bad_contact.answer.call_args[0][0])

        # Sending own contact completes onboarding cleanly
        good_contact = MagicMock()
        good_contact.user_id = self.tg_user_mock.id
        good_contact.phone_number = "998905556677"
        msg_good_contact = MagicMock()
        msg_good_contact.from_user = self.tg_user_mock
        msg_good_contact.contact = good_contact
        msg_good_contact.answer = AsyncMock()
        await handle_user_contact(msg_good_contact, state)

        self.assertIsNone(await state.get_state())
        self.assertEqual(msg_good_contact.answer.call_count, 2)
        self.assertIn("Muvaffaqiyatli yakunlandi".lower(), msg_good_contact.answer.call_args_list[0][0][0].lower())
        kb_call = msg_good_contact.answer.call_args_list[1][1]["reply_markup"]
        self.assertTrue(kb_call.inline_keyboard[0][0].web_app.url.endswith("/client"))

    async def test_general_contact_does_not_bypass_unfinished_webapp_onboarding(self):
        from apps.bot.handlers import handle_general_contact

        # Simulates a user created via Mini App initData who has NOT finished /login onboarding yet
        user = await User.objects.acreate(
            username="pending_webapp_user",
            telegram_id=111222333,
            role=User.RoleChoices.ARENDATOR,
            is_onboarded=False,
            is_registered=False,
        )

        state = MockFSMContext()
        contact_mock = MagicMock()
        contact_mock.user_id = self.tg_user_mock.id
        contact_mock.phone_number = "998915119590"
        msg = MagicMock()
        msg.from_user = self.tg_user_mock
        msg.contact = contact_mock
        msg.answer = AsyncMock()

        await handle_general_contact(msg, state)

        refreshed = await User.objects.aget(id=user.id)
        self.assertEqual(refreshed.phone, "+998915119590")
        self.assertFalse(refreshed.is_onboarded)
        self.assertFalse(refreshed.is_registered)
        self.assertIn("Mini App ilovasiga qaytib", msg.answer.call_args[0][0])

    async def test_admin_command_access_control(self):
        from django.test import override_settings
        from apps.bot.handlers import handle_admin_command

        msg_unauth = MagicMock()
        msg_unauth.from_user = self.tg_user_mock
        msg_unauth.answer = AsyncMock()
        with override_settings(SUPERADMIN_TELEGRAM_IDS=[999888777], ADMIN_TELEGRAM_ID=None):
            await handle_admin_command(msg_unauth)
        self.assertIn("huquqi mavjud emas", msg_unauth.answer.call_args[0][0])

        msg_admin = MagicMock()
        msg_admin.from_user = self.tg_user_mock
        msg_admin.answer = AsyncMock()
        with override_settings(SUPERADMIN_TELEGRAM_IDS=[self.tg_user_mock.id]):
            await handle_admin_command(msg_admin)
        kb = msg_admin.answer.call_args[1]["reply_markup"]
        self.assertIn("Superadmin Panel", kb.inline_keyboard[0][0].text)
        self.assertTrue(kb.inline_keyboard[0][0].web_app.url.endswith("/superadmin"))
        super_user = await User.objects.aget(telegram_id=self.tg_user_mock.id)
        self.assertTrue(super_user.is_superuser)
        self.assertTrue(super_user.is_staff)


class IjarachiPaymentNotificationTests(TestCase):
    def setUp(self):
        from datetime import date
        from decimal import Decimal
        from apps.fleet.models import Car, Contract, Payment
        from apps.fleet.services import create_contract_service

        self.today = date(2026, 4, 10)
        self.owner = User.objects.create_user(
            username="owner_notif",
            telegram_id=1001001,
            full_name="Sardor Arendator",
            phone="+998901112233",
            role=User.RoleChoices.ARENDATOR,
            is_registered=True,
            is_onboarded=True,
            is_frozen=False,
        )
        self.client_user = User.objects.create_user(
            username="client_notif",
            telegram_id=555666777,
            full_name="Dilshod Mijoz",
            phone="+998909998877",
            role=User.RoleChoices.IJARACHI,
            is_registered=True,
            is_onboarded=True,
        )
        self.driver = Driver.objects.create(
            owner=self.owner,
            user=self.client_user,
            full_name="Dilshod Mijoz",
            phone="+998909998877",
        )
        self.car = Car.objects.create(
            owner=self.owner,
            name="Chevrolet Cobalt",
            plate_number="01 A 777 AA",
            status=Car.Status.AVAILABLE,
        )
        self.contract = create_contract_service(
            owner=self.owner,
            car=self.car,
            driver=self.driver,
            car_price=Decimal("10000.00"),
            initial_payment=Decimal("0.00"),
            annual_percent=Decimal("0.00"),
            months_count=2,
            payment_day=10,
            start_date=date(2026, 3, 10),
        )
        self.p1, self.p2 = list(self.contract.payments.order_by("month_number"))
        self.p1.due_date = date(2026, 4, 17)
        self.p1.expected_amount = Decimal("500.00")
        self.p1.paid_amount = Decimal("0.00")
        self.p1.save()

        self.p2.due_date = date(2026, 5, 17)
        self.p2.expected_amount = Decimal("500.00")
        self.p2.paid_amount = Decimal("0.00")
        self.p2.save()

    async def test_7_days_before_sends_once_and_silent_on_days_6_to_1(self):
        from datetime import timedelta
        from decimal import Decimal
        from apps.bot.services import send_ijarachi_payment_notifications

        await self.p1.arefresh_from_db()
        self.p1.paid_amount = Decimal("100.00")
        await self.p1.asave(update_fields=["paid_amount"])

        bot = MagicMock()
        bot.send_message = AsyncMock()

        # Exactly 7 days before 2026-04-17 is 2026-04-10
        sent = await send_ijarachi_payment_notifications(bot, today=self.today)
        self.assertEqual(sent, 1)
        bot.send_message.assert_called_once()
        kwargs = bot.send_message.call_args.kwargs
        self.assertEqual(kwargs["chat_id"], 555666777)
        self.assertIn("🔔 Eslatma!", kwargs["text"])
        self.assertIn("Chevrolet Cobalt (01 A 777 AA)", kwargs["text"])
        self.assertIn("7 kun qoldi", kwargs["text"])
        self.assertIn("2026-04-17", kwargs["text"])
        self.assertIn("$400.00", kwargs["text"])
        self.assertIn("Sardor Arendator (+998901112233)", kwargs["text"])
        btn = kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(btn.text, "🚗 Shartnomani ko'rish (Mini App)")
        self.assertTrue(btn.web_app.url.endswith("/client"))

        await self.p1.arefresh_from_db()
        self.assertEqual(self.p1.last_notified_date, self.today)
        self.assertTrue(self.p1.notified_7days_before)

        # Days 6..1 before due date must stay silent
        bot.send_message.reset_mock()
        for offset in range(1, 7):
            sent_later = await send_ijarachi_payment_notifications(
                bot, today=self.today + timedelta(days=offset)
            )
            self.assertEqual(sent_later, 0)
        bot.send_message.assert_not_called()

    async def test_due_date_today_and_same_day_deduplication(self):
        from datetime import date
        from apps.bot.services import send_ijarachi_payment_notifications

        bot = MagicMock()
        bot.send_message = AsyncMock()
        due_day = date(2026, 4, 17)

        first = await send_ijarachi_payment_notifications(bot, today=due_day)
        self.assertEqual(first, 1)
        text = bot.send_message.call_args.kwargs["text"]
        self.assertIn("📅 Bugun to'lov kuni!", text)
        self.assertIn("$500.00", text)
        self.assertIn("Sardor Arendator (+998901112233)", text)
        btn = bot.send_message.call_args.kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertTrue(btn.web_app.url.endswith("/client"))

        # Running again on the exact same day is deduplicated via last_notified_date
        bot.send_message.reset_mock()
        second = await send_ijarachi_payment_notifications(bot, today=due_day)
        self.assertEqual(second, 0)
        bot.send_message.assert_not_called()

    async def test_overdue_marks_status_sends_daily_and_stops_when_paid(self):
        from datetime import date
        from decimal import Decimal
        from asgiref.sync import sync_to_async
        from apps.bot.services import send_ijarachi_payment_notifications
        from apps.fleet.models import Payment
        from apps.fleet.services import record_payment_service

        bot = MagicMock()
        bot.send_message = AsyncMock()

        day_1_late = date(2026, 4, 18)
        day_2_late = date(2026, 4, 19)
        day_3_after_pay = date(2026, 4, 20)

        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=day_1_late), 1)
        text_1 = bot.send_message.call_args.kwargs["text"]
        self.assertIn("⚠️ To'lov muddati o'tib ketdi!", text_1)
        self.assertIn("1 kunga kechikmoqda", text_1)
        self.assertIn("2026-04-17", text_1)
        self.assertIn("$500.00", text_1)

        await self.p1.arefresh_from_db()
        self.assertEqual(self.p1.status, Payment.Status.OVERDUE)
        self.assertEqual(self.p1.last_notified_date, day_1_late)

        # Duplicate call same day -> 0 notifications
        bot.send_message.reset_mock()
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=day_1_late), 0)

        # Next day -> 1 overdue notification with 2 kunga kechikmoqda
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=day_2_late), 1)
        text_2 = bot.send_message.call_args.kwargs["text"]
        self.assertIn("2 kunga kechikmoqda", text_2)

        # Record full payment -> status PAID -> notifications stop immediately
        await sync_to_async(record_payment_service)(
            owner=self.owner,
            payment=self.p1,
            amount=Decimal("500.00"),
            comment="To'liq yopildi",
        )
        await self.p1.arefresh_from_db()
        self.assertEqual(self.p1.status, Payment.Status.PAID)

        bot.send_message.reset_mock()
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=day_3_after_pay), 0)
        bot.send_message.assert_not_called()

    async def test_postpone_clears_overdue_and_stops_notifications(self):
        from datetime import date
        from unittest.mock import patch
        from asgiref.sync import sync_to_async
        from apps.bot.services import send_ijarachi_payment_notifications
        from apps.fleet.models import Payment
        from apps.fleet.services import postpone_contract_payments_service

        bot = MagicMock()
        bot.send_message = AsyncMock()

        day_late = date(2026, 4, 19)
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=day_late), 1)
        await self.p1.arefresh_from_db()
        self.assertEqual(self.p1.status, Payment.Status.OVERDUE)

        with patch("apps.fleet.services.timezone.localdate", return_value=day_late):
            await sync_to_async(postpone_contract_payments_service)(
                owner=self.owner,
                payment=self.p1,
                comment="Kelishildi",
            )
        await self.p1.arefresh_from_db()
        self.assertEqual(self.p1.due_date, date(2026, 5, 10))
        self.assertEqual(self.p1.status, Payment.Status.PENDING)

        # No overdue alert on following day
        bot.send_message.reset_mock()
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=date(2026, 4, 20)), 0)
        bot.send_message.assert_not_called()

        # Re-qualifies cleanly for 7-days-before alert on 2026-05-03
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=date(2026, 5, 3)), 1)
        self.assertIn("7 kun qoldi", bot.send_message.call_args.kwargs["text"])

    async def test_excludes_frozen_owner_closed_contract_paid_and_unonboarded(self):
        from datetime import date
        from decimal import Decimal
        from apps.bot.services import send_ijarachi_payment_notifications
        from apps.fleet.models import Payment

        bot = MagicMock()
        bot.send_message = AsyncMock()
        due_day = date(2026, 4, 17)

        # Frozen Arendator -> 0 alerts
        self.owner.is_frozen = True
        await self.owner.asave(update_fields=["is_frozen"])
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)
        self.owner.is_frozen = False
        await self.owner.asave(update_fields=["is_frozen"])

        # Closed contract -> 0 alerts
        self.contract.is_active = False
        await self.contract.asave(update_fields=["is_active"])
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)
        self.contract.is_active = True
        await self.contract.asave(update_fields=["is_active"])

        # Un-onboarded Ijarachi -> 0 alerts
        self.client_user.is_onboarded = False
        self.client_user.is_registered = False
        await self.client_user.asave(update_fields=["is_onboarded", "is_registered"])
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)

        # Missing phone -> 0 alerts
        self.client_user.is_onboarded = True
        self.client_user.is_registered = True
        self.client_user.phone = ""
        self.client_user.phone_number = ""
        await self.client_user.asave(
            update_fields=["is_onboarded", "is_registered", "phone", "phone_number"]
        )
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)
        self.client_user.phone = "+998909998877"
        self.client_user.phone_number = "+998909998877"
        await self.client_user.asave(update_fields=["phone", "phone_number"])

        # paid_amount >= expected_amount -> 0 alerts even if status somehow not updated
        self.p1.paid_amount = Decimal("500.00")
        await self.p1.asave(update_fields=["paid_amount"])
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)

        # status == PAID -> 0 alerts
        self.p1.paid_amount = Decimal("0.00")
        self.p1.status = Payment.Status.PAID
        await self.p1.asave(update_fields=["paid_amount", "status"])
        self.assertEqual(await send_ijarachi_payment_notifications(bot, today=due_day), 0)


from django.test import TransactionTestCase


class IjarachiCeleryTaskTests(TransactionTestCase):
    def test_celery_beat_schedule_and_send_payment_notifications_task(self):
        from datetime import date
        from decimal import Decimal
        from unittest.mock import patch
        from django.conf import settings
        from django.test import override_settings
        from apps.bot.tasks import send_payment_notifications
        from apps.fleet.models import Car
        from apps.fleet.services import create_contract_service

        self.assertEqual(settings.TIME_ZONE, "Asia/Tashkent")
        self.assertEqual(settings.CELERY_TIMEZONE, "Asia/Tashkent")
        self.assertIn("send_payment_notifications_morning", settings.CELERY_BEAT_SCHEDULE)
        entry = settings.CELERY_BEAT_SCHEDULE["send_payment_notifications_morning"]
        self.assertEqual(entry["task"], "apps.bot.tasks.send_payment_notifications")
        self.assertEqual(entry["schedule"].hour, {9})
        self.assertEqual(entry["schedule"].minute, {0})

        today = date(2026, 4, 10)
        owner = User.objects.create_user(
            username="owner_celery",
            telegram_id=2002002,
            full_name="Sardor Arendator",
            phone="+998901112233",
            role=User.RoleChoices.ARENDATOR,
            is_registered=True,
            is_onboarded=True,
            is_frozen=False,
        )
        client_user = User.objects.create_user(
            username="client_celery",
            telegram_id=666777888,
            full_name="Dilshod Mijoz",
            phone="+998909998877",
            role=User.RoleChoices.IJARACHI,
            is_registered=True,
            is_onboarded=True,
        )
        driver = Driver.objects.create(
            owner=owner,
            user=client_user,
            full_name="Dilshod Mijoz",
            phone="+998909998877",
        )
        car = Car.objects.create(
            owner=owner,
            name="Chevrolet Cobalt",
            plate_number="01 B 777 BB",
            status=Car.Status.AVAILABLE,
        )
        contract = create_contract_service(
            owner=owner,
            car=car,
            driver=driver,
            car_price=Decimal("5000.00"),
            initial_payment=Decimal("0.00"),
            annual_percent=Decimal("0.00"),
            months_count=1,
            payment_day=17,
            start_date=date(2026, 3, 17),
        )
        payment = contract.payments.get()
        payment.due_date = date(2026, 4, 17)
        payment.expected_amount = Decimal("500.00")
        payment.save(update_fields=["due_date", "expected_amount"])

        with override_settings(TELEGRAM_BOT_TOKEN="123456:TEST_TOKEN"):
            with (
                patch("apps.bot.tasks.Bot") as mock_bot_cls,
                patch("apps.bot.services.timezone.localdate", return_value=today),
            ):
                bot_inst = mock_bot_cls.return_value
                bot_inst.send_message = AsyncMock()
                bot_inst.session = MagicMock()
                bot_inst.session.close = AsyncMock()

                result = send_payment_notifications()
                self.assertEqual(result, 1)
                bot_inst.send_message.assert_called_once()
