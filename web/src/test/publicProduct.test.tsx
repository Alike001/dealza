import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { WalletContext } from "../lib/wallet";
import { orderDraftKey } from "../lib/orderDraft";
import { beginIntent, pendingIntent } from "../lib/pendingTransaction";
import { network } from "../lib/config";
import {
  api,
  buyer,
  hash,
  id,
  operator,
  seller,
  session,
  snapshot,
  text,
  wallet,
} from "./fixtures";

function mount(connected = wallet(null), gateway = api()) {
  const view = render(
    <WalletContext.Provider value={connected}>
      <App api={gateway} />
    </WalletContext.Provider>,
  );
  return { ...view, gateway };
}
async function navigate(path: string) {
  await act(async () => {
    location.hash = path;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("public product and preserved checkout boundaries", () => {
  it("keeps the public landing wallet-free and links to the real application", () => {
    const { gateway } = mount();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Make online deals clearer before money moves.",
    );
    expect(
      screen.getAllByRole("link", { name: /Create an agreement/ })[0],
    ).toHaveAttribute("href", "#/create");
    expect(
      screen.getByRole("link", { name: "Open your orders" }),
    ).toHaveAttribute("href", "#/orders");
    expect(gateway.loadOrder).not.toHaveBeenCalled();
    expect(gateway.listOrders).not.toHaveBeenCalled();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("opens a complete shared link from the dashboard without dropping its terms", async () => {
    location.hash = "/orders";
    const { gateway } = mount();
    const user = userEvent.setup();
    const link = `${location.origin}/#/order/${id}?terms=${encodeURIComponent(text)}`;
    await user.type(screen.getByLabelText("Order link or ID"), link);
    await user.click(screen.getByRole("button", { name: /Open order/ }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(location.hash).toContain(`/order/${id}?terms=`);
    expect(new URLSearchParams(location.hash.split("?")[1]).get("terms")).toBe(
      text,
    );
    expect(gateway.act).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
  it("returns keyboard focus to the wallet trigger on Escape", async () => {
    mount();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: "Connect wallet",
    });
    await user.click(trigger);
    expect(
      screen.getByRole("region", { name: "Wallet connection" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "Wallet connection" }),
    ).not.toBeInTheDocument();
  });
  it("retains an unresolved intent across marketing, dashboard and help navigation", async () => {
    beginIntent({
      version: 1,
      actor: buyer,
      operator,
      target: operator,
      data: "0x1234",
      action: "release",
      before: snapshot(),
      proof: hash,
      hash,
    });
    const { gateway } = mount(wallet());
    await screen.findByText(/unresolved release/);
    for (const route of ["/orders", "/help", "/"]) {
      await navigate(route);
      expect(screen.getByText(/unresolved release/)).toBeInTheDocument();
      expect(pendingIntent(buyer, operator)?.hash).toBe(hash);
    }
    expect(gateway.resumePending).not.toHaveBeenCalled();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("restores the seller draft after leaving and returning to creation", async () => {
    location.hash = "/create";
    const { gateway } = mount(wallet(session(seller)));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("What is this order for?"), text);
    const draft = localStorage.getItem(
      orderDraftKey(session(seller), gateway.deployment)!,
    );
    await navigate("/orders");
    await navigate("/create");
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(
      localStorage.getItem(orderDraftKey(session(seller), gateway.deployment)!),
    ).toBe(draft);
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it("shows the exact approval spender and cap before requesting a signature", async () => {
    location.hash = `/order/${id}?terms=${encodeURIComponent(text)}`;
    const created = snapshot({
      collected: false,
      held: 0n,
      captured: 0n,
      derived: 1,
      preApproved: false,
    });
    created.order.status = 1;
    const { gateway } = mount(
      wallet(),
      api({ loadOrder: async () => created }),
    );
    const user = userEvent.setup();
    await screen.findByText("Awaiting payment");
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "1. Allow exactly this USDC amount" }),
    );
    const review = screen.getByRole("region", { name: "Review wallet action" });
    expect(within(review).getByText(network.collector)).toBeInTheDocument();
    expect(
      within(review).getByText("1 USDC · exact amount, not unlimited"),
    ).toBeInTheDocument();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("continues blocking approval after a network change", async () => {
    location.hash = `/order/${id}?terms=${encodeURIComponent(text)}`;
    const created = snapshot({
      collected: false,
      held: 0n,
      captured: 0n,
      derived: 1,
    });
    created.order.status = 1;
    const gateway = api({ loadOrder: async () => created });
    const { rerender } = mount(wallet(), gateway);
    const user = userEvent.setup();
    await screen.findByText("Awaiting payment");
    await user.click(screen.getByRole("checkbox"));
    rerender(
      <WalletContext.Provider value={wallet(session(buyer, 1))}>
        <App api={gateway} />
      </WalletContext.Provider>,
    );
    expect(
      screen.getByRole("button", { name: "1. Allow exactly this USDC amount" }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("shows verified settlement after a fresh mount without offering release", async () => {
    location.hash = `/order/${id}?terms=${encodeURIComponent(text)}`;
    const paid = snapshot({ held: 0n, captured: 1_000_000n, derived: 4 });
    paid.order.status = 4;
    const gateway = api({ loadOrder: async () => paid });
    const first = mount(wallet(), gateway);
    await screen.findByText("Paid to seller");
    first.unmount();
    mount(wallet(), gateway);
    await screen.findByText("Paid to seller");
    expect(screen.getByText("0 USDC")).toBeInTheDocument();
    expect(screen.getByText("1 USDC")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve release to seller" }),
    ).not.toBeInTheDocument();
  });
});
