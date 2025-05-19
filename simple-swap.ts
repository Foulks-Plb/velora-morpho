import {
  createPublicClient,
  erc20Abi,
  http,
  publicActions,
  createWalletClient,
  parseUnits,
  checksumAddress,
  Address,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const ACCOUNT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Address test from hardhat
// PUBLIC_KEY: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RPC_URL =
  "https://virtual.mainnet.rpc.tenderly.co/f737b323-846a-46ed-b6d7-f93e95d62143";
const SRC_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
const DEST_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT

const swapSchema = z.object({
  priceRoute: z.object({
    tokenTransferProxy: z.string().regex(/[0-9A-Fa-f]+/g),
  }),
  txParams: z.object({
    data: z.string(),
    to: z.string(),
    value: z.string(),
    gasPrice: z.string(),
  }),
});

const client = createWalletClient({
  chain: mainnet,
  transport: http(RPC_URL),
  account: privateKeyToAccount(ACCOUNT_PRIVATE_KEY),
}).extend(publicActions);

const params = {
  amount: parseUnits("10", 6).toString(),
  srcToken: SRC_TOKEN,
  srcDecimals: "6",
  destToken: DEST_TOKEN, // USDT
  destDecimals: "6",
  network: "1",
  slippage: "1000",
  side: "BUY",
  userAddress: client.account.address,
};

const baseUrl = "https://api.paraswap.io/swap";

const queryString = new URLSearchParams(params).toString();
const url = `${baseUrl}?${queryString}`;

const req = await fetch(url, {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
});

const swap = swapSchema.parse(await req.json());
console.log("🚀 ~ swap:", swap);

// Approve token transfer proxy to spend USDC
await client.writeContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: [
    checksumAddress(swap.priceRoute.tokenTransferProxy as Address),
    parseUnits("1000", 6),
  ],
});

// Verify allowance
const allowanceUsdc = await client.readContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "allowance",
  args: [
    client.account.address,
    checksumAddress(swap.priceRoute.tokenTransferProxy),
  ],
});
console.log("🚀 ~ allowanceUsdc:", allowanceUsdc);

const tx = await client.sendTransaction({
  data: swap.txParams.data,
  to: swap.txParams.to,
  account: client.account,
  value: 0n,
});

console.log("🚀 ~ tx:", tx);

const balanceSrc = await client.readContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [client.account.address],
});

const balanceDest = await client.readContract({
  address: DEST_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [client.account.address],
});

console.log("🚀 ~ balanceSrc:", balanceSrc);
console.log("🚀 ~ balanceDest:", balanceDest);
