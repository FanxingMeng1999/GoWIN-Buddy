#!/usr/bin/env python3
"""GoWIN personal dashboard host.

Standalone local dashboard delivery:
- serves the full replicated dashboard HTML + static assets
- exposes /api/state and /health
- persists runtime URL for desktop pet fallback open
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import os
import tempfile
import time
import json
import mimetypes
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


FALLBACK_STATE: dict[str, Any] = {
    "tasks": [],
    "workRecords": {},
    "reflectionRecords": {},
    "gameState": {
        "questClaims": {"date": "", "claimed": {}},
        "questProgress": {"date": "", "progress": {}},
        "dailyCounters": {"date": "", "microResets": 0},
    },
}

FALLBACK_THEME: dict[str, Any] = {
    "id": "clawd",
    "name": "Sprout Buddy",
    "variant": "grid",
    "pageStart": "#FFF7E8",
    "pageEnd": "#FFFAF0",
    "pageGlow": "rgba(255, 211, 130, 0.22)",
    "surfaceBg": "rgba(255,255,255,0.78)",
    "surfaceStrongBg": "rgba(255,255,255,0.96)",
    "surfaceMutedBg": "rgba(255,249,240,0.95)",
    "surfaceBorder": "rgba(255, 196, 102, 0.28)",
    "surfaceShadow": "0 14px 30px rgba(255, 194, 99, 0.12)",
    "textMain": "#24324a",
    "textMuted": "#6b7280",
    "accentStrong": "#FF8C42",
    "accentAlt": "#FF6B8B",
    "accentMint": "#43AA8B",
    "accentSky": "#4D9DE0",
    "accentPurple": "#9B5DE5",
    "accentYellow": "#F9C74F",
    "accentCoral": "#F48C6E",
    "accentLime": "#A7C957",
    "chipBg": "rgba(255, 247, 231, 0.92)",
    "chipText": "#FF8C42",
    "idleButtonFrom": "#43AA8B",
    "idleButtonTo": "#22C55E",
    "activeButtonFrom": "#FF6B8B",
    "activeButtonTo": "#F43F5E",
    "scrollbarTrack": "#FFE8D6",
    "scrollbarThumb": "#FF8C42",
    "modalBorder": "#FF8C42",
    "ornament": "rgba(255, 255, 255, 0.56)",
}


def deep_merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        merged: dict[str, Any] = {}
        for key in set(base.keys()) | set(override.keys()):
            if key in base and key in override:
                merged[key] = deep_merge(base[key], override[key])
            elif key in override:
                merged[key] = override[key]
            else:
                merged[key] = base[key]
        return merged
    return override


class StateConflict(Exception):
    """A different client saved after the caller read the state."""


def atomic_write_json(target: Path, payload: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent,
                                         prefix=target.name + ".", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class DashboardContext:
    def __init__(
        self,
        workspace_root: Path,
        state_path: Path | None = None,
        runtime_path: Path | None = None,
        theme_path: Path | None = None,
    ) -> None:
        self.workspace_root = workspace_root
        self.web_root = workspace_root / "apps" / "rpg-hub" / "web"
        self.dashboard_html = self.web_root / "dashboard.html"
        self.state_template_path = self.web_root / "doctor_dashboard_state_template.v1.json"
        resolved_state = state_path or (workspace_root / "data" / "state" / "game_state.json")
        resolved_runtime = runtime_path or (workspace_root / "runtime" / "rpg_hub" / "runtime.json")
        resolved_theme = theme_path or (workspace_root / "runtime" / "rpg_hub" / "theme.json")
        self.state_path = resolved_state if resolved_state.is_absolute() else (workspace_root / resolved_state).resolve()
        self.runtime_path = resolved_runtime if resolved_runtime.is_absolute() else (workspace_root / resolved_runtime).resolve()
        self.theme_path = resolved_theme if resolved_theme.is_absolute() else (workspace_root / resolved_theme).resolve()
        self.lock = threading.RLock()
        self.backup_path = self.state_path.with_name(self.state_path.name + ".bak")
        self._default_state = self._load_default_state()
        self._state_cache = None
        self._ensure_state_file()

    def _load_default_state(self) -> dict[str, Any]:
        if self.state_template_path.exists():
            try:
                payload = json.loads(self.state_template_path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    return payload
            except Exception:
                pass
        return json.loads(json.dumps(FALLBACK_STATE))

    def _ensure_state_file(self) -> None:
        self.read_state_with_revision()

    def _recover_state(self) -> None:
        # Preserve the exact damaged bytes before attempting recovery.
        if self.state_path.exists():
            damaged = self.state_path.with_name(self.state_path.name + f".corrupt-{time.time_ns()}")
            os.replace(self.state_path, damaged)
        recovered = copy.deepcopy(self._default_state)
        if self.backup_path.exists():
            try:
                candidate = json.loads(self.backup_path.read_text(encoding="utf-8-sig"))
                if isinstance(candidate, dict):
                    recovered = candidate
            except (ValueError, UnicodeError):
                pass
        atomic_write_json(self.state_path, recovered)
        self._state_cache = None

    def read_state_with_revision(self) -> tuple[dict[str, Any], str]:
        with self.lock:
            try:
                stat = self.state_path.stat()
                key = (stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size)
                if self._state_cache and self._state_cache[0] == key:
                    return copy.deepcopy(self._state_cache[1]), self._state_cache[2]
                raw_bytes = self.state_path.read_bytes()
                raw = json.loads(raw_bytes.decode("utf-8-sig"))
                if not isinstance(raw, dict):
                    raise ValueError("state file is not a JSON object")
            except (FileNotFoundError, ValueError, UnicodeError):
                self._recover_state()
                return self.read_state_with_revision()
            revision = '"' + hashlib.sha256(raw_bytes).hexdigest() + '"'
            merged = deep_merge(self._default_state, raw)
            self._state_cache = (key, merged, revision)
            return copy.deepcopy(merged), revision

    def read_state(self) -> dict[str, Any]:
        return self.read_state_with_revision()[0]

    def write_state(self, state: dict[str, Any], expected_revision: str | None = None) -> str:
        if not isinstance(state, dict):
            raise ValueError("state must be an object")
        with self.lock:
            _previous, revision = self.read_state_with_revision()
            if expected_revision is not None and expected_revision != revision:
                raise StateConflict("state changed in another window")
            # Back up the last complete state, never a partially written file.
            previous_raw = json.loads(self.state_path.read_text(encoding="utf-8-sig"))
            atomic_write_json(self.backup_path, previous_raw)
            atomic_write_json(self.state_path, state)
            self._state_cache = None
            return self.read_state_with_revision()[1]

    def write_runtime(self, url: str) -> None:
        atomic_write_json(self.runtime_path, {"url": url})

    def read_runtime_url(self) -> str:
        try:
            payload = json.loads(self.runtime_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                url = payload.get("url")
                if isinstance(url, str):
                    return url
        except Exception:
            pass
        return ""

    def read_theme(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.theme_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                return deep_merge(FALLBACK_THEME, payload)
        except Exception:
            pass
        return dict(FALLBACK_THEME)

    def resolve_static_file(self, request_path: str) -> Path | None:
        if not request_path or request_path == "/":
            return None
        decoded = urllib.parse.unquote(request_path.lstrip("/"))
        if not decoded:
            return None
        candidate = (self.web_root / decoded).resolve()
        try:
            candidate.relative_to(self.web_root.resolve())
        except ValueError:
            return None
        if not candidate.exists() or not candidate.is_file():
            return None
        return candidate

    @staticmethod
    def runtime_alive(url: str, timeout: float = 0.8) -> bool:
        if not url:
            return False
        probe = f"{url.rstrip('/')}/health"
        try:
            with urllib.request.urlopen(probe, timeout=timeout) as response:
                return response.status == 200
        except (urllib.error.URLError, TimeoutError, ValueError):
            return False


def make_handler(context: DashboardContext):
    class DashboardHandler(BaseHTTPRequestHandler):
        server_version = "GoWINDashboardHost/2.0"

        def _origin_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            return origin is None or origin in {
                f"http://127.0.0.1:{self.server.server_port}",
                f"http://localhost:{self.server.server_port}",
            }

        def _send_json(self, payload: dict[str, Any], status: int = 200, revision: str | None = None) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if self.headers.get("Origin") and self._origin_allowed():
                self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "ETag")
            if revision:
                self.send_header("ETag", revision)
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path, force_type: str | None = None) -> None:
            body = path.read_bytes()
            content_type = force_type
            if not content_type:
                guessed, _ = mimetypes.guess_type(str(path))
                content_type = guessed or "application/octet-stream"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") else content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            if not self._origin_allowed():
                self._send_json({"ok": False, "error": "origin_not_allowed"}, status=403)
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, If-Match, If-None-Match")
            self.end_headers()

        def do_GET(self) -> None:
            if not self._origin_allowed():
                self._send_json({"ok": False, "error": "origin_not_allowed"}, status=403)
                return
            parsed = urllib.parse.urlparse(self.path)
            req_path = parsed.path or "/"

            if req_path in ("/", "/index.html"):
                if not context.dashboard_html.exists():
                    self._send_json({"ok": False, "error": "dashboard_missing"}, status=404)
                    return
                self._send_file(context.dashboard_html, force_type="text/html")
                return

            if req_path == "/health":
                self._send_json({"ok": True})
                return

            if req_path == "/api/state":
                state, revision = context.read_state_with_revision()
                if self.headers.get("If-None-Match") == revision:
                    self.send_response(HTTPStatus.NOT_MODIFIED)
                    self.send_header("ETag", revision)
                    self.end_headers()
                else:
                    self._send_json(state, revision=revision)
                return

            if req_path == "/api/theme":
                self._send_json(context.read_theme())
                return

            static_path = context.resolve_static_file(req_path)
            if static_path:
                self._send_file(static_path)
                return

            self._send_json({"ok": False, "error": "not_found"}, status=404)

        def do_POST(self) -> None:
            if not self._origin_allowed():
                self._send_json({"ok": False, "error": "origin_not_allowed"}, status=403)
                return
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/api/state":
                self._send_json({"ok": False, "error": "not_found"}, status=404)
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length <= 0:
                    raise ValueError("empty request body")
                payload = self.rfile.read(content_length) if content_length > 0 else b"{}"
                state = json.loads(payload.decode("utf-8"))
                if not isinstance(state, dict):
                    raise ValueError("state must be an object")
            except Exception as exc:
                self._send_json({"ok": False, "error": f"invalid_json: {exc}"}, status=400)
                return
            try:
                revision = context.write_state(state, expected_revision=self.headers.get("If-Match"))
            except StateConflict:
                self._send_json({"ok": False, "error": "state_conflict"}, status=409)
                return
            except OSError:
                self._send_json({"ok": False, "error": "save_failed"}, status=500)
                return
            self._send_json({"ok": True}, revision=revision)

        def log_message(self, _fmt: str, *_args: Any) -> None:
            return

    return DashboardHandler


def pick_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def launch(context: DashboardContext, no_open: bool = False) -> int:
    existing = context.read_runtime_url()
    if DashboardContext.runtime_alive(existing):
        if not no_open:
            webbrowser.open(existing)
        return 0

    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(context))
    url = f"http://127.0.0.1:{server.server_port}/"
    context.write_runtime(url)
    if not no_open:
        webbrowser.open(url)

    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def health(context: DashboardContext) -> int:
    url = context.read_runtime_url()
    if DashboardContext.runtime_alive(url):
        print("ok")
        return 0
    print("down")
    return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GoWIN personal dashboard host")
    parser.add_argument("action", choices=["launch", "health"], help="action")
    parser.add_argument("--workspace-root", required=True, help="workspace root")
    parser.add_argument("--state-path", default="", help="override dashboard state path")
    parser.add_argument("--runtime-path", default="", help="override dashboard runtime path")
    parser.add_argument("--theme-path", default="", help="override dashboard theme path")
    parser.add_argument("--no-open", action="store_true", help="run server without opening browser")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state_path = Path(args.state_path).resolve() if args.state_path else None
    runtime_path = Path(args.runtime_path).resolve() if args.runtime_path else None
    theme_path = Path(args.theme_path).resolve() if args.theme_path else None
    context = DashboardContext(
        Path(args.workspace_root).resolve(),
        state_path=state_path,
        runtime_path=runtime_path,
        theme_path=theme_path,
    )
    if args.action == "launch":
        return launch(context, no_open=args.no_open)
    if args.action == "health":
        return health(context)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
