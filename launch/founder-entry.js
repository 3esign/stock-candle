"use strict";

// Disclosed founder path: acquire TSLAx, buy exactly 5M XCNDL through the
// public game wrapper (one rung), then transfer the acquired XCNDL to Semir.
// Read-only by default and idempotent across partial completion.
const fs = require("fs");
const path = require("path");
const { headers: incognitoHeaders } = require("C:/Svemir/lib/incognito.js");

const MODULES = "C:/Svemir/tools/solana-cli/scripts-scratch/node_modules";
const requireFromTools = (name) => require(path.join(MODULES, name));
const BN = requireFromTools("bn.js");
const {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = requireFromTools("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} = requireFromTools("@solana/spl-token");
const {
  bondingCurvePda,
  getBuySolAmountFromTokenAmount,
  getBuyTokenAmountFromSolAmount,
  normalizeQuoteMint,
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
} = requireFromTools("@pump-fun/pump-sdk");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const SWAP_API = "https://lite-api.jup.ag/swap/v1/swap";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const PROGRAM_ID = new PublicKey("4NAF1Q253cmH4mviU5eMF3A23qUGxzuwXhkHAoGvAAHB");
const MINT = new PublicKey("5CmZR4yHKwfTDL5y7PoMJ6kTR9LJBcsdXPBoY9tLT5sF");
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const DEPLOYER = new PublicKey("ExBhtaQXzQvTYreqjy2E9ZdvoxJWrBEnwooD2ceGTFgE");
const SEMIR = new PublicKey("HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM");
const PUMP_BUYBACK_FEE_RECIPIENT = new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");
const DEPLOYER_KEYPAIR = "C:/Svemir/tools/solana-cli/artifacts/stockpulse-mainnet/stockpulse-deployer.json";
const RECEIPT_PATH = path.resolve(__dirname, "onchain.receipt.json");
const INPUT_LAMPORTS = 220_000_000n;
const MIN_SOL_RESERVE_LAMPORTS = 25_000_000n;
const FOUNDER_MIN_BUY_RAW = 1_000_000_000_000n;
const SLIPPAGE_BPS = 100n;
const MAX_PRICE_IMPACT_PCT = 0.01;
const MAX_PACKET_BYTES = 1232;
const REQUIRED_CONFIRM = "STOCK_CANDLE_FOUNDER_MAINNET";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function sendEnabled() {
  if (!hasFlag("--send")) return false;
  if (argValue("--mainnet-confirm") !== REQUIRED_CONFIRM) {
    throw new Error(`founder sends blocked; expected --send --mainnet-confirm ${REQUIRED_CONFIRM}`);
  }
  return true;
}

function makeConnection() {
  return new Connection(RPC, {
    commitment: "confirmed",
    fetchMiddleware: (url, options, fetchFn) => fetchFn(url, {
      ...options,
      headers: {
        ...incognitoHeaders(url, { vrsta: "json" }),
        ...(options.headers || {}),
      },
    }),
  });
}

function loadDeployer() {
  const bytes = JSON.parse(fs.readFileSync(DEPLOYER_KEYPAIR, "utf8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(bytes));
  if (!keypair.publicKey.equals(DEPLOYER)) throw new Error("deployer keypair mismatch");
  return keypair;
}

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

function gameAddresses() {
  const [config, configBump] = pda([Buffer.from("candle_config"), MINT.toBuffer()]);
  const [pot, potBump] = pda([Buffer.from("candle_pot"), config.toBuffer()]);
  const [record, recordBump] = pda([Buffer.from("candle_player"), config.toBuffer(), DEPLOYER.toBuffer()]);
  return { config, configBump, pot, potBump, record, recordBump };
}

function ui(raw, decimals) {
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addSlippage(raw) {
  return (BigInt(raw) * (10_000n + SLIPPAGE_BPS) + 9_999n) / 10_000n;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...incognitoHeaders(String(url), { vrsta: "json" }),
      accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_error) {
    throw new Error(`unreadable HTTP ${response.status} response`);
  }
  if (!response.ok || body.error) throw new Error(body.error || body.errorMessage || `HTTP ${response.status}`);
  return body;
}

function saveReceipt(patch) {
  const current = fs.existsSync(RECEIPT_PATH)
    ? JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"))
    : {};
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify({ ...current, ...patch }, null, 2) + "\n");
}

function decodeConfig(info) {
  if (!info || info.data.length < 380 || info.data[0] !== 1) return null;
  return {
    startTs: Number(info.data.readBigInt64LE(3)),
    endTs: Number(info.data.readBigInt64LE(11)),
    totalStrikes: info.data.readBigUInt64LE(35).toString(),
    closed: info.data[51] === 1,
    leader: new PublicKey(info.data.subarray(92, 124)).toBase58(),
    leaderScore: info.data.readBigUInt64LE(124).toString(),
    baseMint: new PublicKey(info.data.subarray(236, 268)).toBase58(),
    lastAwardedCurveBalance: info.data.readBigUInt64LE(308).toString(),
  };
}

function decodeRecord(info) {
  if (!info || info.data.length < 64) return null;
  return {
    wallet: new PublicKey(info.data.subarray(0, 32)).toBase58(),
    strikes: info.data.readBigUInt64LE(32).toString(),
    volumeRaw: info.data.readBigUInt64LE(40).toString(),
    lastSlot: info.data.readBigUInt64LE(48).toString(),
    score: info.data.readBigUInt64LE(56).toString(),
  };
}

async function tokenBalance(connection, mint, owner) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const info = await connection.getAccountInfo(ata, "confirmed");
  if (!info) return { ata, amount: 0n, exists: false };
  const account = unpackAccount(ata, info, TOKEN_2022_PROGRAM_ID);
  if (!account.owner.equals(owner) || !account.mint.equals(mint)) throw new Error(`token account mismatch: ${ata.toBase58()}`);
  return { ata, amount: BigInt(account.amount.toString()), exists: true };
}

async function founderCost(connection, amountRaw = FOUNDER_MIN_BUY_RAW) {
  const online = new OnlinePumpSdk(connection);
  const curvePda = bondingCurvePda(MINT);
  const [global, feeConfig, bondingCurve, mintInfo, curveInfo, resolved] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
    online.fetchBondingCurve(MINT),
    connection.getAccountInfo(MINT, "confirmed"),
    connection.getAccountInfo(curvePda, "confirmed"),
    online.resolveQuoteMint(TSLAX_MINT),
  ]);
  if (!mintInfo || !curveInfo) throw new Error("XCNDL mint or bonding curve is not live");
  if (!resolved.quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("TSLAx quote token program drifted");
  const mintState = unpackMint(MINT, mintInfo, TOKEN_2022_PROGRAM_ID);
  const quoteMint = normalizeQuoteMint(bondingCurve.quoteMint);
  if (!quoteMint.equals(TSLAX_MINT)) throw new Error("XCNDL curve is not TSLAx-quoted");
  const exact = BigInt(getBuySolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: new BN(mintState.supply.toString()),
    bondingCurve,
    amount: new BN(amountRaw.toString()),
    quoteMint,
  }).toString());
  return { global, feeConfig, mintSupply: new BN(mintState.supply.toString()), bondingCurve, quoteMint, exact, maximum: addSlippage(exact) };
}

async function affordableFounderPlan(connection, quoteBalanceRaw) {
  const context = await founderCost(connection, FOUNDER_MIN_BUY_RAW);
  const spendBudget = BigInt(quoteBalanceRaw) * 98n / 100n;
  let amountRaw = BigInt(getBuyTokenAmountFromSolAmount({
    global: context.global,
    feeConfig: context.feeConfig,
    mintSupply: context.mintSupply,
    bondingCurve: context.bondingCurve,
    amount: new BN(spendBudget.toString()),
    quoteMint: context.quoteMint,
  }).toString());
  amountRaw -= amountRaw % 1_000n;
  if (amountRaw < FOUNDER_MIN_BUY_RAW) throw new Error("available TSLAx cannot safely buy the 1M game minimum");
  const exact = BigInt(getBuySolAmountFromTokenAmount({
    global: context.global,
    feeConfig: context.feeConfig,
    mintSupply: context.mintSupply,
    bondingCurve: context.bondingCurve,
    amount: new BN(amountRaw.toString()),
    quoteMint: context.quoteMint,
  }).toString());
  const maximum = addSlippage(exact);
  if (maximum > BigInt(quoteBalanceRaw)) throw new Error("dynamic founder maximum exceeds the available TSLAx balance");
  return { amountRaw, exact, maximum, spendBudget, global: context.global, bondingCurve: context.bondingCurve };
}

async function readState(connection) {
  const a = gameAddresses();
  const [sol, mintInfo, configInfo, recordInfo, sourceQuote, sourceBase, semirBase] = await Promise.all([
    connection.getBalance(DEPLOYER, "confirmed"),
    connection.getAccountInfo(MINT, "confirmed"),
    connection.getAccountInfo(a.config, "confirmed"),
    connection.getAccountInfo(a.record, "confirmed"),
    tokenBalance(connection, TSLAX_MINT, DEPLOYER),
    tokenBalance(connection, MINT, DEPLOYER),
    tokenBalance(connection, MINT, SEMIR),
  ]);
  if (!mintInfo || !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("XCNDL mint is absent or not Token-2022");
  const mintState = unpackMint(MINT, mintInfo, TOKEN_2022_PROGRAM_ID);
  if (mintState.decimals !== 6) throw new Error(`XCNDL decimals changed: ${mintState.decimals}`);
  return {
    solLamports: BigInt(sol),
    sol: ui(sol, 9),
    config: decodeConfig(configInfo),
    record: decodeRecord(recordInfo),
    sourceQuote,
    sourceBase,
    semirBase,
    addresses: a,
    mintDecimals: mintState.decimals,
  };
}

function publicState(state) {
  return {
    launchSol: state.sol,
    launchTslax: ui(state.sourceQuote.amount, 8),
    launchXcndl: ui(state.sourceBase.amount, 6),
    semirXcndl: ui(state.semirBase.amount, 6),
    config: state.config,
    founderRecord: state.record,
    mintDecimals: state.mintDecimals,
    addresses: Object.fromEntries(Object.entries(state.addresses).map(([key, value]) => [key, value?.toBase58 ? value.toBase58() : value])),
  };
}

async function jupiterQuote() {
  const url = new URL(QUOTE_API);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", TSLAX_MINT.toBase58());
  url.searchParams.set("amount", INPUT_LAMPORTS.toString());
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("slippageBps", "100");
  url.searchParams.set("restrictIntermediateTokens", "true");
  return fetchJson(url);
}

async function commandStatus(connection) {
  const state = await readState(connection);
  let plan = null;
  try {
    const value = await affordableFounderPlan(connection, state.sourceQuote.amount);
    plan = { amountRaw: value.amountRaw.toString(), amountXcndl: ui(value.amountRaw, 6), maximumRaw: value.maximum.toString(), maximumTslax: ui(value.maximum, 8) };
  } catch (error) {
    plan = { unavailable: error.message };
  }
  console.log(JSON.stringify({ sent: false, founderMinimumRaw: FOUNDER_MIN_BUY_RAW.toString(), state: publicState(state), affordablePlan: plan }, null, 2));
}

async function commandSwap(connection, send) {
  const before = await readState(connection);
  const cost = await founderCost(connection, FOUNDER_MIN_BUY_RAW);
  if (before.sourceQuote.amount >= cost.maximum) {
    try {
      const existingPlan = await affordableFounderPlan(connection, before.sourceQuote.amount);
      if (existingPlan.amountRaw >= FOUNDER_MIN_BUY_RAW) {
        console.log(JSON.stringify({ alreadyFunded: true, state: publicState(before), affordableXcndl: ui(existingPlan.amountRaw, 6) }, null, 2));
        return;
      }
    } catch (_error) {}
  }
  const quote = await jupiterQuote();
  const minimumOut = BigInt(quote.otherAmountThreshold);
  const postMinimum = before.sourceQuote.amount + minimumOut;
  const impact = Number(quote.priceImpactPct || 0);
  if (postMinimum < cost.maximum) throw new Error(`0.22 SOL minimum output ${ui(postMinimum, 8)} TSLAx does not cover the 1M game minimum ${ui(cost.maximum, 8)}`);
  if (!Number.isFinite(impact) || impact > MAX_PRICE_IMPACT_PCT) throw new Error(`Jupiter price impact ${quote.priceImpactPct} is too high`);
  if (before.solLamports - INPUT_LAMPORTS < MIN_SOL_RESERVE_LAMPORTS) throw new Error("0.22 SOL swap would breach the 0.025 SOL reserve");
  const plan = {
    inputSol: "0.22",
    minimumOutputTslax: ui(minimumOut, 8),
    postMinimumTslax: ui(postMinimum, 8),
    minimumGameBuyTslax: ui(cost.maximum, 8),
    priceImpactPct: quote.priceImpactPct,
    route: (quote.routePlan || []).map((row) => row.swapInfo?.label).filter(Boolean),
  };
  console.log(JSON.stringify({ action: "swap", sent: false, before: publicState(before), plan }, null, 2));
  if (!send) return;

  const response = await fetchJson(SWAP_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: DEPLOYER.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: 1_000_000, global: false, priorityLevel: "high" },
      },
    }),
  });
  if (response.simulationError || !response.swapTransaction) throw new Error(`Jupiter swap build failed: ${JSON.stringify(response.simulationError)}`);
  const transaction = VersionedTransaction.deserialize(Buffer.from(response.swapTransaction, "base64"));
  transaction.sign([loadDeployer()]);
  const simulation = await connection.simulateTransaction(transaction, { sigVerify: true, commitment: "confirmed" });
  if (simulation.value.err) throw new Error(`swap simulation failed: ${JSON.stringify(simulation.value.err)}`);
  const signature = await connection.sendRawTransaction(Buffer.from(transaction.serialize()), { skipPreflight: false, maxRetries: 5 });
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: transaction.message.recentBlockhash,
    lastValidBlockHeight: response.lastValidBlockHeight,
  }, "confirmed");
  if (confirmation.value.err) throw new Error(`swap failed: ${JSON.stringify(confirmation.value.err)}`);
  const after = await readState(connection);
  const affordable = await affordableFounderPlan(connection, after.sourceQuote.amount);
  if (affordable.amountRaw < FOUNDER_MIN_BUY_RAW) throw new Error("swap confirmed but TSLAx readback is below the game minimum");
  saveReceipt({ founderSwap: { at: new Date().toISOString(), signature, plan, after: publicState(after) } });
  console.log(JSON.stringify({ sent: true, signature, after: publicState(after) }, null, 2));
}

async function waitUntilOpen(config) {
  const now = Math.floor(Date.now() / 1000);
  if (!config || config.closed) throw new Error("game config is missing or closed");
  if (now > config.endTs) throw new Error("game window already ended");
  const waitMs = Math.max(0, (config.startTs - now + 1) * 1000);
  if (waitMs > 10 * 60 * 1000) throw new Error("game start is more than ten minutes away");
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function buildAndSend(connection, instructions, lookups, send) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: DEPLOYER, recentBlockhash: latest.blockhash, instructions }).compileToV0Message(lookups);
  const transaction = new VersionedTransaction(message);
  const bytes = Buffer.from(transaction.serialize()).length;
  if (bytes > MAX_PACKET_BYTES) throw new Error(`packet too large: ${bytes}`);
  const signer = send ? loadDeployer() : null;
  if (signer) transaction.sign([signer]);
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: Boolean(signer),
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  });
  if (simulation.value.err) throw new Error(`simulation failed: ${JSON.stringify(simulation.value.err)}`);
  if (!send) return { sent: false, bytes, units: simulation.value.unitsConsumed };
  const signature = await connection.sendRawTransaction(Buffer.from(transaction.serialize()), { skipPreflight: false, maxRetries: 5 });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(`transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  return { sent: true, signature, bytes, units: simulation.value.unitsConsumed };
}

async function commandBuy(connection, send) {
  let before = await readState(connection);
  if (before.record && BigInt(before.record.volumeRaw) >= FOUNDER_MIN_BUY_RAW && before.sourceBase.amount > 0n) {
    console.log(JSON.stringify({ alreadyBoughtThroughWrapper: true, state: publicState(before) }, null, 2));
    return;
  }
  if (before.sourceBase.amount > 0n) throw new Error("launch wallet already holds XCNDL without the expected founder game record");
  await waitUntilOpen(before.config);
  before = await readState(connection);
  const plan = await affordableFounderPlan(connection, before.sourceQuote.amount);
  if (before.sourceQuote.amount < plan.maximum) throw new Error(`launch wallet has ${ui(before.sourceQuote.amount, 8)} TSLAx, needs ${ui(plan.maximum, 8)}`);
  const a = before.addresses;
  const pumpBuy = await PUMP_SDK.getBuyV2InstructionRaw({
    user: DEPLOYER,
    mint: MINT,
    creator: plan.bondingCurve.creator,
    amount: new BN(plan.amountRaw.toString()),
    quoteAmount: new BN(plan.maximum.toString()),
    feeRecipient: plan.global.feeRecipient,
    buybackFeeRecipient: PUMP_BUYBACK_FEE_RECIPIENT,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteMint: TSLAX_MINT,
    quoteTokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  const wrapper = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: DEPLOYER, isSigner: true, isWritable: true },
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.pot, isSigner: false, isWritable: true },
      { pubkey: a.record, isSigner: false, isWritable: true },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pumpBuy.keys,
    ],
    data: Buffer.concat([Buffer.from([1, a.recordBump, a.configBump, a.potBump]), pumpBuy.data]),
  });
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"));
  if (!receipt.gameAlt?.address) throw new Error("frozen game ALT receipt is missing");
  const altResult = await connection.getAddressLookupTable(new PublicKey(receipt.gameAlt.address), { commitment: "confirmed" });
  if (!altResult.value || altResult.value.state.authority) throw new Error("game ALT is missing or not frozen");
  const result = await buildAndSend(connection, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
    wrapper,
  ], [altResult.value], send);
  console.log(JSON.stringify({ action: "buy", sent: false, amountRaw: plan.amountRaw.toString(), amountXcndl: ui(plan.amountRaw, 6), maxTslax: ui(plan.maximum, 8), transaction: result }, null, 2));
  if (!send) return;
  const after = await readState(connection);
  if (!after.record || BigInt(after.record.volumeRaw) !== plan.amountRaw || after.record.strikes !== "1" || after.record.score !== "1") {
    throw new Error("founder record readback does not prove exactly one dynamic wrapper rung");
  }
  if (after.sourceBase.amount < plan.amountRaw) throw new Error("founder XCNDL balance readback is below the confirmed purchase");
  saveReceipt({ founderBuy: { at: new Date().toISOString(), signature: result.signature, amountRaw: plan.amountRaw.toString(), maxTslaxRaw: plan.maximum.toString(), after: publicState(after) } });
  console.log(JSON.stringify({ sent: true, signature: result.signature, after: publicState(after) }, null, 2));
}

async function commandTransfer(connection, send) {
  const before = await readState(connection);
  const receipt = fs.existsSync(RECEIPT_PATH) ? JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8")) : {};
  const purchasedRaw = BigInt(receipt.founderBuy?.amountRaw || "0");
  if (purchasedRaw < FOUNDER_MIN_BUY_RAW) throw new Error("founder buy receipt is missing or below the game minimum");
  if (before.semirBase.amount >= purchasedRaw && before.sourceBase.amount < purchasedRaw) {
    console.log(JSON.stringify({ alreadyTransferred: true, state: publicState(before) }, null, 2));
    return;
  }
  if (!before.record || BigInt(before.record.volumeRaw) !== purchasedRaw) throw new Error("founder wrapper proof does not match the recorded purchase");
  if (before.sourceBase.amount < purchasedRaw) throw new Error("launch wallet has less XCNDL than the recorded purchase");
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(DEPLOYER, before.semirBase.ata, SEMIR, MINT, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(
      before.sourceBase.ata,
      MINT,
      before.semirBase.ata,
      DEPLOYER,
      purchasedRaw,
      before.mintDecimals,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
  ];
  const result = await buildAndSend(connection, instructions, [], send);
  console.log(JSON.stringify({ action: "transfer", sent: false, amountRaw: purchasedRaw.toString(), amountXcndl: ui(purchasedRaw, 6), to: SEMIR.toBase58(), transaction: result }, null, 2));
  if (!send) return;
  const after = await readState(connection);
  if (after.semirBase.amount < before.semirBase.amount + purchasedRaw) throw new Error("Semir XCNDL readback did not increase by the recorded purchase");
  saveReceipt({ founderTransfer: { at: new Date().toISOString(), signature: result.signature, after: publicState(after) } });
  console.log(JSON.stringify({ sent: true, signature: result.signature, after: publicState(after) }, null, 2));
}

async function main() {
  const command = process.argv[2] || "status";
  const send = sendEnabled();
  const connection = makeConnection();
  if (command === "status") return commandStatus(connection);
  if (command === "swap") return commandSwap(connection, send);
  if (command === "buy") return commandBuy(connection, send);
  if (command === "transfer") return commandTransfer(connection, send);
  throw new Error(`unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("ERROR:", error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  FOUNDER_MIN_BUY_RAW,
  INPUT_LAMPORTS,
  MIN_SOL_RESERVE_LAMPORTS,
  REQUIRED_CONFIRM,
  addSlippage,
  gameAddresses,
  ui,
};
