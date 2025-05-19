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

// erc20Transfer generalAdapter1 => paraswapAdapter
// buy
//
// actions.push(
//   {
//     type: "erc20Transfer",
//     args: [
//       srcToken, // sended token
//       paraswapAdapter, // recipient
//       limitAmount, // amount
//       generalAdapter1, // adapter
//       operation.skipRevert,
//     ],
//   },
//   {
//     type: "paraswapBuy",
//     args: [
//       swap.to, // augustus
//       swap.data, // calldata
//       srcToken, // sended token
//       operation.address, // received (destination) token
//       swap.offsets, // offsets
//       receiver === paraswapAdapter ? generalAdapter1 : receiver, // receiver
//       operation.skipRevert,
//     ],
//   },
//   {
//     type: "erc20Transfer",
//     args: [
//       srcToken,
//       generalAdapter1,
//       maxUint256,
//       paraswapAdapter,
//       operation.skipRevert,
//     ],
//   }
// );

const client = createWalletClient({
  chain: mainnet,
  transport: http(RPC_URL),
  account: privateKeyToAccount(ACCOUNT_PRIVATE_KEY),
}).extend(publicActions);

await client.writeContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: ["0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", parseUnits("1000", 6)],
});

await client.writeContract({
  address: SRC_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: ["0x03b5259bd204bfd4a616e5b79b0b786d90c6c38f", parseUnits("1000", 6)],
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

const params = {
  amount: parseUnits("10", 6).toString(),
  srcToken: SRC_TOKEN,
  srcDecimals: "6",
  destToken: DEST_TOKEN, // USDT
  destDecimals: "6",
  network: "1",
  slippage: "1000",
  side: "SELL",
  userAddress: client.account.address,
  version: "6.2", // version allowed by mopho bundler with allowed smart contract augustus
  // options: {
  // includeContractMethods: SUPPORTED_CONTRACT_METHODS as unknown as ContractMethod[],
  // excludeRFQ: true,
  // ignoreBadUsdPrice: true,
  // partner: "compound.blue",
  // maxImpact: 2,
  // excludeDEXS: ["UniswapV4"],
  // },
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
// console.log("🚀 ~ swap:", swap);

const requirements = new ActionBundleRequirements();
const bundle = new ActionBundle(
  1,
  [
    {
      type: "erc20TransferFrom",
      args: [
        SRC_TOKEN, // sended token
        parseUnits("10", 6), // amount
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // general adapter
        false, // operation.skipRevert,
      ],
    },
    {
      type: "erc20Transfer",
      args: [
        SRC_TOKEN, // sended token
        "0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f", // paraswap recipient
        parseUnits("10", 6), // amount
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // general adapter
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
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // receiver
        false,
      ],
    },
  ],
  requirements
);

const buildTx = await bundle.tx();

const tx = await client.sendTransaction({
  data: buildTx.data,
  to: buildTx.to,
  account: client.account,
  value: buildTx.value,
});

console.log("🚀 ~ tx:", tx);
