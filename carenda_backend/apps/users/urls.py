from django.urls import path
from apps.users.views import MeAPIView

urlpatterns = [
    path('me/', MeAPIView.as_view(), name='user-me'),
]
