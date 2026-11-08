# 🚀 Carenda — Production Deployment Guide

Bu qo'llanma **Carenda** ko'p ijarachili (multi-tenant) avtomobil ijarasi platformasini Ubuntu VPS serverida Docker Compose va Caddy yordamida ishlab chiqarishga (production) chiqarish bo'yicha to'liq yo'riqnomani taqdim etadi.

---

## 🏗️ 1. Arxitektura Tuzilishi

Carenda quyidagi 4 ta asosiy konteynerdan tashkil topgan:
1. **`db` (PostgreSQL 15):** Xavfsiz, ma'lumotlar saqlanadigan (persistent volume) relyatsion ma'lumotlar bazasi.
2. **`backend` (Django 6 + DRF + Gunicorn):** Barcha biznes-mantiq, USD moliyaviy hisob-kitoblar va REST API endpointlari.
3. **`bot` (Aiogram 3 + APScheduler):** Telegram boti va har kuni soat `09:00` da avtomatik ishga tushuvchi qarzdorlik eslatmalari scheduler'i.
4. **`frontend` (Next.js 16 App Router + Tailwind CSS):** Telegram Mini App interfeysi (mobilga moslashgan, `/api/v1` orqali backendga proxy qilingan).
5. **Caddy Web Server:** Avtomatik Let's Encrypt SSL (HTTPS) sertifikati va port `3000` ga teskari proksi (reverse proxy).

---

## 📋 2. Talablar (Prerequisites)

- **Server:** Ubuntu 22.04 LTS yoki 24.04 LTS (kamida 1 GB RAM, 1 CPU).
- **Docker & Docker Compose:** Serverda o'rnatilgan bo'lishi kerak.
- **Telegram Bot Token:** `@BotFather` orqali olingan token.
- **Domen:** Server IP manziliga yo'naltirilgan A-yozuvi (masalan, `carenda.sizningdomen.uz`).

---

## 🛠️ 3. Serverga Docker O'rnatish

Agar serveringizda Docker hali o'rnatilmagan bo'lsa:

```bash
# Tizimni yangilash
sudo apt update && sudo apt upgrade -y

# Kerakli utilitalarni o'rnatish
sudo apt install -y curl git ufw

# Docker va Docker Compose o'rnatish
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📥 4. Loyihani Serverga Ko'chirish va Sozlash

### 1) Repozitoriyni klonlash:
```bash
git clone https://github.com/Gayrat17/Carenda.git /opt/carenda
cd /opt/carenda
```

### 2) `.env.production` faylini yaratish:
```bash
cp .env.production.example .env.production
nano .env.production
```

Quyidagi o'zgaruvchilarni to'ldiring:
```env
# Xavfsiz Django Secret Key
SECRET_KEY=juda-uzun-va-maxfiy-kalit-yozing-bu-yerga

# Database (PostgreSQL)
POSTGRES_DB=carenda_db
POSTGRES_USER=carenda_user
POSTGRES_PASSWORD=kuchli_va_murakkab_parol_123!
DB_HOST=db
DB_PORT=5432
DATABASE_URL=postgres://carenda_user:kuchli_va_murakkab_parol_123!@db:5432/carenda_db

# Telegram Bot
BOT_TOKEN=9021085452:AAG0dSxh_Va29aobmi1gQsU086LED3aRwYY
WEBAPP_URL=https://carenda.sizningdomen.uz

# Frontend Internal API Proxy
BACKEND_INTERNAL_URL=http://backend:8000
```

---

## 🐳 5. Konteynerlarni Ishga Tushirish

Konteynerlarni bir buyruq bilan yig'ish va fonda ishga tushirish:

```bash
docker compose --env-file .env.production up -d --build
```

### Holatni tekshirish:
```bash
docker compose ps
```
Barcha xizmatlar (`carenda_db`, `carenda_backend`, `carenda_bot`, `carenda_frontend`) `Up (healthy)` holatida bo'lishi kerak.

### Loglarni kuzatish:
```bash
# Barcha loglar
docker compose logs -f

# Faqat Telegram bot loglari
docker compose logs -f bot

# Faqat backend loglari
docker compose logs -f backend
```

### Django Admin uchun Superuser yaratish:
```bash
docker compose exec backend python manage.py createsuperuser
```

---

## 🔒 6. Caddy Web Server O'rnatish (Avtomatik Bepul HTTPS)

Caddy Let's Encrypt orqali avtomatik SSL oladi va konfiguratsiyasi nihoyatda oson:

```bash
# Caddy o'rnatish
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### Caddyfile konfiguratsiyasi:
Loyiha ildizidagi `Caddyfile` ni `/etc/caddy/Caddyfile` ga ko'chiring:
```bash
sudo cp /opt/carenda/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```
Domen nomingizni (`carenda.sizningdomen.uz`) o'z domeningizga o'zgartiring va saqlang:

```caddy
carenda.sizningdomen.uz {
    reverse_proxy localhost:3000
    encode gzip zstd
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options ALLOWALL
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Caddy'ni qayta ishga tushiring:
```bash
sudo systemctl restart caddy
```

Endi `https://carenda.sizningdomen.uz` manzili orqali Telegram Mini App to'liq HTTPS bilan ishlaydi!

---

## 📱 7. Telegram Bot va Mini App Tugmasini Sozlash

1. Telegramda `@BotFather` botiga kiring.
2. `/mybots` buyrug'ini yuboring va o'z botingizni tanlang.
3. **Bot Settings** -> **Menu Button** -> **Configure menu button** bo'limiga kiring.
4. Mini App havolasi sifatida HTTPS domeningizni kiriting:
   ```
   https://carenda.sizningdomen.uz
   ```
5. Tugma matniga `🚀 Carenda` yoki `📱 Mini App` deb yozing.

---

## ⚡ 8. Mahalliy Ishlab Chiqish va Sinash (Cloudflare Tunnel)

Agar siz o'z kompyuteringizda (masalan, Mac yoki Linux) ishlab chiqayotgan bo'lsangiz va real telefondagi Telegram orqali sinab ko'rmoqchi bo'lsangiz:

```bash
# 1. Cloudflared o'rnatish (Mac uchun)
brew install cloudflared

# 2. Port 3000 ga bepul HTTPS tunnel ochish
cloudflared tunnel --url http://localhost:3000
```

Terminalda hosil bo'lgan `https://xxxx.trycloudflare.com` havolasini `@BotFather` dagi WebApp URL ga qo'ying. Single-tunnel proxying tufayli barcha API so'rovlari va Telegram Mini App to'g'ridan-to'g'ri ishlaydi!

---

## 💾 9. Zaxira Nusxalash va Yangilash (Maintenance)

### Ma'lumotlar bazasini zaxiralash (Backup):
```bash
docker compose exec db pg_dump -U carenda_user carenda_db > backup_$(date +%Y%m%d).sql
```

### Zaxiradan tiklash (Restore):
```bash
cat backup_file.sql | docker compose exec -T db psql -U carenda_user -d carenda_db
```

### Yangi versiyani serverga yuklash (Deploy update):
```bash
cd /opt/carenda
git pull origin main
docker compose up -d --build
```

### Qo'lda qarzdorlik xabarlarini sinab yuborish:
```bash
docker compose exec backend python manage.py send_alerts
```
