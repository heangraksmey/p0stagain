#!/bin/bash
set -e

echo "================================================"
echo "  Telegram Bot Manager | Docker Setup"
echo "================================================"
echo

# ── Step 1: Check Docker ─────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found. Install it first:"
    echo "    curl -fsSL https://get.docker.com | sh"
    exit 1
fi
echo "[OK] Docker detected."

if ! docker compose version &> /dev/null; then
    echo "[!] 'docker compose' plugin not found. Install docker-compose-plugin and re-run."
    exit 1
fi

# ── Step 2: Create .env if missing ────────────────────────────────────────
if [ ! -f .env ]; then
    echo
    echo "[!] No .env file found. Creating one from .env.example..."
    cp .env.example .env
    echo "[!] IMPORTANT: edit .env now and set your real BOT_TOKEN, then re-run this script."
    echo "    nano .env"
    exit 1
fi

if grep -q "your_telegram_bot_token_here" .env; then
    echo
    echo "[!] .env still has the placeholder BOT_TOKEN. Edit it first:"
    echo "    nano .env"
    exit 1
fi
echo "[OK] .env found."

# ── Step 3: Build and start ───────────────────────────────────────────────
echo
echo "================================================"
echo "  Building and starting the bot..."
echo "================================================"
echo
docker compose up -d --build

echo
echo "================================================"
echo "  Started! Dashboard: http://<your-droplet-ip>:3000"
echo "  Logs:    docker compose logs -f"
echo "  Stop:    docker compose down"
echo "================================================"
