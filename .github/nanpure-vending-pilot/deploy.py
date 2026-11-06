"""Guarded one-release update of the existing, isolated Nanpure pilot.

Credentials and the existing private Worker code stay inside the Actions runner.
Only the vending function is redirected; assets, outer routing and bindings are
retained. This script cannot target the production Worker or production D1.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import urllib.error
import urllib.request
from email import policy
from email.parser import BytesParser

ACCOUNT = "3fb1db1d33caddf96fec77fac7d571e6"
WORKER = "nanpure-vending-pilot"
DATABASE = "f812ddef-4e57-424b-90af-60d7b2f6bfb1"
PRODUCTION_DB = "7bb28b61-5fe2-47ce-b71b-b0e04fc3747b"
# Read-only inspection confirmed this rollback contains the exact original code.
EXPECTED_VERSION = "8e81153e-0374-4e62-ace9-35ac7e55c6d5"
EXPECTED_BUNDLE = "369a2c961c4c6f9e80736ee8c8594d11b63ff01c5a8e4abc97662444a275de12"
MIGRATION_HASH = "2ffd8c57ee032a441ea2197dbda832ad90c24b22ac7565cc8ff4db303ae463bd"
BASE = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT
SCRIPT = "/workers/scripts/" + WORKER
ROOT = Path(__file__).resolve().parents[2]
EXPECTED_BINDINGS = {
    "ASSETS": "assets", "DB": "d1", "NOTEBOOK_PATH": "plain_text",
    "OWNER_KEY_HASH": "plain_text", "VENDING_CATALOGUE_ENABLED": "plain_text",
    "VENDING_ENABLED": "plain_text", "VENDING_PUBLIC_PLAY": "plain_text",
}
PRESERVED_SETTINGS = ("bindings", "compatibility_date", "compatibility_flags", "usage_model",
                      "placement", "logpush", "tags", "tail_consumers", "limits", "observability")
NEW_OBJECTS = {"vending_enrollments", "sqlite_autoindex_vending_enrollments_1",
               "sqlite_autoindex_vending_enrollments_2", "vending_enrollment_members",
               "sqlite_autoindex_vending_enrollment_members_1", "vending_enrollment_members_grant"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def api_raw(path, token, method="GET", data=None, content_type=None):
    if not path.startswith((SCRIPT, "/d1/database/" + DATABASE + "/")):
        raise RuntimeError("Request is outside the approved pilot resources")
    headers = {"Authorization": "Bearer " + token, "Accept": "*/*"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read(20 * 1024 * 1024 + 1)
            if len(raw) > 20 * 1024 * 1024:
                raise RuntimeError("Pilot response exceeds the size limit")
            return raw, response.headers
    except urllib.error.HTTPError as error:
        # Cloudflare errors can echo submitted configuration. Log numeric codes only.
        codes = []
        try:
            codes = [x.get("code") for x in json.loads(error.read()).get("errors", [])]
        except (ValueError, AttributeError):
            pass
        raise RuntimeError("Pilot API HTTP " + str(error.code) + "; codes=" + json.dumps(codes)) from None


def api(path, token, method="GET", data=None):
    raw, _ = api_raw(path, token, method,
                     None if data is None else json.dumps(data).encode(),
                     None if data is None else "application/json")
    result = json.loads(raw)
    if result.get("success") is not True:
        raise RuntimeError("Pilot API failed; codes=" + json.dumps([x.get("code") for x in result.get("errors", [])]))
    return result["result"]


def query(token, sql):
    result = api("/d1/database/" + DATABASE + "/query", token, "POST", {"sql": sql})
    if not result or any(row.get("success") is not True for row in result):
        raise RuntimeError("Isolated database query did not complete")
    return result


def current_version(token):
    result = api(SCRIPT + "/deployments", token)
    deployments = result["deployments"] if isinstance(result, dict) else result
    versions = deployments[0].get("versions", [])
    if len(versions) != 1 or versions[0].get("percentage") != 100:
        raise RuntimeError("Pilot deployment is not a single fully active version")
    return versions[0]["version_id"]


def current_modules(token):
    raw, headers = api_raw(SCRIPT + "/content/v2", token)
    content_type = headers.get("Content-Type", "")
    if not content_type.lower().startswith("multipart/"):
        raise RuntimeError("Expected the inspected module-format pilot")
    envelope = ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + raw
    message = BytesParser(policy=policy.default).parsebytes(envelope)
    modules = {}
    for part in message.iter_parts():
        name = part.get_filename() or part.get_param("name", header="content-disposition")
        if not name or name in modules:
            raise RuntimeError("Unexpected pilot module names")
        modules[name] = (part.get_payload(decode=True) or b"", part.get_content_type())
    return modules


def assert_settings(settings):
    bindings = settings.get("bindings", [])
    if len(bindings) != len(EXPECTED_BINDINGS) or {b.get("name"): b.get("type") for b in bindings} != EXPECTED_BINDINGS:
        raise RuntimeError("Pilot bindings changed since inspection")
    db = next(b for b in bindings if b["name"] == "DB")
    if db.get("id") != DATABASE or DATABASE == PRODUCTION_DB:
        raise RuntimeError("The isolated pilot database was not confirmed")
    if settings.get("compatibility_date") != "2026-05-15" or settings.get("compatibility_flags", []) != []:
        raise RuntimeError("Pilot compatibility settings changed since inspection")


def schema(token):
    return query(token, "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' ORDER BY type,name")[0]["results"]


def normalize_schema(rows):
    return {r["name"]: (r["type"], r["tbl_name"], re.sub(r"\s+", " ", r["sql"] or "").strip()) for r in rows}


def apply_additive_migration(token):
    migration = ROOT / "nanpure-api/migrations/0015_vending_enrollment.sql"
    source = migration.read_bytes()
    if digest(source) != MIGRATION_HASH:
        raise RuntimeError("The reviewed additive migration changed")
    memory = sqlite3.connect(":memory:")
    memory.row_factory = sqlite3.Row
    memory.execute("CREATE TABLE vending_devices(id TEXT PRIMARY KEY)")
    memory.executescript(source.decode())
    expected = normalize_schema([dict(r) for r in memory.execute("SELECT type,name,tbl_name,sql FROM sqlite_master") if r["name"] in NEW_OBJECTS])
    memory.close()
    before = normalize_schema(schema(token))
    existing_new = {k: v for k, v in before.items() if k in NEW_OBJECTS}
    if existing_new and existing_new != expected:
        raise RuntimeError("Existing enrollment schema does not match the reviewed migration")
    devices_before = query(token, "SELECT id,token_hash,name,created,revoked FROM vending_devices ORDER BY id")[0]["results"]
    catalogue_before = query(token, "SELECT COUNT(*) AS n FROM vending_catalogue")[0]["results"][0]["n"]
    if catalogue_before != 427:
        raise RuntimeError("The expected 427-condition pilot catalogue was not found")
    ledger_present = "d1_migrations" in before
    mark = "INSERT INTO d1_migrations(name) SELECT '0015_vending_enrollment.sql' WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name='0015_vending_enrollment.sql');" if ledger_present else ""
    changes = ("" if existing_new else source.decode()) + "\n" + mark
    if changes.strip():
        query(token, changes)
    after = normalize_schema(schema(token))
    if {k: v for k, v in after.items() if k in NEW_OBJECTS} != expected:
        raise RuntimeError("Enrollment schema verification failed")
    if {k: v for k, v in before.items() if k not in NEW_OBJECTS} != {k: v for k, v in after.items() if k not in NEW_OBJECTS}:
        raise RuntimeError("Existing database schema changed unexpectedly")
    devices_after = query(token, "SELECT id,token_hash,name,created,revoked FROM vending_devices ORDER BY id")[0]["results"]
    if devices_before != devices_after:
        raise RuntimeError("Existing device records changed during the migration; inspect before deploying")
    print(json.dumps({"migration": "0015_vending_enrollment.sql", "isolated_database": True,
                      "existing_devices_preserved": len(devices_before), "catalogue_conditions": catalogue_before,
                      "existing_schema_preserved": True, "existing_migration_ledger_updated": ledger_present}))


def upload_metadata(settings):
    metadata = {
        "main_module": "worker.js", "keep_assets": True,
        "bindings": [{"name": b["name"], "type": "inherit"} for b in settings["bindings"]],
        "compatibility_date": settings["compatibility_date"],
        "compatibility_flags": settings.get("compatibility_flags", []),
    }
    for key in ("usage_model", "logpush", "placement", "tags", "tail_consumers", "limits", "observability"):
        if key in settings and settings[key] is not None:
            metadata[key] = settings[key]
    metadata["annotations"] = {"workers/message": "Nanpure 0.3.1 individual phone enrollment; source " + os.environ.get("GITHUB_SHA", "local"),
                               "workers/tag": "nanpure-fleet-0.3.1"}
    return metadata


def upload(token, metadata, modules):
    boundary = "nanpure-pilot-" + os.urandom(16).hex()
    pieces = []
    for name, raw, content_type in [("metadata", json.dumps(metadata).encode(), "application/json")] + [(n, v[0], v[1]) for n, v in modules.items()]:
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+", name):
            raise RuntimeError("Unexpected upload part name")
        pieces.extend([(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\nContent-Type: {content_type}\r\n\r\n').encode(), raw, b"\r\n"])
    pieces.append(("--" + boundary + "--\r\n").encode())
    raw, _ = api_raw(SCRIPT + "?bindings_inherit=strict", token, "PUT", b"".join(pieces), "multipart/form-data; boundary=" + boundary)
    response = json.loads(raw)
    if response.get("success") is not True:
        raise RuntimeError("Pilot upload failed; codes=" + json.dumps([e.get("code") for e in response.get("errors", [])]))
    return response.get("result", {})


def module_hashes(modules):
    return {name: digest(value[0]) for name, value in modules.items()}


def restore_our_upload(token, settings, metadata, originals, expected_modules):
    """Restore only an unchanged upload that can be positively identified as ours."""
    before_version = current_version(token)
    live = current_modules(token)
    live_settings = api(SCRIPT + "/settings", token)
    after_version = current_version(token)
    if module_hashes(live) == module_hashes(originals):
        print(json.dumps({"previous_code_still_active": True, "recovery_upload_performed": False}))
        return
    if before_version != after_version or module_hashes(live) != module_hashes(expected_modules):
        raise RuntimeError("Pilot state changed or is unconfirmed; no recovery upload was attempted")
    if any(settings.get(key) != live_settings.get(key) for key in PRESERVED_SETTINGS):
        raise RuntimeError("Pilot configuration changed; no recovery upload was attempted")
    annotations = live_settings.get("annotations", {})
    if not isinstance(annotations, dict) or annotations.get("workers/message") != metadata["annotations"]["workers/message"]:
        raise RuntimeError("Current upload ownership is unconfirmed; no recovery upload was attempted")
    rollback_metadata = upload_metadata(settings)
    rollback_metadata["annotations"] = {"workers/message": "Restore previous pilot code after failed enrollment release verification"}
    upload(token, rollback_metadata, originals)
    restored = current_modules(token)
    if module_hashes(restored) != module_hashes(originals):
        raise RuntimeError("Pilot rollback requires inspection")
    print(json.dumps({"previous_code_restored": True, "additive_schema_retained": True}))


def main():
    if os.environ.get("GITHUB_REPOSITORY") != "atugari/atugari.github.io" or os.environ.get("GITHUB_REF") != "refs/heads/nanpure-vending-pilot":
        raise RuntimeError("This deploy is restricted to the isolated pilot branch")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if len(token) < 20:
        raise RuntimeError("The existing deployment credential is unavailable")
    settings = api(SCRIPT + "/settings", token)
    assert_settings(settings)
    if current_version(token) != EXPECTED_VERSION:
        raise RuntimeError("Pilot version changed; no deployment performed")
    originals = current_modules(token)
    if set(originals) != {"worker.js"} or digest(originals["worker.js"][0]) != EXPECTED_BUNDLE:
        raise RuntimeError("Pilot source differs from the inspected version")
    with tempfile.TemporaryDirectory(prefix="nanpure-pilot-") as temporary:
        directory = Path(temporary)
        os.chmod(directory, 0o700)
        original_path = directory / "original-worker.mjs"
        original_path.write_bytes(originals["worker.js"][0])
        subprocess.run(["node", str(ROOT / ".github/nanpure-vending-pilot/patch-worker.mjs"), str(original_path), str(directory / "patched")], check=True, cwd=ROOT)
        modules = {name: ((directory / "patched" / name).read_bytes(), "application/javascript+module") for name in ("worker.js", "fleet-vending.mjs")}
        subprocess.run(["node", "--check", str(directory / "patched/worker.js")], check=True, cwd=ROOT)
        # The hosted runner receives non-JSON 403s from the public endpoint, as
        # recorded by inspect.py. Verify the real modules offline here; perform
        # authenticated live enrollment from the authorized client after deploy.
        subprocess.run(["node", str(ROOT / ".github/nanpure-vending-pilot/rehearse-live.mjs"),
                        str(original_path), str(directory / "patched/worker.js")], check=True, cwd=ROOT,
                       env={"PATH": os.environ.get("PATH", ""), "NODE_NO_WARNINGS": "1"})
        if current_version(token) != EXPECTED_VERSION:
            raise RuntimeError("Pilot version changed before migration")
        apply_additive_migration(token)
        latest_settings = api(SCRIPT + "/settings", token)
        if settings != latest_settings or current_version(token) != EXPECTED_VERSION:
            raise RuntimeError("Pilot configuration changed before upload")
        metadata = upload_metadata(settings)
        print(json.dumps({"ready_to_deploy": True, "worker": WORKER, "preserve_assets": True,
                          "preserve_bindings": True, "only_vending_function_redirected": True}))
        phase = "upload"
        try:
            uploaded = upload(token, metadata, modules)
            phase = "active version"
            deployed = current_version(token)
            if deployed == EXPECTED_VERSION:
                raise RuntimeError("A new pilot version was not activated")
            phase = "uploaded module identity"
            live = current_modules(token)
            if module_hashes(live) != module_hashes(modules) or current_version(token) != deployed:
                raise RuntimeError("Deployed pilot module verification failed")
            # Some Cloudflare API variants include a version identifier; a script
            # name in result.id is never treated as a deployment/version ID.
            returned_version = uploaded.get("version_id")
            if returned_version and returned_version != deployed:
                raise RuntimeError("Upload response and active version differ")
            phase = "preserved configuration"
            after_settings = api(SCRIPT + "/settings", token)
            assert_settings(after_settings)
            for key in PRESERVED_SETTINGS:
                if settings.get(key) != after_settings.get(key):
                    raise RuntimeError("Existing pilot setting was not preserved: " + key)
        except Exception as error:
            restore_our_upload(token, settings, metadata, originals, modules)
            raise RuntimeError("Verification failed at " + phase + ": " + str(error)) from None
        print(json.dumps({"deployed": True, "worker": WORKER, "version_id": deployed,
                          "previous_version_id": EXPECTED_VERSION, "existing_outer_worker_bytes_preserved": True,
                          "assets_and_bindings_preserved": True, "actual_modules_rehearsed_offline": True,
                          "authenticated_live_enrollment_verification": "required from authorized client",
                          "module_hashes": {n: digest(v[0]) for n, v in modules.items()}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not dump request objects, bodies, source code or environment values.
        print("Pilot deployment stopped: " + str(error))
        raise SystemExit(1)
