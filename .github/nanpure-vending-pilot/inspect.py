"""Read-only metadata inspection for the existing isolated vending Worker."""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from email import policy
from email.parser import BytesParser

ACCOUNT = "3fb1db1d33caddf96fec77fac7d571e6"
WORKER = "nanpure-vending-pilot"
PRODUCTION_DB = "7bb28b61-5fe2-47ce-b71b-b0e04fc3747b"
BASE = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT
SCRIPT = "/workers/scripts/" + WORKER

def read_resource(path, token, accept="application/json"):
    request = urllib.request.Request(
        BASE + path, method="GET",
        headers={"Authorization": "Bearer " + token, "Accept": accept},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read(20 * 1024 * 1024 + 1)
            if len(body) > 20 * 1024 * 1024:
                raise RuntimeError("Worker inspection response exceeds the size limit")
            return body, response.headers
    except urllib.error.HTTPError as error:
        raise RuntimeError("Read-only Cloudflare request failed: HTTP " + str(error.code)) from None

def read_json(path, token):
    body, _ = read_resource(path, token)
    value = json.loads(body)
    if value.get("success") is not True:
        codes = [item.get("code") for item in value.get("errors", [])]
        raise RuntimeError("Cloudflare metadata request failed; error codes=" + json.dumps(codes))
    return value.get("result")

def inspect_public_protocol():
    # Invalid, synthetic credentials cannot register a device or claim work.
    public = "https://nanpure-vending-pilot.puzzle-hub-4826.workers.dev"
    payload = json.dumps({"action": "enroll", "enrollmentKey": "0" * 64,
                          "token": "1" * 64, "name": "verification"}).encode()
    results = []
    for with_origin in (False, True):
        headers = {"Content-Type": "application/json", "Cache-Control": "no-cache"}
        if with_origin:
            headers["Origin"] = public
        request = urllib.request.Request(public + "/api/vending/worker", method="POST", data=payload, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(1024 * 1024)
            try:
                value = json.loads(raw)
                is_json = isinstance(value, dict)
            except (ValueError, UnicodeDecodeError):
                is_json = False
            results.append({"origin_header": with_origin, "status": response.status,
                            "body_bytes": len(raw), "json_object": is_json,
                            "content_type": response.headers.get("Content-Type")})
    return results

def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if len(token) < 20:
        raise RuntimeError("The existing deployment credential is unavailable")
    settings = read_json(SCRIPT + "/settings", token)
    deployments = read_json(SCRIPT + "/deployments", token)
    versions = read_json(SCRIPT + "/versions", token)
    bindings = settings.get("bindings", [])
    safe_bindings = []
    for binding in bindings:
        row = {"name": binding.get("name"), "type": binding.get("type")}
        if binding.get("type") == "d1":
            row["database_id"] = binding.get("id")
        safe_bindings.append(row)
    db = [b for b in bindings if b.get("type") == "d1" and b.get("name") == "DB"]
    isolated = len(db) == 1 and bool(db[0].get("id")) and db[0]["id"] != PRODUCTION_DB

    body, headers = read_resource(SCRIPT + "/content/v2", token, "*/*")
    content_type = headers.get("Content-Type", "")
    modules = []
    if content_type.lower().startswith("multipart/"):
        envelope = ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + body
        message = BytesParser(policy=policy.default).parsebytes(envelope)
        for part in message.iter_parts():
            data = part.get_payload(decode=True) or b""
            modules.append({
                "name": part.get_filename() or part.get_param("name", header="content-disposition"),
                "content_type": part.get_content_type(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            })
    else:
        modules.append({
            "name": headers.get("CF-Entrypoint"),
            "content_type": content_type,
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "es_module_export_present": bool(re.search(rb"\bexport\s", body)),
        })
    deployment_items = deployments.get("deployments", []) if isinstance(deployments, dict) else deployments
    version_items = versions.get("items", []) if isinstance(versions, dict) else versions
    report = {
        "worker": WORKER, "read_only": True, "isolated_database": isolated,
        "compatibility_date": settings.get("compatibility_date"),
        "compatibility_flags": settings.get("compatibility_flags", []),
        "usage_model": settings.get("usage_model"),
        "settings_keys": sorted(settings),
        "bindings": safe_bindings,
        "assets_present": bool(settings.get("assets")),
        "deployments": [
            {"id": d.get("id"), "source": d.get("source"), "versions": d.get("versions")}
            for d in (deployment_items or [])[:3]
        ],
        "versions": [
            {"id": v.get("id"), "number": v.get("number"), "metadata": {
                k: v.get("metadata", {}).get(k) for k in ["created_on", "source"]
            }} for v in (version_items or [])[:3]
        ],
        "modules": modules,
        "public_protocol_probes": inspect_public_protocol(),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not isolated:
        raise RuntimeError("The expected isolated DB binding was not confirmed; no changes performed")

if __name__ == "__main__":
    main()
