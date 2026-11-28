#!/usr/bin/env python3
"""X note poster for Parade's note articles.

Separate from the puzzle poster (scripts/x-four + nanpure-x-worker) and
from the video poster (scripts/x-video):
- Uses the SAME GitHub Secrets (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN,
  X_ACCESS_TOKEN_SECRET). Keys are never regenerated or printed.
- Text-only posts: a queue entry is removed from queue.json once it is
  recorded in history.json, and a note_id in history.json (posted or
  uncertain) is never posted again automatically.
- The script refuses to post outside the 30-minute window after an
  entry's x_time_jst. No automatic retry: an uncertain result is
  recorded as 'uncertain' and stops the run.
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
EXPECTED_USERNAME = os.environ.get("X_EXPECTED_USERNAME", "parade166")
API = "https://api.x.com"
HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE_PATH = os.path.join(HERE, "queue.json")
HISTORY_PATH = os.path.join(HERE, "history.json")
NOTE_URL_PREFIX = "https://note.com/jolly_crocus986/n/"
MAX_POST_CHARS = 280


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def weighted_length(text):
    """Rough X length: URLs count as 23, non-ASCII characters as 2."""
    total = 0
    rest = text
    for token in text.split():
        if token.startswith("http://") or token.startswith("https://"):
            total += 23
            rest = rest.replace(token, "", 1)
    for ch in rest:
        if ch == "\n":
            continue
        total += 2 if ord(ch) > 0x7F else 1
    # Spaces removed by the URL replacement still count once each.
    total += text.count(" ")
    return total


def _history_ids(history):
    posted = {h["note_id"] for h in history.get("posted", [])}
    uncertain = {h["note_id"] for h in history.get("uncertain", [])}
    return posted, uncertain


def validate_queue(queue, history):
    """Pure checks. Raises ValueError on any problem. Used by tests and dry-run."""
    if queue.get("account") != EXPECTED_USERNAME:
        raise ValueError(f"queue account must be {EXPECTED_USERNAME}")
    seen_ids, seen_times = set(), set()
    posted, uncertain = _history_ids(history)
    for e in queue["entries"]:
        nid = e["note_id"]
        if nid in seen_ids:
            raise ValueError(f"duplicate note_id in queue: {nid}")
        seen_ids.add(nid)
        xt = datetime.fromisoformat(e["x_time_jst"])
        if xt.tzinfo is None:
            raise ValueError("x_time_jst must carry a timezone")
        key = xt.astimezone(JST).isoformat()
        if key in seen_times:
            raise ValueError(f"two entries share x_time {key}")
        seen_times.add(key)
        url = NOTE_URL_PREFIX + nid
        if url not in e["text"]:
            raise ValueError(f"{nid}: text must contain its note link")
        if not e["text"].endswith(url):
            raise ValueError(f"{nid}: note link must be at the end of the text")
        if weighted_length(e["text"]) > MAX_POST_CHARS:
            raise ValueError(f"{nid}: text is over {MAX_POST_CHARS} weighted characters")
    return {"entries": len(queue["entries"]),
            "already_posted": sorted(posted & seen_ids),
            "uncertain": sorted(uncertain & seen_ids)}


def find_postable(queue, note_id):
    for e in queue["entries"]:
        if e["note_id"] == note_id:
            return e
    return None


def due_entries(queue, history, now):
    posted, uncertain = _history_ids(history)
    out = []
    for e in queue["entries"]:
        xt = datetime.fromisoformat(e["x_time_jst"])
        if e["note_id"] in posted or e["note_id"] in uncertain:
            continue
        if xt <= now < xt + timedelta(minutes=30):
            out.append(e)
    return out


# --- OAuth 1.0a signing (same scheme as scripts/x-video/post_video.py) ---

def _enc(s):
    return urllib.parse.quote(str(s), safe="~")

def oauth_header(method, url, params=None):
    oauth = {
        "oauth_consumer_key": os.environ["X_API_KEY"],
        "oauth_nonce": uuid.uuid4().hex,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": os.environ["X_ACCESS_TOKEN"],
        "oauth_version": "1.0",
    }
    u = urllib.parse.urlparse(url)
    pairs = urllib.parse.parse_qsl(u.query) + list((params or {}).items()) + list(oauth.items())
    norm = "&".join(f"{_enc(k)}={_enc(v)}" for k, v in sorted(pairs, key=lambda p: (_enc(p[0]), _enc(p[1]))))
    base = "&".join([method.upper(), _enc(f"{u.scheme}://{u.netloc}{u.path}"), _enc(norm)])
    key = f"{_enc(os.environ['X_API_SECRET'])}&{_enc(os.environ['X_ACCESS_TOKEN_SECRET'])}".encode()
    oauth["oauth_signature"] = base64.b64encode(hmac.new(key, base.encode(), hashlib.sha1).digest()).decode()
    return "OAuth " + ", ".join(f'{_enc(k)}="{_enc(v)}"' for k, v in sorted(oauth.items()))


def api_json(method, route, body=None):
    url = API + route
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": oauth_header(method, url),
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"X API {e.code} {route}: {detail}") from None


def check_account():
    data = api_json("GET", "/2/users/me")
    name = (data.get("data") or {}).get("username", "")
    if name.lower() != EXPECTED_USERNAME.lower():
        raise RuntimeError(f"Wrong X posting account: {name}")
    return name


def post_entry(entry):
    result = api_json("POST", "/2/tweets", {"text": entry["text"]})
    post_id = str((result.get("data") or {}).get("id", ""))
    if not post_id.isdigit():
        raise RuntimeError("uncertain post result")
    return post_id


def remove_from_queue(queue, note_id):
    queue["entries"] = [e for e in queue["entries"] if e["note_id"] != note_id]


def record_posted(queue, history, entry, post_id, now):
    remove_from_queue(queue, entry["note_id"])
    history.setdefault("posted", []).append({
        "note_id": entry["note_id"],
        "post_id": post_id,
        "x_time_jst": entry.get("x_time_jst", "manual"),
        "sent_at": now.isoformat(),
    })
    save_json(QUEUE_PATH, queue)
    save_json(HISTORY_PATH, history)


def record_uncertain(history, note_id, now):
    history.setdefault("uncertain", []).append({"note_id": note_id, "at": now.isoformat()})
    save_json(HISTORY_PATH, history)


def main():
    mode = os.environ.get("X_NOTE_MODE", "dry-run")
    queue = load_json(QUEUE_PATH, {"account": EXPECTED_USERNAME, "entries": []})
    history = load_json(HISTORY_PATH, {"posted": []})
    summary = validate_queue(queue, history)
    if mode == "dry-run":
        now = datetime.now(JST)
        print(json.dumps({"ok": True, "mode": "dry-run", **summary,
                          "due_now": [e["note_id"] for e in due_entries(queue, history, now)]},
                         ensure_ascii=False))
        return 0
    if mode == "check":
        print(json.dumps({"ok": True, "username": check_account()}))
        return 0
    if mode == "post-id":
        # Manual, one explicit note article at a time.
        nid = os.environ.get("X_NOTE_ID", "")
        entry = find_postable(queue, nid)
        if entry is None:
            raise RuntimeError(f"note_id not in queue: {nid}")
        posted, uncertain = _history_ids(history)
        if nid in posted or nid in uncertain:
            print(json.dumps({"ok": True, "skipped": "already posted or uncertain", "note_id": nid}))
            return 0
        check_account()
        now = datetime.now(JST)
        try:
            post_id = post_entry(entry)
        except Exception:
            record_uncertain(history, nid, now)
            raise
        record_posted(queue, history, entry, post_id, now)
        print(json.dumps({"ok": True, "posted": [post_id], "note_id": nid}))
        return 0
    if mode == "post-due":
        check_account()
        now = datetime.now(JST)
        due = due_entries(queue, history, now)
        if not due:
            print(json.dumps({"ok": True, "posted": []}))
            return 0
        if len(due) > 1:
            raise RuntimeError("more than one entry due; refusing to post in bulk")
        entry = due[0]
        try:
            post_id = post_entry(entry)
        except Exception:
            record_uncertain(history, entry["note_id"], now)
            raise
        record_posted(queue, history, entry, post_id, now)
        print(json.dumps({"ok": True, "posted": [post_id]}))
        return 0
    raise RuntimeError(f"unknown mode {mode}")


if __name__ == "__main__":
    sys.exit(main())
