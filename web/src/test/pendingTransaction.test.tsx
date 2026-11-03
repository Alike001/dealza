import { OrderPage } from "../components/OrderPage";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  beginIntent,
  saveIntent,
  pendingIntent,
  clearIntent,
  rememberCreation,
  savedCreation,
  type Intent,
} from "../lib/pendingTransaction";
import { PendingTransaction } from "../components/PendingTransaction";
import { WalletContext } from "../lib/wallet";
import {
  api,
  buyer,
  seller,
  hash,
  id,
  operator,
  session,
  snapshot,
  wallet,
} from "./fixtures";
const intent = (): Intent => ({
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
describe("durable pending submissions", () => {
  it("retains exact BigInt order context and hash across refresh", () => {
    beginIntent(intent());
    expect(pendingIntent(buyer, operator)).toEqual(intent());
    expect(pendingIntent(seller, operator)).toBeNull();
    expect(() => beginIntent(intent())).toThrow("unresolved");
  });
  it("fails closed when storage is corrupt or unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("storage unavailable");
      });
    expect(() => beginIntent(intent())).toThrow("storage unavailable");
    spy.mockRestore();
    saveIntent(intent());
    localStorage.setItem(`dealza:pending:84532:${operator}:${buyer}`, "broken");
    expect(() => pendingIntent(buyer, operator)).toThrow("cannot be read");
  });
  it("remembers verified creation without overriding another account", () => {
    const saved = intent();
    rememberCreation(saved, id);
    expect(savedCreation(buyer, operator, saved.data)).toBe(id);
    expect(savedCreation(seller, operator, saved.data)).toBeNull();
    clearIntent(saved);
  });
  it("restores the saved hash and only performs a read-only recheck", async () => {
    const saved = intent();
    saveIntent(saved);
    const gateway = api({
      resumePending: vi.fn(async (_session, update) => {
        update({ phase: "confirmed", hash, message: "Verified" });
        clearIntent(saved);
        return undefined;
      }),
    });
    const view = () => (
      <WalletContext.Provider value={wallet()}>
        <PendingTransaction api={gateway} />
      </WalletContext.Provider>
    );
    const first = render(view());
    await screen.findByText(/unresolved release/);
    first.unmount();
    render(view());
    expect(await screen.findByPlaceholderText(hash)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Recheck saved transaction/ }),
    );
    await screen.findByText("Verified");
    expect(gateway.act).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
    expect(gateway.resumePending).toHaveBeenCalledTimes(1);
  });
  it("does not expose a prior wallet result when accounts switch while checking", async () => {
    saveIntent(intent());
    let finish!: (v: undefined) => void;
    const gateway = api({
      resumePending: vi.fn(() => new Promise<undefined>((r) => (finish = r))),
    });
    const view = (account = buyer) => (
      <WalletContext.Provider value={wallet(session(account))}>
        <PendingTransaction api={gateway} />
      </WalletContext.Provider>
    );
    const { rerender } = render(view());
    await screen.findByText(/unresolved release/);
    await userEvent.click(
      screen.getByRole("button", { name: /Recheck saved transaction/ }),
    );
    rerender(view(seller));
    await act(async () => finish(undefined));
    expect(screen.queryByText(/unresolved release/)).not.toBeInTheDocument();
    expect(pendingIntent(buyer, operator)).not.toBeNull();
  });
  it("disables rechecking on a different network and never signs", async () => {
    saveIntent(intent());
    const gateway = api();
    render(
      <WalletContext.Provider value={wallet(session(buyer, 1))}>
        <PendingTransaction api={gateway} />
      </WalletContext.Provider>,
    );
    expect(
      await screen.findByRole("button", { name: /Recheck saved transaction/ }),
    ).toBeDisabled();
    expect(gateway.resumePending).not.toHaveBeenCalled();
  });
  it("retains unknown-hash requests rather than permitting a duplicate signature", async () => {
    saveIntent({ ...intent(), hash: undefined });
    const gateway = api();
    render(
      <WalletContext.Provider value={wallet()}>
        <PendingTransaction api={gateway} />
      </WalletContext.Provider>,
    );
    await screen.findByText(/did not return a hash/);
    expect(() => beginIntent(intent())).toThrow("unresolved");
    expect(gateway.act).not.toHaveBeenCalled();
  });
});

it("disables payment submission controls when a durable request remains unresolved", async () => {
  saveIntent(intent());
  const gateway = api();
  render(
    <WalletContext.Provider value={wallet()}>
      <OrderPage id={id} description="" api={gateway} />
    </WalletContext.Provider>,
  );
  await screen.findByText("Payment reserved");
  await userEvent.click(screen.getByRole("checkbox"));
  expect(
    screen.getByRole("button", {
      name: "Approve release to seller",
    }),
  ).toBeDisabled();
  expect(gateway.act).not.toHaveBeenCalled();
});
