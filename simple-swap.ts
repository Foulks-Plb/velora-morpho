import {
  erc20Abi,
  http,
  publicActions,
  createWalletClient,
  parseUnits,
  formatUnits,
  checksumAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod/v4";

const ACCOUNT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Address test from hardhat
// PUBLIC_KEY: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RPC_URL =
  "https://virtual.mainnet.rpc.tenderly.co/8c1ba48e-d3fc-4bb6-9f8a-ce8b67e9b2a6";

const SRC_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
const SRC_DECIMALS = 6;

const DEST_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT
const DEST_DECIMALS = 6;

const client = createWalletClient({
  chain: mainnet,
  transport: http(RPC_URL),
  account: privateKeyToAccount(ACCOUNT_PRIVATE_KEY),
}).extend(publicActions);

const baseUrl = "https://api.paraswap.io/swap";

const params = {
  side: "BUY",
  amount: parseUnits("10", DEST_DECIMALS).toString(),
  srcToken: SRC_TOKEN,
  srcDecimals: SRC_DECIMALS.toString(),
  destToken: DEST_TOKEN,
  destDecimals: DEST_DECIMALS.toString(),
  network: "1", // Ethereum Mainnet
  slippage: "100", // 1%
  userAddress: client.account.address,
};

const queryString = new URLSearchParams(params).toString();
const url = `${baseUrl}?${queryString}`;

const response = await fetch(url, {
  method: "GET",
});

const data = await response.json();
console.log("🚀 ~ data:", data);

const swapSchema = z.object({
  priceRoute: z.object({
    tokenTransferProxy: z.templateLiteral(["0x", z.string()]),
  }),
  txParams: z.object({
    data: z.templateLiteral(["0x", z.string()]),
    to: z.templateLiteral(["0x", z.string()]), // Swapper contract address
  }),
});

const swap = swapSchema.parse(data);

// Approve token transfer proxy to spend SRC_TOKEN
await client.writeContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: [
    checksumAddress(swap.priceRoute.tokenTransferProxy),
    parseUnits("100", 6),
  ],
});

const [allowanceSrc, balanceSrcBefore, balanceDestBefore] = await Promise.all([
  client.readContract({
    address: SRC_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [
      client.account.address,
      checksumAddress(swap.priceRoute.tokenTransferProxy),
    ],
  }),
  client.readContract({
    address: SRC_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [client.account.address],
  }),
  client.readContract({
    address: DEST_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [client.account.address],
  }),
]);
console.log("🚀 ~ allowanceSrc:", formatUnits(allowanceSrc, SRC_DECIMALS));
console.log(
  "🚀 ~ balanceSrcBefore:",
  formatUnits(balanceSrcBefore, SRC_DECIMALS)
);
console.log(
  "🚀 ~ balanceDestBefore:",
  formatUnits(balanceDestBefore, DEST_DECIMALS)
);

const tx = await client.sendTransaction({
  data: swap.txParams.data,
  to: swap.txParams.to,
  account: client.account,
});
console.log("🚀 ~ tx:", tx);

const [balanceSrcAfter, balanceDestAfter] = await Promise.all([
  client.readContract({
    address: SRC_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [client.account.address],
  }),
  client.readContract({
    address: DEST_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [client.account.address],
  }),
]);
console.log(
  "🚀 ~ balanceSrcAfter:",
  formatUnits(balanceSrcAfter, SRC_DECIMALS)
);
console.log(
  "🚀 ~ balanceDestAfter:",
  formatUnits(balanceDestAfter, DEST_DECIMALS)
);
