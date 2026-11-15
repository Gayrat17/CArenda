from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class InviteCodeRateThrottle(AnonRateThrottle):
    """Rate limits verification of invite codes to prevent brute-forcing."""
    scope = "invite_code"
    rate = "5/minute"


class AuthRateThrottle(AnonRateThrottle):
    """Rate limits Telegram authentication requests to prevent replay and brute-force attempts."""
    scope = "auth"
    rate = "10/minute"


class SensitiveActionThrottle(UserRateThrottle):
    """Rate limits sensitive mutating actions such as manual payment recording."""
    scope = "sensitive"
    rate = "5/minute"
