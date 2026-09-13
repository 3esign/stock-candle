"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { headers: incognitoHeaders } = require("C:/Svemir/lib/incognito.js");

const RPC = "https://api.mainnet-beta.solana.com";
const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const TSLAX_MINT = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const LAUNCH_WALLET = "ExBhtaQXzQvTYreqjy2E9ZdvoxJWrBEnwooD2ceGTFgE";
const PROGRAM_ID = "4NAF1Q253cmH4mviU5eMF3A23qUGxzuwXhkHAoGvAAHB";
const STOCX_CREATE_TX = "5ZwJUg9dTQv3c7K3315b123XwQkiQiYy5DyZR5CGFp1nDYiC4ZgyGdJjPigK5PhRtQhcRKPuZWNbdFhHLWkokNSs";
const STOCX_FEE_SHARE_TX = "63xtzEtcS3SiFsPjV48YDJ4y6VaJvBrPF8RNR8u42aZkYiDYRonw4cJxxuiwUBKqZQHupLBToZgAVehhHW8vzqeF";
const PROGRAM_ELF = "C:/Svemir/skills/svemir-solana/lab/candle-fuse/target/deploy/candle_fuse_lab.so";
const TOKEN_IMAGE = path.resolve(__dirname, "..", "site", "assets", "xcndl-token.png");
const PROGRAM_MAX_LEN = 30720;
const POT_SEED_LAMPORTS = 50000000;
const FOUNDER_ENTRY_SOL_LAMPORTS = 220000000;
const FOUNDER_TARGET_XCNDL_UI = 5000000;
const OPERATING_BUFFER_LAMPORTS = 20000000;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...incognitoHeaders(url, { vrsta: "json" }),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = JSON.parse(text);
  if (!response.ok || body.error) throw new Error(body.error ? JSON.stringify(body.error) : "HTTP " + response.status);
  return body;
}

let rpcId = 0;
async function rpc(method, params) {
  const body = await fetchJson(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params || [] }),
  });
  return body.result;
}

function keyString(value) {
  return typeof value === "string" ? value : value && value.pubkey;
}

async function transactionCost(signature, payer) {
  const tx = await rpc("getTransaction", [signature, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
  if (!tx || !tx.meta) throw new Error("Historical transaction is unavailable: " + signature);
  const keys = tx.transaction.message.accountKeys.map(keyString);
  const payerIndex = keys.indexOf(payer);
  if (payerIndex < 0) throw new Error("Payer is absent from historical transaction: " + signature);
  const delta = tx.meta.preBalances[payerIndex] - tx.meta.postBalances[payerIndex];
  return { signature, slot: tx.slot, payerDeltaLamports: delta, payerDeltaSol: delta / 1e9, feeLamports: tx.meta.fee };
}

async function quote(inputLamports) {
  const url = new URL(JUPITER_QUOTE);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", TSLAX_MINT);
  url.searchParams.set("amount", String(inputLamports));
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("slippageBps", "100");
  url.searchParams.set("restrictIntermediateTokens", "true");
  const result = await fetchJson(url.toString());
  return {
    inputSol: Number(result.inAmount) / 1e9,
    outputTslax: Number(result.outAmount) / 1e8,
    minimumTslax: Number(result.otherAmountThreshold) / 1e8,
    priceImpactPct: Number(result.priceImpactPct || 0),
    route: (result.routePlan || []).map((row) => row.swapInfo && row.swapInfo.label).filter(Boolean),
  };
}

async function main() {
  const elf = fs.readFileSync(PROGRAM_ELF);
  const image = fs.readFileSync(TOKEN_IMAGE);
  const sizes = {
    programAccount: 36,
    programData: PROGRAM_MAX_LEN + 45,
    temporaryDeployBuffer: elf.length + 37,
    config: 380,
    founderPlayerRecord: 64,
    feeSharingConfig: 1024,
    gameLookupTable: 56 + (21 * 32),
    founderBaseTokenAta: 165,
  };
  const rentEntries = await Promise.all(Object.entries(sizes).map(async ([name, bytes]) => {
    const lamports = await rpc("getMinimumBalanceForRentExemption", [bytes, { commitment: "confirmed" }]);
    return [name, { bytes, lamports, sol: lamports / 1e9 }];
  }));
  const rent = Object.fromEntries(rentEntries);
  const [balanceLamports, programAccount, tslaxAccount, createHistory, feeShareHistory, founderQuote] = await Promise.all([
    rpc("getBalance", [LAUNCH_WALLET, { commitment: "confirmed" }]).then((row) => row.value),
    rpc("getAccountInfo", [PROGRAM_ID, { encoding: "base64", commitment: "confirmed" }]),
    rpc("getAccountInfo", [TSLAX_MINT, { encoding: "base64", commitment: "confirmed" }]),
    transactionCost(STOCX_CREATE_TX, LAUNCH_WALLET),
    transactionCost(STOCX_FEE_SHARE_TX, LAUNCH_WALLET),
    quote(FOUNDER_ENTRY_SOL_LAMPORTS),
  ]);

  const programPersistentLamports = rent.programAccount.lamports + rent.programData.lamports;
  const laterPersistentRentLamports = rent.config.lamports
    + rent.gameLookupTable.lamports
    + rent.founderPlayerRecord.lamports
    + rent.founderBaseTokenAta.lamports;
  const historicalSetupLamports = createHistory.payerDeltaLamports + feeShareHistory.payerDeltaLamports;
  const laterLaunchSpendLamports = laterPersistentRentLamports
    + historicalSetupLamports
    + POT_SEED_LAMPORTS
    + FOUNDER_ENTRY_SOL_LAMPORTS;
  const deployPeakLamports = programPersistentLamports
    + rent.temporaryDeployBuffer.lamports
    + OPERATING_BUFFER_LAMPORTS;
  const fullLaunchLamports = programPersistentLamports
    + laterLaunchSpendLamports
    + OPERATING_BUFFER_LAMPORTS;
  const recommendedStartingLamports = Math.max(deployPeakLamports, fullLaunchLamports);
  const topUpLamports = Math.max(0, recommendedStartingLamports - balanceLamports);

  const output = {
    verifiedAt: new Date().toISOString(),
    network: "mainnet-beta",
    sent: false,
    program: {
      id: PROGRAM_ID,
      alreadyDeployed: Boolean(programAccount && programAccount.value),
      elfBytes: elf.length,
      maxLen: PROGRAM_MAX_LEN,
      sha256: crypto.createHash("sha256").update(elf).digest("hex").toUpperCase(),
    },
    image: {
      bytes: image.length,
      sha256: crypto.createHash("sha256").update(image).digest("hex").toUpperCase(),
    },
    tslaxMintExists: Boolean(tslaxAccount && tslaxAccount.value),
    launchWallet: { address: LAUNCH_WALLET, balanceLamports, balanceSol: balanceLamports / 1e9 },
    rent,
    historicalSamePathCosts: { createHistory, feeShareHistory },
    founderEntryQuote: founderQuote,
    budget: {
      founderTargetXcndlUi: FOUNDER_TARGET_XCNDL_UI,
      potSeedSol: POT_SEED_LAMPORTS / 1e9,
      founderEntrySol: FOUNDER_ENTRY_SOL_LAMPORTS / 1e9,
      operatingBufferSol: OPERATING_BUFFER_LAMPORTS / 1e9,
      programPersistentRentSol: programPersistentLamports / 1e9,
      laterRentAndHistoricalSetupSol: (laterPersistentRentLamports + historicalSetupLamports) / 1e9,
      temporaryDeployBufferSol: rent.temporaryDeployBuffer.lamports / 1e9,
      deployPeakWithBufferSol: deployPeakLamports / 1e9,
      fullLaunchWithReserveSol: fullLaunchLamports / 1e9,
      recommendedStartingSol: recommendedStartingLamports / 1e9,
      currentBalanceSol: balanceLamports / 1e9,
      topUpNeededSol: topUpLamports / 1e9,
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("ERROR:", error.message || error);
  process.exitCode = 1;
});
