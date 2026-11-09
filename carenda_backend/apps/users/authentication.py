import hashlib
import hmac
import json
import urllib.parse
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.users.models import User, UserSetting


class TelegramWebAppAuthentication(BaseAuthentication):
    """
    Authenticates requests via Telegram WebApp initData (HMAC-SHA256 signature).
    Supports seamless auto-registration on first login (role: owner, 14-day trial)
    and a local dev fallback when settings.DEBUG is True.
    """

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "").strip()
        dev_tg_id_header = request.headers.get("X-Dev-Telegram-Id")

        # Local development fallback when DEBUG=True
        if settings.DEBUG:
            if (
                auth_header in ("tma dev", "tma dev ", "Bearer tma dev")
                or auth_header.startswith("tma dev")
                or dev_tg_id_header
            ):
                return self._get_or_create_dev_user(dev_tg_id_header)

        if not auth_header:
            return None

        parts = auth_header.split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "tma":
            return None

        init_data_raw = parts[1].strip()
        return self._validate_telegram_init_data(init_data_raw)

    def _get_or_create_dev_user(self, dev_tg_id_header: str | None = None):
        dev_tg_id = 999999999
        if dev_tg_id_header:
            try:
                dev_tg_id = int(dev_tg_id_header)
            except (ValueError, TypeError):
                dev_tg_id = 999999999

        cache_key = f"auth_user:{dev_tg_id}"
        cached_user = cache.get(cache_key)
        if cached_user is not None:
            return (cached_user, None)

        username = (
            "demo_arendator"
            if dev_tg_id == 999999999
            else f"dev_tenant_{dev_tg_id}"
        )
        full_name = (
            "Demo Arendator"
            if dev_tg_id == 999999999
            else f"Dev Tenant {dev_tg_id}"
        )

        user, created = User.objects.get_or_create(
            telegram_id=dev_tg_id,
            defaults={
                "username": username,
                "full_name": full_name,
                "role": User.RoleChoices.ARENDATOR,
                "plan": User.Plan.TRIAL,
                "cars_limit": 10,
                "is_registered": True,
                "expires_at": timezone.now() + timedelta(days=365),
            },
        )
        if not created:
            updated = False
            if user.full_name != full_name:
                user.full_name = full_name
                updated = True
            if user.username != username:
                user.username = username
                updated = True
            if updated:
                user.save(update_fields=["full_name", "username"])

        UserSetting.objects.get_or_create(owner=user)
        user = User.objects.select_related("settings", "parent_owner").get(pk=user.pk)
        cache.set(cache_key, user, 60)
        return (user, None)

    def _validate_telegram_init_data(self, init_data_raw: str):
        try:
            parsed_items = urllib.parse.parse_qsl(
                init_data_raw, keep_blank_values=True
            )
        except Exception as e:
            raise AuthenticationFailed(f"Invalid initData format: {e}")

        data_dict = dict(parsed_items)
        received_hash = data_dict.get("hash")
        if not received_hash:
            raise AuthenticationFailed("Invalid Telegram initData: hash missing")

        # Sort all keys except hash alphabetically
        data_check_pairs = [
            (k, v) for k, v in parsed_items if k != "hash"
        ]
        data_check_pairs.sort(key=lambda x: x[0])
        data_check_string = "\n".join(f"{k}={v}" for k, v in data_check_pairs)

        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        secret_key = hmac.new(
            b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
        ).digest()
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            if not settings.DEBUG:
                raise AuthenticationFailed("Invalid Telegram signature")

        user_raw = data_dict.get("user")
        if not user_raw:
            raise AuthenticationFailed("User data missing in Telegram initData")

        try:
            user_data = json.loads(user_raw)
        except Exception:
            raise AuthenticationFailed("Invalid JSON in Telegram user field")

        telegram_id = user_data.get("id")
        if not telegram_id:
            raise AuthenticationFailed("Telegram user id missing")

        cache_key = f"auth_user:{telegram_id}"
        cached_user = cache.get(cache_key)
        if cached_user is not None:
            return (cached_user, None)

        first_name = user_data.get("first_name", "")
        last_name = user_data.get("last_name", "")
        tg_username = user_data.get("username") or f"tg_{telegram_id}"
        full_name = f"{first_name} {last_name}".strip() or tg_username

        # Auto-registration on first login (role: owner, 60-day free trial)
        from apps.users.models import SubscriptionSettings
        sub_settings = SubscriptionSettings.get_settings()
        trial_end = timezone.now() + timedelta(days=sub_settings.free_duration_days)

        user, created = User.objects.get_or_create(
            telegram_id=telegram_id,
            defaults={
                "username": tg_username,
                "full_name": full_name,
                "first_name": first_name,
                "last_name": last_name,
                "role": User.RoleChoices.ARENDATOR,
                "plan": User.Plan.FREE,
                "cars_limit": sub_settings.free_max_contracts,
                "trial_ends_at": trial_end,
                "expires_at": trial_end,
            },
        )

        if not created:
            updated = False
            raw_tg_username = user_data.get("username")
            if raw_tg_username and user.username != raw_tg_username:
                if not User.objects.filter(username=raw_tg_username).exclude(pk=user.pk).exists():
                    user.username = raw_tg_username
                    updated = True
            if full_name and user.full_name != full_name:
                user.full_name = full_name
                updated = True
            if first_name and user.first_name != first_name:
                user.first_name = first_name
                updated = True
            if last_name and user.last_name != last_name:
                user.last_name = last_name
                updated = True
            if updated:
                user.save(update_fields=["username", "full_name", "first_name", "last_name"])

        UserSetting.objects.get_or_create(owner=user)
        user = User.objects.select_related("settings", "parent_owner").get(pk=user.pk)
        cache.set(cache_key, user, 60)
        return (user, None)
