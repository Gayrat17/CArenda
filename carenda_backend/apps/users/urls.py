from django.urls import path
from apps.users.views import (
    MeAPIView,
    PaymentSettingsAPIView,
    SubscriptionRequestAPIView,
    SubscriptionStatusAPIView,
)

urlpatterns = [
    path('me/', MeAPIView.as_view(), name='user-me'),
    path('subscriptions/payment-settings/', PaymentSettingsAPIView.as_view(), name='subscription-payment-settings'),
    path('subscriptions/request/', SubscriptionRequestAPIView.as_view(), name='subscription-request'),
    path('subscriptions/my-status/', SubscriptionStatusAPIView.as_view(), name='subscription-my-status'),
]
