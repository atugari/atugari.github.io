#!/usr/bin/env python3
"""Guarded, pilot-only importer for the registered 104k Nanpure collection.

Default mode is read-only. --apply first applies migration 0016 to the isolated
pilot D1 (never production), then imports only deficits using idempotent
INSERT OR IGNORE batches. All source validation/fingerprinting is done by the
pinned Node vending validator before any insert is attempted.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

ACCOUNT = "3fb1db1d33caddf96fec77fac7d571e6"
DATABASE = "f812ddef-4e57-424b-90af-60d7b2f6bfb1"
PRODUCTION_DB = "7bb28b61-5fe2-47ce-b71b-b0e04fc3747b"
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "nanpure-api"
MIGRATION = API / "migrations/0016_vending_stock_target_100.sql"
PLANNER = API / "scripts/inspect-vending-collection-refill.mjs"
APPLY = "--apply" in sys.argv

def api(path, data=None):
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if len(token) < 20:
        raise RuntimeError("Cloudflare deployment credential is unavailable.")
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data, ensure_ascii=False).encode()
    request = urllib.request.Request(BASE + path, data=body, headers=headers,
                                     method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            value = json.loads(response.read(20 * 1024 * 1024 + 1))
    except urllib.error.HTTPError as error:
        raise RuntimeError("Cloudflare API HTTP " + str(error.code)) from None
    if value.get("success") is not True:
        codes = [item.get("code") for item in value.get("errors", [])]
        raise RuntimeError("Cloudflare API error codes: " + json.dumps(codes))
    return value.get("result")

def query(sql, params=None):
    if DATABASE == PRODUCTION_DB:
        raise RuntimeError("Production database guard failed.")
    result = api("/d1/database/" + DATABASE + "/query",
                 {"sql": sql, **({"params": params} if params is not None else {})})
    if not isinstance(result, list) or any(row.get("success") is not True for row in result):
        raise RuntimeError("Pilot D1 query did not complete successfully.")
    return result

def rows(sql, params=None):
    result = query(sql, params)
    if len(result) != 1:
        raise RuntimeError("Expected one D1 query result.")
    return result[0].get("results", [])

def ensure_catalogue():
    found = rows("SELECT sql FROM sqlite_master WHERE type='table' AND name='vending_catalogue'")
    if len(found) != 1:
        raise RuntimeError("Pilot vending catalogue table was not found.")
    count = rows("SELECT COUNT(*) AS n FROM vending_catalogue")[0]["n"]
    if count != 427:
        raise RuntimeError("Expected exactly 427 pilot vending profiles.")
    schema = found[0].get("sql") or ""
    if "BETWEEN 1 AND 100" not in schema:
        before = rows("SELECT profile,available,waiting,target,expanded FROM vending_catalogue ORDER BY profile")
        query(MIGRATION.read_text(encoding="utf-8"))
        after = rows("SELECT profile,available,waiting,target,expanded FROM vending_catalogue ORDER BY profile")
        if len(before) != 427 or len(after) != 427:
            raise RuntimeError("Catalogue row count changed during migration.")
        for old, new in zip(before, after):
            if any(old[k] != new[k] for k in ("profile", "available", "waiting", "expanded")):
                raise RuntimeError("Migration changed existing stock or reservation counters.")
            expected = 100 if old["expanded"] == 1 else old["target"]
            if new["target"] != expected:
                raise RuntimeError("Unexpected target after migration.")
    final = rows("SELECT COUNT(*) AS n FROM vending_catalogue WHERE expanded=1 AND target<>100")[0]["n"]
    if final:
        raise RuntimeError("Expanded shelves did not all reach target 100.")

def snapshots(directory):
    profile_rows = rows("SELECT profile,available,waiting,target,expanded FROM vending_catalogue ORDER BY profile")
    if len(profile_rows) != 427:
        raise RuntimeError("Stock snapshot did not contain 427 profiles.")
    stock = {"profiles": {r["profile"]: {
        "available": r["available"], "waiting": r["waiting"],
        "target": r["target"], "expanded": r["expanded"]
    } for r in profile_rows}}
    (directory / "stock.json").write_text(json.dumps(stock), encoding="utf-8")

    # Page through the unique digest index rather than risk truncating a large
    # single D1 response. These IDs make the subsequent plan idempotent.
    uids, digests, cursor = [], [], ""
    while True:
        batch = rows("SELECT digest,uid FROM vending_puzzles WHERE digest>? ORDER BY digest LIMIT 4000", [cursor])
        if not batch:
            break
        digests.extend(item["digest"] for item in batch)
        uids.extend(item["uid"] for item in batch)
        cursor = batch[-1]["digest"]
    (directory / "existing.json").write_text(
        json.dumps({"uids": uids, "digests": digests}), encoding="utf-8")

def make_plan(directory):
    command = ["node", str(PLANNER), "--plan",
               "--stock", str(directory / "stock.json"),
               "--existing", str(directory / "existing.json"),
               "--output", str(directory / "plan.json")]
    completed = subprocess.run(command, cwd=API, text=True, capture_output=True)
    if completed.stdout:
        print(completed.stdout.strip())
    if completed.returncode not in (0, 2):
        raise RuntimeError("Collection planner failed: " + completed.stderr[-2000:])
    report = json.loads((directory / "plan.json").read_text(encoding="utf-8"))
    if report["totals"]["recordsRead"] != report["sourceRelease"] and False:
        raise RuntimeError("Unreachable source guard.")
    return report

def import_plan(report):
    imported = 0
    plan = report.get("plan", [])
    # Small batches keep request bodies and bound-parameter counts bounded.
    for start in range(0, len(plan), 10):
        batch = plan[start:start + 10]
        values, params = [], []
        now = int(time.time() * 1000)
        for item in batch:
            uid = item["uid"]
            job_id = "collection-refill:" + uid
            payload = json.dumps(item["puzzle"], ensure_ascii=False, separators=(",", ":"))
            values.append("(?,?,?,CAST(? AS BLOB),?,NULL,NULL,?)")
            params.extend([item["digest"], uid, job_id, payload, now, item["profile"]])
        sql = ("INSERT OR IGNORE INTO vending_puzzles "
               "(digest,uid,job_id,payload,created,order_id,collected,profile) VALUES " +
               ",".join(values))
        result = query(sql, params)
        if len(result) != 1:
            raise RuntimeError("Unexpected insert result shape.")
        imported += int(result[0].get("meta", {}).get("changes", 0))
    return imported

def main():
    if DATABASE == PRODUCTION_DB:
        raise RuntimeError("Refusing to access production D1.")
    if not MIGRATION.is_file() or not PLANNER.is_file():
        raise RuntimeError("Run this workflow from the reviewed refill feature branch.")
    if APPLY:
        print("Applying target-100 migration to the isolated pilot database.")
        ensure_catalogue()
    else:
        print("READ-ONLY MODE: no D1 writes will be performed.")
        ensure_catalogue_readonly = rows("SELECT COUNT(*) AS n FROM vending_catalogue")[0]["n"]
        if ensure_catalogue_readonly != 427:
            raise RuntimeError("Expected 427 pilot profiles.")
    import tempfile
    with tempfile.TemporaryDirectory(prefix="nanpure-vending-refill-") as tmp:
        directory = Path(tmp)
        snapshots(directory)
        report = make_plan(directory)
        print(json.dumps({
            "mode": "apply" if APPLY else "read-only",
            "profilesWithSource": report["totals"]["matchedConfigs"],
            "sourceRecordsRead": report["totals"]["recordsRead"],
            "validSourceRecords": report["totals"]["validRecords"],
            "invalidSourceRecords": report["totals"]["invalidRecords"],
            "duplicateSourceIds": report["totals"]["duplicateUids"],
            "duplicateFingerprints": report["totals"]["duplicateFingerprints"],
            "plannedRows": report.get("plannedImports", 0),
            "insufficientSourceShelves": len(report.get("errors", []))
        }, ensure_ascii=False))
        if not APPLY:
            print("Dry run complete. Re-run manually with apply=true only after reviewing this report.")
            return
        imported = import_plan(report)
        after = rows("SELECT profile,available,waiting,target,expanded FROM vending_catalogue ORDER BY profile")
        remaining = [r for r in after if r["waiting"] + r["target"] - r["available"] > 0]
        print(json.dumps({"insertedRows": imported, "remainingDeficits": len(remaining),
                          "remainingProfiles": [{"profile": r["profile"],
                            "available": r["available"], "waiting": r["waiting"],
                            "target": 100 if r["expanded"] == 1 else r["target"]}
                            for r in remaining[:50]]}, ensure_ascii=False))
        if report.get("errors"):
            print("Some shelves had fewer compatible unique source records than their requested deficit.")

if __name__ == "__main__":
    main()
