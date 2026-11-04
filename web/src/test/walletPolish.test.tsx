import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import {
  CompletedPaymentEvidence,
  completedPaymentReceipts,
} from "../components/CompletedPaymentEvidence";
import { completedPaymentId } from "../lib/completedPayment";
import { WalletControl } from "../components/WalletControl";
import {
  WalletProvider,
  useWallet,
  type InjectedProvider,
} from "../lib/wallet";
import {
  completedPaymentHref,
  completedPaymentTerms,
} from "../lib/completedPayment";
import { api, buyer, seller } from "./fixtures";

function provider(name: string, account = buyer) {
  let accounts: string[] = [];
  let chain = "0x14a34";
  const listeners = new Map<string, (value: unknown) => void>();
  const p = {
    isMetaMask: name === "MetaMask",
    request: vi.fn(async ({ method }: { method: string }): Promise<unknown> => {
      if (method === "eth_requestAccounts") accounts = [account];
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") {
        chain = "0x14a34";
        return null;
      }
      return accounts;
    }),
    on: (event: string, listener: (value: unknown) => void) => {
      listeners.set(event, listener);
    },
    removeListener: (event: string) => {
      listeners.delete(event);
    },
  };
  return {
    p,
    listeners,
    change: (value: string[]) => {
      accounts = value;
      listeners.get("accountsChanged")?.(value);
    },
    network: (value: string) => {
      chain = value;
      listeners.get("chainChanged")?.(value);
    },
  };
}
function Probe() {
  const w = useWallet();
  return (
    <output data-testid="identity">
      {w.session
        ? `${w.session.account}:${w.session.chainId}:${w.choices.find((c) => c.provider === w.session?.provider)?.name}`
        : "Disconnected"}
    </output>
  );
}
function mount(gateway = api()) {
  return render(
    <WalletProvider>
      <WalletControl api={gateway} />
      <Probe />
      <button>Outside action</button>
    </WalletProvider>,
  );
}
async function open() {
  await userEvent.click(
    screen.getByRole("button", { name: /Connect wallet|Wallet connected:/ }),
  );
}
function announce(p: InjectedProvider, name = "Rabby", uuid = "rabby") {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid, name }, provider: p },
    }),
  );
}

describe("wallet choice and disclosure (simulated providers only)", () => {
  it("offers one direct wallet choice, connects once and returns focus", async () => {
    const { p } = provider("MetaMask");
    window.ethereum = p;
    mount();
    expect(
      p.request.mock.calls.some(([a]) => a.method === "eth_requestAccounts"),
    ).toBe(false);
    await open();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect MetaMask" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Wallet connection" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("identity")).toHaveTextContent(buyer);
    expect(
      screen.getByRole("button", { name: /Wallet connected:/ }),
    ).toHaveFocus();
    expect(
      p.request.mock.calls.filter(([a]) => a.method === "eth_requestAccounts"),
    ).toHaveLength(1);
    expect(
      p.request.mock.calls.every(
        ([a]) => !/sign|send|delegate/i.test(a.method),
      ),
    ).toBe(true);
  });
  it("requires an explicit choice even when a provider emits an already-authorized account", async () => {
    const meta = provider("MetaMask");
    window.ethereum = meta.p;
    mount();
    await act(async () => meta.change([buyer]));
    expect(screen.getByTestId("identity")).toHaveTextContent("Disconnected");
    expect(meta.p.request).not.toHaveBeenCalled();
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect MetaMask" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(buyer),
    );
  });
  it("keeps distinct EIP-6963 providers and switches account, network and provider safely", async () => {
    const meta = provider("MetaMask"),
      other = provider("Rabby", seller);
    window.ethereum = { ...meta.p, providers: [meta.p, other.p] };
    mount();
    await act(async () => {
      announce(meta.p, "MetaMask", "meta");
      announce(other.p);
    });
    await open();
    expect(
      screen.getAllByRole("button", { name: /^Connect (MetaMask|Rabby)$/ }),
    ).toHaveLength(2);
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Rabby" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(
        `${seller}:84532:Rabby`,
      ),
    );
    expect(
      meta.p.request.mock.calls.some(
        ([a]) => a.method === "eth_requestAccounts",
      ),
    ).toBe(false);
    await act(async () => other.change([buyer]));
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(
        `${buyer}:84532:Rabby`,
      ),
    );
    await act(async () => other.network("0x1"));
    await open();
    expect(await screen.findByText(/Wrong network/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to Base Sepolia" }),
    );
    await screen.findByText("Connected to Base Sepolia");
    await userEvent.click(
      screen.getByRole("button", { name: "Disconnect this session" }),
    );
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect MetaMask" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(
        `${buyer}:84532:MetaMask`,
      ),
    );
    expect(other.listeners.size).toBe(0);
    await act(async () => other.change([seller]));
    expect(screen.getByTestId("identity")).toHaveTextContent("MetaMask");
  });
  it("does not label other legacy providers MetaMask based on the aggregate flag", async () => {
    const meta = provider("MetaMask"),
      other = provider("Other");
    window.ethereum = { ...meta.p, providers: [meta.p, other.p] };
    mount();
    await open();
    expect(
      screen.getByRole("button", { name: "Connect Browser wallet 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Connect MetaMask" }),
    ).toHaveLength(1);
  });
  it("dismisses on Escape, outside pointer and focus leaving, with appropriate focus", async () => {
    mount();
    await open();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Connect wallet" }),
    ).toHaveFocus();
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Outside action" }),
    );
    expect(
      screen.queryByRole("region", { name: "Wallet connection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Outside action" }),
    ).toHaveFocus();
    await open();
    act(() => screen.getByRole("button", { name: "Outside action" }).focus());
    expect(
      screen.queryByRole("region", { name: "Wallet connection" }),
    ).not.toBeInTheDocument();
  });
  it.each([4001, -32603])(
    "shows a recoverable connection error for %s",
    async (code) => {
      const { p } = provider("MetaMask");
      p.request.mockImplementation(async ({ method }) => {
        if (method === "eth_requestAccounts")
          throw { code, message: "Wallet unavailable" };
        return method === "eth_chainId" ? "0x14a34" : [];
      });
      window.ethereum = p;
      mount();
      await open();
      await userEvent.click(
        screen.getByRole("button", { name: "Connect MetaMask" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(/try again/);
      expect(screen.getByTestId("identity")).toHaveTextContent("Disconnected");
      expect(
        screen.getByRole("button", { name: "Connect MetaMask" }),
      ).toBeEnabled();
      if (code === 4001)
        expect(screen.getByRole("alert")).toHaveTextContent(/declined/);
    },
  );
  it("shows pending permission and prevents duplicate connection requests", async () => {
    const { p } = provider("MetaMask");
    let finish!: (value: unknown) => void;
    p.request.mockImplementation(async ({ method }) =>
      method === "eth_requestAccounts"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : method === "eth_chainId"
          ? "0x14a34"
          : [],
    );
    window.ethereum = p;
    mount();
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect MetaMask" }),
    );
    expect(
      screen.getByRole("button", { name: "Connecting to MetaMask…" }),
    ).toBeDisabled();
    expect(screen.getByText(/Waiting for permission/)).toBeInTheDocument();
    await act(async () => finish([buyer]));
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(buyer),
    );
  });
  it("copies the full address, retries unavailable balances and clears copy feedback on account change", async () => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    const meta = provider("MetaMask");
    window.ethereum = meta.p;
    const gateway = api();
    vi.mocked(gateway.balances).mockRejectedValueOnce(
      new Error("RPC unavailable"),
    );
    mount(gateway);
    await open();
    await user.click(screen.getByRole("button", { name: "Connect MetaMask" }));
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(buyer),
    );
    await open();
    expect(await screen.findByText(/Balance read failed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry balances" }));
    await screen.findByText("Balances read from Base Sepolia.");
    await user.click(
      screen.getByRole("button", { name: "Copy wallet address" }),
    );
    expect(write).toHaveBeenCalledWith(buyer);
    expect(screen.getByText("Copied")).toBeInTheDocument();
    await act(async () => meta.change([seller]));
    await waitFor(() =>
      expect(screen.queryByText("Copied")).not.toBeInTheDocument(),
    );
  });
  it("keeps disconnect effective when a delayed account read resolves", async () => {
    const meta = provider("MetaMask");
    window.ethereum = meta.p;
    mount();
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect MetaMask" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("identity")).toHaveTextContent(buyer),
    );
    await open();
    let finish!: (value: unknown) => void;
    meta.p.request.mockImplementation(async ({ method }) =>
      method === "eth_accounts"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : "0x14a34",
    );
    // A provider read already in progress must never restore a disconnected session.
    await act(async () => {
      meta.listeners.get("chainChanged")?.("0x14a34");
    });
    // Session is cleared while the new identity is uncertain.
    expect(screen.getByTestId("identity")).toHaveTextContent("Disconnected");
    await act(async () => {
      meta.listeners.get("disconnect")?.(null);
      finish([seller]);
    });
    expect(screen.getByTestId("identity")).toHaveTextContent("Disconnected");
  });
});

describe("judge entry and FAQ", () => {
  it("links to the genuine order with its exact original terms without reading or writing payments on home", () => {
    const gateway = api();
    render(
      <WalletProvider>
        <App api={gateway} />
      </WalletProvider>,
    );
    const links = screen.getAllByRole("link", {
      name: /View a real completed payment/,
    });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(link).toHaveAttribute("href", completedPaymentHref);
    expect(
      new URLSearchParams(completedPaymentHref.split("?")[1]).get("terms"),
    ).toBe(completedPaymentTerms);
    expect(gateway.loadOrder).not.toHaveBeenCalled();
    expect(gateway.act).not.toHaveBeenCalled();
  });
  it("exposes only authentic recorded receipt links on the genuine completed order", () => {
    const { rerender } = render(
      <CompletedPaymentEvidence id={completedPaymentId} />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    completedPaymentReceipts.forEach(([label, hash], i) => {
      expect(links[i]).toHaveTextContent(label);
      expect(links[i]).toHaveAttribute(
        "href",
        `https://sepolia.basescan.org/tx/${hash}`,
      );
    });
    expect(
      screen.getByText(/No physical delivery occurred/),
    ).toBeInTheDocument();
    rerender(<CompletedPaymentEvidence id={`0x${"a".repeat(64)}`} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("opens and closes native FAQ disclosure", async () => {
    render(
      <WalletProvider>
        <App api={api()} />
      </WalletProvider>,
    );
    const summary = screen.getByText(
      "Does Dealza check that my order arrived?",
    );
    const details = summary.closest("details")!;
    await userEvent.click(summary);
    expect(details.open).toBe(true);
    await userEvent.click(summary);
    expect(details.open).toBe(false);
  });
});
