import { describe, expect, it, vi } from "vitest";
import type { TransactionReceipt } from "viem";
import { confirmTransaction, type TransactionPort } from "../lib/transactions";
import type { TxState } from "../lib/domain";
import { assertSession } from "../lib/wallet";
import { buyer, hash, reviewer, session } from "./fixtures";

const receipt = (status: "success" | "reverted") =>
  ({ status, transactionHash: hash }) as TransactionReceipt;
function port(overrides: Partial<TransactionPort> = {}): TransactionPort {
  return {
    check: vi.fn(async () => {}),
    simulate: vi.fn(async () => {}),
    send: vi.fn(async () => hash),
    wait: vi.fn(async () => receipt("success")),
    verify: vi.fn(async () => {}),
    ...overrides,
  };
}
describe("receipt-driven transactions", () => {
  it("does not confirm before receipt success and transaction identity verification", async () => {
    let resolve!: (r: TransactionReceipt) => void;
    const pending = new Promise<TransactionReceipt>((r) => {
      resolve = r;
    });
    const states: TxState[] = [];
    const p = port({ wait: vi.fn(() => pending) });
    const task = confirmTransaction(p, (state) => states.push(state));
    await vi.waitFor(() => expect(states.at(-1)?.phase).toBe("pending"));
    expect(states.some((s) => s.phase === "confirmed")).toBe(false);
    resolve(receipt("success"));
    await task;
    expect(p.verify).toHaveBeenCalled();
    expect(states.at(-1)?.phase).toBe("confirmed");
    expect(p.check).toHaveBeenCalledTimes(2);
  });
  it("a declined signature never starts receipt confirmation", async () => {
    const p = port({
      send: vi.fn(async () => {
        throw { code: 4001 };
      }),
    });
    await expect(confirmTransaction(p, vi.fn())).rejects.toEqual({
      code: 4001,
    });
    expect(p.wait).not.toHaveBeenCalled();
  });
  it("a failed simulation never reaches the wallet request", async () => {
    const p = port({
      simulate: vi.fn(async () => {
        throw new Error("execution reverted");
      }),
    });
    await expect(confirmTransaction(p, vi.fn())).rejects.toThrow("reverted");
    expect(p.send).not.toHaveBeenCalled();
  });
  it("a reverted receipt never confirms success", async () => {
    const update = vi.fn(),
      p = port({ wait: vi.fn(async () => receipt("reverted")) });
    await expect(confirmTransaction(p, update)).rejects.toThrow("reverted");
    expect(p.verify).not.toHaveBeenCalled();
    expect(
      update.mock.calls.some(([state]) => state.phase === "confirmed"),
    ).toBe(false);
  });
  it("a successful replacement with different calldata is not accepted as this action", async () => {
    const update = vi.fn();
    await expect(
      confirmTransaction(
        port({
          verify: vi.fn(async () => {
            throw new Error("different transaction");
          }),
        }),
        update,
      ),
    ).rejects.toThrow("different transaction");
    expect(
      update.mock.calls.some(([state]) => state.phase === "confirmed"),
    ).toBe(false);
  });
});
describe("wallet session validation", () => {
  it("rejects wrong networks before any payment simulation", async () => {
    await expect(assertSession(session(buyer, 1))).rejects.toThrow(
      "Base Sepolia",
    );
  });
  it("rejects a disconnected or changed selected account", async () => {
    const s = session();
    s.provider.request = vi.fn(async ({ method }) =>
      method === "eth_chainId" ? "0x14a34" : [],
    );
    await expect(assertSession(s)).rejects.toThrow("disconnected");
    s.provider.request = vi.fn(async ({ method }) =>
      method === "eth_chainId" ? "0x14a34" : [reviewer, buyer],
    );
    await expect(assertSession(s)).rejects.toThrow("changed accounts");
  });
});

describe("replacement classifications", () => {
  it.each([
    ["repriced", "changed the gas price"],
    ["cancelled", "submitted a cancellation"],
    ["replaced", "replacement transaction was reported"],
  ] as const)(
    "reports %s without declaring a successful order",
    async (reason, message) => {
      const update = vi.fn();
      const p = port({
        wait: vi.fn(async (_hash, replaced) => {
          replaced(hash, reason);
          return receipt("success");
        }),
        verify: vi.fn(async () => {
          throw new Error("no matching order");
        }),
      });
      await expect(confirmTransaction(p, update)).rejects.toThrow(
        "no matching order",
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "pending",
          message: expect.stringContaining(message),
        }),
      );
      expect(update.mock.calls.some(([s]) => s.phase === "confirmed")).toBe(
        false,
      );
    },
  );
});
