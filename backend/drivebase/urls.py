"""
URL configuration for DriveBase project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import os
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import i18n_patterns
from django.http import JsonResponse, FileResponse, Http404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token

# Django Ninja API
from ninja import NinjaAPI
from manager.api import router as vehicles_router
from manager.auth_api import auth_router
from manager.vehicle_api import vehicle_router
from manager.transaction_api import router as transaction_router
from manager.settings_api import settings_router
from manager.activity_logs_api import router as activity_logs_router
from manager.dashboard_api import dashboard_router


# Standalone CSRF view with ensure_csrf_cookie decorator
@ensure_csrf_cookie
def get_csrf_token(request):
    """
    Returns a simple JSON response, ensures the CSRF cookie is set,
    and returns csrfToken in the response body for desktop/webview clients.
    """
    return JsonResponse({
        "detail": "CSRF cookie set",
        "csrfToken": get_token(request),
    })


def download_desktop_app(request):
    """Serve the Windows Desktop Application installer directly."""
    possible_paths = [
        os.path.join(settings.BASE_DIR, 'staticfiles', 'downloads', 'DriveBase_Setup.exe'),
        os.path.join(settings.BASE_DIR, 'static', 'downloads', 'DriveBase_Setup.exe'),
        os.path.join(settings.BASE_DIR, 'media', 'downloads', 'DriveBase_Setup.exe'),
    ]
    for file_path in possible_paths:
        if os.path.exists(file_path):
            return FileResponse(
                open(file_path, 'rb'),
                as_attachment=True,
                filename='DriveBase_Setup.exe',
                content_type='application/vnd.microsoft.portable-executable'
            )
    raise Http404("Desktop application installer not found.")


# Create API instance (session-authenticated routers enforce CSRF via django_auth)
api = NinjaAPI(
    title="Vehicle Management API",
    version="1.0.0",
    description="REST API for Vehicle Management System",
    urls_namespace='api',
)

# Add routers
api.add_router("/", vehicles_router)
api.add_router("/", auth_router)
api.add_router("/", vehicle_router)
api.add_router("/transactions", transaction_router)
api.add_router("/settings", settings_router)
api.add_router("/activity-logs", activity_logs_router)
api.add_router("/", dashboard_router)

urlpatterns = [
    # CSRF endpoint - MUST be outside NinjaAPI to use ensure_csrf_cookie
    path('api/auth/csrf', get_csrf_token, name='csrf-token'),
    # Desktop installer direct download
    path('api/desktop/download', download_desktop_app, name='download-desktop-app'),
    path('downloads/DriveBase_Setup.exe', download_desktop_app, name='download-desktop-exe'),
    # API endpoints (outside i18n_patterns to avoid language prefix)
    path('api/', api.urls),
]

urlpatterns += i18n_patterns(
    path('admin/', admin.site.urls),
    path('', include('manager.urls')),
    path('rosetta/', include('rosetta.urls')),
    path('i18n/', include('django.conf.urls.i18n')),
    prefix_default_language=False,
)

handler404 = 'manager.views.custom_404'
# handler500 = 'manager.views.custom_500'

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += [
        path("__reload__/", include("django_browser_reload.urls")),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
