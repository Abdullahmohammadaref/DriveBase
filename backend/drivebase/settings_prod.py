"""
Production settings for DriveBase.
Loaded by Gunicorn via: --settings=drivebase.settings_prod
Or set DJANGO_SETTINGS_MODULE=drivebase.settings_prod in .env.production
"""
from .settings import *  # noqa: F401, F403
import os

# --- Security ---
DEBUG = False

SECRET_KEY = os.environ['SECRET_KEY']  # Must be set — fail loudly if missing

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# Whitelist Tauri desktop origins and local development origins alongside production domain
TAURI_ORIGINS = [
    'http://tauri.localhost',
    'https://tauri.localhost',
    'tauri://localhost',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',')
CSRF_TRUSTED_ORIGINS = list(dict.fromkeys([x.strip() for x in CSRF_TRUSTED_ORIGINS if x.strip()] + TAURI_ORIGINS))

# SameSite=None + Secure allows Tauri desktop WebView2 to maintain authenticated sessions cross-origin over HTTPS
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = 'None'
SESSION_COOKIE_SAMESITE = 'None'

# Session longevity settings (30 days) and rolling expiration so active sessions don't expire prematurely
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 days
SESSION_SAVE_EVERY_REQUEST = True

# --- WhiteNoise for static files ---
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # right after SecurityMiddleware
] + [m for m in MIDDLEWARE if m not in (  # noqa: F405
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
)]

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# --- CORS — restrict to your domain in production + Tauri desktop app ---
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
CORS_ALLOWED_ORIGINS = list(dict.fromkeys([x.strip() for x in CORS_ALLOWED_ORIGINS if x.strip()] + TAURI_ORIGINS))
CORS_ALLOW_CREDENTIALS = True

# --- Logging ---
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}

# --- Remove debug-only apps ---
INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'django_browser_reload']  # noqa: F405
