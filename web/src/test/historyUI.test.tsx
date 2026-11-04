import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { OrderPage } from "../components/OrderPage";
import { WalletContext } from "../lib/wallet";
import type { Activity } from "../lib/domain";
import {
  api,
  buyer,
  seller,
  id,
  hash,
  snapshot,
  session,
  wallet,
  text,
} from "./fixtures";
const event = (n: number): Activity => ({
  name: "OrderReleased",
  hash,
  logIndex: n,
  block: 500n - BigInt(n),
  timestamp: 1500,
  detail: "Confirmed on Base Sepolia",
});

describe("history presentation and interruption", () => {
  it("loads older activity without duplicates, retries a failed page and names the end", async () => {
    const user = userEvent.setup(),
      activity = vi
        .fn()
        .mockResolvedValueOnce({ items: [event(0)], through: 500n, next: 299n })
        .mockRejectedValueOnce(Error("RPC unavailable"))
        .mockResolvedValueOnce({ items: [event(0), event(1)], through: 299n });
    const gateway = api({ activity });
    render(
      <WalletContext.Provider value={wallet()}>
        <OrderPage id={id} description={text} api={gateway} />
      </WalletContext.Provider>,
    );
    await screen.findByText(/Recent activity only/);
    await user.click(
      screen.getByRole("button", { name: "Load earlier activity" }),
    );
    await screen.findByText(/History is incomplete/);
    expect(screen.getAllByText("Release recorded")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Retry history" }));
    await screen.findByText(/End of history/);
    expect(screen.getAllByText("Release recorded")).toHaveLength(2);
    expect(activity.mock.calls[1][1]).toBe(299n);
    expect(activity.mock.calls[2][1]).toBe(299n);
  });
  it("discards an older page after an account/network switch", async () => {
    const user = userEvent.setup();
    let finish!: (x: unknown) => void;
    const activity = vi
      .fn()
      .mockResolvedValueOnce({ items: [event(0)], through: 500n, next: 299n })
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockResolvedValue({ items: [], through: 600n });
    const gateway = api({ activity });
    const view = (account = buyer, chain = 84532) => (
      <WalletContext.Provider value={wallet(session(account, chain))}>
        <OrderPage id={id} description={text} api={gateway} />
      </WalletContext.Provider>
    );
    const { rerender } = render(view());
    await screen.findByText("Release recorded");
    await user.click(
      screen.getByRole("button", { name: "Load earlier activity" }),
    );
    const oldSignal = activity.mock.calls[1][2] as AbortSignal;
    rerender(view(seller, 1));
    await waitFor(() => expect(oldSignal.aborted).toBe(true));
    await act(async () => finish({ items: [event(1)], through: 299n }));
    expect(screen.queryByText("Release recorded")).not.toBeInTheDocument();
    expect(screen.getByText(/You’re the seller/)).toBeInTheDocument();
  });
  it("does not refetch a history window on every current-state poll", async () => {
    const gateway = api();
    render(
      <WalletContext.Provider value={wallet()}>
        <OrderPage id={id} description={text} api={gateway} />
      </WalletContext.Provider>,
    );
    await screen.findByText(/End of history/);
    expect(gateway.activity).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    vi.mocked(gateway.loadOrder).mockResolvedValue(snapshot({ block: 501n }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    vi.useRealTimers();
    expect(gateway.activity).toHaveBeenCalledTimes(1);
    // Explicit refresh still loads a new recent window.
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh history" }),
    );
    await waitFor(() => expect(gateway.activity).toHaveBeenCalledTimes(2));
  });
  it("renders current Released and Voided summaries and prevents stale discovery after switching", async () => {
    window.location.hash = "/orders";
    const user = userEvent.setup();
    let finish!: (x: unknown) => void;
    const item = {
      id,
      seller,
      buyer,
      reviewer: seller,
      amount: 1000000n,
      expiry: 3000,
      block: 100n,
      status: "Paid to seller",
    };
    const listOrders = vi
      .fn()
      .mockResolvedValueOnce({ items: [item], through: 500n, next: 299n })
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockResolvedValueOnce({
        items: [{ ...item, status: "Cancelled" }],
        through: 600n,
      });
    const gateway = api({ listOrders });
    const view = (account = buyer, chain = 84532) => (
      <WalletContext.Provider value={wallet(session(account, chain))}>
        <App api={gateway} />
      </WalletContext.Provider>
    );
    const { rerender } = render(view());
    await screen.findByText(/You are buying.*Paid to seller/);
    await user.click(
      screen.getByRole("button", { name: "Load earlier orders" }),
    );
    rerender(view(seller, 1));
    await screen.findByText(/You are selling.*Cancelled/);
    await act(async () =>
      finish({ items: [{ ...item, id: hash }], through: 299n }),
    );
    expect(screen.queryByText(/You are buying/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Order 0x/ })).toHaveLength(1);
  });
});
