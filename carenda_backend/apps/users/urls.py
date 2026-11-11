from django.urls import path
from apps.users.views import (
    CompleteOnboardingAPIView,
    MeAPIView,
    PaymentSettingsAPIView,
    SubscriptionRequestAPIView,
    SubscriptionStatusAPIView,
    SuperadminApproveRequestAPIView,
    SuperadminArendatorsAPIView,
    SuperadminGrantSubscriptionAPIView,
    SuperadminRejectRequestAPIView,
    SuperadminSettingsAPIView,
    SuperadminSubscriptionRequestsAPIView,
    SuperadminToggleFreezeAPIView,
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
    # Superadmin APIs
    path('superadmin/arendators/', SuperadminArendatorsAPIView.as_view(), name='superadmin-arendators'),
    path('superadmin/arendators/<int:pk>/toggle-freeze/', SuperadminToggleFreezeAPIView.as_view(), name='superadmin-toggle-freeze'),
    path('superadmin/arendators/<int:pk>/grant-subscription/', SuperadminGrantSubscriptionAPIView.as_view(), name='superadmin-grant-subscription'),
    path('superadmin/settings/', SuperadminSettingsAPIView.as_view(), name='superadmin-settings'),
    path('superadmin/requests/', SuperadminSubscriptionRequestsAPIView.as_view(), name='superadmin-requests'),
    path('superadmin/requests/<int:pk>/approve/', SuperadminApproveRequestAPIView.as_view(), name='superadmin-request-approve'),
    path('superadmin/requests/<int:pk>/reject/', SuperadminRejectRequestAPIView.as_view(), name='superadmin-request-reject'),
]
