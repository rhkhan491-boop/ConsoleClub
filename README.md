# Console Club — The Gaming Arena

Website + booking engine + Telegram admin bot. Flat-root layout: every file sits in the repository root.

## Deploy (GitHub → Render)

1. Upload every file in this folder directly into the root of your GitHub repository (no nested folder).
2. In Render, create a **Web Service** from the repo (or let `render.yaml` configure it):
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn -w 1 -b 0.0.0.0:$PORT server:app`
   - Environment variable: `BOT_TOKEN` = your BotFather token (Dashboard → Environment).
3. Open Telegram, find your bot, and send `/start` from an admin account (8887142614 or 6034840006). Telegram only lets a bot message a user who has started it.
4. Keep the site awake on Render's free tier with an external cron (for example cron-job.org) that requests `https://<your-app>.onrender.com/api/health` every 10 minutes.

## Security checklist

- **Revoke any bot token that has been pasted into chat, code, or screenshots.** In BotFather send `/revoke`, then put the new token in Render's `BOT_TOKEN` variable. Never commit a token to GitHub.
- `web.db`, `private_uploads/` and any `.env` files are excluded by `.gitignore`. The server never serves them publicly; only whitelisted site files (html, css, js, images) are reachable.

## Data safety on Render's free tier

Render's free disk is wiped on redeploys and restarts. To protect bookings:
- The bot sends `web.db` to both admins every 3 hours automatically.
- Use **📤 Upload / Restore .db** in the bot (or send any `.db` file to the bot) to restore after a redeploy.

## Telegram notes

- `deleteWebhook` runs on startup with `drop_pending_updates=false`, so polling is never blocked by an old webhook and no pending admin taps are lost.
- If a screenshot cannot be attached, the booking still arrives as a text message.
- If you see `409 Conflict` in the logs during a redeploy, it clears within a few seconds once the old instance stops.

## Local test

```
pip install -r requirements.txt
python server.py          # http://localhost:5000
```
