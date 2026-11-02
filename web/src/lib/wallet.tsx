import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAddress, isAddress, type Address } from "viem";
import { friendlyError } from "./domain";
import { network } from "./config";

export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
}
export type Session = {
  account: Address;
  chainId: number;
  provider: InjectedProvider;
};
export type WalletChoice = {
  id: string;
  name: string;
  provider: InjectedProvider;
};
export type WalletState = {
  session: Session | null;
  choices: WalletChoice[];
  selected: string;
  connecting: boolean;
  error: string;
  select(id: string): void;
  connect(): Promise<void>;
  switchNetwork(): Promise<void>;
  disconnect(): void;
};
export const WalletContext = createContext<WalletState | null>(null);
export function useWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("Wallet provider is unavailable.");
  return wallet;
}
declare global {
  interface Window {
    ethereum?: InjectedProvider & {
      isMetaMask?: boolean;
      providers?: InjectedProvider[];
    };
  }
}
export async function assertSession(session: Session): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    session.provider.request({ method: "eth_accounts" }),
    session.provider.request({ method: "eth_chainId" }),
  ]);
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    accounts[0].toLowerCase() !== session.account.toLowerCase()
  )
    throw new Error(
      "Your wallet disconnected or changed accounts. Reconnect before continuing.",
    );
  if (Number(chainId) !== network.chainId)
    throw new Error(
      "Switch your wallet to Base Sepolia before continuing. Mainnet transactions are blocked.",
    );
}
export function WalletProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState<WalletChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const ignored = useRef(false);
  const generation = useRef(0);
  const provider = choices.find((choice) => choice.id === selected)?.provider;
  useEffect(() => {
    const add = (choice: WalletChoice) => {
      setChoices((old) =>
        old.some((x) => x.provider === choice.provider)
          ? old
          : [...old, choice],
      );
      setSelected((old) => old || choice.id);
    };
    const announced = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: InjectedProvider;
        }>
      ).detail;
      if (typeof detail?.provider?.request === "function" && detail.info?.uuid)
        add({
          id: detail.info.uuid,
          name: String(detail.info.name).slice(0, 60),
          provider: detail.provider,
        });
    };
    window.addEventListener("eip6963:announceProvider", announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected =
      window.ethereum?.providers || (window.ethereum ? [window.ethereum] : []);
    injected.forEach((p, i) =>
      add({
        id: `injected-${i}`,
        name: window.ethereum?.isMetaMask
          ? "MetaMask"
          : `Browser wallet ${i + 1}`,
        provider: p,
      }),
    );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announced);
  }, []);
  const refresh = useCallback(
    async (requestAccess = false) => {
      if (!provider)
        throw new Error(
          "Install MetaMask or another compatible browser wallet, then reload this page.",
        );
      const version = ++generation.current;
      const accounts = await provider.request({
        method: requestAccess ? "eth_requestAccounts" : "eth_accounts",
      });
      const chainId = Number(await provider.request({ method: "eth_chainId" }));
      if (version !== generation.current || ignored.current) return;
      if (
        Array.isArray(accounts) &&
        typeof accounts[0] === "string" &&
        isAddress(accounts[0])
      )
        setSession({ account: getAddress(accounts[0]), chainId, provider });
      else setSession(null);
    },
    [provider],
  );
  useEffect(() => {
    ignored.current = false;
    setSession(null);
    const change = () => {
      if (!ignored.current)
        void refresh().catch((e) => {
          setSession(null);
          setError(friendlyError(e));
        });
    };
    const disconnect = () => {
      generation.current++;
      setSession(null);
    };
    if (provider) {
      change();
      provider.on?.("accountsChanged", change);
      provider.on?.("chainChanged", change);
      provider.on?.("disconnect", disconnect);
    }
    return () => {
      generation.current++;
      provider?.removeListener?.("accountsChanged", change);
      provider?.removeListener?.("chainChanged", change);
      provider?.removeListener?.("disconnect", disconnect);
    };
  }, [provider, refresh]);
  const connect = async () => {
    setConnecting(true);
    setError("");
    ignored.current = false;
    try {
      await refresh(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConnecting(false);
    }
  };
  const switchNetwork = async () => {
    if (!provider) return;
    setError("");
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x14a34" }],
        });
      } catch (e) {
        if ((e as { code?: number }).code !== 4902) throw e;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x14a34",
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: [network.explorer],
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x14a34" }],
        });
      }
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  return (
    <WalletContext.Provider
      value={{
        session,
        choices,
        selected,
        connecting,
        error,
        select: setSelected,
        connect,
        switchNetwork,
        disconnect: () => {
          ignored.current = true;
          generation.current++;
          setSession(null);
          setError("");
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
