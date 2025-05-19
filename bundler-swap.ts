import {
  createPublicClient,
  erc20Abi,
  http,
  publicActions,
  createWalletClient,
  parseUnits,
  checksumAddress,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import {
  ActionBundle,
  ActionBundleRequirements,
} from "@morpho-org/bundler-sdk-viem";

const ACCOUNT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Address test from hardhat
// PUBLIC_KEY: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RPC_URL =
  "https://virtual.mainnet.rpc.tenderly.co/8c1ba48e-d3fc-4bb6-9f8a-ce8b67e9b2a6";

const SRC_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
const DEST_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT

const GENERAL_ADAPTER = "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0";
const PARASWAP_ADAPTER = "0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f";

const PARASWAP_BASE_URL = "https://api.paraswap.io/swap";

const client = createWalletClient({
  chain: mainnet,
  transport: http(RPC_URL),
  account: privateKeyToAccount(ACCOUNT_PRIVATE_KEY),
}).extend(publicActions);

// Approve the General Adapter contract to spend the USDC
await client.writeContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: [GENERAL_ADAPTER, parseUnits("1000", 6)],
});

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

// Paraswap params
const params = {
  amount: parseUnits("10", 6).toString(),
  srcToken: SRC_TOKEN,
  srcDecimals: "6",
  destToken: DEST_TOKEN, // USDT
  destDecimals: "6",
  network: "1",
  slippage: "10",
  side: "SELL",
  userAddress: client.account.address,
  version: "6.2", // version allowed by mopho bundler with allowed smart contract augustus
};

// Call paraswap api to get the swap data
const queryString = new URLSearchParams(params).toString();
const url = `${PARASWAP_BASE_URL}?${queryString}`;

const req = await fetch(url, {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
});

// Parse the swap data
const swap = swapSchema.parse(await req.json());

// Build bundle for SDK
const requirements = new ActionBundleRequirements();
const bundle = new ActionBundle(
  1,
  [
    {
      type: "erc20TransferFrom",
      args: [
        SRC_TOKEN, // sended token
        parseUnits("10", 6), // amount
        GENERAL_ADAPTER, // general adapter
        false, // operation.skipRevert,
      ],
    },
    {
      type: "erc20Transfer",
      args: [
        SRC_TOKEN, // sended token
        PARASWAP_ADAPTER, // paraswap recipient
        parseUnits("10", 6), // amount
        GENERAL_ADAPTER, // general adapter
        false, // operation.skipRevert,
      ],
    },
    {
      type: "paraswapSell",
      args: [
        swap.txParams.to, // augustus
        swap.txParams.data, // calldata
        SRC_TOKEN, // sended token
        DEST_TOKEN, // received (destination) token
        true, // entire balance
        {
          exactAmount: 4n + 32n * 3n,
          limitAmount: 4n + 32n * 4n,
          quotedAmount: 4n + 32n * 5n,
        }, // offsets (exact amount in)
        GENERAL_ADAPTER, // receiver
        false,
      ],
    },
    {
      type: "erc20Transfer",
      args: [
        DEST_TOKEN, // sended token
        client.account.address, // paraswap recipient
        parseUnits("10", 6), // amount
        GENERAL_ADAPTER, // general adapter
        false, // operation.skipRevert,
      ],
    },
  ],
  requirements
);

// Build bundler from SDK
const buildTx = await bundle.tx();

const tx = await client.sendTransaction({
  data: buildTx.data,
  to: buildTx.to,
  account: client.account,
  value: buildTx.value,
});

console.log("🚀 ~ tx:", tx);

// verify balance user
const balanceSrc = await client.readContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [client.account.address],
});
console.log("🚀 ~ balanceSrc:", balanceSrc);

const balanceDest = await client.readContract({
  address: DEST_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [client.account.address],
});
console.log("🚀 ~ balanceDest:", balanceDest);

// Verify balance general adapter
const balanceGeneralAdapterSrc = await client.readContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [GENERAL_ADAPTER],
});
console.log("🚀 ~ balanceGeneralAdapter src:", balanceGeneralAdapterSrc);

const balanceGeneralAdapterDest = await client.readContract({
  address: DEST_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [GENERAL_ADAPTER],
});
console.log("🚀 ~ balanceGeneralAdapter dest:", balanceGeneralAdapterDest);
