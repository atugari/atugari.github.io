#!/usr/bin/env python3
"""X video poster for Parade's YouTube videos and shorts.

Separate from the puzzle poster (scripts/x-four + nanpure-x-worker):
- Uses the SAME GitHub Secrets (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN,
  X_ACCESS_TOKEN_SECRET). Keys are never regenerated or printed.
- Posts only at 19:30 JST, never in the puzzle slots 08:00/12:00/18:00/21:00.
- Duplicate guard: a youtube_id recorded in history.json is never posted again,
  and two queue entries may not share a youtube_id or an x_time.
- The video file is fetched from the public YouTube page at post time
  (after the 19:00 YouTube publication) and uploaded with the chunked
  media upload, then a single tweet is created. No automatic retry:
  an uncertain result is recorded as 'uncertain' and stops the run.
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
PUZZLE_SLOTS = {"08:00", "12:00", "18:00", "21:00"}
VIDEO_SLOT = "19:30"
EXPECTED_USERNAME = os.environ.get("X_EXPECTED_USERNAME", "parade166")
API = "https://api.x.com"
HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE_PATH = os.path.join(HERE, "queue.json")
HISTORY_PATH = os.path.join(HERE, "history.json")
MAX_POST_CHARS = 280


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def validate_queue(queue, history):
    """Pure checks. Raises ValueError on any problem. Used by tests and dry-run."""
    seen_ids, seen_times = set(), set()
    posted = {h["youtube_id"] for h in history.get("posted", [])}
    for e in queue["entries"]:
        yid = e["youtube_id"]
        if yid in seen_ids:
            raise ValueError(f"duplicate youtube_id in queue: {yid}")
        seen_ids.add(yid)
        xt = datetime.fromisoformat(e["x_time_jst"])
        if xt.tzinfo is None:
            raise ValueError("x_time_jst must carry a timezone")
        slot = xt.astimezone(JST).strftime("%H:%M")
        if slot in PUZZLE_SLOTS:
            raise ValueError(f"{yid}: {slot} collides with a puzzle slot")
        if slot != VIDEO_SLOT:
            raise ValueError(f"{yid}: slot {slot} is not the video slot {VIDEO_SLOT}")
        key = xt.isoformat()
        if key in seen_times:
            raise ValueError(f"two entries share x_time {key}")
        seen_times.add(key)
        pub = datetime.fromisoformat(e["youtube_publish_jst"])
        if xt <= pub:
            raise ValueError(f"{yid}: X time must be after the YouTube publication")
        if len(e["text"]) > 25000:
            raise ValueError(f"{yid}: text too long")
        if yid not in e["text"]:
            raise ValueError(f"{yid}: text must contain its YouTube link")
    for e in queue.get("backlog", []):
        yid = e["youtube_id"]
        if yid in seen_ids:
            raise ValueError(f"backlog youtube_id also appears elsewhere: {yid}")
        seen_ids.add(yid)
        if yid not in e["text"]:
            raise ValueError(f"{yid}: backlog text must contain its YouTube link")
    return {"entries": len(queue["entries"]), "backlog": len(queue.get("backlog", [])),
            "already_posted": sorted(posted & seen_ids)}


def find_postable(queue, youtube_id):
    for e in list(queue["entries"]) + list(queue.get("backlog", [])):
        if e["youtube_id"] == youtube_id:
            return e
    return None


def due_entries(queue, history, now):
    posted = {h["youtube_id"] for h in history.get("posted", [])}
    out = []
    for e in queue["entries"]:
        xt = datetime.fromisoformat(e["x_time_jst"])
        if e["youtube_id"] in posted:
            continue
        if xt <= now < xt + timedelta(minutes=30):
            out.append(e)
    return out


# --- OAuth 1.0a signing (same scheme as nanpure-x-worker/src/index.js) ---

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


def download_video(entry, dest_dir):
    youtube_id = entry["youtube_id"]
    out = os.path.join(dest_dir, f"{youtube_id}.mp4")
    media_url = entry.get("media_url")
    if media_url:
        # Preferred source: the exact file, hosted as a release asset.
        # (YouTube blocks downloads from GitHub Actions addresses, so the
        # scheduled runs cannot rely on fetching from YouTube directly.)
        urllib.request.urlretrieve(media_url, out)
    else:
        # Fallback: fetch the public YouTube version. Output is left
        # visible in the log so a failure shows its reason.
        subprocess.run(
            ["yt-dlp", "-f", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4",
             "-o", out, f"https://www.youtube.com/watch?v={youtube_id}"],
            check=True, timeout=1500)
    if not os.path.exists(out) or os.path.getsize(out) == 0:
        raise RuntimeError("download produced no file")
    return out


def _media_id_of(resp):
    for container in (resp, resp.get("data") or {}):
        for key in ("media_id_string", "media_id", "id"):
            if container.get(key):
                return str(container[key])
    raise RuntimeError(f"no media id in response: {str(resp)[:200]}")


def _processing_info_of(resp):
    for container in (resp, resp.get("data") or {}):
        if container.get("processing_info"):
            return container["processing_info"]
    return {}


def upload_video(path):
    """Chunked upload via /2/media/upload (INIT/APPEND/FINALIZE)."""
    total = os.path.getsize(path)
    init = api_form("INIT", {"command": "INIT", "total_bytes": str(total),
                             "media_type": "video/mp4", "media_category": "tweet_video"})
    media_id = _media_id_of(init)
    with open(path, "rb") as f:
        seg = 0
        while True:
            chunk = f.read(5 * 1024 * 1024)
            if not chunk:
                break
            api_form("APPEND", {"command": "APPEND", "media_id": media_id, "segment_index": str(seg)}, chunk)
            seg += 1
    fin = api_form("FINALIZE", {"command": "FINALIZE", "media_id": media_id})
    info = _processing_info_of(fin)
    for _ in range(60):
        if info.get("state") in (None, "succeeded"):
            return media_id
        if info.get("state") == "failed":
            raise RuntimeError("video processing failed")
        time.sleep(max(1, int(info.get("check_after_secs", 5))))
        st = api_get_status(media_id)
        info = _processing_info_of(st)
    raise RuntimeError("video processing did not finish")


def api_form(command, fields, chunk=None):
    # The v2 media endpoint takes every command as multipart/form-data.
    # (Sending INIT as form-urlencoded is rejected: the API reports each
    # field as an invalid query parameter.) With multipart bodies, OAuth
    # signs only the oauth_* parameters, never the body fields.
    url = API + "/2/media/upload"
    boundary = "----xvideo" + uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    if chunk is not None:
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"media\"; filename=\"chunk\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode()
        body += chunk
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": oauth_header("POST", url),
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise RuntimeError(f"X API {e.code} media {command}: {detail}") from None


def api_get_status(media_id):
    url = API + f"/2/media/upload?command=STATUS&media_id={media_id}"
    req = urllib.request.Request(url, method="GET", headers={"Authorization": oauth_header("GET", url)})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def post_entry(entry, workdir):
    path = download_video(entry, workdir)
    media_id = upload_video(path)
    result = api_json("POST", "/2/tweets", {"text": entry["text"], "media": {"media_ids": [media_id]}})
    post_id = str((result.get("data") or {}).get("id", ""))
    if not post_id.isdigit():
        raise RuntimeError("uncertain post result")
    return post_id


def save_history(history):
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2, sort_keys=True)


def main():
    mode = os.environ.get("X_VIDEO_MODE", "dry-run")
    queue = load_json(QUEUE_PATH, {"entries": []})
    history = load_json(HISTORY_PATH, {"posted": []})
    summary = validate_queue(queue, history)
    if mode == "dry-run":
        now = datetime.now(JST)
        print(json.dumps({"ok": True, "mode": "dry-run", **summary,
                          "due_now": [e["youtube_id"] for e in due_entries(queue, history, now)]},
                         ensure_ascii=False))
        return 0
    if mode == "check":
        print(json.dumps({"ok": True, "username": check_account()}))
        return 0
    if mode == "post-id":
        # Manual, one explicit video at a time (used for already-published videos).
        yid = os.environ.get("X_VIDEO_YOUTUBE_ID", "")
        entry = find_postable(queue, yid)
        if entry is None:
            raise RuntimeError(f"youtube_id not in queue or backlog: {yid}")
        if any(h["youtube_id"] == yid for h in history.get("posted", [])):
            print(json.dumps({"ok": True, "skipped": "already posted", "youtube_id": yid}))
            return 0
        check_account()
        now = datetime.now(JST)
        try:
            post_id = post_entry(entry, os.environ.get("X_VIDEO_WORKDIR", "/tmp"))
        except Exception:
            history.setdefault("uncertain", []).append({"youtube_id": yid, "at": now.isoformat()})
            save_history(history)
            raise
        history["posted"].append({"youtube_id": yid, "post_id": post_id,
                                  "x_time_jst": entry.get("x_time_jst", "manual"),
                                  "sent_at": now.isoformat()})
        save_history(history)
        print(json.dumps({"ok": True, "posted": [post_id], "youtube_id": yid}))
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
            post_id = post_entry(entry, os.environ.get("X_VIDEO_WORKDIR", "/tmp"))
        except Exception:
            history.setdefault("uncertain", []).append(
                {"youtube_id": entry["youtube_id"], "at": now.isoformat()})
            save_history(history)
            raise
        history["posted"].append({"youtube_id": entry["youtube_id"], "post_id": post_id,
                                  "x_time_jst": entry["x_time_jst"], "sent_at": now.isoformat()})
        save_history(history)
        print(json.dumps({"ok": True, "posted": [post_id]}))
        return 0
    raise RuntimeError(f"unknown mode {mode}")


if __name__ == "__main__":
    sys.exit(main())
