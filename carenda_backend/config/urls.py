from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return JsonResponse({"status": "ok", "service": "carenda_backend"})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/health/', health_check, name='health-check'),
    path('api/v1/', include('apps.users.urls')),
    path('api/v1/', include('apps.fleet.urls')),
    path('api/', include('apps.users.urls')),
    path('api/', include('apps.fleet.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
