"""Public RPC safety boundary for deployment and payment preparation."""
import unittest
from unittest.mock import patch

from verify_live_deployment import DeploymentRPC


class DeploymentReaderSafetyTest(unittest.TestCase):
    def test_public_endpoint_cannot_sign_send_or_change_state(self):
        rpc = DeploymentRPC("https://sepolia.base.org")
        with patch("integration.command") as base, patch("verify_live_deployment.command") as extra:
            for method in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_sign",
                           "personal_sign", "eth_signTypedData_v4", "anvil_setBalance",
                           "anvil_impersonateAccount", "evm_mine", "wallet_sendCalls"):
                with self.assertRaises(RuntimeError):
                    rpc.rpc(method, [])
            base.assert_not_called()
            extra.assert_not_called()

    def test_extra_methods_are_read_only(self):
        rpc = DeploymentRPC("https://sepolia.base.org")
        with patch("verify_live_deployment.command", return_value='"0x0"') as command:
            for method in ("eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getStorageAt"):
                self.assertEqual(rpc.rpc(method, ["0xabc"]), "0x0")
                self.assertEqual(command.call_args.args,
                                 ("cast", "rpc", "--rpc-url", "https://sepolia.base.org", method, "0xabc"))


if __name__ == "__main__":
    unittest.main()
