# Deploying to a DigitalOcean Droplet

## 1. Create the Droplet
- Marketplace image **"Docker"** (Ubuntu + Docker pre-installed), $6/mo plan is enough.
- Add your SSH key during creation.

## 2. Copy the project to the Droplet
From your local machine:
```
scp -r . root@<droplet-ip>:/opt/telegram-bot
```
(`.gitignore`/`.dockerignore` keep secrets and `node_modules` out — if you instead use `git clone` on the Droplet, that's fine too.)

## 3. Create the `.env` file on the Droplet
```
ssh root@<droplet-ip>
cd /opt/telegram-bot
cp .env.example .env
nano .env   # set BOT_TOKEN to your real token
```

## 4. Start it
```
docker compose up -d --build
```
This builds the image, starts the container, and creates a named Docker volume (`bot-data`) mounted at `/data` inside the container — your `.telegram-session`, `.telegram-config.json`, and `.scheduled-messages.json` persist there across restarts and redeploys.

## 5. Open the firewall
```
ufw allow 3000/tcp
```
Or put it behind Nginx/Caddy with a domain + HTTPS (recommended if exposing the dashboard publicly, since it has no login).

## 6. Updating after code changes
```
cd /opt/telegram-bot
git pull            # or re-scp the files
docker compose up -d --build
```
The `bot-data` volume is untouched by rebuilds, so your Telegram session and scheduled posts survive.

## Logs / management
```
docker compose logs -f       # tail logs
docker compose restart       # restart
docker compose down          # stop (volume is preserved)
```
