import os
from pathlib import Path
import dj_database_url
from decouple import config
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
PARENT_DIR = BASE_DIR.parent

# Reliably load .env from project root and carenda_backend
if (PARENT_DIR / ".env").exists():
    load_dotenv(PARENT_DIR / ".env")
if (BASE_DIR / ".env").exists():
    load_dotenv(BASE_DIR / ".env", override=True)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config(
    'SECRET_KEY',
    default='django-insecure-_nv3o$sz0pc9l3o3-pt$2)+13xo!#7tglkt&=0o!@0g$&=z6(6',
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='*',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()],
)

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'rest_framework',
    'corsheaders',

    # Local apps
    'apps.users',
    'apps.fleet',
    'apps.bot',
]

MIDDLEWARE = [
    'django.middleware.gzip.GZipMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database (Strict PostgreSQL Configuration)
import sys

IS_TESTING = "test" in sys.argv
CONN_MAX_AGE = 0 if IS_TESTING else config('CONN_MAX_AGE', default=60, cast=int)
DATABASE_URL = config('DATABASE_URL', default=None)

DB_NAME = config('DB_NAME', default='carenda_db')
DB_USER = config('DB_USER', default='postgres')
DB_PASSWORD = config('DB_PASSWORD', default='1')
DB_HOST = config('DB_HOST', default='localhost')
DB_PORT = config('DB_PORT', default='5432')

# Normalize common username quirks (e.g. POSTGRES -> postgres)
if DB_USER and DB_USER.upper() == 'POSTGRES':
    DB_USER = 'postgres'

if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=CONN_MAX_AGE)
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': DB_NAME,
            'USER': DB_USER,
            'PASSWORD': DB_PASSWORD,
            'HOST': DB_HOST,
            'PORT': str(DB_PORT),
            'CONN_MAX_AGE': CONN_MAX_AGE,
        }
    }

# Redis & Resilient Caching Configuration
import socket
import sys
import urllib.parse
from celery.schedules import crontab

IS_TESTING = "test" in sys.argv
REDIS_URL = config("REDIS_URL", default="redis://127.0.0.1:6379/0")


def _is_redis_reachable(url: str, timeout: float = 0.15) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 6379
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


REDIS_ONLINE = False if IS_TESTING else _is_redis_reachable(REDIS_URL, timeout=0.15)

if REDIS_ONLINE:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "IGNORE_EXCEPTIONS": True,
                "SOCKET_CONNECT_TIMEOUT": 0.2,
                "SOCKET_TIMEOUT": 0.2,
                "CONNECTION_POOL_KWARGS": {"max_connections": 50},
            },
            "KEY_PREFIX": "carenda",
        }
    }
    CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=REDIS_URL)
    CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default=REDIS_URL)
    CELERY_TASK_ALWAYS_EAGER = False
    DJANGO_REDIS_IGNORE_EXCEPTIONS = True
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "carenda-fast-locmem-cache",
        }
    }
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+locmem://"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    DJANGO_REDIS_IGNORE_EXCEPTIONS = True

CELERY_TIMEZONE = "Asia/Tashkent"
CELERY_ENABLE_UTC = False
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

CELERY_BEAT_SCHEDULE = {
    "send_daily_overdue_alerts_morning": {
        "task": "apps.bot.tasks.send_daily_overdue_alerts_task",
        "schedule": crontab(hour=9, minute=0),
    },
}

# Custom User Model
AUTH_USER_MODEL = 'users.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Tashkent'

USE_I18N = True

USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (User uploads, Payment QR, etc.)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

def _parse_int_list(raw_val: str | None) -> list[int]:
    if not raw_val:
        return []
    ids: list[int] = []
    for part in str(raw_val).split(","):
        part = part.strip()
        if part:
            try:
                ids.append(int(part))
            except (ValueError, TypeError):
                pass
    return ids


# Telegram Mini App Configuration
TELEGRAM_BOT_TOKEN = config(
    "BOT_TOKEN",
    default=config("TELEGRAM_BOT_TOKEN", default="dev_bot_token_123456"),
)
WEBAPP_URL = config("WEBAPP_URL", default="http://localhost:3000")
ADMIN_TELEGRAM_ID = config('ADMIN_TELEGRAM_ID', default=None, cast=lambda v: int(v) if v else None)
SUPERADMIN_TELEGRAM_IDS = _parse_int_list(config('SUPERADMIN_TELEGRAM_IDS', default=''))
if not SUPERADMIN_TELEGRAM_IDS and ADMIN_TELEGRAM_ID:
    SUPERADMIN_TELEGRAM_IDS = [ADMIN_TELEGRAM_ID]
elif ADMIN_TELEGRAM_ID and ADMIN_TELEGRAM_ID not in SUPERADMIN_TELEGRAM_IDS:
    SUPERADMIN_TELEGRAM_IDS.append(ADMIN_TELEGRAM_ID)

# Payment Defaults / Fallbacks from Environment
DEFAULT_PAYNET_URL = config('NEXT_PUBLIC_PAYNET_P2P_URL', default='')
DEFAULT_CLICK_URL = config('NEXT_PUBLIC_CLICK_P2P_URL', default='')
DEFAULT_PAYME_URL = config('NEXT_PUBLIC_PAYME_P2P_URL', default='')
DEFAULT_CARD_NUMBER = config('NEXT_PUBLIC_ADMIN_CARD_NUMBER', default='')
DEFAULT_CARD_HOLDER = config('NEXT_PUBLIC_ADMIN_CARD_HOLDER', default='')

# Django Rest Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.TelegramWebAppAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

