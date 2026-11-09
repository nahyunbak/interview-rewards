type Evm = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Evm[];
};
type Account = {
  address: string;
  chains: readonly string[];
  features: readonly string[];
};
type StandardWallet = {
  name: string;
  accounts: readonly Account[];
  features: Record<string, unknown>;
};
const wallets = new Set<StandardWallet>();
const register = (...items: StandardWallet[]) => {
  items.forEach((w) => wallets.add(w));
  return () => items.forEach((w) => wallets.delete(w));
};
if (typeof window !== "undefined") {
  window.addEventListener("wallet-standard:register-wallet", ((
    e: CustomEvent<(api: { register: typeof register }) => void>,
  ) => e.detail({ register })) as EventListener);
  window.dispatchEvent(
    new CustomEvent("wallet-standard:app-ready", { detail: { register } }),
  );
}
declare global {
  interface Window {
    ethereum?: Evm;
    phantom?: {
      ethereum?: Evm;
      solana?: {
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        signMessage: (
          bytes: Uint8Array,
          encoding: string,
        ) => Promise<{ signature: Uint8Array }>;
      };
    };
  }
}
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
export async function connectWallet(
  chain: string,
  provider: string,
): Promise<{ address: string; sign: (message: string) => Promise<string> }> {
  if (chain === "base") {
    const announced: { info: { rdns: string }; provider: Evm }[] = [];
    const listener = (e: Event) =>
      announced.push(
        (e as CustomEvent<{ info: { rdns: string }; provider: Evm }>).detail,
      );
    window.addEventListener("eip6963:announceProvider", listener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise((r) => setTimeout(r, 300));
    window.removeEventListener("eip6963:announceProvider", listener);
    const selected = announced.find((p) =>
      provider === "metamask"
        ? p.info.rdns === "io.metamask"
        : p.info.rdns === "app.phantom",
    )?.provider;
    const evm =
      selected ||
      (provider === "phantom"
        ? window.phantom?.ethereum
        : window.ethereum?.providers?.find(
            (p) => p.isMetaMask && !p.isPhantom,
          ) ||
          (window.ethereum?.isMetaMask && !window.ethereum.isPhantom
            ? window.ethereum
            : undefined));
    if (!evm)
      throw new Error(
        `${provider === "metamask" ? "MetaMask" : "Phantom"}을 설치하거나 확장 프로그램 연결을 허용해주세요.`,
      );
    const accounts = (await evm.request({
      method: "eth_requestAccounts",
    })) as string[];
    const address = accounts[0];
    if (!address) throw new Error("계정을 선택해주세요.");
    // Message signing verifies the recipient; the server selects the testnet for payout.
    return {
      address,
      sign: async (message) =>
        evm.request({
          method: "personal_sign",
          params: [
            "0x" +
              Array.from(new TextEncoder().encode(message), (b) =>
                b.toString(16).padStart(2, "0"),
              ).join(""),
            address,
          ],
        }) as Promise<string>,
    };
  }
  const w = [...wallets].find((w) => w.name.toLowerCase().includes(provider));
  if (w) {
    const connect = w.features["standard:connect"] as
      | { connect: () => Promise<{ accounts: readonly Account[] }> }
      | undefined;
    const sign = w.features["solana:signMessage"] as
      | {
          signMessage: (input: {
            account: Account;
            message: Uint8Array;
          }) => Promise<{ signature: Uint8Array }[]>;
        }
      | undefined;
    if (connect && sign) {
      const result = await connect.connect();
      const account = result.accounts.find(
        (a) =>
          a.chains.some((c) => c.startsWith("solana:")) &&
          a.features.includes("solana:signMessage"),
      );
      if (!account)
        throw new Error("Solana 메시지 서명을 지원하는 계정을 선택해주세요.");
      return {
        address: account.address,
        sign: async (message) => {
          const response = await sign.signMessage({
            account,
            message: new TextEncoder().encode(message),
          });
          if (!response[0]) throw new Error("서명이 취소되었습니다.");
          return base64(response[0].signature);
        },
      };
    }
  }
  if (provider === "phantom" && window.phantom?.solana) {
    const sol = window.phantom.solana;
    const { publicKey } = await sol.connect();
    return {
      address: publicKey.toString(),
      sign: async (message) =>
        base64(
          (await sol.signMessage(new TextEncoder().encode(message), "utf8"))
            .signature,
        ),
    };
  }
  throw new Error(
    "Solana 연결을 지원하는 최신 지갑 확장 프로그램을 활성화하고 새로고침해주세요.",
  );
}
