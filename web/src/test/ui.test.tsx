import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { CreateOrder } from "../components/CreateOrder";
import { OrderPage } from "../components/OrderPage";
import { orderDraftKey } from "../lib/orderDraft";
import { WalletContext, WalletProvider, useWallet } from "../lib/wallet";
import {
  api,
  buyer,
  hash,
  id,
  reviewer,
  seller,
  session,
  snapshot,
  text,
  wallet,
} from "./fixtures";

describe("pending integration and routing", () => {
  it("shows an explicit pending state without inventing orders or balances", () => {
    window.location.hash = "/orders";
    const gateway = api({ deployment: null });
    render(
      <WalletContext.Provider value={wallet(null)}>
        <App api={gateway} />
      </WalletContext.Provider>,
    );
    expect(screen.getByText("Testnet integration pending")).toBeInTheDocument();
    expect(screen.queryByText("Paid to seller")).not.toBeInTheDocument();
    expect(gateway.listOrders).not.toHaveBeenCalled();
    expect(gateway.loadOrder).not.toHaveBeenCalled();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("opens a shared link without a wallet but never claims it exists when undeployed", () => {
    const gateway = api({ deployment: null });
    window.location.hash = `/order/${id}?terms=${encodeURIComponent(text)}`;
    render(
      <WalletContext.Provider value={wallet(null)}>
        <App api={gateway} />
      </WalletContext.Provider>,
    );
    expect(
      screen.getByText("This order can’t be verified yet."),
    ).toBeInTheDocument();
    expect(gateway.loadOrder).not.toHaveBeenCalled();
  });
  it("rejects malformed order links instead of making a chain request", async () => {
    window.location.hash = "/orders";
    const user = userEvent.setup(),
      gateway = api({ deployment: null });
    render(
      <WalletContext.Provider value={wallet(null)}>
        <App api={gateway} />
      </WalletContext.Provider>,
    );
    await user.type(screen.getByLabelText("Order link or ID"), "not-an-order");
    await user.click(screen.getByRole("button", { name: /Open order/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "complete Dealza order ID",
    );
    expect(gateway.loadOrder).not.toHaveBeenCalled();
  });
  it("saves only a local draft while integration is pending", async () => {
    const user = userEvent.setup(),
      gateway = api({ deployment: null });
    render(
      <WalletContext.Provider value={wallet(session(seller))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    await user.type(screen.getByLabelText("What is this order for?"), text);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      screen.getByText(/No order or payment has been created/),
    ).toBeInTheDocument();
    expect(gateway.create).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(orderDraftKey(session(seller), null)!),
    ).toContain(text);
  });
});

function order(gateway = api(), connected = wallet()) {
  return render(
    <WalletContext.Provider value={connected}>
      <OrderPage id={id} description={text} api={gateway} />
    </WalletContext.Provider>,
  );
}
async function proposeRelease() {
  const user = userEvent.setup();
  await screen.findByText("Payment reserved");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Approve release to seller" }),
  );
  await user.click(screen.getByRole("button", { name: "Continue to wallet" }));
}
describe("financial UI transitions", () => {
  it("shows receipt-verified settlement immediately and never rolls back to a lagging read", async () => {
    const paid = snapshot({
      held: 0n,
      captured: 1_000_000n,
      storeBalance: 0n,
      derived: 4,
      block: 510n,
    });
    paid.order.status = 4;
    let finish!: () => void;
    const gateway = api({
      // All later reads lag behind the authenticated receipt block.
      loadOrder: vi.fn().mockResolvedValue(snapshot({ block: 505n })),
      act: vi.fn(async (_action, _id, _session, update) => {
        update({
          phase: "confirmed",
          hash,
          message: "Payment record verified",
          snapshot: paid,
        });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }),
    });
    order(gateway);
    await proposeRelease();
    expect(screen.getByText("Paid to seller")).toBeInTheDocument();
    expect(screen.queryByText("Payment reserved")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
    expect(screen.getByText("Paid to seller")).toBeInTheDocument();
  });
  it("retains a verified settlement with an explicit warning when the next RPC read fails", async () => {
    const paid = snapshot({
      held: 0n,
      captured: 1_000_000n,
      storeBalance: 0n,
      derived: 4,
      block: 510n,
    });
    paid.order.status = 4;
    const gateway = api({
      loadOrder: vi
        .fn()
        .mockResolvedValueOnce(snapshot())
        .mockRejectedValue(Error("RPC unavailable")),
      act: vi.fn(async (_action, _id, _session, update) => {
        update({
          phase: "confirmed",
          hash,
          message: "Receipt verified",
          snapshot: paid,
        });
      }),
    });
    order(gateway);
    await proposeRelease();
    await screen.findByText("Latest update unavailable.");
    expect(screen.getByText("Paid to seller")).toBeInTheDocument();
    expect(
      screen.getByText(/Showing the last verified payment record/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it("updates the visible order after a saved receipt is reconciled", async () => {
    order();
    await screen.findByText("Payment reserved");
    const paid = snapshot({
      held: 0n,
      captured: 1_000_000n,
      storeBalance: 0n,
      derived: 4,
      block: 510n,
    });
    paid.order.status = 4;
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("dealza:confirmed-order", { detail: paid }),
      );
    });
    expect(screen.getByText("Paid to seller")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it("automatically refreshes a previously reserved order to its settled state", async () => {
    vi.useFakeTimers();
    try {
      const paid = snapshot({
        held: 0n,
        captured: 1_000_000n,
        storeBalance: 0n,
        derived: 4,
        block: 510n,
      });
      paid.order.status = 4;
      order(
        api({
          loadOrder: vi
            .fn()
            .mockResolvedValueOnce(snapshot())
            .mockResolvedValue(paid),
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByText("Payment reserved")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText("Paid to seller")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignores an old chain read that arrives after a newer payment state", async () => {
    vi.useFakeTimers();
    try {
      let firstRead!: (value: ReturnType<typeof snapshot>) => void;
      const old = new Promise<ReturnType<typeof snapshot>>((resolve) => {
        firstRead = resolve;
      });
      const paid = snapshot({
        held: 0n,
        captured: 1_000_000n,
        derived: 4,
        block: 501n,
      });
      paid.order.status = 4;
      const gateway = api({
        loadOrder: vi.fn().mockReturnValueOnce(old).mockResolvedValue(paid),
      });
      order(gateway);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText("Paid to seller")).toBeInTheDocument();
      await act(async () => {
        firstRead(snapshot());
      });
      expect(screen.getByText("Paid to seller")).toBeInTheDocument();
      expect(screen.queryByText("Payment reserved")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it("disconnected visitors can read an order but cannot release or reserve funds", async () => {
    const gateway = api();
    order(gateway, wallet(null));
    await screen.findByText("Payment reserved");
    expect(screen.getByText("Connect to take part.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("wrong networks disable actions and offer an explicit network switch", async () => {
    const gateway = api(),
      connected = wallet(session(buyer, 1));
    order(gateway, connected);
    await screen.findByText("Payment reserved");
    expect(
      screen.getByRole("button", { name: "Approve release to seller" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch network" }),
    );
    expect(connected.switchNetwork).toHaveBeenCalled();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("a submitted transaction never marks an order paid before refreshed chain state", async () => {
    let finish!: () => void;
    const gateway = api({
      act: vi.fn(async (_action, _id, _session, update) => {
        update({ phase: "pending", message: "Waiting for confirmation", hash });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }),
    });
    order(gateway);
    await proposeRelease();
    expect(screen.getByText("Payment reserved")).toBeInTheDocument();
    expect(screen.queryByText("Paid to seller")).not.toBeInTheDocument();
    const paid = snapshot({ held: 0n, captured: 1_000_000n, derived: 4 });
    paid.order.status = 4;
    vi.mocked(gateway.loadOrder).mockResolvedValue(paid);
    await act(async () => {
      finish();
    });
    expect(await screen.findByText("Paid to seller")).toBeInTheDocument();
  });
  it("a declined wallet signature leaves the reservation unchanged", async () => {
    const gateway = api({
      act: vi.fn(async () => {
        throw { code: 4001 };
      }),
    });
    order(gateway);
    await proposeRelease();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "declined the wallet request",
    );
    expect(screen.getByText("Payment reserved")).toBeInTheDocument();
    expect(screen.queryByText("Paid to seller")).not.toBeInTheDocument();
  });
  it("a reverted payment never becomes a successful release in the interface", async () => {
    order(
      api({
        act: vi.fn(async () => {
          throw new Error("execution reverted");
        }),
      }),
    );
    await proposeRelease();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "rejected by the contract",
    );
    expect(screen.getByText("Payment reserved")).toBeInTheDocument();
    expect(screen.queryByText("Paid to seller")).not.toBeInTheDocument();
  });
  it("an expired disputed order exposes recovery, never buyer release or reviewer overrides", async () => {
    const s = snapshot({ chainTime: 3000, derived: 6 });
    s.order.status = 3;
    order(api({ loadOrder: vi.fn(async () => s) }));
    await screen.findByText("Recovery available");
    expect(
      screen.getByRole("button", { name: "Recover expired funds" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("A dispute does not pause the clock.").length,
    ).toBeGreaterThan(0);
  });
  it("only the agreed reviewer sees both dispute decisions", async () => {
    const s = snapshot({ derived: 3 });
    s.order.status = 3;
    order(api({ loadOrder: vi.fn(async () => s) }), wallet(session(reviewer)));
    await screen.findByText("In review");
    expect(
      screen.getByRole("button", { name: "Decide: pay the seller" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decide: return to buyer" }),
    ).toBeInTheDocument();
  });
  it("unverified linked terms are clearly identified before funding", async () => {
    render(
      <WalletContext.Provider value={wallet()}>
        <OrderPage id={id} description="A substituted agreement" api={api()} />
      </WalletContext.Provider>,
    );
    expect(
      await screen.findByText("These linked terms do not match the order."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Approve release to seller" }),
    ).toBeDisabled();
  });
  it("shows an unavailable order as an error, not an empty successful payment", async () => {
    order(
      api({
        loadOrder: vi.fn(async () => {
          throw new Error("Order not found or RPC unavailable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn’t verify this order",
    );
    expect(screen.queryByText("Paid to seller")).not.toBeInTheDocument();
  });
});

async function fillOrderForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("What is this order for?"), text);
  await user.type(screen.getByLabelText(/Order amount/), "1.000001");
  await user.type(screen.getByLabelText("Buyer’s wallet address"), buyer);
  await user.type(
    screen.getByLabelText("Agreed reviewer’s wallet address"),
    reviewer,
  );
  fireEvent.change(screen.getByLabelText("Buyer must reserve by"), {
    target: {
      value: new Date(Date.now() + 86400_000).toISOString().slice(0, 16),
    },
  });
  fireEvent.change(screen.getByLabelText("Payment release & review deadline"), {
    target: {
      value: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16),
    },
  });
  await user.click(screen.getByRole("button", { name: /Review order/ }));
  await screen.findByText("REVIEW BEFORE YOU CREATE");
  return user;
}
describe("seller order creation", () => {
  it("allows term review while undeployed but disables the onchain creation action", async () => {
    const gateway = api({ deployment: null });
    render(
      <WalletContext.Provider value={wallet(session(seller))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    await fillOrderForm();
    expect(
      screen.getByRole("button", { name: "Testnet integration pending" }),
    ).toBeDisabled();
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it("keeps a failed seller signature from producing an order link", async () => {
    const gateway = api({
      create: vi.fn(async () => {
        throw { code: 4001 };
      }),
    });
    render(
      <WalletContext.Provider value={wallet(session(seller))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    const user = await fillOrderForm();
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "declined the wallet request",
    );
    expect(
      screen.queryByText("Your order link is ready."),
    ).not.toBeInTheDocument();
  });
  it("creates a shareable checkout link only when the confirmed gateway returns an order ID", async () => {
    const gateway = api();
    render(
      <WalletContext.Provider value={wallet(session(seller))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    const user = await fillOrderForm();
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    await screen.findByText("Your order link is ready.");
    expect(
      (screen.getByLabelText("Shareable checkout link") as HTMLInputElement)
        .value,
    ).toContain(id);
    expect(gateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1_000_001n,
        buyer,
        reviewer,
        description: text,
      }),
      expect.objectContaining({ account: seller }),
      expect.any(Function),
    );
  });
  it("requires a new review when the selected seller wallet changes", async () => {
    const gateway = api();
    const view = render(
      <WalletContext.Provider value={wallet(session(seller))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    await fillOrderForm();
    view.rerender(
      <WalletContext.Provider value={wallet(session(buyer))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByText("REVIEW BEFORE YOU CREATE"),
      ).not.toBeInTheDocument(),
    );
    expect(gateway.create).not.toHaveBeenCalled();
  });
});

function WalletProbe() {
  const w = useWallet();
  return (
    <>
      <p>{w.session?.account || "Disconnected"}</p>
      <p>{w.error}</p>
      <button onClick={() => void w.connect()}>Connect</button>
    </>
  );
}
describe("injected wallet lifecycle", () => {
  it("handles accountsChanged and disconnect without signing any message or transaction", async () => {
    const listeners = new Map<string, (value: unknown) => void>();
    let accounts: string[] = [];
    window.ethereum = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return "0x14a34";
        if (method === "eth_requestAccounts") accounts = [buyer];
        return accounts;
      }),
      on: (name, callback) => {
        listeners.set(name, callback);
      },
      removeListener: (name) => {
        listeners.delete(name);
      },
    };
    const provider = window.ethereum;
    const view = render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText(buyer);
    accounts = [seller];
    await act(async () => {
      listeners.get("accountsChanged")?.(accounts);
    });
    await screen.findByText(seller);
    await act(async () => {
      listeners.get("disconnect")?.(undefined);
    });
    await screen.findByText("Disconnected");
    expect(
      vi
        .mocked(provider.request)
        .mock.calls.every(
          ([args]) => !/sign|sendTransaction/i.test(args.method),
        ),
    ).toBe(true);
    view.unmount();
    expect(listeners.size).toBe(0);
  });
  it("explains a connection rejection without displaying a connected account", async () => {
    window.ethereum = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") throw { code: 4001 };
        return method === "eth_chainId" ? "0x14a34" : [];
      }),
    };
    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText(/declined the wallet request/);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });
});

describe("seller draft recovery", () => {
  const draftKey = () => orderDraftKey(session(seller), api().deployment)!;
  const createView = (gateway = api(), connected = wallet(session(seller))) =>
    render(
      <WalletContext.Provider value={connected}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
  it("restores every edited field after refresh without restoring review or sending a transaction", async () => {
    const gateway = api();
    const view = createView(gateway);
    await fillOrderForm();
    const saved = JSON.parse(localStorage.getItem(draftKey())!).form;
    view.unmount();
    createView(gateway);
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(
      saved.description,
    );
    expect(screen.getByLabelText(/Order amount/)).toHaveValue(saved.amount);
    expect(screen.getByLabelText("Buyer’s wallet address")).toHaveValue(
      saved.buyer,
    );
    expect(
      screen.getByLabelText("Agreed reviewer’s wallet address"),
    ).toHaveValue(saved.reviewer);
    expect(screen.getByLabelText("Buyer must reserve by")).toHaveValue(
      saved.fundingCutoff,
    );
    expect(
      screen.getByLabelText("Payment release & review deadline"),
    ).toHaveValue(saved.expiry);
    expect(screen.getByText(/Incomplete draft restored/)).toBeInTheDocument();
    expect(
      screen.queryByText("REVIEW BEFORE YOU CREATE"),
    ).not.toBeInTheDocument();
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it("isolates account/network/disconnect changes and restores the original account's draft", async () => {
    const gateway = api();
    const view = createView(gateway);
    await fillOrderForm();
    const rerender = (connected: ReturnType<typeof wallet>) =>
      view.rerender(
        <WalletContext.Provider value={connected}>
          <CreateOrder api={gateway} />
        </WalletContext.Provider>,
      );
    for (const connected of [
      wallet(session(buyer)),
      wallet(session(seller, 1)),
      wallet(null),
    ]) {
      rerender(connected);
      expect(screen.getByLabelText("What is this order for?")).toHaveValue("");
      expect(
        screen.queryByText("REVIEW BEFORE YOU CREATE"),
      ).not.toBeInTheDocument();
    }
    rerender(wallet(session(seller)));
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it.each([
    ["amount", "0", "positive amount"],
    ["buyer", seller, "different wallets"],
    ["reviewer", "not-an-address", "reviewer’s complete"],
    ["description", " ", "Describe the order"],
    ["fundingCutoff", "2000-01-01T12:00", "future deadlines"],
    ["expiry", "2099-01-01T12:00", "future deadlines"],
  ])(
    "revalidates restored %s without trusting a previous review",
    async (name, value, message) => {
      const view = createView();
      await fillOrderForm();
      view.unmount();
      const stored = JSON.parse(localStorage.getItem(draftKey())!);
      stored.form[name] = value;
      stored.terms = { approved: true };
      stored.created = id;
      localStorage.setItem(draftKey(), JSON.stringify(stored));
      const gateway = api();
      createView(gateway);
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(
        screen.queryByText("Your order link is ready."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("REVIEW BEFORE YOU CREATE"),
      ).not.toBeInTheDocument();
      expect(gateway.create).not.toHaveBeenCalled();
    },
  );
  it("revalidates a deadline that expires between review and creation", async () => {
    const gateway = api();
    createView(gateway);
    const user = await fillOrderForm();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400_000);
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "future deadlines",
    );
    expect(gateway.create).not.toHaveBeenCalled();
    expect(localStorage.getItem(draftKey())).toContain(text);
  });
  it.each([
    "wallet upgrade replaced the order",
    "Receipt timed out",
    "execution reverted",
    "User rejected request",
  ])("retains the draft after %s", async (message) => {
    const gateway = api({
      create: vi.fn(async () => {
        throw new Error(message);
      }),
    });
    const view = createView(gateway);
    const user = await fillOrderForm();
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(
      screen.queryByText("Your order link is ready."),
    ).not.toBeInTheDocument();
    view.unmount();
    createView(gateway);
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });
  it("keeps pending drafts and ignores an old completion after account changes", async () => {
    let finish!: (value: typeof id) => void;
    const gateway = api({
      create: vi.fn(async (_terms, _session, update) => {
        update({ phase: "pending", hash, message: "Waiting" });
        return new Promise<typeof id>((resolve) => {
          finish = resolve;
        });
      }),
    });
    const view = createView(gateway);
    const user = await fillOrderForm();
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    expect(localStorage.getItem(draftKey())).toContain(text);
    expect(screen.getByLabelText("What is this order for?")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear draft" })).toBeDisabled();
    view.rerender(
      <WalletContext.Provider value={wallet(session(buyer))}>
        <CreateOrder api={gateway} />
      </WalletContext.Provider>,
    );
    await act(async () => {
      finish(id);
    });
    expect(
      screen.queryByText("Your order link is ready."),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(draftKey())).toContain(text);
  });
  it("restores a draft refreshed during a pending transaction without resubmitting or assuming success", async () => {
    let finish!: (value: typeof id) => void;
    const gateway = api({
      create: vi.fn(async (_terms, _session, update) => {
        update({ phase: "pending", hash, message: "Waiting" });
        return new Promise<typeof id>((resolve) => {
          finish = resolve;
        });
      }),
    });
    const view = createView(gateway);
    const user = await fillOrderForm();
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    view.unmount();
    createView(gateway);
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(
      screen.queryByText("REVIEW BEFORE YOU CREATE"),
    ).not.toBeInTheDocument();
    expect(gateway.create).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(id);
    });
    expect(
      screen.queryByText("Your order link is ready."),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(draftKey())).toContain(text);
  });
  it("clears the scoped draft only on verified creation or explicit clear", async () => {
    const gateway = api();
    const view = createView(gateway);
    const user = await fillOrderForm();
    localStorage.setItem("other-account-draft", "preserve");
    await user.click(
      screen.getByRole("button", { name: "Create order on Base Sepolia" }),
    );
    await screen.findByText("Your order link is ready.");
    expect(localStorage.getItem(draftKey())).toBeNull();
    expect(localStorage.getItem("other-account-draft")).toBe("preserve");
    view.unmount();
    createView(gateway);
    fireEvent.change(screen.getByLabelText("What is this order for?"), {
      target: { value: text },
    });
    await user.click(screen.getByRole("button", { name: "Clear draft" }));
    expect(localStorage.getItem(draftKey())).toBeNull();
    expect(screen.getByLabelText("What is this order for?")).toHaveValue("");
  });
  it("shows storage failure without claiming the draft was saved", () => {
    createView();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    fireEvent.change(screen.getByLabelText("What is this order for?"), {
      target: { value: text },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not save this draft",
    );
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(
      screen.queryByText(/Draft saved on this device/),
    ).not.toBeInTheDocument();
  });
});
