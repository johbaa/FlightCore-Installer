#!/bin/bash
set -Eeuo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
HELPER_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE="$HELPER_DIR/recovery-engine.command"
PORT=8765

if [ ! -f "$ENGINE" ]; then
  echo "Recovery engine is missing. Keep both files in the extracted folder."
  read -r -p "Press Return to close."
  exit 1
fi

chmod +x "$ENGINE"
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
PAGE="https://johbaa.github.io/FlightCore-Installer/spark-recovery.html#helper=$TOKEN"

echo "DJI Spark Recovery local helper"
echo "Keep this window open while using the recovery page."
echo "Opening the protected local control page..."
open "$PAGE"

exec python3 - "$ENGINE" "$TOKEN" "$PORT" <<'PY'
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

engine, token, port_text = sys.argv[1:]
port = int(port_text)
lock = threading.Lock()
state = {"running": False, "finished": False, "exitCode": None, "output": ""}

def append(text):
    with lock:
        state["output"] += text
        if len(state["output"]) > 250_000:
            state["output"] = state["output"][-250_000:]

def recover():
    env = os.environ.copy()
    env["DJI_SPARK_WEB_CONFIRMED"] = "1"
    try:
        process = subprocess.Popen(
            [engine], cwd=os.path.dirname(engine), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        for line in iter(process.stdout.readline, ""):
            append(line)
        code = process.wait()
    except Exception as exc:
        append(f"\nFAIL: Could not start recovery: {exc}\n")
        code = 1
    with lock:
        state.update(running=False, finished=True, exitCode=code)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "https://johbaa.github.io")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")

    def authorized(self):
        supplied = parse_qs(urlparse(self.path).query).get("token", [""])[0]
        return supplied == token

    def json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path != "/status" or not self.authorized():
            return self.json(403, {"error": "Not authorized"})
        with lock:
            snapshot = dict(state)
        self.json(200, {"ready": True, **snapshot})

    def do_POST(self):
        if urlparse(self.path).path != "/run" or not self.authorized():
            return self.json(403, {"error": "Not authorized"})
        with lock:
            if state["running"]:
                return self.json(409, {"error": "Recovery is already running"})
            state.update(running=True, finished=False, exitCode=None, output="")
        threading.Thread(target=recover, daemon=True).start()
        self.json(202, {"started": True})

try:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
except OSError as exc:
    print(f"Could not start local helper on 127.0.0.1:{port}: {exc}")
    print("Close any other DJI Spark Recovery helper window and try again.")
    input("Press Return to close.")
    raise SystemExit(1)

print(f"Local helper ready on 127.0.0.1:{port}")
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
PY
