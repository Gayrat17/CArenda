from django.urls import path
from apps.users.views import (
    CompleteOnboardingAPIView,
    MeAPIView,
    PaymentSettingsAPIView,
    SubscriptionRequestAPIView,
    SubscriptionStatusAPIView,
    TelegramAuthAPIView,
    VerifyInviteCodeAPIView,
)

urlpatterns = [
    path('me/', MeAPIView.as_view(), name='user-me'),
    path('auth/telegram/', TelegramAuthAPIView.as_view(), name='auth-telegram'),
    path('auth/verify-code/', VerifyInviteCodeAPIView.as_view(), name='auth-verify-code'),
    path('auth/verify-invite-code/', VerifyInviteCodeAPIView.as_view(), name='auth-verify-invite-code'),
    path('auth/complete-onboarding/', CompleteOnboardingAPIView.as_view(), name='auth-complete-onboarding'),
    path('subscriptions/settings/', PaymentSettingsAPIView.as_view(), name='subscription-settings'),
    path('subscriptions/payment-settings/', PaymentSettingsAPIView.as_view(), name='subscription-payment-settings'),
    path('subscriptions/request/', SubscriptionRequestAPIView.as_view(), name='subscription-request'),
    path('subscriptions/status/', SubscriptionStatusAPIView.as_view(), name='subscription-status'),
    path('subscriptions/my-status/', SubscriptionStatusAPIView.as_view(), name='subscription-my-status'),
]
