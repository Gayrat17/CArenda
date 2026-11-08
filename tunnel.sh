#!/usr/bin/env bash

# ==============================================================================
# Carenda - Cloudflare HTTPS Tunnel for Telegram Mini App Mobile Testing
# ==============================================================================

# 1. Check if cloudflared is installed
if ! command -v cloudflared >/dev/null 2>&1; then
    echo "❌ Xatolik: 'cloudflared' kompyuterda o'rnatilmagan."
    echo ""
    echo "O'rnatish uchun quyidagi buyruqni bajaring:"
    echo "    brew install cloudflared"
    echo ""
    echo "Boshqa operatsion tizimlar uchun:"
    echo "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
fi

echo "✅ 'cloudflared' topildi: $(which cloudflared)"

# 2. Check if Next.js frontend is active on localhost:3000
echo "🔍 localhost:3000 tekshirilmoqda..."
if nc -z 127.0.0.1 3000 2>/dev/null || nc -z localhost 3000 2>/dev/null; then
    echo "✅ Frontend localhost:3000 da muvaffaqiyatli ishlamoqda."
else
    echo "⚠️  DIQQAT: localhost:3000 da Next.js frontend aniqlanmadi!"
    echo "   Mini App ishlashi uchun alohida terminal oynasida frontendni ishga tushiring:"
    echo "   👉 cd carenda_frontend && npm run dev"
    echo ""
fi

# 3. Informational banner and instructions
echo "================================================================="
echo " 🚀 Carenda Cloudflare HTTPS Tunnel ishga tushirilmoqda"
echo " Target: http://localhost:3000"
echo "================================================================="
echo "📌 QO'LLANMA (Telegram Mini App HTTPS talabi):"
echo " 1. Cloudflare quyida 'https://<tasodifiy>.trycloudflare.com' manzilini chiqaradi."
echo " 2. Ushbu HTTPS manzilni nusxalang va 'carenda_backend/.env' faylidagi"
echo "    'WEBAPP_URL' o'zgaruvchisiga yozing:"
echo "    WEBAPP_URL=https://<tasodifiy>.trycloudflare.com"
echo " 3. Botni qayta ishga tushiring (uv run python manage.py runbot)."
echo " 4. Telegram'da @BotFather orqali /setmenubutton bilan ushbu URL'ni sozlang"
echo "    yoki botga /start yuborib tugmani bosing."
echo "================================================================="
echo ""

# 4. Run Cloudflare Tunnel
exec cloudflared tunnel --url http://localhost:3000
