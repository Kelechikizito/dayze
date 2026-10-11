import { concat, hashTypedData, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

/*
 * Privy's gas sponsorship upgrades an embedded wallet with EIP-7702 to ZeroDev's Kernel. The address then has
 * code, so verifiers that use OpenZeppelin's SignatureChecker (CoFHE's ACL among them) skip ecrecover and call
 * the wallet's ERC-1271 `isValidSignature`. Kernel's 7702 mode accepts the EOA key's signature only over a
 * wrapped hash: EIP-712 `Kernel(bytes32 hash)` in the wallet's own domain, prefixed with 0x00 (root validator).
 * A plain signature fails there, and CoFHE answers sealOutput with HTTP 401.
 */

const EIP712_DOMAIN_ABI = [
  {
    type: "function",
    name: "eip712Domain",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1" },
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "extensions", type: "uint256[]" },
    ],
  },
] as const;

export type KernelDomain = { name: string; version: string; chainId: number; verifyingContract: Address };

/** The wallet's Kernel EIP-712 domain if it's a 7702-delegated Kernel account, else undefined (a plain EOA) */
export async function kernelDomainOf(publicClient: PublicClient, account: Address): Promise<KernelDomain | undefined> {
  const code = await publicClient.getCode({ address: account }).catch(() => undefined);
  if (!code || !code.toLowerCase().startsWith("0xef0100")) return undefined;
  const domain = await publicClient
    .readContract({ address: account, abi: EIP712_DOMAIN_ABI, functionName: "eip712Domain" })
    .catch(() => undefined);
  if (!domain || domain[1] !== "Kernel") return undefined;
  return { name: domain[1], version: domain[2], chainId: Number(domain[3]), verifyingContract: domain[4] };
}

/** A plain ECDSA signature is 65 bytes; a Kernel ERC-1271 one is 66 (0x00 prefix) */
export function isKernelSignature(signature: string): boolean {
  return signature.length === 2 + 66 * 2 && signature.toLowerCase().startsWith("0x00");
}

/**
 * The same wallet client, but typed-data signatures come out in Kernel's ERC-1271 format when the account is a
 * delegated Kernel wallet. Everything else passes through. Kernel checks the signer is the account itself.
 */
export function withKernelSignatures(walletClient: WalletClient, publicClient: PublicClient): WalletClient {
  const signTypedData = (async (args: Parameters<WalletClient["signTypedData"]>[0]) => {
    const account = walletClient.account?.address;
    const domain = account ? await kernelDomainOf(publicClient, account) : undefined;
    if (!domain) return walletClient.signTypedData(args);
    const hash = hashTypedData(args as never);
    const signature = await walletClient.signTypedData({
      account: walletClient.account!,
      domain,
      types: { Kernel: [{ name: "hash", type: "bytes32" }] },
      primaryType: "Kernel",
      message: { hash },
    });
    return concat(["0x00", signature]) as Hex;
  }) as WalletClient["signTypedData"];
  return { ...walletClient, signTypedData };
}
