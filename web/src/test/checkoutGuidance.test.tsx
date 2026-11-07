import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { OrderPage } from "../components/OrderPage";
import { CheckoutFeedback } from "../components/CheckoutFeedback";
import { PendingTransaction } from "../components/PendingTransaction";
import { WalletContext } from "../lib/wallet";
import {
  allowedActions,
  type Action,
  type OrderSnapshot,
  type TxState,
} from "../lib/domain";
import {
  beginIntent,
  clearIntent,
  pendingIntent,
} from "../lib/pendingTransaction";
import {
  verifyActionEffects,
  verifyCanonicalReceipt,
  type ReceiptNetwork,
} from "../lib/receiptProof";
import { live, receiptOf, stateOf, transactionOf } from "./helpers/recorded";
import {
  api,
  buyer,
  seller,
  reviewer,
  operator,
  id,
  hash,
  text,
  session,
  snapshot,
  wallet,
} from "./fixtures";

function unfunded(changes: Partial<OrderSnapshot> = {}) {
  const s = snapshot({
    collected: false,
    held: 0n,
    captured: 0n,
    storeBalance: 0n,
    derived: 1,
    preApproved: false,
    ...changes,
  });
  s.order.status = 1;
  return s;
}
function view(gateway = api(), account: Address = buyer) {
  return (
    <WalletContext.Provider value={wallet(session(account))}>
      <OrderPage id={id} description={text} api={gateway} />
    </WalletContext.Provider>
  );
}
const recommended = () =>
  document.querySelector<HTMLButtonElement>(".recommended-action");
async function acknowledge() {
  await userEvent.click(screen.getByRole("checkbox"));
}
async function reviewAction(name: string) {
  await acknowledge();
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("region", { name: "Review wallet action" });
}

describe("guided checkout from authoritative state", () => {
  it.each([
    ["before allowance", 0n, false, "1. Allow exactly this USDC amount", 0],
    ["after allowance", 1000000n, false, "2. Authorize these payment terms", 1],
    ["after preapproval", 1000000n, true, "3. Reserve the USDC", 2],
    [
      "preapproval completed first",
      0n,
      true,
      "1. Allow exactly this USDC amount",
      1,
    ],
  ] as const)(
    "recommends one action %s, including on return",
    async (_name, allowance, preApproved, label, count) => {
      const s = unfunded({ allowance, preApproved });
      const gateway = api({ loadOrder: vi.fn(async () => s) });
      const first = render(view(gateway));
      await screen.findByText("Awaiting payment");
      expect(recommended()).toHaveTextContent(label);
      expect(document.querySelectorAll(".recommended-action")).toHaveLength(1);
      const progress = screen.getByRole("region", { name: "Payment progress" });
      expect(within(progress).getAllByRole("listitem")).toHaveLength(3);
      expect(progress.querySelectorAll('[data-complete="true"]')).toHaveLength(
        count,
      );
      expect(gateway.act).not.toHaveBeenCalled();
      first.unmount();
      render(view(gateway));
      await screen.findByText("Awaiting payment");
      expect(recommended()).toHaveTextContent(label);
    },
  );
  it("keeps independently valid preapproval available before allowance", async () => {
    const s = unfunded(),
      gateway = api({ loadOrder: vi.fn(async () => s) });
    render(view(gateway));
    await screen.findByText("Awaiting payment");
    expect(allowedActions(s, buyer)).toContain("preApprove");
    await userEvent.click(screen.getByText(/Other permitted actions/));
    const region = await reviewAction("2. Authorize these payment terms");
    expect(region).toHaveTextContent("does not reserve USDC or pay the seller");
    expect(region.querySelector("h3")).toHaveFocus();
    expect(recommended()).toBeNull();
    await userEvent.click(
      within(region).getByRole("button", { name: "Continue to wallet" }),
    );
    expect(gateway.act).toHaveBeenCalledWith(
      "preApprove",
      id,
      expect.objectContaining({ account: buyer }),
      expect.any(Function),
      "",
    );
  });
  it("recommends an exact cap while retaining a contract-valid reservation with a larger allowance", async () => {
    const s = unfunded({ allowance: 2000000n, preApproved: true }),
      gateway = api({ loadOrder: vi.fn(async () => s) });
    render(view(gateway));
    await screen.findByText("Awaiting payment");
    expect(recommended()).toHaveTextContent("Revoke unused USDC allowance");
    expect(allowedActions(s, buyer)).toContain("fund");
    await userEvent.click(screen.getByText(/Other permitted actions/));
    const region = await reviewAction("3. Reserve the USDC");
    await userEvent.click(
      within(region).getByRole("button", { name: "Continue to wallet" }),
    );
    expect(gateway.act).toHaveBeenCalledWith(
      "fund",
      id,
      expect.anything(),
      expect.any(Function),
      "",
    );
  });
  it("advances after verified effects, never after signature or submission alone", async () => {
    let update!: (tx: TxState) => void, finish!: () => void;
    const s = unfunded(),
      after = unfunded({ allowance: 1000000n, block: 501n });
    const gateway = api({
      loadOrder: vi.fn(async () => s),
      act: vi.fn(async (_a, _id, _session, u) => {
        update = u;
        u({ phase: "signature", message: "Review allowance" });
        await new Promise<void>((r) => (finish = r));
      }),
    });
    render(view(gateway));
    await screen.findByText("Awaiting payment");
    const region = await reviewAction("1. Allow exactly this USDC amount");
    await userEvent.click(
      within(region).getByRole("button", { name: "Continue to wallet" }),
    );
    expect(
      screen.getByText("Wallet confirmation requested"),
    ).toBeInTheDocument();
    expect(recommended()).toHaveTextContent("1. Allow exactly");
    expect(recommended()).toBeDisabled();
    act(() =>
      update({ phase: "pending", hash, message: "Submitted allowance" }),
    );
    expect(screen.getByText("Transaction submitted")).toBeInTheDocument();
    expect(screen.queryByText("Allowance confirmed")).not.toBeInTheDocument();
    expect(recommended()).toHaveTextContent("1. Allow exactly");
    fireEvent.click(recommended()!);
    expect(gateway.act).toHaveBeenCalledTimes(1);
    await act(async () => {
      update({
        phase: "confirmed",
        hash,
        message: "Effects verified",
        snapshot: after,
      });
      finish();
    });
    expect(screen.getByText("Allowance confirmed")).toBeInTheDocument();
    expect(screen.getByText(/No USDC moved/)).toBeInTheDocument();
    expect(recommended()).toHaveTextContent("2. Authorize");
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
  });
  it("shows completed funding after reservation even when allowance was consumed", async () => {
    render(view());
    await screen.findByText("Payment reserved");
    expect(recommended()).toHaveTextContent("Approve release to seller");
    expect(
      screen
        .getByRole("region", { name: "Payment progress" })
        .querySelectorAll('[data-complete="true"]'),
    ).toHaveLength(3);
    await acknowledge();
    await userEvent.click(
      screen.getByRole("button", { name: "Open a dispute" }),
    );
    expect(
      screen.getByLabelText("Evidence or decision reference"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to wallet" }),
    ).toBeDisabled();
    expect(screen.getByText("Expiry keeps running")).toBeInTheDocument();
  });
  it("keeps emergency buyer recovery prominent after expiry", async () => {
    const s = snapshot({ derived: 6, chainTime: 3000 });
    s.order.status = 3;
    render(view(api({ loadOrder: vi.fn(async () => s) })));
    await screen.findByText("Recovery available");
    expect(recommended()).toHaveTextContent("Recover expired funds");
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
  it("shows recovered funds without asking a buyer to wait for a reviewer", async () => {
    const s = snapshot({
      derived: 7,
      held: 0n,
      storeBalance: 0n,
      chainTime: 3000,
    });
    s.order.status = 3;
    render(view(api({ loadOrder: vi.fn(async () => s) })));
    await screen.findByText("Recovered by buyer");
    expect(
      screen.queryByText(/The agreed reviewer must decide the dispute/),
    ).not.toBeInTheDocument();
    expect(recommended()).toHaveTextContent("Update recovery record");
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it("shows seller evidence without implying it releases funds, and preserves voluntary return", async () => {
    render(view(api(), seller));
    await screen.findByText("Payment reserved");
    expect(recommended()).toHaveTextContent("Record delivery evidence");
    expect(
      screen.getByText(/Evidence does not release payment/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Evidence or decision reference"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByText("Cancellation, allowance and recovery controls"),
    );
    expect(
      screen.getByRole("button", { name: "Return reserve to buyer" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it.each(["unfunded", "reserved"])(
    "does not prompt a seller to fund or submit delivery evidence after %s expiry",
    async (state) => {
      const s =
        state === "unfunded"
          ? unfunded({ chainTime: 2000, derived: 6 })
          : snapshot({ chainTime: 3000, derived: 6 });
      render(view(api({ loadOrder: vi.fn(async () => s) }), seller));
      await screen.findByText(
        state === "unfunded" ? "Payment window closed" : "Recovery available",
      );
      expect(
        screen.queryByText(/Waiting for the buyer to reserve funds/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Record delivery evidence for the buyer/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Evidence or decision reference"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Record delivery evidence" }),
      ).not.toBeInTheDocument();
      if (state === "reserved") {
        expect(
          screen.getByText(/You may still return the reserve/),
        ).toBeInTheDocument();
        await userEvent.click(
          screen.getByText("Cancellation, allowance and recovery controls"),
        );
        expect(
          screen.getByRole("button", { name: "Return reserve to buyer" }),
        ).toBeInTheDocument();
      }
    },
  );
  it("requires an explicit reviewer outcome, reference and review before confirmation", async () => {
    const s = snapshot({ derived: 3 });
    s.order.status = 3;
    render(view(api({ loadOrder: vi.fn(async () => s) }), reviewer));
    await screen.findByText("In review");
    const pay = screen.getByRole("radio", { name: "Decide: pay the seller" });
    const back = screen.getByRole("radio", { name: "Decide: return to buyer" });
    expect(pay).not.toBeChecked();
    expect(back).not.toBeChecked();
    expect(recommended()).toBeNull();
    await userEvent.click(back);
    expect(recommended()).toHaveTextContent("Review reviewer decision");
    await acknowledge();
    await userEvent.click(recommended()!);
    expect(
      screen.getByRole("button", { name: "Continue to wallet" }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("Evidence or decision reference"),
      "Original reviewer decision",
    );
    expect(
      screen.getByRole("button", { name: "Continue to wallet" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("region", { name: "Review wallet action" }),
    ).toHaveTextContent("reserve returns to the buyer");
  });
  it("does not offer either reviewer outcome to a disputed buyer", async () => {
    const s = snapshot({ derived: 3 });
    s.order.status = 3;
    render(view(api({ loadOrder: vi.fn(async () => s) })));
    await screen.findByText("In review");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(recommended()).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it.each([4, 5] as const)(
    "shows terminal status %s without active deadline or payment prompts",
    async (status) => {
      const s = snapshot({
        held: 0n,
        storeBalance: 0n,
        captured: status === 4 ? 1000000n : 0n,
        derived: status,
      });
      s.order.status = status;
      render(view(api({ loadOrder: vi.fn(async () => s) })));
      await screen.findByText(status === 4 ? "Paid to seller" : "Cancelled");
      expect(
        screen.getByText("No active payment deadline."),
      ).toBeInTheDocument();
      expect(recommended()).toBeNull();
      expect(
        screen.queryByText("A dispute does not pause the clock."),
      ).not.toBeInTheDocument();
    },
  );
  it("clears a buyer proposal and evidence when the connected wallet changes", async () => {
    const gateway = api();
    const mounted = render(view(gateway));
    await screen.findByText("Payment reserved");
    await acknowledge();
    await userEvent.click(
      screen.getByRole("button", { name: "Open a dispute" }),
    );
    await userEvent.type(
      screen.getByLabelText("Evidence or decision reference"),
      "Private buyer reference",
    );
    mounted.rerender(view(gateway, seller));
    await screen.findByText("You’re the seller.");
    expect(
      screen.queryByRole("region", { name: "Review wallet action" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Evidence or decision reference")).toHaveValue(
      "",
    );
    expect(recommended()).toHaveTextContent("Record delivery evidence");
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("recovers from an RPC failure without offering actions from uncertain state", async () => {
    const gateway = api({
      loadOrder: vi
        .fn()
        .mockRejectedValueOnce(Error("RPC unavailable"))
        .mockResolvedValue(unfunded()),
    });
    render(view(gateway));
    await screen.findByRole("alert");
    expect(recommended()).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Awaiting payment");
    expect(recommended()).toHaveTextContent("1. Allow exactly");
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("keeps partial history explicit, even when the queried recent range is empty", async () => {
    const gateway = api({
      activity: vi.fn(async () => ({ items: [], through: 500n, next: 299n })),
    });
    render(view(gateway));
    await screen.findByText(/Partial history/);
    expect(
      screen.getByText(/No matching events in the queried blocks/),
    ).toHaveTextContent("Older or unavailable blocks may contain activity");
    expect(screen.queryByText("No transactions")).not.toBeInTheDocument();
  });
  it("opens agreement details by keyboard and returns focus after leaving confirmation", async () => {
    render(view());
    await screen.findByText("Payment reserved");
    const trigger = screen.getByRole("button", {
      name: "Read agreement and participants",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByText("Agreement and participants").closest("details"),
    ).toHaveAttribute("open");
    expect(screen.getByText("Agreement and participants")).toHaveFocus();
    const region = await reviewAction("Approve release to seller");
    expect(within(region).getByRole("heading")).toHaveFocus();
    await userEvent.click(
      within(region).getByRole("button", { name: "Go back" }),
    );
    expect(
      screen.getByRole("heading", { name: "You’re the buyer." }),
    ).toHaveFocus();
  });
  it("reconciles a persisted pending request after remount without duplicate submission", async () => {
    const before = unfunded({ allowance: 1000000n, preApproved: true });
    const saved = {
      version: 1 as const,
      action: "fund" as const,
      actor: buyer,
      operator,
      target: operator,
      data: "0x1234" as const,
      hash,
      before,
      proof: hash,
    };
    const after = snapshot({ block: 501n });
    beginIntent(saved);
    const gateway = api({
      loadOrder: vi.fn(async () => before),
      resumePending: vi.fn(async (_session, update) => {
        update({
          phase: "confirmed",
          hash,
          snapshot: after,
          message: "Receipt and reservation verified",
        });
        clearIntent(saved);
        return undefined;
      }),
    });
    const mount = () => (
      <WalletContext.Provider value={wallet()}>
        <PendingTransaction api={gateway} />
        <OrderPage id={id} description={text} api={gateway} />
      </WalletContext.Provider>
    );
    const first = render(mount());
    await screen.findByText("Awaiting payment");
    expect(recommended()).toBeDisabled();
    first.unmount();
    render(mount());
    await screen.findByText("Awaiting payment");
    expect(recommended()).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: /Recheck saved transaction/ }),
    );
    await screen.findByText("Payment reserved");
    expect(pendingIntent(buyer, operator)).toBeNull();
    expect(gateway.act).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
    expect(recommended()).toHaveTextContent("Approve release to seller");
  });
});

function afterAction(action: Action) {
  const s =
    action === "approve" || action === "preApprove"
      ? unfunded({ allowance: 1000000n, preApproved: action === "preApprove" })
      : snapshot();
  if (action === "dispute") {
    s.order.status = 3;
    s.derived = 3;
  }
  if (
    ["release", "resolveRelease", "resolveVoid", "cancel", "reclaim"].includes(
      action,
    )
  ) {
    const returned = ["resolveVoid", "cancel", "reclaim"].includes(action);
    s.order.status = action === "reclaim" ? 3 : returned ? 5 : 4;
    s.derived = action === "reclaim" ? 7 : returned ? 5 : 4;
    s.held = 0n;
    s.storeBalance = 0n;
    s.captured = returned ? 0n : 1000000n;
    if (action === "reclaim") s.chainTime = 3000;
  }
  return s;
}
describe("action-specific verified feedback", () => {
  it.each([
    ["approve", "Allowance confirmed"],
    ["preApprove", "Payment terms authorized"],
    ["fund", "Funds reserved"],
    ["dispute", "Dispute opened"],
    ["resolveRelease", "Reviewer decision confirmed"],
    ["resolveVoid", "Reviewer decision confirmed"],
    ["release", "Funds released"],
    ["cancel", "Funds returned"],
    ["reclaim", "Funds returned"],
  ] as [Action, string][])(
    "describes verified %s accurately",
    (action, title) => {
      render(
        <CheckoutFeedback
          action={action}
          tx={{
            phase: "confirmed",
            hash,
            message: "Verified",
            snapshot: afterAction(action),
          }}
        />,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /View transaction/ }),
      ).toHaveAttribute("href", expect.stringContaining(hash));
      if (action === "approve" || action === "preApprove")
        expect(screen.getByRole("status")).toHaveTextContent("No USDC moved");
    },
  );
  it.each(["missing receipt hash", "missing snapshot", "inconsistent effects"])(
    "does not report successful allowance with %s",
    (reason) => {
      const tx: TxState = {
        phase: "confirmed",
        hash,
        message: "Confirmed",
        snapshot: afterAction("approve"),
      };
      if (reason === "missing receipt hash") delete tx.hash;
      else if (reason === "missing snapshot") delete tx.snapshot;
      else tx.snapshot!.allowance = 0n;
      render(<CheckoutFeedback action="approve" tx={tx} />);
      expect(screen.queryByText("Allowance confirmed")).not.toBeInTheDocument();
      expect(screen.getByText("Checking transaction")).toBeInTheDocument();
    },
  );
  it("asks for transaction verification after an error retaining a hash", () => {
    render(
      <CheckoutFeedback
        action="fund"
        tx={{ phase: "error", hash, message: "RPC timed out" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Verify this transaction before retrying",
    );
    expect(screen.queryByText("Funds reserved")).not.toBeInTheDocument();
  });
  it.each(["approve", "preApprove", "fund", "delivery", "release"] as const)(
    "replays genuine historical %s receipt before showing UI success",
    async (action) => {
      const receipt = receiptOf(action),
        before = stateOf(action, "before"),
        after = stateOf(action, "after");
      const reader = {
        getChainId: async () => 84532,
        getTransactionReceipt: async () => receipt,
        getTransaction: async () => transactionOf(action),
        getBlock: async () => ({
          hash: receipt.blockHash,
          number: receipt.blockNumber,
          transactions: [receipt.transactionHash],
        }),
        getBlockNumber: async () => receipt.blockNumber + 2n,
      };
      await verifyCanonicalReceipt(reader, receipt);
      verifyActionEffects({
        action,
        actor: (action === "delivery"
          ? live.addresses.seller
          : live.addresses.buyer) as Address,
        before,
        after,
        receipt,
        network: live.addresses as ReceiptNetwork,
        proof:
          "0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82",
      });
      render(
        <CheckoutFeedback
          action={action}
          tx={{
            phase: "confirmed",
            hash: receipt.transactionHash,
            snapshot: after,
            message: "Verified historical effects",
          }}
        />,
      );
      expect(
        screen.queryByText("Checking transaction"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /View transaction/ }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining(receipt.transactionHash),
      );
    },
  );
});
