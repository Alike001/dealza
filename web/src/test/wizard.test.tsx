import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateOrder } from "../components/CreateOrder";
import { CheckoutProgress } from "../components/PaymentGuidance";
import { WalletContext } from "../lib/wallet";
import {
  orderDraftKey,
  readDraftStage,
  writeDraftStage,
} from "../lib/orderDraft";
import {
  api,
  buyer,
  seller,
  reviewer,
  wallet,
  session,
  text,
  id,
  hash,
  snapshot,
} from "./fixtures";

function mount(gateway = api()) {
  return render(
    <WalletContext.Provider value={wallet(session(seller))}>
      <CreateOrder api={gateway} />
    </WalletContext.Provider>,
  );
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
function details() {
  fireEvent.change(screen.getByLabelText("What is this order for?"), {
    target: { value: text },
  });
  fireEvent.change(screen.getByLabelText(/Order amount/), {
    target: { value: "1" },
  });
}
function people() {
  fireEvent.change(screen.getByLabelText("Buyer’s wallet address"), {
    target: { value: buyer },
  });
  fireEvent.change(screen.getByLabelText("Agreed reviewer’s wallet address"), {
    target: { value: reviewer },
  });
}
function review() {
  details();
  click("Continue");
  people();
  click("Continue");
  fireEvent.change(screen.getByLabelText("Buyer must reserve by"), {
    target: {
      value: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    },
  });
  fireEvent.change(screen.getByLabelText("Payment release & review deadline"), {
    target: {
      value: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
    },
  });
  click("Review order");
}
describe("guided agreement creation", () => {
  it("shows one stage, validates amount, and focuses the new heading", () => {
    mount();
    details();
    fireEvent.change(screen.getByLabelText(/Order amount/), {
      target: { value: "0" },
    });
    click("Continue");
    expect(screen.getByRole("alert")).toHaveTextContent("positive amount");
    expect(
      screen.queryByLabelText("Buyer’s wallet address"),
    ).not.toBeInTheDocument();
    details();
    click("Continue");
    expect(
      screen.getByRole("heading", { name: "People involved" }),
    ).toHaveFocus();
    expect(
      screen.queryByLabelText("What is this order for?"),
    ).not.toBeInTheDocument();
    click("Continue");
    expect(screen.getByRole("alert")).toHaveTextContent("buyer’s complete");
  });
  it("keeps description and amount when navigating back", () => {
    mount();
    details();
    click("Continue");
    click("Back");
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(screen.getByLabelText(/Order amount/)).toHaveValue("1");
  });
  it("restores progress after refresh without trusting review or success", () => {
    const gateway = api(),
      view = mount(gateway);
    details();
    click("Continue");
    people();
    click("Continue");
    view.unmount();
    mount(gateway);
    expect(screen.getByLabelText("Buyer must reserve by")).toBeInTheDocument();
    expect(
      screen.queryByText("REVIEW BEFORE YOU CREATE"),
    ).not.toBeInTheDocument();
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it("caps corrupt progress and refuses to skip invalid earlier fields", () => {
    const key = orderDraftKey(session(seller), api().deployment)!;
    localStorage.setItem(`${key}:progress`, "4");
    expect(readDraftStage(key)).toBe(0);
    writeDraftStage(key, 3);
    expect(readDraftStage(key)).toBe(2);
    mount();
    expect(
      screen.getByLabelText("What is this order for?"),
    ).toBeInTheDocument();
  });
  it("renders a dedicated review with fingerprint and allows edits before signing", () => {
    const gateway = api();
    mount(gateway);
    review();
    expect(
      screen.queryByLabelText("What is this order for?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Terms fingerprint")).toBeInTheDocument();
    click("Edit Agreement details");
    expect(screen.getByLabelText("What is this order for?")).toHaveValue(text);
    expect(
      screen.queryByRole("button", { name: "Create order on Base Sepolia" }),
    ).not.toBeInTheDocument();
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it("does not expose success on submission and shows a receipt after verified completion", async () => {
    let finish!: () => void;
    const gateway = api({
      create: vi.fn(async (_terms, _session, update) => {
        update({ phase: "signature", message: "Awaiting wallet" });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        update({ phase: "pending", hash, message: "Submitted" });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        update({
          phase: "confirmed",
          hash,
          message: "Receipt and terms verified",
        });
        return id;
      }),
    });
    mount(gateway);
    review();
    click("Create order on Base Sepolia");
    expect(
      screen.queryByLabelText("Shareable checkout link"),
    ).not.toBeInTheDocument();
    await act(async () => finish());
    expect(
      screen.getByText("Transaction submitted — verification pending"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Shareable checkout link"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Agreement details" }),
    ).toBeDisabled();
    await act(async () => finish());
    expect(
      (screen.getByLabelText("Shareable checkout link") as HTMLInputElement)
        .value,
    ).toContain(id);
    expect(
      screen.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute("href", expect.stringContaining(hash));
    expect(
      localStorage.getItem(orderDraftKey(session(seller), gateway.deployment)!),
    ).toBeNull();
  });
});

describe("authoritative checkout progress", () => {
  it("moves the active step only when a new chain snapshot is provided", () => {
    const s = snapshot({
      collected: false,
      held: 0n,
      derived: 1,
      preApproved: false,
    });
    s.order.status = 1;
    const view = render(<CheckoutProgress snapshot={s} />);
    const current = () =>
      within(screen.getByRole("region", { name: "Payment progress" }))
        .getByText("Exact USDC allowance")
        .closest("li");
    expect(current()).toHaveAttribute("aria-current", "step");
    view.rerender(
      <CheckoutProgress
        snapshot={{ ...s, allowance: s.order.payment.maxAmount }}
      />,
    );
    expect(screen.getByText("Pre-approve terms").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    view.rerender(<CheckoutProgress snapshot={{ ...s, preApproved: true }} />);
    expect(screen.getByText("Reserve USDC").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
  it("explains expiry during a dispute without implying automatic recovery", () => {
    const s = snapshot({ derived: 6, chainTime: 3000 });
    s.order.status = 3;
    render(<CheckoutProgress snapshot={s} />);
    expect(screen.getByText(/Expiry has passed/)).toHaveTextContent(
      "require buyer recovery",
    );
  });
});

describe("settled payment presentation", () => {
  it("does not warn of an active reserve expiry after verified capture", () => {
    const s = snapshot({
      derived: 4,
      held: 0n,
      captured: 1000000n,
      chainTime: 4000,
    });
    s.order.status = 4;
    render(<CheckoutProgress snapshot={s} />);
    expect(
      screen.getByText(/No active reserve deadline remains/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Expiry has passed/)).not.toBeInTheDocument();
  });
});
