from unittest.mock import AsyncMock, MagicMock

from django.test import TestCase
from django.utils import timezone

from apps.bot.handlers import (
    get_contact_request_keyboard,
    get_existing_user,
    get_main_reply_keyboard,
    get_miniapp_inline_keyboard,
    handle_contact,
    handle_start,
    register_or_update_contact_user,
)
from apps.users.models import User, UserSetting


class BotRegistrationFlowTests(TestCase):
    def setUp(self):
        self.tg_user_mock = MagicMock()
        self.tg_user_mock.id = 111222333
        self.tg_user_mock.first_name = "Jamshid"
        self.tg_user_mock.last_name = "Karimov"
        self.tg_user_mock.username = "jamshid_tg"
        self.tg_user_mock.full_name = "Jamshid Karimov"

    async def test_start_unregistered_user_requests_contact(self):
        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()

        await handle_start(message)

        # Should prompt for phone number with contact keyboard
        message.answer.assert_called_once()
        args, kwargs = message.answer.call_args
        self.assertIn("telefon raqamingizni yuboring", args[0])
        reply_markup = kwargs.get("reply_markup")
        self.assertIsNotNone(reply_markup)
        self.assertTrue(reply_markup.keyboard[0][0].request_contact)

    async def test_start_user_without_phone_requests_contact(self):
        # Create user with no phone
        await User.objects.acreate(
            username="nophone_user",
            telegram_id=111222333,
            full_name="Jamshid Karimov",
            phone="",
        )

        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()

        await handle_start(message)

        message.answer.assert_called_once()
        args, kwargs = message.answer.call_args
        self.assertIn("telefon raqamingizni yuboring", args[0])
        reply_markup = kwargs.get("reply_markup")
        self.assertTrue(reply_markup.keyboard[0][0].request_contact)

    async def test_contact_sharing_registers_user_and_setting(self):
        contact_mock = MagicMock()
        contact_mock.phone_number = "998901234567"  # missing leading +

        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.contact = contact_mock
        message.answer = AsyncMock()

        await handle_contact(message)

        # Verify user created in DB
        user = await User.objects.aget(telegram_id=111222333)
        self.assertEqual(user.phone, "+998901234567")
        self.assertEqual(user.role, User.RoleChoices.OWNER)
        self.assertEqual(user.full_name, "Jamshid Karimov")

        # Verify UserSetting exists
        setting_exists = await UserSetting.objects.filter(owner=user).aexists()
        self.assertTrue(setting_exists)

        # Verify 2 answers sent (confirmation + Mini App button)
        self.assertEqual(message.answer.call_count, 2)
        first_call_args = message.answer.call_args_list[0][0]
        self.assertIn("muvaffaqiyatli ro'yxatdan o'tdingiz", first_call_args[0])

    async def test_start_registered_user_greets_with_miniapp_button(self):
        # Create user with phone
        user = await User.objects.acreate(
            username="jamshid_tg",
            telegram_id=111222333,
            full_name="Jamshid Karimov",
            phone="+998901234567",
            role=User.RoleChoices.OWNER,
        )
        await UserSetting.objects.acreate(owner=user)

        message = MagicMock()
        message.from_user = self.tg_user_mock
        message.answer = AsyncMock()

        await handle_start(message)

        # Should send 2 answers (welcome + Mini App button)
        self.assertEqual(message.answer.call_count, 2)
        first_call_args = message.answer.call_args_list[0][0]
        self.assertIn("Jamshid Karimov", first_call_args[0])
        self.assertIn("Carenda boshqaruv tizimiga xush kelibsiz", first_call_args[0])

    def test_keyboards_structure(self):
        contact_kb = get_contact_request_keyboard()
        self.assertTrue(contact_kb.keyboard[0][0].request_contact)
        self.assertEqual(contact_kb.keyboard[0][0].text, "📞 Telefon raqamni yuborish")

        main_kb = get_main_reply_keyboard()
        self.assertEqual(len(main_kb.keyboard), 2)

        miniapp_kb = get_miniapp_inline_keyboard()
        self.assertIn("Carenda", miniapp_kb.inline_keyboard[0][0].text)
        self.assertIsNotNone(miniapp_kb.inline_keyboard[0][0].web_app)
