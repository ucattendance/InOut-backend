# Linode API setup — api.inout.urbancode.tech

Frontend (`https://inout.urbancode.tech`) needs an **HTTPS** API. HTTP-only calls are blocked by the browser (mixed content).

## 1) DNS (Hostinger hPanel)

Add an **A record**:

| Type | Name | Points to | TTL |
|------|------|-----------|-----|
| A | api | 172.105.61.231 | 300 |

Wait 5–15 minutes, then verify:

```bash
nslookup api.inout.urbancode.tech
```

## 2) Nginx on Linode

SSH:

```bash
ssh zen@172.105.61.231
cd ~/Inout-backend
git pull origin main
sudo cp deploy/nginx-api.inout.urbancode.tech.conf /etc/nginx/sites-available/inout-api
sudo ln -sf /etc/nginx/sites-available/inout-api /etc/nginx/sites-enabled/inout-api
sudo nginx -t
sudo systemctl reload nginx
curl http://127.0.0.1/ping   # from app on 5010
curl -H "Host: api.inout.urbancode.tech" http://127.0.0.1/ping
```

## 3) HTTPS (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.inout.urbancode.tech
```

Test:

```bash
curl https://api.inout.urbancode.tech/ping
```

Expected: `pong`

## 4) PM2 check

```bash
pm2 list
pm2 logs inout-backend --lines 20
curl http://127.0.0.1:5010/ping
```

## 5) Email (reminders / leave / register)

`.env`-la add pannunga:

```env
NOTIFY_EMAIL=admin@urbancode.in
NOTIFY_PASSWORD=your_gmail_app_password
ATTENDANCE_REMINDERS_ENABLED=true
MONTHLY_REPORTS_ENABLED=true
```

Restart:

```bash
pm2 restart inout-backend
pm2 logs inout-backend --lines 30
```

Logs-la `[AttendanceReminder] Scheduler started` varanum.

Test (no live send):

```bash
cd ~/Inout-backend
node scripts/testAttendanceReminders.js
```

## Notes

- App listens on **5010** (see `.env` PORT).
- CORS already allows `https://inout.urbancode.tech`.
- Old path `http://172.105.61.231/inout-api/` may conflict with other nginx sites; prefer the subdomain above.
