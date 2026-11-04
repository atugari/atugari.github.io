"""Recovery must never overwrite a deployment that is not positively ours."""
import importlib.util
from pathlib import Path
import sys
# The neighboring read-only helper is named inspect.py; keep it from shadowing
# Python's standard-library inspect module used by unittest.mock.
sys.path = [entry for entry in sys.path if Path(entry).resolve() != Path(__file__).resolve().parent]
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("pilot_deploy", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.settings = {"bindings": [{"name": "DB", "type": "d1"}], "compatibility_date": "2026-05-15"}
        self.metadata = deploy.upload_metadata(self.settings)
        self.live_settings = {**self.settings, "annotations": self.metadata["annotations"]}
        self.old = {"worker.js": (b"old", "application/javascript+module")}
        self.ours = {"worker.js": (b"patched", "application/javascript+module"), "fleet-vending.mjs": (b"new", "application/javascript+module")}

    def run_recovery(self, modules, versions=("ours", "ours"), settings=None):
        with patch.object(deploy, "current_version", side_effect=versions), \
             patch.object(deploy, "current_modules", side_effect=[modules, self.old]), \
             patch.object(deploy, "api", return_value=settings or self.live_settings), \
             patch.object(deploy, "upload") as upload:
            try:
                deploy.restore_our_upload("dummy", self.settings, self.metadata, self.old, self.ours)
            except RuntimeError:
                return False, upload.call_count
            return True, upload.call_count

    def test_lost_upload_response_can_restore_only_verified_owned_bytes(self):
        self.assertEqual(self.run_recovery(self.ours), (True, 1))

    def test_original_code_needs_no_recovery_write(self):
        self.assertEqual(self.run_recovery(self.old), (True, 0))

    def test_third_party_code_is_not_overwritten(self):
        third = {"worker.js": (b"someone else's update", "application/javascript+module")}
        self.assertEqual(self.run_recovery(third), (False, 0))

    def test_version_changed_during_inspection_is_not_overwritten(self):
        self.assertEqual(self.run_recovery(self.ours, versions=("ours", "another")), (False, 0))

    def test_changed_configuration_is_not_overwritten(self):
        self.assertEqual(self.run_recovery(self.ours, settings={**self.live_settings, "limits": {"cpu_ms": 30000}}), (False, 0))

    def test_unconfirmed_owner_is_not_overwritten(self):
        self.assertEqual(self.run_recovery(self.ours, settings=self.settings), (False, 0))


if __name__ == "__main__":
    unittest.main()
