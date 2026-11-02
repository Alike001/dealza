"""Safety tests for the non-broadcast integration tools; no RPC or wallets used."""
import json
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import integration


class IntegrationSafetyTest(unittest.TestCase):
    def test_rehearsal_uses_public_price_without_changing_funded_balance(self):
        rehearsal = integration.Rehearsal.__new__(integration.Rehearsal)
        rehearsal.roles = {"seller": "0x" + "11" * 20}
        rehearsal.gas_price = 6_000_000
        rehearsal.snapshot = Mock(return_value={})
        rehearsal.report = {"transactions": []}
        rehearsal.event_names = {}
        rehearsal.rpc = Mock()
        rehearsal.rpc.rpc.side_effect = ["0x64", "0x", "0x0", "0xabc",
            {"status": "0x1", "gasUsed": "0x64", "logs": []}]
        rehearsal.tx("seller create", "seller", "0x" + "22" * 20, "0x1234")
        calls = rehearsal.rpc.rpc.call_args_list
        self.assertEqual([c.args[0] for c in calls], ["eth_estimateGas", "eth_call",
                         "eth_getTransactionCount", "eth_sendTransaction", "eth_getTransactionReceipt"])
        for index in (0, 1, 3):
            self.assertEqual(calls[index].args[1][0]["gasPrice"], hex(6_000_000))
        self.assertEqual(rehearsal.report["transactions"][0]["proposed_gas_limit"], 125)

    def test_rehearsal_rejects_zero_price(self):
        with self.assertRaisesRegex(RuntimeError, "nonzero public gas price"):
            integration.Rehearsal(None, {}, {"gas_price_snapshot_wei": 0}, {})

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
