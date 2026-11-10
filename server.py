#!/usr/bin/env python3
"""Local server for the outing website and its editor.

Serves the site like any static server and also lets admin.html save edits
straight into data/*.json (the previous version is kept in data/.backups/).

    python3 server.py          # http://localhost:8000  (editor: /admin.html)
    python3 server.py 8080     # custom port
"""
import json
import os
import shutil
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
FILES = {"site", "event", "hotel", "locations", "employees", "rooms", "cars"}
MAX_BODY = 5 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/status":
            return self.send_json(200, {"canSave": True})
        if self.path.startswith("/data/.backups"):
            return self.send_json(404, {"error": "Not found"})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/save":
            return self.send_json(404, {"error": "Not found"})
        origin = self.headers.get("Origin")
        if origin and origin.split("://", 1)[-1] != self.headers.get("Host"):
            return self.send_json(403, {"error": "Cross-origin save refused"})
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send_json(415, {"error": "Expected JSON"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {"error": "Body missing or too large"})
        try:
            files = json.loads(self.rfile.read(length)).get("files")
        except (ValueError, AttributeError):
            return self.send_json(400, {"error": "Invalid JSON"})
        if not isinstance(files, dict) or not files or not set(files) <= FILES:
            return self.send_json(400, {"error": "Unknown data files"})

        stamp = time.strftime("%Y%m%d-%H%M%S")
        backup_dir = os.path.join(DATA, ".backups", stamp)
        os.makedirs(backup_dir, exist_ok=True)
        for name, content in files.items():
            path = os.path.join(DATA, f"{name}.json")
            if os.path.exists(path):
                shutil.copy2(path, backup_dir)
            tmp = f"{path}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(content, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            os.replace(tmp, path)
        self.log_message("Saved %s (backup %s)", ", ".join(sorted(files)), stamp)
        return self.send_json(200, {"ok": True, "backup": stamp})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Website: http://localhost:{port}/\nEditor:  http://localhost:{port}/admin.html\nPress Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
