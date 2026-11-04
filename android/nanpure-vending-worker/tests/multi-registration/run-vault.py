#!/usr/bin/env python3
"""Test the production Vault migration with real SQLite and synthetic data."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--app", type=Path, default=here.parents[1])
parser.add_argument("--jdk", type=Path, default=os.environ.get("JAVA_HOME"))
parser.add_argument("--gson", type=Path, default=os.environ.get("GSON_JAR"))
parser.add_argument("--out", type=Path)
args = parser.parse_args()
if args.jdk is None or args.gson is None:
    parser.error("provide --jdk and --gson, or JAVA_HOME and GSON_JAR")
app = args.app.resolve()
suffix = ".exe" if os.name == "nt" else ""
javac = args.jdk.resolve() / "bin" / ("javac" + suffix)
java = args.jdk.resolve() / "bin" / ("java" + suffix)
gson = args.gson.resolve()
production = app / "src/main/java/jp/nanpure/refill/RefillVault.java"
shared = app / "tests/bootstrap/src"
adapters = [
    shared / "android/content/Context.java",
    shared / "android/content/SharedPreferences.java",
    shared / "android/content/res/AssetManager.java",
    shared / "org/json/JSONObject.java",
    shared / "org/json/JSONArray.java",
    shared / "org/json/JSONException.java",
]
sources = sorted((here / "src").rglob("*.java")) + adapters + [production]
for required in (javac, java, gson, here / "sqlite_bridge.py", *sources):
    if not required.is_file():
        parser.error(f"required file does not exist: {required}")
before = hashlib.sha256(production.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix="refill-vault-migration-") as temporary:
    temp = Path(temporary)
    classes = temp / "classes"
    classes.mkdir()
    compiled = subprocess.run(
        [str(javac), "-encoding", "UTF-8", "-cp", str(gson),
         "-d", str(classes), *map(str, sources)],
        capture_output=True, text=True, timeout=45)
    if compiled.returncode:
        sys.stderr.write(compiled.stdout + compiled.stderr)
        raise SystemExit(compiled.returncode)
    reports = []
    for stage in ("initial", "resume"):
        result = subprocess.run([
            str(java), "-ea", "-cp", os.pathsep.join([str(classes), str(gson)]),
            "-Drefill.test.python=" + sys.executable,
            "-Drefill.test.sqlite.bridge=" + str(here / "sqlite_bridge.py"),
            "jp.nanpure.refill.VaultMigrationHarness", str(temp / "database"), stage,
        ], capture_output=True, text=True, timeout=45)
        if result.returncode:
            sys.stderr.write(result.stdout + result.stderr)
            raise SystemExit(result.returncode)
        reports.append(json.loads(result.stdout))
if hashlib.sha256(production.read_bytes()).hexdigest() != before:
    raise RuntimeError("production Vault source changed during verification")
report = {
    "ok": all(item["ok"] for item in reports),
    "tests": sum(item["tests"] for item in reports),
    "assertions": sum(item["assertions"] for item in reports),
    "passed": [name for item in reports for name in item["passed"]],
    "scope": reports[0]["scope"],
    "limitations": reports[0]["limitations"],
    "sourceSHA256": {str(production.relative_to(app)): before},
    "sqlite": sqlite3.sqlite_version,
    "ranAt": datetime.now(timezone.utc).isoformat(),
}
encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
if args.out is None:
    print(encoded, end="")
else:
    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(json.dumps({"ok": report["ok"], "tests": report["tests"],
                      "assertions": report["assertions"], "report": str(output)}))
