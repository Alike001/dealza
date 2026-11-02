"""Safety tests for the non-broadcast integration tools; no RPC or wallets used."""
import json
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import integration


class IntegrationSafetyTest(unittest.TestCase):
    def test_public_rpc_rejects_mutation_before_starting_any_process(self):
        public = integration.PublicRPC("https://sepolia.base.org")
        with patch.object(integration, "command") as command:
            for method in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "personal_unlockAccount",
                           "anvil_setBalance", "evm_mine"):
                with self.assertRaises(RuntimeError):
                    public.rpc(method, [])
            command.assert_not_called()

    def test_wrong_chain_and_duplicate_roles_are_rejected(self):
        roles = json.loads((integration.ROOT / "config/base-sepolia.roles.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "roles.json"
            wrong_chain = {**roles, "chain_id": 1}
            path.write_text(json.dumps(wrong_chain))
            with self.assertRaises(RuntimeError):
                integration.load_roles(path)
            roles["seller"] = roles["buyer"]
            path.write_text(json.dumps(roles))
            with self.assertRaises(RuntimeError):
                integration.load_roles(path)

    def test_failed_public_preflight_never_starts_a_mutable_fork(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.json"
            args = ["integration.py", "simulate", "--output", str(output)]
            blocked = {"blockers": ["buyer has no test ETH for gas"], "readiness": "NO-GO"}
            with patch("sys.argv", args), patch.object(integration, "command", return_value=""), \
                    patch.object(integration, "preflight", return_value=blocked), \
                    patch.object(integration, "LocalFork") as fork:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(integration.main(), 2)
                fork.assert_not_called()
            self.assertEqual(json.loads(output.read_text())["readiness"], "NO-GO")


if __name__ == "__main__":
    unittest.main()
