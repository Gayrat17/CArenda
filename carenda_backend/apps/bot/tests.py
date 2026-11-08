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
    handle_choose_client,
    handle_choose_owner,
    handle_client_contact,
    handle_client_tenant_code,
    handle_owner_contact,
    handle_start,
    match_and_register_client_driver,
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
        self.assertIn("👤 Men Ijarachiman (Mijoz)", buttons)

    async def test_start_registered_owner_greets_with_tenant_code(self):
        user = await User.objects.acreate(
            username="owner_user",
            telegram_id=111222333,
            full_name="Jamshid Karimov",
            phone="+998901234567",
            role=User.RoleChoices.OWNER,
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

    async def test_start_registered_client_greets_with_client_miniapp(self):
        owner = await User.objects.acreate(
            username="owner_user",
            full_name="Owner Bek",
            role=User.RoleChoices.OWNER,
        )
        await User.objects.acreate(
            username="client_user",
            telegram_id=111222333,
            full_name="Haydovchi Bobur",
            phone="+998909876543",
            role=User.RoleChoices.CLIENT,
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
        self.assertIn("Carenda mijoz kabinetiga xush kelibsiz", first_call_args[0])
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
        self.assertEqual(user.role, User.RoleChoices.OWNER)
        self.assertTrue(user.is_registered)
        self.assertIsNotNone(user.tenant_code)
        self.assertTrue(user.tenant_code.startswith("AR-"))

        # UserSetting created
        setting_exists = await UserSetting.objects.filter(owner=user).aexists()
        self.assertTrue(setting_exists)

        # State cleared
        self.assertIsNone(await state.get_state())

    async def test_client_onboarding_flow_success(self):
        # Setup: Owner and pre-registered Driver in DB
        owner = await User.objects.acreate(
            username="owner_salim",
            full_name="Salim Arendator",
            phone="+998901112233",
            role=User.RoleChoices.OWNER,
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

        # Step 1: Choose client
        msg_choose = MagicMock()
        msg_choose.answer = AsyncMock()
        await handle_choose_client(msg_choose, state)
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_tenant_code.state,
        )

        # Step 2: Input valid tenant code
        msg_code = MagicMock()
        msg_code.text = "ar-7777"  # lower case test
        msg_code.answer = AsyncMock()
        await handle_client_tenant_code(msg_code, state)

        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_client_phone.state,
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

        await handle_client_contact(msg_phone, state)

        # Verify client registered
        client_user = await User.objects.aget(telegram_id=111222333)
        self.assertEqual(client_user.role, User.RoleChoices.CLIENT)
        self.assertEqual(client_user.parent_owner_id, owner.id)
        self.assertTrue(client_user.is_registered)

        # Verify Driver.user is linked
        driver_updated = await Driver.objects.aget(id=driver.id)
        self.assertEqual(driver_updated.user_id, client_user.id)

        # Verify success message sent
        self.assertEqual(msg_phone.answer.call_count, 2)
        success_text = msg_phone.answer.call_args_list[0][0][0]
        self.assertIn("Tasdiqlandi! Xush kelibsiz", success_text)
        self.assertIn("Anvar Haydovchi", success_text)

    async def test_client_onboarding_invalid_tenant_code(self):
        state = MockFSMContext()
        await state.set_state(RegistrationStates.waiting_for_tenant_code)

        msg = MagicMock()
        msg.text = "AR-0000"
        msg.answer = AsyncMock()

        await handle_client_tenant_code(msg, state)

        msg.answer.assert_called_once()
        self.assertIn(
            "Bunday kodli arendator topilmadi", msg.answer.call_args[0][0]
        )
        # Still in waiting_for_tenant_code state
        self.assertEqual(
            await state.get_state(),
            RegistrationStates.waiting_for_tenant_code.state,
        )

    async def test_client_onboarding_unmatched_phone_rejected(self):
        owner = await User.objects.acreate(
            username="owner_aziz",
            full_name="Aziz Arendator",
            tenant_code="AR-8888",
            role=User.RoleChoices.OWNER,
            is_registered=True,
        )
        await Driver.objects.acreate(
            owner=owner,
            full_name="Boshqa Haydovchi",
            phone="+998901112233",
        )

        state = MockFSMContext()
        await state.set_state(RegistrationStates.waiting_for_client_phone)
        await state.update_data(target_owner_id=owner.id)

        contact_mock = MagicMock()
        contact_mock.phone_number = "998979999999"  # Does not match driver
        msg = MagicMock()
        msg.from_user = self.tg_user_mock
        msg.contact = contact_mock
        msg.answer = AsyncMock()

        await handle_client_contact(msg, state)

        msg.answer.assert_called_once()
        self.assertIn(
            "Bazada bunday foydalanuvchi yo'q", msg.answer.call_args[0][0]
        )
        # Should not create client user
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
