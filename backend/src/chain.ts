import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  keccak256,
  verifyMessage,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { createPublicKey, verify } from "node:crypto";
import { PrismaClient, Payout, Interview } from "@prisma/client";
import { Chain } from "./domain";
const base = () =>
  createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org", {
      timeout: 10000,
      retryCount: 1,
    }),
  });
const sol = () =>
  new Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "finalized",
  );
export function addressValid(chain: Chain, address: string) {
  try {
    return chain === "base"
      ? isAddress(address)
      : PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}
export async function verifyWallet(
  chain: Chain,
  address: string,
  message: string,
  signature: string,
) {
  if (chain === "base")
    return verifyMessage({
      address: address as Hex,
      message,
      signature: signature as Hex,
    });
  const bytes = new PublicKey(address).toBuffer();
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), bytes]),
    type: "spki",
    format: "der",
  });
  return verify(
    null,
    Buffer.from(message),
    key,
    Buffer.from(signature, "base64"),
  );
}
export function explorer(chain: string, id: string) {
  return chain === "base"
    ? `https://sepolia.basescan.org/tx/${id}`
    : `https://explorer.solana.com/tx/${id}?cluster=devnet`;
}
async function networkGuard(chain: string) {
  if (chain === "base") {
    if ((await base().getChainId()) !== 84532)
      throw new Error("TESTNET_MISMATCH");
  } else if (
    (await sol().getGenesisHash()) !==
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
  )
    throw new Error("TESTNET_MISMATCH");
}
async function prepare(p: Payout, i: Interview) {
  await networkGuard(i.chain);
  if (i.chain === "base") {
    const key = process.env.BASE_PRIVATE_KEY;
    if (!key) throw new Error("PAYOUT_KEY_MISSING");
    const account = privateKeyToAccount(key as Hex);
    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org"),
    });
    const request = await wallet.prepareTransactionRequest({
      to: i.address as Hex,
      value: BigInt(p.amount),
    });
    const rawTx = await wallet.signTransaction(request);
    return { rawTx, txId: keccak256(rawTx), validUntil: null };
  }
  const secret = process.env.SOLANA_SECRET_KEY;
  if (!secret) throw new Error("PAYOUT_KEY_MISSING");
  const account = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  const latest = await sol().getLatestBlockhash();
  const tx = new Transaction({ feePayer: account.publicKey, ...latest }).add(
    SystemProgram.transfer({
      fromPubkey: account.publicKey,
      toPubkey: new PublicKey(i.address),
      lamports: BigInt(p.amount),
    }),
  );
  tx.sign(account);
  const rawTx = tx.serialize().toString("base64");
  // PublicKey uses the same base58 encoding; a signature is 64 bytes, so encode directly.
  return {
    rawTx,
    txId: base58(tx.signature!),
    validUntil: String(latest.lastValidBlockHeight),
  };
}
function base58(bytes: Uint8Array) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
// One worker owns the payout keys; do not run multiple backend instances with this SQLite store.
export async function processPayouts(db: PrismaClient) {
  if (process.env.PAYOUT_ENABLED !== "true") return;
  for (const chain of ["base", "solana"]) {
    let p = await db.payout.findFirst({
      where: { interview: { chain }, status: "submitted" },
      include: { interview: true },
      orderBy: { createdAt: "asc" },
    });
    if (!p) {
      const queued = await db.payout.findFirst({
        where: { interview: { chain }, status: "queued" },
        include: { interview: true },
        orderBy: { createdAt: "asc" },
      });
      if (!queued) continue;
      try {
        const signed = await prepare(queued, queued.interview);
        p = await db.payout.update({
          where: { id: queued.id },
          data: { ...signed, status: "submitted", error: null },
          include: { interview: true },
        });
      } catch {
        await db.payout.update({
          where: { id: queued.id },
          data: { error: "지급 지갑·잔액·네트워크 설정을 확인해주세요." },
        });
        continue;
      }
    }
    try {
      await networkGuard(chain);
      if (chain === "base") {
        const receipt = await base()
          .getTransactionReceipt({ hash: p.txId as Hex })
          .catch(() => null);
        if (receipt) {
          const finalized = await base().getBlock({ blockTag: "finalized" });
          if (receipt.blockNumber <= finalized.number)
            await db.payout.update({
              where: { id: p.id },
              data: {
                status: receipt.status === "success" ? "confirmed" : "failed",
                confirmedAt: receipt.status === "success" ? new Date() : null,
                error:
                  receipt.status === "success" ? null : "체인에서 실패 확정",
              },
            });
        } else
          await base()
            .sendRawTransaction({ serializedTransaction: p.rawTx as Hex })
            .catch(() => undefined);
      } else {
        const connection = sol();
        const status = (
          await connection.getSignatureStatuses([p.txId!], {
            searchTransactionHistory: true,
          })
        ).value[0];
        if (status?.confirmationStatus === "finalized")
          await db.payout.update({
            where: { id: p.id },
            data: {
              status: status.err ? "failed" : "confirmed",
              confirmedAt: status.err ? null : new Date(),
              error: status.err ? "체인에서 실패 확정" : null,
            },
          });
        else if (
          (await connection.getBlockHeight("finalized")) > Number(p.validUntil)
        )
          await db.payout.update({
            where: { id: p.id },
            data: {
              error:
                "거래 유효기간 경과: 운영자가 기존 거래를 확인해야 합니다. 자동 재송금하지 않습니다.",
            },
          });
        else
          await connection
            .sendRawTransaction(Buffer.from(p.rawTx!, "base64"))
            .catch(() => undefined);
      }
    } catch {
      /* Existing signed transaction remains durable; reconcile on next tick. */
    }
  }
}
