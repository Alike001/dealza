import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Hash } from "viem";
import App from "../App";
import { OrderPage } from "../components/OrderPage";
import { GenuineJourneys } from "../components/GenuineJourneys";
import { CompletedPaymentEvidence } from "../components/CompletedPaymentEvidence";
import {
  CompletedOutcome,
  completedOrderTitle,
} from "../components/PaymentGuidance";
import { genuineJourneys } from "../components/genuineJourneys";
import { descriptionHash, shareLink, type OrderSnapshot } from "../lib/domain";
import { WalletContext } from "../lib/wallet";
import recorded from "./recorded/judge-outcomes.json";
import { api, id, snapshot, wallet } from "./fixtures";

function realSnapshot(row = recorded.cases[0]): OrderSnapshot {
  const s = row.snapshot;
  return {
    ...s,
    id: s.id as Hash,
    order: {
      ...s.order,
      payment: {
        ...s.order.payment,
        maxAmount: BigInt(s.order.payment.maxAmount),
        salt: BigInt(s.order.payment.salt),
      },
    } as OrderSnapshot["order"],
    held: BigInt(s.held),
    captured: BigInt(s.captured),
    allowance: BigInt(s.allowance),
    buyerBalance: BigInt(s.buyerBalance),
    buyerGas: BigInt(s.buyerGas),
    storeBalance: BigInt(s.storeBalance),
    tokenStore: s.tokenStore as Hash,
    block: BigInt(s.block),
  };
}
function order(
  s: OrderSnapshot,
  description: string,
  gateway = api({ loadOrder: vi.fn(async () => s) }),
) {
  return {
    ...render(
      <WalletContext.Provider value={wallet(null)}>
        <OrderPage id={s.id} description={description} api={gateway} />
      </WalletContext.Provider>,
    ),
    gateway,
  };
}
function app(gateway = api()) {
  return {
    ...render(
      <WalletContext.Provider value={wallet(null)}>
        <App api={gateway} />
      </WalletContext.Provider>,
    ),
    gateway,
  };
}

describe("two genuine judge journeys", () => {
  it("uses only the audited IDs, original descriptions and twelve real receipt hashes", () => {
    render(<GenuineJourneys />);
    expect(genuineJourneys).toHaveLength(2);
    for (const [i, journey] of genuineJourneys.entries()) {
      const source = recorded.cases[i];
      expect(journey.id).toBe(source.snapshot.id);
      expect(journey.description).toBe(source.description);
      expect(new URLSearchParams(journey.href.split("?")[1]).get("terms")).toBe(
        source.description,
      );
      expect(descriptionHash(journey.description)).toBe(
        source.snapshot.order.descriptionHash,
      );
      expect(journey.receipts.map(([, hash]) => hash)).toEqual(
        source.receiptHashes,
      );
      expect(screen.getByRole("link", { name: journey.label })).toHaveAttribute(
        "href",
        journey.href,
      );
    }
  });
  it.each(["/", "/orders", "/help"])(
    "offers both real outcomes on %s without seeded activity or wallet reads",
    (path) => {
      history.replaceState(null, "", `#${path}`);
      const { gateway } = app();
      const examples = screen.getByRole("region", {
        name: "Genuine payment examples",
      });
      for (const journey of genuineJourneys)
        expect(
          within(examples).getByRole("link", { name: journey.label }),
        ).toHaveAttribute("href", journey.href);
      expect(document.querySelectorAll(".order-row")).toHaveLength(0);
      expect(gateway.listOrders).not.toHaveBeenCalled();
      expect(gateway.loadOrder).not.toHaveBeenCalled();
      expect(gateway.balances).not.toHaveBeenCalled();
      expect(gateway.act).not.toHaveBeenCalled();
      expect(gateway.create).not.toHaveBeenCalled();
      if (path === "/")
        expect(
          screen.getByText(
            /Online deals made in DMs need clearer payment agreements and a way to resolve disputes/,
          ),
        ).toBeInTheDocument();
    },
  );
  it.each(recorded.cases)(
    "shows the genuine $name outcome and settlement receipt without a next-step/connect prompt",
    async (row) => {
      const s = realSnapshot(row);
      const { gateway } = order(s, row.description);
      await screen.findByText(
        row.name === "paid" ? "Paid to seller" : "Returned to buyer",
      );
      expect(screen.getByText("COMPLETED ORDER")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          name: row.name === "paid" ? "Payment complete." : "Reserve returned.",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("YOUR NEXT STEP")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Connect to take part."),
      ).not.toBeInTheDocument();
      expect(document.querySelector(".recommended-action")).toBeNull();
      const panel = document.querySelector(".action-panel") as HTMLElement;
      const recipient =
        row.name === "paid" ? s.order.payment.receiver : s.order.payment.payer;
      expect(within(panel).getByText(recipient)).toBeInTheDocument();
      expect(within(panel).getByText("1 test USDC")).toBeInTheDocument();
      const link = within(panel).getByRole("link", {
        name: /View .* receipt on Base Sepolia/,
      });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute(
        "href",
        `https://sepolia.basescan.org/tx/${row.receiptHashes.at(-1)}`,
      );
      expect(
        screen.getByText("All six transaction receipts").closest("details"),
      ).not.toHaveAttribute("open");
      expect(
        screen.queryByText("The description isn’t included in this link."),
      ).not.toBeInTheDocument();
      expect(gateway.act).not.toHaveBeenCalled();
    },
  );
  it.each(recorded.cases)(
    "keeps archived $name receipts outside the partial history disclosure",
    async (row) => {
      const s = realSnapshot(row);
      order(s, row.description);
      await screen.findByText("Genuine transaction receipts");
      const receiptSection = document.querySelector(".recorded-receipts")!;
      expect(receiptSection.closest("#history-events")).toBeNull();
      await userEvent.click(screen.getByText("All six transaction receipts"));
      const links = within(receiptSection as HTMLElement).getAllByRole("link");
      expect(links).toHaveLength(7);
      for (const hash of row.receiptHashes)
        expect(
          links.some(
            (link) =>
              link.getAttribute("href") ===
              `https://sepolia.basescan.org/tx/${hash}`,
          ),
        ).toBe(true);
    },
  );
  it("does not attach curated receipt evidence to an unknown order", () => {
    render(<CompletedPaymentEvidence id={id} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("closed state distinctions and failures", () => {
  it("does not turn an unfunded cancellation into a payment return", async () => {
    const s = snapshot({
      derived: 5,
      collected: false,
      held: 0n,
      captured: 0n,
      storeBalance: 0n,
    });
    s.order.status = 5;
    order(s, "");
    await screen.findByText("Cancelled");
    expect(
      screen.getByRole("heading", { name: "Order cancelled." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No USDC was reserved or paid/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Returned amount")).not.toBeInTheDocument();
  });
  it("distinguishes buyer expiry recovery from reviewer return", async () => {
    const s = snapshot({
      derived: 7,
      held: 0n,
      captured: 0n,
      storeBalance: 0n,
      chainTime: 3000,
    });
    s.order.status = 3;
    order(s, "");
    await screen.findByText("Recovered by buyer");
    expect(
      screen.getByRole("heading", { name: "Recovery complete." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/buyer recovered the expired/)).toBeInTheDocument();
    expect(screen.queryByText("Reserve returned.")).not.toBeInTheDocument();
  });
  it("does not render a completed outcome from a valid open order", () => {
    const s = snapshot();
    const { container } = render(<CompletedOutcome snapshot={s} />);
    expect(container).toBeEmptyDOMElement();
    expect(completedOrderTitle(s)).toBe("Order details.");
  });
  it.each(recorded.cases)(
    "never creates a false $name success when the initial RPC read fails",
    async (row) => {
      const s = realSnapshot(row),
        gateway = api({
          loadOrder: vi.fn(async () => {
            throw Error("RPC unavailable");
          }),
        });
      order(s, row.description, gateway);
      await screen.findByText("We couldn’t verify this order.");
      expect(document.querySelector(".payment-sheet")).toBeNull();
      expect(screen.queryByText("COMPLETED ORDER")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Genuine transaction receipts"),
      ).not.toBeInTheDocument();
    },
  );
  it("retains known verified settlement with an explicit stale-read warning and recovers", async () => {
    vi.useFakeTimers();
    try {
      const s = realSnapshot();
      const gateway = api({
        loadOrder: vi
          .fn()
          .mockResolvedValueOnce(s)
          .mockRejectedValue(Error("RPC unavailable")),
      });
      order(s, recorded.cases[0].description, gateway);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByText("Paid to seller")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(
        screen.getByText("Latest update unavailable."),
      ).toBeInTheDocument();
      expect(screen.getByText("LAST VERIFIED OUTCOME")).toBeInTheDocument();
      expect(screen.getByText("Paid to seller")).toBeInTheDocument();
      vi.mocked(gateway.loadOrder).mockResolvedValue({
        ...s,
        block: s.block + 1n,
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      });
      expect(
        screen.queryByText("Latest update unavailable."),
      ).not.toBeInTheDocument();
      expect(screen.getByText("COMPLETED ORDER")).toBeInTheDocument();
      expect(gateway.act).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("agreement-link truth and encoding", () => {
  it.each(recorded.cases)(
    "keeps missing $name description unverified even for a known genuine case",
    async (row) => {
      const s = realSnapshot(row);
      order(s, "");
      await screen.findByText("The description isn’t included in this link.");
      expect(
        screen.getByText(
          /This link contains the order ID but no agreement text/,
        ),
      ).toBeInTheDocument();
      expect(document.querySelector(".terms-text")).toBeNull();
      expect(screen.queryByText(row.description)).not.toBeInTheDocument();
      await userEvent.click(screen.getByText("Show share link"));
      expect(screen.getByLabelText("Share link")).toHaveValue(shareLink(s.id));
      expect(
        screen.getByText(/This copy contains the order ID only/),
      ).toBeInTheDocument();
    },
  );
  it("keeps mismatched text unverified and excludes it from copied links", async () => {
    const s = realSnapshot();
    order(s, "An unrelated description");
    await screen.findByText("These linked terms do not match the order.");
    expect(document.querySelector(".terms-text")).toBeNull();
    await userEvent.click(screen.getByText("Show share link"));
    expect(screen.getByLabelText("Share link")).toHaveValue(shareLink(s.id));
  });
  it.each([
    ...recorded.cases.map((row) => row.description),
    'Café & tea + 50% #1? "review" / next ✓',
  ])(
    "preserves full agreement text through URL encoding, copy and a remount: %s",
    async (description) => {
      const user = userEvent.setup(),
        s = realSnapshot();
      s.order = { ...s.order, descriptionHash: descriptionHash(description) };
      const href = shareLink(s.id, description);
      const gateway = api({ loadOrder: vi.fn(async () => s) });
      history.replaceState(null, "", href);
      const mounted = app(gateway);
      await screen.findByText("Paid to seller");
      expect(document.querySelector(".terms-text")).toHaveTextContent(
        description,
      );
      expect(
        screen.queryByText("These linked terms do not match the order."),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Copy link" }));
      const copied = await navigator.clipboard.readText();
      expect(copied).toBe(href);
      expect(
        new URLSearchParams(new URL(copied).hash.split("?")[1]).get("terms"),
      ).toBe(description);
      mounted.unmount();
      app(gateway);
      await screen.findByText("Paid to seller");
      expect(document.querySelector(".terms-text")).toHaveTextContent(
        description,
      );
      expect(gateway.act).not.toHaveBeenCalled();
    },
  );
});

it("does not steal focus from a newly focused field after navigation", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  app();
  await act(async () => {
    history.replaceState(null, "", "#/orders");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  const input = screen.getByLabelText("Order link or ID");
  input.focus();
  act(() => frames.at(-1)!(0));
  expect(input).toHaveFocus();
  await act(async () => {
    history.replaceState(null, "", "#/help");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(cancel).toHaveBeenCalled();
});
