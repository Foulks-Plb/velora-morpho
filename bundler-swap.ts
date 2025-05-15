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
  "https://virtual.mainnet.rpc.tenderly.co/f737b323-846a-46ed-b6d7-f93e95d62143";

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
        parseUnits("1", 6), // amount
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // general adapter
        false, // operation.skipRevert,
      ],
    },
    {
      type: "erc20Transfer",
      args: [
        SRC_TOKEN, // sended token
        "0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f", // paraswap recipient
        parseUnits("1", 6), // amount
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // general adapter
        false, // operation.skipRevert,
      ],
    },
    {
      type: "paraswapBuy",
      args: [
        swap.txParams.to, // augustus
        swap.txParams.data, // calldata
        SRC_TOKEN, // sended token
        DEST_TOKEN, // received (destination) token
        {
          exactAmount: BigInt(4 + 4 * 32),
          limitAmount: BigInt(4 + 3 * 32),
          quotedAmount: BigInt(4 + 5 * 32),
        }, // offsets
        "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0", // receiver
        false,
      ],
    },
  ],
  requirements
);

const buildTx = await bundle.tx();
console.log("🚀 ~ txData:", buildTx);

const tx = await client.sendTransaction({
  data: buildTx.data,
  to: buildTx.to,
  account: client.account,
  value: buildTx.value,
});

console.log("🚀 ~ tx:", tx);

// 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 // user
// 0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245
// 0x374f435d0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000004a6c312ec70e8747a587ee860a0353cd42be0ae000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000643790767d000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000003b5259bd204bfd4a616e5b79b0b786d90c6c38f00000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000

// const swapSchema = z.object({
//   priceRoute: z.object({
//     tokenTransferProxy: z.string().regex(/[0-9A-Fa-f]+/g),
//   }),
//   txParams: z.object({
//     data: z.string(),
//     to: z.string(),
//     value: z.string(),
//     gasPrice: z.string(),
//   }),
// });

// const params = {
//   amount: parseUnits("10", 6).toString(),
//   srcToken: SRC_TOKEN,
//   srcDecimals: "6",
//   destToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
//   destDecimals: "6",
//   network: "1",
//   slippage: "1000",
//   side: "SELL",
//   userAddress: client.account.address,
// };

// const baseUrl = "https://api.paraswap.io/swap";

// const queryString = new URLSearchParams(params).toString();
// const url = `${baseUrl}?${queryString}`;

// const req = await fetch(url, {
//   method: "GET",
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// const swap = swapSchema.parse(await req.json());
// console.log("🚀 ~ swap:", swap);

// // approve
// await client.writeContract({
//   address: SRC_TOKEN,
//   abi: erc20Abi,
//   functionName: "approve",
//   args: [
//     checksumAddress(swap.priceRoute.tokenTransferProxy as Address),
//     parseUnits("1000", 6),
//   ],
// });

// const allowanceUsdc = await client.readContract({
//   address: SRC_TOKEN,
//   abi: erc20Abi,
//   functionName: "allowance",
//   args: [
//     client.account.address,
//     checksumAddress(swap.priceRoute.tokenTransferProxy),
//   ],
// });
// console.log("🚀 ~ allowanceUsdc:", allowanceUsdc);

// const tx = await client.sendTransaction({
//   data: swap.txParams.data,
//   to: swap.txParams.to,
//   account: client.account,
//   value: 0n,
// });

// // console.log("🚀 ~ tx:", tx);

// // from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
// // to: 0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57
// // 0xb2f1e6db000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000a896f70000000000000000000000000000000000000000000000000000000000989680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000004de43041cbd36888becc7bbcbc0045e3b1f144466f5f
