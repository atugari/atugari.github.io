#!/usr/bin/env python3
"""Private stdin/stdout SQLite transport for the Java test adapters.

Only synthetic test databases and data are accepted by the harness. This helper
does not access network APIs, Android devices, credentials, or application data.
"""
import base64
import json
import pathlib
import sqlite3
import sys


database = pathlib.Path(sys.argv[1])
database.parent.mkdir(parents=True, exist_ok=True)
connection = sqlite3.connect(database, isolation_level=None)
fault = None


def decode(value):
    if isinstance(value, dict) and set(value) == {"__bytes__"}:
        return base64.b64decode(value["__bytes__"], validate=True)
    return value


def encode(value):
    if isinstance(value, bytes):
        return {"__bytes__": base64.b64encode(value).decode("ascii")}
    return value


for line in sys.stdin:
    try:
        request = json.loads(line)
        operation = request["operation"]
        if operation == "close":
            connection.close()
            print(json.dumps({"ok": True}), flush=True)
            break
        if operation == "fault":
            fault = (request["sql_prefix"], request["message"])
            response = {"ok": True}
        elif operation == "sql":
            sql = request["sql"]
            if fault is not None and sql.startswith(fault[0]):
                _, message = fault
                fault = None
                raise sqlite3.OperationalError(message)
            cursor = connection.execute(sql, tuple(decode(item) for item in request.get("arguments", [])))
            rows = [[encode(item) for item in row] for row in cursor.fetchall()] if cursor.description else []
            response = {
                "ok": True,
                "rows": rows,
                "changed": max(0, cursor.rowcount),
                "insert_id": cursor.lastrowid,
            }
        else:
            raise ValueError("Unknown test transport operation")
    except (ValueError, KeyError, sqlite3.Error) as error:
        response = {"ok": False, "error": str(error), "error_type": type(error).__name__}
    print(json.dumps(response, ensure_ascii=True), flush=True)
