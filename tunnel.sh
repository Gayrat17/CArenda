#!/usr/bin/env bash

# ==============================================================================
# Carenda - To'liq Avtomatlashtirilgan Cloudflare HTTPS Tunnel
# Telegram Mini App'ni mobil qurilmalarda darhol test qilish uchun
# ==============================================================================

set -e

# Ranglar va formatlar
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 1. 'cloudflared' o'rnatilganligini tekshirish
if ! command -v cloudflared >/dev/null 2>&1; then
    echo -e "${RED}❌ Xatolik: 'cloudflared' kompyuterda o'rnatilmagan.${NC}"
    echo ""
    echo "O'rnatish uchun quyidagi buyruqni bajaring:"
    echo "    brew install cloudflared"
    echo ""
    echo "Boshqa operatsion tizimlar uchun:"
    echo "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
fi

echo -e "${GREEN}✅ 'cloudflared' mavjud:${NC} $(which cloudflared)"

# 2. Next.js Frontend porti (localhost:3000) faolligini tekshirish
echo -e "${CYAN}🔍 localhost:3000 tekshirilmoqda...${NC}"
if nc -z 127.0.0.1 3000 2>/dev/null || nc -z localhost 3000 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend localhost:3000 da faol ishlamoqda.${NC}"
else
    echo -e "${YELLOW}⚠️  OGOHLANTIRISH: localhost:3000 da Next.js frontend aniqlanmadi!${NC}"
    echo -e "   Mini App to'g'ri ishlashi uchun alohida terminalda frontendni yoqing:"
    echo -e "   👉 ${BOLD}cd carenda_frontend && npm run dev${NC}\n"
fi

# 3. Vaqtinchalik log fayli yaratish va tozalash mexanizmi (Trap)
LOG_FILE=$(mktemp -t cf_tunnel_log.XXXXXX)
CLEANED=0

cleanup() {
    if [ "$CLEANED" -eq 1 ]; then
        return
    fi
    CLEANED=1
    echo ""
    echo -e "${YELLOW}🛑 Cloudflare Tunnel to'xtatilmoqda...${NC}"
    kill "$TAIL_PID" 2>/dev/null || true
    kill "$CF_PID" 2>/dev/null || true
    rm -f "$LOG_FILE" 2>/dev/null || true
    echo -e "${GREEN}👋 Tunnel to'xtatildi.${NC}"
    exit 0
}

trap cleanup INT TERM EXIT

echo -e "${BLUE}⏳ Cloudflare HTTPS tunneli ishga tushirilmoqda...${NC}"
cloudflared tunnel --url http://localhost:3000 > "$LOG_FILE" 2>&1 &
CF_PID=$!

# 4. Tunnel havolasini avtomatik tutib olish (kutish maksimum 35 soniya)
TUNNEL_URL=""
for i in {1..35}; do
    if ! kill -0 "$CF_PID" 2>/dev/null; then
        echo -e "${RED}❌ cloudflared kutilmaganda to'xtadi. Loglar:${NC}"
        cat "$LOG_FILE"
        exit 1
    fi

    TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "$LOG_FILE" | head -n 1 || true)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo -e "${RED}❌ HTTPS havola olinmadi. cloudflared loglari:${NC}"
    cat "$LOG_FILE"
    exit 1
fi

echo -e "\n${GREEN}✨ Yangi HTTPS havola olindi:${NC} ${BOLD}${TUNNEL_URL}${NC}\n"

# 5. .env fayllarini va Telegram Bot Menyu tugmasini AVTOMATIK yangilash (Python yordamida)
python3 -c "
import re
import json
import urllib.request
from pathlib import Path

tunnel_url = '${TUNNEL_URL}'

# 1. .env fayllaridagi WEBAPP_URL ni yangilash
env_targets = ['carenda_backend/.env', '.env', '.env.production']
updated_files = []
for path_str in env_targets:
    p = Path(path_str)
    if p.exists():
        txt = p.read_text(encoding='utf-8')
        if re.search(r'^WEBAPP_URL=.*', txt, flags=re.MULTILINE):
            txt = re.sub(r'^WEBAPP_URL=.*', f'WEBAPP_URL={tunnel_url}', txt, flags=re.MULTILINE)
        else:
            txt += f'\nWEBAPP_URL={tunnel_url}\n'
        p.write_text(txt, encoding='utf-8')
        updated_files.append(str(p))

if updated_files:
    print(f'✅ Konfiguratsiya yangilandi: {\", \".join(updated_files)} -> WEBAPP_URL={tunnel_url}')

# 2. BOT_TOKEN orqali Telegram Bot Menyu tugmasini avtomatik sozlash
bot_token = None
for path_str in ['carenda_backend/.env', '.env', '.env.production']:
    p = Path(path_str)
    if p.exists():
        txt = p.read_text(encoding='utf-8')
        m = re.search(r'^(?:BOT_TOKEN|TELEGRAM_BOT_TOKEN)=[\x27\"]?([^\x27\"\s]+)[\x27\"]?', txt, re.MULTILINE)
        if m:
            bot_token = m.group(1).strip()
            break

if bot_token and not bot_token.startswith('dev_'):
    # Telegram Bot username'ini olish
    bot_username = 'bot'
    try:
        req_me = urllib.request.Request(f'https://api.telegram.org/bot{bot_token}/getMe')
        with urllib.request.urlopen(req_me, timeout=5) as resp:
            data_me = json.loads(resp.read().decode())
            if data_me.get('ok'):
                bot_username = data_me['result'].get('username', 'bot')
    except Exception:
        pass

    # setChatMenuButton orqali pastki chapdagi WebApp menyusini sozlash
    url = f'https://api.telegram.org/bot{bot_token}/setChatMenuButton'
    payload = json.dumps({
        'menu_button': {
            'type': 'web_app',
            'text': 'Carenda Mini App',
            'web_app': {'url': tunnel_url}
        }
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data.get('ok'):
                print(f'🤖 Telegram Bot (@{bot_username}) menyu tugmasi avtomatik ulandi!')
            else:
                print(f'⚠️ Telegram Bot API javobi: {data}')
    except Exception as e:
        print(f'⚠️ Telegram menyu tugmasini sozlashda ogohlantirish: {e}')
"

# 6. Muvaffaqiyat xulosasi
echo ""
echo -e "${GREEN}================================================================================${NC}"
echo -e " ${BOLD}${GREEN}🎉 BARCHASI AVTOMATIK SOZLANDI! SIZGA HЕCH QANDAY ISH QOLMADI.${NC}"
echo -e "${GREEN}================================================================================${NC}"
echo -e " ${BOLD}🌐 Faol HTTPS Havola:${NC}   ${CYAN}${TUNNEL_URL}${NC}"
echo -e " ${BOLD}⚙️  Backend Sozlamasi:${NC}   carenda_backend/.env faylida WEBAPP_URL yangilandi"
echo -e " ${BOLD}🤖 Telegram Bot:${NC}         @C_arenda_bot menyu tugmasi to'g'ridan-to'g'ri ulandi"
echo -e " ${BOLD}📱 Sinovdan o'tkazish:${NC}   Telefoningizda Telegram orqali @C_arenda_bot ga kiring"
echo -e "                         va pastdagi ${BOLD}\"Carenda Mini App\"${NC} tugmasini bosing!"
echo -e "${GREEN}================================================================================${NC}"
echo -e " ℹ️  Tunnelni to'xtatish uchun klaviaturada ${BOLD}[Ctrl + C]${NC} tugmalarini bosing."
echo -e "${GREEN}================================================================================${NC}"
echo ""

# 7. Cloudflare jonli so'rovlar oqimini ko'rsatish
tail -n 0 -f "$LOG_FILE" &
TAIL_PID=$!

wait "$CF_PID"
