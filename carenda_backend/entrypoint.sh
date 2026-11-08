#!/bin/sh
set -e

# Wait for database if DATABASE_URL or DB_HOST is configured
if [ -n "$DB_HOST" ]; then
  echo "Waiting for database at $DB_HOST:${DB_PORT:-5432}..."
  while ! nc -z "$DB_HOST" "${DB_PORT:-5432}" 2>/dev/null; do
    sleep 1
  done
  echo "Database is ready!"
fi

if [ "$1" = "runserver" ]; then
  echo "Applying database migrations..."
  python manage.py migrate --noinput
  echo "Collecting static files..."
  python manage.py collectstatic --noinput
  echo "Starting production Gunicorn WSGI server on 0.0.0.0:8000..."
  exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
elif [ "$1" = "runbot" ]; then
  echo "Starting Carenda Aiogram 3 Bot & Scheduler..."
  exec python manage.py runbot
else
  exec "$@"
fi
