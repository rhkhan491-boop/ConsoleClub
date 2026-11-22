"""
Console Club — The Gaming Arena
Flask web backend + Telegram admin bot (flat-root deployment on Render).

Environment variables:
  BOT_TOKEN   Telegram BotFather token (required for bot features)
  DB_FILE     Optional path to the SQLite file (default: ./web.db)
  PORT        Set automatically by Render
"""

import os
import re
import html
import json
import math
import time
import uuid
import shutil
import random
import string
import sqlite3
import logging
import datetime
import threading
from contextlib import contextmanager

import requests
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("consoleclub")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.environ.get("DB_FILE", os.path.join(BASE_DIR, "web.db"))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "private_uploads")  # never served publicly
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

BOT_TOKEN = os.environ.get("9088208652:AAEEodKYLyRjCdYgjeMThb_Xgo2WAzFmdzY", "").strip()
ADMIN_IDS = {8887142614, 6034840006}
UPI_ID = "q292825506@ybl"
TG_BASE = "https://api.telegram.org"
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

SETUPS = {
    # name: (allowed durations in minutes, allows 2 players)
    "PS5 Gaming": ((30, 60, 120, 180), True),
    "PS4 Gaming": ((30, 60, 120, 180), True),
    "Steering Wheel": ((30, 60, 120), False),
    "VR Gaming": ((30, 60, 120), False),
    "VR + Steering": ((30, 60, 120), False),
    "GTA VI": ((60, 120, 180, 240), False),
}

# Price tables mirror the official posters (keep in sync with app.js).
DAY_PRICES = {
    "PS5 Gaming": {1: {30: 70, 60: 120, 120: 200, 180: 300}, 2: {30: 110, 60: 200, 120: 350, 180: 530}},
    "PS4 Gaming": {1: {30: 50, 60: 80, 120: 140, 180: 200}, 2: {30: 80, 60: 130, 120: 220, 180: 320}},
    "Steering Wheel": {1: {30: 100, 60: 160, 120: 320}},
    "VR Gaming": {1: {30: 120, 60: 200, 120: 400}},
    "VR + Steering": {1: {30: 200, 60: 330, 120: 660}},
    "GTA VI": {1: {60: 120, 120: 200, 180: 300, 240: 400}},
}
NIGHT_HOURLY = {  # (single, multiplayer) per hour, 12:00 AM – 7:00 AM
    "PS5 Gaming": (200, 300),
    "PS4 Gaming": (120, 200),
    "Steering Wheel": (280, 280),
    "VR Gaming": (300, 300),
    "VR + Steering": (400, 400),
    "GTA VI": (200, 200),
}

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB request cap

db_lock = threading.RLock()
_bot_started = False


def _scrub(value):
    """Remove the bot token from any text before it reaches the logs."""
    text = str(value)
    if BOT_TOKEN:
        text = text.replace(BOT_TOKEN, "<token>")
    return text


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
@contextmanager
def db_conn():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db_lock, db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_hash TEXT UNIQUE NOT NULL,
                setup TEXT NOT NULL,
                players INTEGER NOT NULL,
                booking_date TEXT NOT NULL,
                booking_time TEXT NOT NULL,
                hours INTEGER NOT NULL DEFAULT 1,
                duration_mins INTEGER NOT NULL DEFAULT 60,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                total_amount REAL NOT NULL,
                advance_amount REAL NOT NULL,
                screenshot_filename TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved_at TIMESTAMP
            )
            """
        )
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(bookings)").fetchall()]
        if "duration_mins" not in cols:
            conn.execute("ALTER TABLE bookings ADD COLUMN duration_mins INTEGER NOT NULL DEFAULT 60")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_slots ON bookings (booking_date, setup, status)")


init_db()


# ---------------------------------------------------------------------------
# Time / pricing helpers (server-side source of truth)
# ---------------------------------------------------------------------------
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def hhmm_to_mins(t):
    m = TIME_RE.match(t or "")
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def mins_to_12h(mins):
    h, m = divmod(mins, 60)
    return f"{(h % 12) or 12}:{m:02d} {'PM' if h >= 12 else 'AM'}"


def ist_now():
    return datetime.datetime.now(IST)


def valid_slot_start(mins):
    """Day Time 10:00–23:30 and Night 00:00–06:30, in 30-minute steps."""
    if mins is None or mins % 30 != 0:
        return False
    return 600 <= mins <= 1410 or 0 <= mins <= 390


def floor_half_up(x):
    return int(math.floor(x + 0.5))


def expected_total(setup, players, duration, start_mins):
    if start_mins < 600:  # night shift (00:00–09:59)
        single, multi = NIGHT_HOURLY[setup]
        rate = multi if players == 2 else single
        return floor_half_up(rate * duration / 60)
    per_players = DAY_PRICES[setup].get(players)
    if per_players is None:
        return None
    return per_players.get(duration)


def duration_label(mins):
    if mins < 60:
        return f"{mins} mins"
    if mins == 60:
        return "1 hr"
    return f"{mins // 60} hrs"


def find_overlap(conn, booking_date, setup, start, duration, exclude_id=None):
    rows = conn.execute(
        "SELECT id, booking_time, duration_mins FROM bookings "
        "WHERE booking_date = ? AND setup = ? AND status IN ('pending', 'approved')",
        (booking_date, setup),
    ).fetchall()
    for r in rows:
        if exclude_id is not None and r["id"] == exclude_id:
            continue
        ex_start = hhmm_to_mins(r["booking_time"])
        ex_end = ex_start + int(r["duration_mins"] or 60)
        if start < ex_end and (start + duration) > ex_start:
            return True
    return False


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------
def tg_call(method, json_body=None, data=None, files=None, timeout=20):
    """POST to the Telegram Bot API. Returns (ok, body). Never raises."""
    if not BOT_TOKEN:
        return False, None
    url = f"{TG_BASE}/bot{BOT_TOKEN}/{method}"
    try:
        if data is not None or files is not None:
            res = requests.post(url, data=data, files=files, timeout=timeout)
        else:
            res = requests.post(url, json=json_body or {}, timeout=timeout)
    except requests.RequestException as e:
        logger.error("Telegram %s network error: %s", method, _scrub(e))
        return False, None
    try:
        body = res.json()
    except ValueError:
        body = None
    if res.status_code != 200 or not (body and body.get("ok")):
        logger.error("Telegram %s failed: HTTP %s | %s", method, res.status_code, _scrub(res.text)[:500])
        return False, body
    return True, body


def send_message(chat_id, text, reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "text": text[:4090],
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    ok, _ = tg_call("sendMessage", json_body=payload)
    return ok


def send_long_message(chat_id, lines, reply_markup=None):
    """Split a long list into several messages under Telegram's 4096-char limit."""
    chunks, chunk = [], ""
    for line in lines:
        if len(chunk) + len(line) + 1 > 3800:
            chunks.append(chunk)
            chunk = ""
        chunk += line + "\n"
    if chunk:
        chunks.append(chunk)
    for i, c in enumerate(chunks):
        send_message(chat_id, c, reply_markup if i == len(chunks) - 1 else None)


def send_photo_or_fallback(chat_id, photo_path, caption, reply_markup=None):
    """Send the screenshot with the booking. If sendPhoto fails for ANY reason,
    fall back to sendMessage so the owner never misses a booking."""
    caption = caption[:1000]
    if photo_path and os.path.isfile(photo_path):
        try:
            data = {"chat_id": str(chat_id), "caption": caption, "parse_mode": "HTML"}
            if reply_markup:
                data["reply_markup"] = json.dumps(reply_markup)
            with open(photo_path, "rb") as fh:
                ok, _ = tg_call("sendPhoto", data=data, files={"photo": fh}, timeout=30)
            if ok:
                return True
        except OSError as e:
            logger.error("Could not open screenshot %s: %s", photo_path, e)
        logger.warning("sendPhoto failed; falling back to sendMessage for chat %s", chat_id)
        return send_message(
            chat_id,
            caption + "\n\n⚠️ <i>Screenshot could not be attached; it is stored on the server.</i>",
            reply_markup,
        )
    return send_message(chat_id, caption, reply_markup)


def send_document(chat_id, doc_path, caption=""):
    try:
        with open(doc_path, "rb") as fh:
            ok, _ = tg_call(
                "sendDocument",
                data={"chat_id": str(chat_id), "caption": caption[:1000], "parse_mode": "HTML"},
                files={"document": fh},
                timeout=60,
            )
        return ok
    except OSError as e:
        logger.error("Could not open %s for sending: %s", doc_path, e)
        return False


def answer_callback(cq_id, text, alert=False):
    tg_call("answerCallbackQuery", json_body={"callback_query_id": cq_id, "text": text[:190], "show_alert": alert})


def remove_buttons(chat_id, message_id):
    tg_call(
        "editMessageReplyMarkup",
        json_body={"chat_id": chat_id, "message_id": message_id, "reply_markup": {"inline_keyboard": []}},
    )


ADMIN_KEYBOARD = {
    "keyboard": [
        [{"text": "📅 Active Approved Bookings"}, {"text": "💾 Download DB Backup"}],
        [{"text": "📤 Upload / Restore .db"}, {"text": "📊 Quick Summary"}],
    ],
    "resize_keyboard": True,
    "is_persistent": True,
}


def notify_admins_new_booking(booking_id):
    with db_lock, db_conn() as conn:
        b = conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()
    if not b:
        logger.error("notify_admins_new_booking: booking %s not found", booking_id)
        return

    start_txt = mins_to_12h(hhmm_to_mins(b["booking_time"]))
    caption = (
        "🚨 <b>NEW CONSOLE CLUB BOOKING</b>\n\n"
        f"🔖 <b>Receipt ID:</b> <code>{html.escape(b['receipt_hash'])}</code>\n"
        f"🎮 <b>Setup:</b> {html.escape(b['setup'])} ({b['players']}P)\n"
        f"📅 <b>Slot:</b> {html.escape(b['booking_date'])} at <b>{html.escape(start_txt)}</b> "
        f"({duration_label(int(b['duration_mins']))})\n"
        f"👤 <b>Gamer:</b> {html.escape(b['name'])}\n"
        f"📞 <b>Phone:</b> <code>{html.escape(b['phone'])}</code>\n"
        f"💰 <b>Total Fee:</b> ₹{int(b['total_amount'])} | <b>50% Paid:</b> ₹{int(b['advance_amount'])}\n"
        f"📌 <b>UPI:</b> <code>{html.escape(UPI_ID)}</code>\n\n"
        "👇 <i>Review the screenshot and approve or deny:</i>"
    )
    reply_markup = {
        "inline_keyboard": [
            [
                {"text": "✅ APPROVE BOOKING", "callback_data": f"app_{booking_id}"},
                {"text": "❌ DENY / REJECT", "callback_data": f"rej_{booking_id}"},
            ]
        ]
    }
    shot = os.path.join(UPLOAD_FOLDER, b["screenshot_filename"]) if b["screenshot_filename"] else None
    for admin_id in ADMIN_IDS:
        send_photo_or_fallback(admin_id, shot, caption, reply_markup)


# ---------------------------------------------------------------------------
# Telegram update handling
# ---------------------------------------------------------------------------
def handle_callback(cq):
    cq_id = cq["id"]
    uid = cq["from"]["id"]
    if uid not in ADMIN_IDS:
        answer_callback(cq_id, "Unauthorized.", alert=True)
        return

    m = re.match(r"^(app|rej)_(\d+)$", cq.get("data", ""))
    if not m:
        answer_callback(cq_id, "Unknown action.")
        return

    new_status = "approved" if m.group(1) == "app" else "rejected"
    booking_id = int(m.group(2))

    with db_lock, db_conn() as conn:
        b = conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()
        if not b:
            answer_callback(cq_id, "Booking not found.", alert=True)
            return
        if new_status == "approved" and find_overlap(
            conn, b["booking_date"], b["setup"], hhmm_to_mins(b["booking_time"]),
            int(b["duration_mins"]), exclude_id=booking_id,
        ):
            answer_callback(cq_id, "Cannot approve: this slot now overlaps another booking.", alert=True)
            return
        conn.execute(
            "UPDATE bookings SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_status, booking_id),
        )

    answer_callback(cq_id, f"Booking {new_status}!")
    msg = cq.get("message") or {}
    if msg.get("message_id") and (msg.get("chat") or {}).get("id"):
        remove_buttons(msg["chat"]["id"], msg["message_id"])

    label = "✅ APPROVED" if new_status == "approved" else "❌ REJECTED (slot released)"
    send_message(
        uid,
        f"<b>Booking {html.escape(b['receipt_hash'])} — {label}</b>\n"
        f"• Gamer: {html.escape(b['name'])} (<code>{html.escape(b['phone'])}</code>)\n"
        f"• Slot: {html.escape(b['booking_date'])} at {html.escape(mins_to_12h(hhmm_to_mins(b['booking_time'])))}\n"
        f"• Setup: {html.escape(b['setup'])}",
        ADMIN_KEYBOARD,
    )


def restore_database(file_id, file_name, uid):
    ok, body = tg_call("getFile", json_body={"file_id": file_id})
    file_path = ((body or {}).get("result") or {}).get("file_path") if ok else None
    if not file_path:
        send_message(uid, "❌ Could not download the file from Telegram.", ADMIN_KEYBOARD)
        return
    try:
        res = requests.get(f"{TG_BASE}/file/bot{BOT_TOKEN}/{file_path}", timeout=60)
        if res.status_code != 200:
            raise RuntimeError(f"HTTP {res.status_code}")
        content = res.content
    except Exception as e:
        logger.error("Restore download failed: %s", _scrub(e))
        send_message(uid, "❌ Could not download the file from Telegram.", ADMIN_KEYBOARD)
        return

    if not content.startswith(b"SQLite format 3\x00"):
        send_message(uid, "❌ That file is not a valid SQLite database.", ADMIN_KEYBOARD)
        return

    incoming = DB_FILE + ".incoming"
    with open(incoming, "wb") as fh:
        fh.write(content)
    try:
        check = sqlite3.connect(incoming)
        check.execute("SELECT COUNT(*) FROM bookings").fetchone()
        check.close()
    except sqlite3.Error as e:
        os.remove(incoming)
        send_message(uid, f"❌ Database check failed: <code>{html.escape(str(e))}</code>", ADMIN_KEYBOARD)
        return

    with db_lock:
        if os.path.exists(DB_FILE):
            shutil.copy2(DB_FILE, DB_FILE + ".bak")
        os.replace(incoming, DB_FILE)
    init_db()
    send_message(
        uid,
        f"✅ <b>Database restored from</b> <code>{html.escape(file_name)}</code><b>!</b>",
        ADMIN_KEYBOARD,
    )


def handle_message(msg):
    uid = msg["from"]["id"]
    if uid not in ADMIN_IDS:
        return  # ignore everyone else silently

    if "document" in msg:
        doc = msg["document"]
        file_name = doc.get("file_name", "")
        if not file_name.lower().endswith(".db"):
            send_message(uid, "❌ Please send a valid <code>.db</code> SQLite file.", ADMIN_KEYBOARD)
            return
        if int(doc.get("file_size", 0)) > 20 * 1024 * 1024:
            send_message(uid, "❌ File is larger than 20 MB; Telegram cannot deliver it.", ADMIN_KEYBOARD)
            return
        restore_database(doc["file_id"], file_name, uid)
        return

    text = (msg.get("text") or "").strip()

    if text == "/start":
        send_message(
            uid,
            "👋 <b>Console Club Admin Bot Active!</b>\n\n"
            "• Tap <b>📅 Active Approved Bookings</b> to verify walk-in gamers.\n"
            "• Tap <b>📤 Upload / Restore .db</b> or send any <code>.db</code> file to restore backup data.\n"
            "• Automatic <code>web.db</code> backups are sent every 3 hours.",
            ADMIN_KEYBOARD,
        )
    elif text in ("/bookings", "📅 Active Approved Bookings"):
        with db_lock, db_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM bookings WHERE status = 'approved' "
                "ORDER BY booking_date ASC, booking_time ASC LIMIT 60"
            ).fetchall()
        if not rows:
            send_message(uid, "ℹ️ No approved bookings scheduled right now.", ADMIN_KEYBOARD)
            return
        lines = ["📋 <b>APPROVED CONSOLE CLUB BOOKINGS</b>\n"]
        for r in rows:
            lines.append(
                f"• <b>{html.escape(r['receipt_hash'])}</b> | "
                f"<b>{html.escape(mins_to_12h(hhmm_to_mins(r['booking_time'])))}</b> "
                f"({html.escape(r['booking_date'])})\n"
                f"   🎮 {html.escape(r['setup'])} ({r['players']}P, {r['duration_mins']} min) | "
                f"👤 {html.escape(r['name'])} (<code>{html.escape(r['phone'])}</code>)\n"
                f"   💰 Paid 50%: ₹{int(r['advance_amount'])} / Total: ₹{int(r['total_amount'])}"
            )
        send_long_message(uid, lines, ADMIN_KEYBOARD)
    elif text in ("/backup", "💾 Download DB Backup"):
        if os.path.exists(DB_FILE):
            send_document(uid, DB_FILE, f"📦 Manual backup ({ist_now():%Y-%m-%d %H:%M} IST)")
        else:
            send_message(uid, "Database file not found yet.", ADMIN_KEYBOARD)
    elif text in ("/restore", "📤 Upload / Restore .db"):
        send_message(
            uid,
            "📤 <b>Upload Database to Restore</b>\n\n"
            "Attach and send your <code>web.db</code> backup file in this chat.\n"
            "The bot will replace the current database and restore all bookings.",
            ADMIN_KEYBOARD,
        )
    elif text in ("/summary", "📊 Quick Summary"):
        with db_lock, db_conn() as conn:
            total = conn.execute("SELECT COUNT(*) AS c FROM bookings").fetchone()["c"]
            approved = conn.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='approved'").fetchone()["c"]
            pending = conn.execute("SELECT COUNT(*) AS c FROM bookings WHERE status='pending'").fetchone()["c"]
            advance = conn.execute(
                "SELECT COALESCE(SUM(advance_amount), 0) AS s FROM bookings WHERE status='approved'"
            ).fetchone()["s"]
        send_message(
            uid,
            "📊 <b>Console Club Summary</b>\n"
            f"• Total bookings: <b>{total}</b>\n"
            f"• Approved: <b>{approved}</b>\n"
            f"• Pending: <b>{pending}</b>\n"
            f"• 50% advance approved: <b>₹{int(advance)}</b>",
            ADMIN_KEYBOARD,
        )


def handle_update(update):
    if "callback_query" in update:
        handle_callback(update["callback_query"])
    elif "message" in update:
        handle_message(update["message"])


def tg_poll_loop():
    """Long-polling loop. Raises on fatal errors so the supervisor restarts it."""
    ok, _ = tg_call("deleteWebhook", json_body={"drop_pending_updates": False})
    logger.info("deleteWebhook (drop_pending_updates=false): %s", "ok" if ok else "failed")
    ok, body = tg_call("getMe")
    if ok:
        logger.info("Telegram bot online as @%s", body["result"].get("username", "?"))

    offset = 0
    logger.info("Telegram polling started.")
    while True:
        try:
            res = requests.get(
                f"{TG_BASE}/bot{BOT_TOKEN}/getUpdates",
                params={
                    "offset": offset,
                    "timeout": 25,
                    "allowed_updates": json.dumps(["message", "callback_query"]),
                },
                timeout=40,
            )
            if res.status_code != 200:
                logger.error("getUpdates HTTP %s: %s", res.status_code, _scrub(res.text)[:300])
                time.sleep(5)
                continue
            for update in res.json().get("result", []):
                offset = update["update_id"] + 1
                try:
                    handle_update(update)
                except Exception as e:  # one bad update must not stop the bot
                    logger.exception("Error handling update: %s", _scrub(e))
        except requests.RequestException as e:
            logger.error("Polling network error: %s", _scrub(e))
            time.sleep(3)


def auto_backup_loop():
    time.sleep(30)
    while True:
        try:
            if os.path.exists(DB_FILE):
                stamp = f"{ist_now():%Y-%m-%d %H:%M} IST"
                for admin_id in ADMIN_IDS:
                    send_document(admin_id, DB_FILE, f"🛡️ <b>Console Club 3-hour auto-backup</b>\n{stamp}")
        except Exception as e:
            logger.error("Auto backup error: %s", _scrub(e))
        time.sleep(3 * 3600)


def supervise(name, target):
    """Restart a background worker forever if it crashes, so it never dies silently."""
    while True:
        try:
            target()
            logger.warning("%s returned; restarting in 5s", name)
        except Exception as e:
            logger.error("%s crashed: %s — restarting in 5s", name, _scrub(e))
        time.sleep(5)


def start_bot_threads():
    global _bot_started
    if _bot_started:
        return
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN is not set — Telegram bot is disabled. Set it in the Render dashboard.")
        return
    _bot_started = True
    threading.Thread(target=supervise, args=("telegram-poller", tg_poll_loop), daemon=True).start()
    threading.Thread(target=supervise, args=("auto-backup", auto_backup_loop), daemon=True).start()


start_bot_threads()


# ---------------------------------------------------------------------------
# Web routes
# ---------------------------------------------------------------------------
@app.after_request
def add_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if resp.mimetype in ("text/html", "text/css", "application/javascript"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


PUBLIC_EXT = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".ico"}


def serve_public(filename):
    """Serve ONLY whitelisted public file types from the project folder.
    server.py, requirements, web.db and private_uploads are never reachable."""
    if not filename or os.path.basename(filename) != filename:
        return None
    if os.path.splitext(filename)[1].lower() not in PUBLIC_EXT:
        return None
    if not os.path.isfile(os.path.join(BASE_DIR, filename)):
        return None
    return send_from_directory(BASE_DIR, filename)


@app.route("/")
def index():
    return serve_public("index.html") or ("Page not found", 404)


@app.route("/img/<path:filename>")
def image_alias(filename):
    # /img/<file> is an alias for /<file> so older HTML paths still resolve.
    return serve_public(filename) or ("Image not found", 404)


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "bot_token_configured": bool(BOT_TOKEN), "admin_count": len(ADMIN_IDS)})


@app.route("/api/locked-slots")
def locked_slots():
    today = ist_now().date().isoformat()
    with db_lock, db_conn() as conn:
        rows = conn.execute(
            "SELECT booking_date, booking_time, duration_mins, setup, status FROM bookings "
            "WHERE status IN ('approved', 'pending') AND booking_date >= ?",
            (today,),
        ).fetchall()
    return jsonify({"success": True, "locked_slots": [dict(r) for r in rows]})


@app.route("/api/book", methods=["POST"])
def submit_booking():
    try:
        setup = request.form.get("setup", "").strip()
        booking_date = request.form.get("booking_date", "").strip()
        booking_time = request.form.get("booking_time", "").strip()
        name = re.sub(r"\s+", " ", request.form.get("name", "")).strip()
        phone = re.sub(r"\D", "", request.form.get("phone", ""))
        if len(phone) == 12 and phone.startswith("91"):
            phone = phone[2:]
        try:
            players = int(request.form.get("players", "1"))
            duration = int(request.form.get("duration_mins", "60"))
            total = int(round(float(request.form.get("total_amount", "0"))))
            advance = int(round(float(request.form.get("advance_amount", "0"))))
        except ValueError:
            return jsonify({"success": False, "error": "Invalid booking numbers."}), 400

        # ----- validation -----
        if setup not in SETUPS:
            return jsonify({"success": False, "error": "Unknown gaming setup."}), 400
        allowed_durs, allows_two = SETUPS[setup]
        if players not in (1, 2) or (players == 2 and not allows_two):
            return jsonify({"success": False, "error": "This setup supports 1 player only."}), 400
        if duration not in allowed_durs:
            return jsonify({"success": False, "error": "Invalid duration for this setup."}), 400

        try:
            day = datetime.date.fromisoformat(booking_date)
        except ValueError:
            return jsonify({"success": False, "error": "Invalid date."}), 400
        now = ist_now()
        today = now.date()
        if day not in (today, today + datetime.timedelta(days=1)):
            return jsonify({"success": False, "error": "Bookings are open for today and tomorrow only."}), 400

        start = hhmm_to_mins(booking_time)
        if not valid_slot_start(start):
            return jsonify({"success": False, "error": "Invalid start time."}), 400
        if day == today and start <= now.hour * 60 + now.minute:
            return jsonify({"success": False, "error": "That start time has already passed."}), 409

        if not (2 <= len(name) <= 40):
            return jsonify({"success": False, "error": "Enter a valid gamertag or name (2–40 characters)."}), 400
        if not PHONE_RE.match(phone):
            return jsonify({"success": False, "error": "Enter a valid 10-digit Indian mobile number."}), 400

        expected = expected_total(setup, players, duration, start)
        if expected is None:
            return jsonify({"success": False, "error": "This option is not priced."}), 400
        if total != expected or advance != floor_half_up(expected / 2):
            return jsonify({"success": False, "error": "Price mismatch. Please refresh the page and try again."}), 400

        shot = request.files.get("screenshot")
        if not shot or not shot.filename:
            return jsonify({"success": False, "error": "Payment screenshot is required."}), 400
        ext = os.path.splitext(secure_filename(shot.filename))[1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            return jsonify({"success": False, "error": "Screenshot must be a JPG, PNG or WEBP image."}), 400

        # ----- atomic overlap check + lock + insert -----
        with db_lock, db_conn() as conn:
            if find_overlap(conn, booking_date, setup, start, duration):
                return jsonify({"success": False, "error": "This slot was just booked. Please choose another time."}), 409

            receipt = None
            for _ in range(20):
                candidate = f"#CC-{''.join(random.choices(string.digits, k=5))}"
                if not conn.execute("SELECT 1 FROM bookings WHERE receipt_hash = ?", (candidate,)).fetchone():
                    receipt = candidate
                    break
            if receipt is None:
                return jsonify({"success": False, "error": "Could not create receipt. Please retry."}), 500

            saved_name = f"pay_{uuid.uuid4().hex}{ext}"
            shot.save(os.path.join(UPLOAD_FOLDER, saved_name))

            cur = conn.execute(
                """
                INSERT INTO bookings (
                    receipt_hash, setup, players, booking_date, booking_time, hours, duration_mins,
                    name, phone, total_amount, advance_amount, screenshot_filename, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    receipt, setup, players, booking_date, booking_time,
                    max(1, math.ceil(duration / 60)), duration,
                    name, phone, float(total), float(advance), saved_name,
                ),
            )
            booking_id = cur.lastrowid

        threading.Thread(target=notify_admins_new_booking, args=(booking_id,), daemon=True).start()
        return jsonify({"success": True, "receipt_hash": receipt, "booking_id": booking_id, "status": "pending"})
    except Exception as e:
        logger.exception("Booking error: %s", _scrub(e))
        return jsonify({"success": False, "error": "Server error. Please try again in a moment."}), 500


@app.route("/<path:filename>")
def catch_all(filename):
    if filename.startswith("api/"):
        return jsonify({"success": False, "error": "Not found"}), 404
    res = serve_public(filename)
    if res:
        return res
    if "." not in os.path.basename(filename):
        res = serve_public(filename + ".html")  # clean URLs: /rates -> rates.html
        if res:
            return res
    return ("Page not found", 404)


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"success": False, "error": "Upload too large (max 10 MB)."}), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
