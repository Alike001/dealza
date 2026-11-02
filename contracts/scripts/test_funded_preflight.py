"""Verify the supplemental receipt reader cannot sign or mutate public state."""
import unittest
from unittest.mock import patch

import funded_preflight


class FundingReaderSafetyTest(unittest.TestCase):
    def test_public_reader_rejects_wallet_and_mutation_methods(self):
        rpc = funded_preflight.ReceiptRPC("https://sepolia.base.org")
        with patch.object(funded_preflight, "command") as command:
            for method in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_sign",
                           "personal_unlockAccount", "anvil_setBalance", "evm_mine",
                           "debug_traceTransaction"):
                with self.assertRaises(RuntimeError):
                    rpc.rpc(method, [])
            command.assert_not_called()

    def test_receipt_lookup_uses_only_read_method(self):
        rpc = funded_preflight.ReceiptRPC("https://sepolia.base.org")
        with patch.object(funded_preflight, "command", return_value='{"status":"0x1"}') as command:
            self.assertEqual(rpc.rpc("eth_getTransactionReceipt", ["0xabc"]), {"status": "0x1"})
            command.assert_called_once_with("cast", "rpc", "--rpc-url", "https://sepolia.base.org",
                                            "eth_getTransactionReceipt", "0xabc")


if __name__ == "__main__":
    unittest.main()
