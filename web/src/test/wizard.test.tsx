import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateOrder } from "../components/CreateOrder";
import { CheckoutProgress } from "../components/PaymentGuidance";
import { WalletContext } from "../lib/wallet";
import { descriptionHash, shareLink } from "../lib/domain";
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
  it("announces completion, previews reviewer and deadlines, and groups the final review", () => {
    mount();
    details();
    click("Continue");
    expect(
      screen.getByText("Step 2 of 5 · People involved"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 5 steps complete")).toBeInTheDocument();
    people();
    const summary = screen.getByRole("region", { name: "Agreement summary" });
    expect(within(summary).getByText(buyer)).toBeInTheDocument();
    expect(within(summary).getByText(reviewer)).toBeInTheDocument();
    click("Continue");
    fireEvent.change(screen.getByLabelText("Buyer must reserve by"), {
      target: {
        value: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      },
    });
    fireEvent.change(
      screen.getByLabelText("Payment release & review deadline"),
      {
        target: {
          value: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
        },
      },
    );
    expect(within(summary).getByText("Reserve by")).toBeInTheDocument();
    expect(
      within(summary).getByText("Release / review before"),
    ).toBeInTheDocument();
    click("Review order");
    for (const name of [
      "Agreement details",
      "Participants",
      "Deadlines",
      "Financial safeguards",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "1 test USDC" }),
    ).toHaveFocus();
  });
  it("keeps draft actions tucked away and supports keyboard step changes", async () => {
    mount();
    expect(
      screen.getByText("Draft options").closest("details"),
    ).not.toHaveAttribute("open");
    details();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    continueButton.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "People involved" }),
    ).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("Buyer’s wallet address")).toHaveFocus();
    const back = screen.getByRole("button", {
      name: /Return to Agreement details/,
    });
    back.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Agreement details" }),
    ).toHaveFocus();
    await userEvent.click(screen.getByText("Draft options"));
    expect(
      screen.getByText("Draft options").closest("details"),
    ).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Clear draft" })).toBeEnabled();
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
        // The safety save must still happen before the gateway/wallet request.
        expect(
          localStorage.getItem(
            orderDraftKey(session(seller), gateway.deployment)!,
          ),
        ).toContain(text);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
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
    expect(screen.getByText("Draft saved on this device.")).toBeInTheDocument();
    expect(screen.getByText(descriptionHash(text))).toBeInTheDocument();
    const key = orderDraftKey(session(seller), gateway.deployment)!;
    localStorage.removeItem(key);
    click("Create order on Base Sepolia");
    expect(
      screen.getByText("Checking wallet and agreement."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Draft saved|No order or payment has been created/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Shareable checkout link"),
    ).not.toBeInTheDocument();
    await act(async () => finish());
    expect(
      screen.getByText("Review the order-creation request in MetaMask."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Review in your wallet")).toHaveLength(1);
    expect(
      screen.queryByText(
        /Checking wallet|Draft saved|No order or payment has been created|Waiting for your transaction/,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Creation in progress…" }),
    ).toBeDisabled();
    click("Creation in progress…");
    expect(gateway.create).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(
      screen.getByText("Transaction submitted — verification pending"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Shareable checkout link"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Transaction submitted. Waiting for Base Sepolia confirmation. Do not submit again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /View transaction/ }),
    ).toHaveLength(1);
    expect(
      screen.queryByText(
        /Draft saved|No order or payment has been created|Review in your wallet|Waiting for your transaction/,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Agreement details" }),
    ).toBeDisabled();
    click("Creation in progress…");
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toContain(text);
    await act(async () => finish());
    expect(
      (screen.getByLabelText("Shareable checkout link") as HTMLInputElement)
        .value,
    ).toBe(shareLink(id, text));
    expect(
      screen.getByText("Receipt and effects verified"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Draft saved|No order or payment has been created|Review in your wallet|Transaction submitted/,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("5 of 5 steps complete")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your order link is ready." }),
    ).toHaveFocus();
    expect(
      screen.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute("href", expect.stringContaining(hash));
    expect(
      localStorage.getItem(orderDraftKey(session(seller), gateway.deployment)!),
    ).toBeNull();
  });
  it.each(["retained", "thrown"])(
    "warns before retrying an unverified transaction with a %s hash and keeps recovery available",
    async (source) => {
      const gateway = api({
        create: vi.fn(async (_terms, _session, update) => {
          if (source === "retained") {
            update({ phase: "pending", hash, message: "Submitted" });
          }
          throw Object.assign(
            new Error("Receipt verification unavailable."),
            source === "thrown" ? { hash } : {},
          );
        }),
      });
      const view = mount(gateway);
      review();
      await act(async () => click("Create order on Base Sepolia"));
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Receipt verification unavailable.");
      expect(alert).toHaveTextContent(
        "Verify the transaction before retrying order creation.",
      );
      expect(alert).toHaveTextContent(
        "Do not submit again while it remains unverified.",
      );
      expect(
        within(alert).getByRole("link", { name: /View transaction/ }),
      ).toHaveAttribute("href", expect.stringContaining(hash));
      expect(
        screen.queryByText(
          /Draft saved|No order or payment has been created|Review in your wallet|Waiting for your transaction/,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Shareable checkout link"),
      ).not.toBeInTheDocument();
      expect(
        localStorage.getItem(
          orderDraftKey(session(seller), gateway.deployment)!,
        ),
      ).toContain(text);
      view.unmount();
      mount(gateway);
      expect(screen.getByText(/Incomplete draft restored/)).toHaveTextContent(
        "check My orders before retrying",
      );
      click("Back");
      expect(screen.getByLabelText("Buyer’s wallet address")).toHaveValue(
        buyer,
      );
      click("Back");
      expect(screen.getByLabelText("What is this order for?")).toHaveValue(
        text,
      );
      expect(gateway.create).toHaveBeenCalledTimes(1);
    },
  );
  it("shows a wallet rejection without a stale draft or a confirmation", async () => {
    const gateway = api({
      create: vi.fn(async () => {
        throw new Error("Wallet request rejected");
      }),
    });
    mount(gateway);
    review();
    await act(async () => click("Create order on Base Sepolia"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Wallet request rejected",
    );
    expect(
      screen.queryByText(/Draft saved|No order or payment has been created/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /View transaction/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Shareable checkout link"),
    ).not.toBeInTheDocument();
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
