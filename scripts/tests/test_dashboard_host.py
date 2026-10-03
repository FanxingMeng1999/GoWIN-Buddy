"""Regression tests for the standalone dashboard host (no real user data)."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("dashboard_host", ROOT / "apps/rpg-hub/host/personal_dashboard_host.py")
host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host)


class DashboardHostTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="gowin-host-test-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state_path = self.root / "state/game_state.json"
        self.context = host.DashboardContext(self.root, state_path=self.state_path)

    def test_corrupt_state_does_not_deadlock_and_preserves_original(self):
        broken = b'{"tasks": [broken'
        self.state_path.write_bytes(broken)
        result = []
        worker = threading.Thread(target=lambda: result.append(self.context.read_state()), daemon=True)
        worker.start()
        worker.join(0.7)
        self.assertFalse(worker.is_alive(), "read_state deadlocked after JSON corruption")
        self.assertIsInstance(result[0], dict)
        preserved = list(self.state_path.parent.glob("game_state.json.corrupt-*"))
        self.assertTrue(preserved, "damaged user state must be retained")
        self.assertEqual(preserved[0].read_bytes(), broken)

    def test_corruption_recovers_last_valid_backup(self):
        self.context.write_state({"tasks": [{"id": 1, "name": "keep my task"}]})
        self.context.write_state({"tasks": [{"id": 2, "name": "new task"}]})
        self.state_path.write_bytes(b"{broken")
        worker = threading.Thread(target=self.context.read_state, daemon=True)
        worker.start()
        worker.join(0.7)
        self.assertFalse(worker.is_alive(), "backup recovery deadlocked")
        recovered = json.loads(self.state_path.read_text("utf-8"))
        self.assertEqual(recovered["tasks"][0]["name"], "keep my task")

    def test_failed_atomic_replace_keeps_previous_state(self):
        self.context.write_state({"tasks": [{"id": 1, "name": "saved"}]})
        before = self.state_path.read_bytes()
        original_replace = os.replace
        def fail_for_state(source, target):
            if Path(target) == self.state_path:
                raise OSError("simulated disk failure")
            return original_replace(source, target)
        with mock.patch.object(host.os, "replace", side_effect=fail_for_state):
            with self.assertRaises(OSError):
                self.context.write_state({"tasks": []})
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertFalse(list(self.state_path.parent.glob("*.tmp")))

    def test_conditional_save_rejects_stale_revision(self):
        _state, revision = self.context.read_state_with_revision()
        self.context.write_state({"tasks": [{"id": 1, "name": "remote"}]})
        with self.assertRaises(host.StateConflict):
            self.context.write_state({"tasks": []}, expected_revision=revision)
        self.assertEqual(self.context.read_state()["tasks"][0]["name"], "remote")

    def test_default_template_is_loaded_once(self):
        with mock.patch.object(self.context, "_load_default_state", side_effect=AssertionError("template reread")):
            self.context.read_state()
            self.context.read_state()

    def test_external_atomic_replacement_invalidates_cache(self):
        self.context.read_state()
        replacement = self.root / "replacement.json"
        replacement.write_text(json.dumps({"tasks": [{"id": 7, "name": "external"}]}), encoding="utf-8")
        os.replace(replacement, self.state_path)
        self.assertEqual(self.context.read_state()["tasks"][0]["name"], "external")

    def start_server(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), host.make_handler(self.context))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def cleanup():
            server.shutdown()
            server.server_close()
            thread.join(1)
        self.addCleanup(cleanup)
        return "http://127.0.0.1:" + str(server.server_port)

    def test_http_etag_and_not_modified(self):
        url = self.start_server() + "/api/state"
        with urllib.request.urlopen(url, timeout=2) as response:
            revision = response.headers["ETag"]
            self.assertTrue(revision)
        request = urllib.request.Request(url, headers={"If-None-Match": revision})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(caught.exception.code, 304)

    def test_http_stale_writer_cannot_overwrite_other_client(self):
        url = self.start_server() + "/api/state"
        with urllib.request.urlopen(url, timeout=2) as response:
            revision = response.headers["ETag"]
        self.context.write_state({"tasks": [{"id": 3, "name": "remote task"}]})
        request = urllib.request.Request(url, data=b'{"tasks":[]}', headers={"Content-Type": "application/json", "If-Match": revision})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(caught.exception.code, 409)
        self.assertEqual(self.context.read_state()["tasks"][0]["name"], "remote task")

    def test_invalid_state_object_is_rejected(self):
        url = self.start_server() + "/api/state"
        request = urllib.request.Request(url, data=b'[]', headers={"Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(caught.exception.code, 400)

    def test_unrelated_web_origin_cannot_read_or_write_task_state(self):
        url = self.start_server() + "/api/state"
        before = self.state_path.read_bytes()
        for data in (None, b'{"tasks":[]}'):
            request = urllib.request.Request(url, data=data, headers={"Origin": "https://unrelated.example", "Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=2)
            self.assertEqual(caught.exception.code, 403)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_dashboard_origin_and_desktop_client_can_save(self):
        origin = self.start_server()
        for headers in ({}, {"Origin": origin}):
            request = urllib.request.Request(origin + "/api/state", data=b'{"tasks":[]}', headers={"Content-Type": "application/json", **headers})
            with urllib.request.urlopen(request, timeout=2) as response:
                self.assertEqual(response.status, 200)

if __name__ == "__main__":
    unittest.main(verbosity=2)
