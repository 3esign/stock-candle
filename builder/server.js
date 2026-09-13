"use strict";

// No-keypair STOCK CANDLE transaction builder. It only reads public state,
// composes unsigned transactions and simulates them before returning bytes.
const fs = require("fs");
const http = require("http");
const path = require("path");
const { headers: incognitoHeaders } = require("C:\\Svemir\\lib\\incognito.js");
const { priceNextRung } = require("./rung.js");

const MODULES = "C:\\Svemir\\tools\\solana-cli\\scripts-scratch\\node_modules";
function requireFromTools(name) {
  try {
    return require(name);
  } catch (_error) {
    return require(path.join(MODULES, name));
  }
}

const BN = requireFromTools("bn.js");
const {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = requireFromTools("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} = requireFromTools("@solana/spl-token");
const {
  bondingCurvePda,
  getBuySolAmountFromTokenAmount,
  normalizeQuoteMint,
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
} = requireFromTools("@pump-fun/pump-sdk");

const MANIFEST_PATH = path.resolve(__dirname, "..", "site", "manifest.json");
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_INSTRUCTIONS_API = "https://lite-api.jup.ag/swap/v1/swap-instructions";
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const PUMP_BUYBACK_FEE_RECIPIENT = new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");
const MAX_PACKET_BYTES = 1232;
const MAX_BODY_BYTES = 1_000_000;
const SLIPPAGE_BPS = 100;
const U64_MAX = (1n << 64n) - 1n;
const CONFIG_LEN = 380;
const ALLOWED_ORIGINS = new Set([
  "https://scandle.ratchetx.xyz",
  "http://127.0.0.1:8791",
  "http://localhost:8791",
]);
const rateBuckets = new Map();

function makeConnection() {
  return new Connection(RPC, {
    commitment: "confirmed",
    fetchMiddleware: (url, options, fetch) => fetch(url, {
      ...options,
      headers: {
        ...incognitoHeaders(url, { vrsta: "json" }),
        ...(options.headers || {}),
      },
    }),
  });
}

function publicManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const requiredAddresses = [
    manifest.mint,
    manifest.programId,
    manifest.config,
    manifest.pot,
    manifest.potQuoteAta,
    manifest.gameAlt,
    manifest.baseTokenProgram,
    manifest.tslaxTokenProgram,
  ];
  const configured = manifest.deployed === true
    && manifest.tradingEnabled === true
    && manifest.creatorFeeSharing?.lockedOnChain === true
    && requiredAddresses.every((value) => address.test(value || ""));
  return { manifest, configured };
}

function connectionError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function assertConfigured() {
  const result = publicManifest();
  if (!result.configured) throw connectionError("launch_manifest_not_configured");
  return result.manifest;
}

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function u64At(buffer, offset) {
  return buffer.readBigUInt64LE(offset);
}

function i64At(buffer, offset) {
  return Number(buffer.readBigInt64LE(offset));
}

function keyAt(buffer, offset) {
  return new PublicKey(buffer.subarray(offset, offset + 32));
}

function isZeroKey(key) {
  return key.toBuffer().every((value) => value === 0);
}

function decodeConfig(info) {
  if (!info || info.data.length < CONFIG_LEN || info.data[0] !== 1) {
    throw connectionError("invalid_game_config");
  }
  const data = info.data;
  return {
    configBump: data[1],
    potBump: data[2],
    startTs: i64At(data, 3),
    endTs: i64At(data, 11),
    minimumBuyRaw: u64At(data, 19),
    entryFeeLamports: u64At(data, 27),
    totalStrikes: u64At(data, 35),
    closed: data[51] === 1,
    winner: keyAt(data, 52),
    winnerScore: u64At(data, 84),
    leader: keyAt(data, 92),
    leaderScore: u64At(data, 124),
    baseMint: keyAt(data, 236),
    baseTokenProgram: keyAt(data, 268),
    ladderStepRaw: u64At(data, 300),
    lastAwardedBalanceRaw: u64At(data, 308),
    quoteMint: keyAt(data, 316),
    quoteTokenProgram: keyAt(data, 348),
  };
}

function rawUi(raw, decimals) {
  const value = BigInt(raw.toString());
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addSlippage(raw, bps = SLIPPAGE_BPS) {
  const value = BigInt(raw.toString());
  return (value * BigInt(10_000 + bps) + 9_999n) / 10_000n;
}

async function retry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw connectionError(`${label}: ${lastError && lastError.message ? lastError.message : lastError}`);
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
    throw connectionError(`unreadable_http_${response.status}`);
  }
  if (!response.ok || body.error) throw connectionError(body.error || body.errorMessage || `http_${response.status}`);
  return body;
}

function verifyManifestState(manifest, programId, configPda, potPda, config) {
  const rules = manifest.launchParameters || {};
  const checks = [
    [programId.toBase58(), manifest.programId, "program"],
    [configPda.toBase58(), manifest.config, "config"],
    [potPda.toBase58(), manifest.pot, "pot"],
    [config.baseMint.toBase58(), manifest.mint, "base_mint"],
    [config.baseTokenProgram.toBase58(), manifest.baseTokenProgram, "base_token_program"],
    [config.quoteMint.toBase58(), manifest.tslaxMint, "quote_mint"],
    [config.quoteTokenProgram.toBase58(), manifest.tslaxTokenProgram, "quote_token_program"],
    [config.minimumBuyRaw.toString(), rules.minimumBaseAmountRaw, "minimum_buy"],
    [config.ladderStepRaw.toString(), rules.rungStepRaw, "rung_step"],
    [config.entryFeeLamports.toString(), rules.successfulRungFeeLamports, "entry_fee"],
    [String(config.endTs - config.startTs), String(rules.windowSeconds), "window"],
  ];
  const failed = checks.find(([actual, expected]) => actual !== expected);
  if (failed) throw connectionError(`manifest_chain_mismatch:${failed[2]}`);
}

async function loadGameAlt(connection, manifest) {
  const result = await retry("game_alt_read", () => connection.getAddressLookupTable(new PublicKey(manifest.gameAlt)));
  if (!result.value) throw connectionError("game_alt_missing");
  if (result.value.state.authority) throw connectionError("game_alt_not_frozen");
  return result.value;
}

async function readState(user) {
  const manifest = assertConfigured();
  const connection = makeConnection();
  const programId = new PublicKey(manifest.programId);
  const mint = new PublicKey(manifest.mint);
  const baseTokenProgram = new PublicKey(manifest.baseTokenProgram);
  const quoteTokenProgram = new PublicKey(manifest.tslaxTokenProgram);
  const [configPda, configBump] = pda([Buffer.from("candle_config"), mint.toBuffer()], programId);
  const [potPda, potBump] = pda([Buffer.from("candle_pot"), configPda.toBuffer()], programId);
  const [playerRecord, playerBump] = pda([
    Buffer.from("candle_player"),
    configPda.toBuffer(),
    user.toBuffer(),
  ], programId);
  const curvePda = bondingCurvePda(mint);
  const curveBaseAta = getAssociatedTokenAddressSync(
    mint,
    curvePda,
    true,
    baseTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userQuoteAta = getAssociatedTokenAddressSync(
    TSLAX_MINT,
    user,
    false,
    quoteTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const sdk = new OnlinePumpSdk(connection);
  const [accountBatch, global, feeConfig, bondingCurve, resolvedQuote] = await Promise.all([
    retry("game_account_read", () => connection.getMultipleAccountsInfo([
      configPda,
      mint,
      TSLAX_MINT,
      curveBaseAta,
      userQuoteAta,
      new PublicKey(manifest.potQuoteAta),
    ], "confirmed")),
    retry("pump_global_read", () => sdk.fetchGlobal()),
    retry("pump_fee_read", () => sdk.fetchFeeConfig()),
    retry("pump_curve_read", () => sdk.fetchBondingCurve(mint)),
    retry("tslax_resolve", () => sdk.resolveQuoteMint(TSLAX_MINT)),
  ]);
  const [configInfo, mintInfo, quoteMintInfo, curveAtaInfo, userQuoteInfo, potQuoteInfo] = accountBatch;
  if (!configInfo || !configInfo.owner.equals(programId)) throw connectionError("config_owner_mismatch");
  if (!mintInfo || !mintInfo.owner.equals(baseTokenProgram)) throw connectionError("base_mint_owner_mismatch");
  if (!quoteMintInfo || !quoteMintInfo.owner.equals(quoteTokenProgram)) throw connectionError("quote_mint_owner_mismatch");
  if (!curveAtaInfo || !curveAtaInfo.owner.equals(baseTokenProgram)) throw connectionError("curve_ata_missing");
  if (!potQuoteInfo || !potQuoteInfo.owner.equals(quoteTokenProgram)) throw connectionError("pot_quote_ata_missing");
  if (!resolvedQuote.quoteTokenProgram.equals(quoteTokenProgram)) throw connectionError("quote_program_mismatch");
  const config = decodeConfig(configInfo);
  verifyManifestState(manifest, programId, configPda, potPda, config);
  const mintState = unpackMint(mint, mintInfo, baseTokenProgram);
  const quoteMintState = unpackMint(TSLAX_MINT, quoteMintInfo, quoteTokenProgram);
  const curveAccount = unpackAccount(curveBaseAta, curveAtaInfo, baseTokenProgram);
  const potQuoteAccount = unpackAccount(new PublicKey(manifest.potQuoteAta), potQuoteInfo, quoteTokenProgram);
  const quoteMint = normalizeQuoteMint(bondingCurve.quoteMint);
  if (!quoteMint.equals(TSLAX_MINT)) throw connectionError("curve_quote_mint_mismatch");
  const rung = priceNextRung({
    curveBalance: curveAccount.amount,
    lastAwardedBalance: config.lastAwardedBalanceRaw,
    ladderStep: config.ladderStepRaw,
    minBuy: config.minimumBuyRaw,
  });
  const amount = new BN(rung.requiredBaseAmount.toString());
  const quoteCost = getBuySolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: new BN(mintState.supply.toString()),
    bondingCurve,
    amount,
    quoteMint,
  });
  const quoteMaxRaw = addSlippage(quoteCost);
  const userQuoteBalance = userQuoteInfo
    ? unpackAccount(userQuoteAta, userQuoteInfo, quoteTokenProgram).amount
    : 0n;
  const alt = await loadGameAlt(connection, manifest);
  return {
    manifest,
    connection,
    programId,
    mint,
    baseTokenProgram,
    quoteTokenProgram,
    configPda,
    configBump,
    potPda,
    potBump,
    playerRecord,
    playerBump,
    curvePda,
    curveBaseAta,
    userQuoteAta,
    config,
    global,
    feeConfig,
    bondingCurve,
    mintState,
    quoteMintState,
    rung,
    amount,
    quoteCost,
    quoteMaxRaw,
    userQuoteBalance,
    potQuoteBalance: potQuoteAccount.amount,
    gameAlt: alt,
  };
}

function stateMeasure(user, state, maximumQuoteRaw) {
  const max = maximumQuoteRaw === null ? null : BigInt(maximumQuoteRaw);
  const failures = [];
  const now = Math.floor(Date.now() / 1000);
  if (state.config.closed) failures.push("race_closed");
  if (now < state.config.startTs) failures.push("race_not_started");
  if (now > state.config.endTs) failures.push("race_window_ended");
  if (max !== null && state.quoteMaxRaw > max) failures.push("next_rung_exceeds_tslax_budget");
  return {
    gates: { ok: failures.length === 0, failures },
    intent: {
      kind: "measure",
      user: user.toBase58(),
      mint: state.mint.toBase58(),
      config: state.configPda.toBase58(),
    },
    requiredBaseAmountRaw: state.amount.toString(),
    requiredBaseAmountUi: rawUi(state.amount, state.mintState.decimals),
    requiredQuoteAmountRaw: state.quoteCost.toString(),
    requiredQuoteAmountUi: rawUi(state.quoteCost, state.quoteMintState.decimals),
    maxQuoteAmountRaw: state.quoteMaxRaw.toString(),
    maxQuoteAmountUi: rawUi(state.quoteMaxRaw, state.quoteMintState.decimals),
    playerQuoteBalanceRaw: state.userQuoteBalance.toString(),
    playerQuoteBalanceUi: rawUi(state.userQuoteBalance, state.quoteMintState.decimals),
    nextTargetCurveBalanceRaw: state.rung.targetCurveBalance.toString(),
    firstRung: state.rung.firstRung,
  };
}

async function makePumpBuy(user, state) {
  return PUMP_SDK.getBuyV2InstructionRaw({
    user,
    mint: state.mint,
    creator: state.bondingCurve.creator,
    amount: state.amount,
    quoteAmount: new BN(state.quoteMaxRaw.toString()),
    feeRecipient: state.global.feeRecipient,
    buybackFeeRecipient: PUMP_BUYBACK_FEE_RECIPIENT,
    tokenProgram: state.baseTokenProgram,
    quoteMint: TSLAX_MINT,
    quoteTokenProgram: state.quoteTokenProgram,
  });
}

function makeStrike(user, state, pumpBuy) {
  return new TransactionInstruction({
    programId: state.programId,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: state.configPda, isSigner: false, isWritable: true },
      { pubkey: state.potPda, isSigner: false, isWritable: true },
      { pubkey: state.playerRecord, isSigner: false, isWritable: true },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pumpBuy.keys,
    ],
    data: Buffer.concat([
      Buffer.from([1, state.playerBump, state.configBump, state.potBump]),
      pumpBuy.data,
    ]),
  });
}

function deserializeJupiterInstruction(ix) {
  if (!ix) return null;
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

async function loadLookupTables(connection, addresses) {
  return Promise.all(addresses.map(async (address) => {
    const result = await retry("jupiter_alt_read", () => connection.getAddressLookupTable(new PublicKey(address)));
    if (!result.value) throw connectionError(`jupiter_alt_missing:${address}`);
    return result.value;
  }));
}

async function compileAndSimulate(connection, payer, instructions, lookups) {
  const latest = await retry("blockhash_read", () => connection.getLatestBlockhash("confirmed"));
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookups);
  const transaction = new VersionedTransaction(message);
  const serialized = Buffer.from(transaction.serialize());
  if (serialized.length > MAX_PACKET_BYTES) throw connectionError(`packet_too_large:${serialized.length}`);
  const simulation = await retry("transaction_simulation", () => connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  }));
  if (simulation.value.err) throw connectionError(`simulation_failed:${JSON.stringify(simulation.value.err)}`);
  return {
    type: "solana:v0",
    encoding: "base64",
    serializedBase64: serialized.toString("base64"),
    bytes: serialized.length,
    recentBlockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    simulationUnits: simulation.value.unitsConsumed || null,
  };
}

async function buildDirect(user, maximumQuoteRaw, serialize) {
  const state = await readState(user);
  const measured = stateMeasure(user, state, maximumQuoteRaw);
  if (!measured.gates.ok || !serialize) return { ...measured, transaction: null };
  if (state.userQuoteBalance < state.quoteMaxRaw) {
    measured.gates.ok = false;
    measured.gates.failures.push("insufficient_tslax_balance");
    return { ...measured, transaction: null };
  }
  const pumpBuy = await makePumpBuy(user, state);
  const strike = makeStrike(user, state, pumpBuy);
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
    strike,
  ];
  const transaction = await compileAndSimulate(state.connection, user, instructions, [state.gameAlt]);
  return {
    ...measured,
    intent: { ...measured.intent, kind: "direct-rung", maximumQuoteAmountRaw: String(maximumQuoteRaw) },
    transaction,
  };
}

async function buildAtomic(user, body) {
  const quote = body.quoteResponse;
  if (!quote || quote.inputMint !== SOL_MINT.toBase58() || quote.outputMint !== TSLAX_MINT.toBase58()) {
    throw new Error("jupiter_quote_mint_mismatch");
  }
  if (String(body.inputAmountRaw) !== String(quote.inAmount)
      || String(body.minimumTslaxAmountRaw) !== String(quote.otherAmountThreshold)) {
    throw new Error("jupiter_quote_amount_mismatch");
  }
  const state = await readState(user);
  const measured = stateMeasure(user, state, BigInt(quote.otherAmountThreshold));
  if (!measured.gates.ok) return { ...measured, transaction: null };
  if (BigInt(quote.otherAmountThreshold) < state.quoteMaxRaw) {
    return {
      ...measured,
      gates: { ok: false, failures: ["route_minimum_does_not_cover_next_rung"] },
      transaction: null,
    };
  }
  const plan = await fetchJson(JUPITER_INSTRUCTIONS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: user.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: false,
    }),
  });
  const pumpBuy = await makePumpBuy(user, state);
  const strike = makeStrike(user, state, pumpBuy);
  const jupiterInstructions = [
    plan.tokenLedgerInstruction,
    ...(plan.setupInstructions || []),
    ...(plan.otherInstructions || []),
    plan.swapInstruction,
    plan.cleanupInstruction,
  ].filter(Boolean).map(deserializeJupiterInstruction);
  const jupiterLookups = await loadLookupTables(state.connection, plan.addressLookupTableAddresses || []);
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
    ...jupiterInstructions,
    strike,
  ];
  const transaction = await compileAndSimulate(
    state.connection,
    user,
    instructions,
    [...jupiterLookups, state.gameAlt]
  );
  return {
    ...measured,
    intent: {
      kind: "atomic-sol-entry",
      user: user.toBase58(),
      inputMint: SOL_MINT.toBase58(),
      outputMint: TSLAX_MINT.toBase58(),
      inputAmountRaw: String(quote.inAmount),
      minimumTslaxAmountRaw: String(quote.otherAmountThreshold),
    },
    transaction,
  };
}

async function buildSettlement(user, kind) {
  const state = await readState(user);
  const now = Math.floor(Date.now() / 1000);
  let winner;
  let instruction;
  if (kind === "close") {
    winner = state.config.leader;
    if (state.config.closed || now <= state.config.endTs || isZeroKey(winner)) {
      return { gates: { ok: false, failures: ["sol_settlement_not_ready"] }, transaction: null };
    }
    instruction = new TransactionInstruction({
      programId: state.programId,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: state.configPda, isSigner: false, isWritable: true },
        { pubkey: state.potPda, isSigner: false, isWritable: true },
        { pubkey: winner, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([2, state.configBump, state.potBump]),
    });
  } else {
    winner = state.config.winner;
    if (!state.config.closed || isZeroKey(winner) || state.potQuoteBalance === 0n) {
      return { gates: { ok: false, failures: ["quote_prize_not_ready"] }, transaction: null };
    }
    const winnerQuoteAta = getAssociatedTokenAddressSync(
      TSLAX_MINT,
      winner,
      false,
      state.quoteTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    instruction = new TransactionInstruction({
      programId: state.programId,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: state.configPda, isSigner: false, isWritable: false },
        { pubkey: state.potPda, isSigner: false, isWritable: false },
        { pubkey: winner, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(state.manifest.potQuoteAta), isSigner: false, isWritable: true },
        { pubkey: winnerQuoteAta, isSigner: false, isWritable: true },
        { pubkey: TSLAX_MINT, isSigner: false, isWritable: false },
        { pubkey: state.quoteTokenProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([3, state.configBump, state.potBump]),
    });
  }
  const transaction = await compileAndSimulate(state.connection, user, [instruction], []);
  return {
    gates: { ok: true, failures: [] },
    intent: {
      kind,
      caller: user.toBase58(),
      config: state.configPda.toBase58(),
      winner: winner.toBase58(),
    },
    transaction,
  };
}

function corsOrigin(request) {
  const origin = request.headers.origin || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "https://scandle.ratchetx.xyz";
}

function sendJson(request, response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": corsOrigin(request),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  });
  response.end(JSON.stringify(body, null, 2));
}

function rateLimited(request) {
  const key = String(request.headers["cf-connecting-ip"] || request.socket.remoteAddress || "unknown");
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("request_body_too_large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function userFrom(url, body = {}) {
  return new PublicKey(url.searchParams.get("user") || body.user || "");
}

async function route(request) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/health" && request.method === "GET") {
    const { manifest, configured } = publicManifest();
    return {
      status: 200,
      body: {
        ok: true,
        service: "stock-candle-builder",
        configured,
        signs: false,
        sends: false,
        site: manifest.siteUrl,
        program: manifest.programId || null,
        mint: manifest.mint || null,
      },
    };
  }
  if (request.method === "OPTIONS") return { status: 204, body: null };
  const origin = request.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return { status: 403, body: { error: "origin_not_allowed" } };
  if (rateLimited(request)) return { status: 429, body: { error: "rate_limited" } };

  const body = request.method === "POST" ? await readBody(request) : {};
  const user = userFrom(url, body);
  if (url.pathname === "/api/stock-candle/measure" && request.method === "GET") {
    const maximum = url.searchParams.get("maxQuoteAmountRaw");
    const state = await readState(user);
    return { status: 200, body: stateMeasure(user, state, maximum) };
  }
  if (url.pathname === "/api/stock-candle/build" && request.method === "GET") {
    const maximum = url.searchParams.get("maxQuoteAmountRaw");
    return { status: 200, body: await buildDirect(user, maximum, true) };
  }
  if (url.pathname === "/api/stock-candle/build-sol-entry" && request.method === "POST") {
    return { status: 200, body: await buildAtomic(user, body) };
  }
  if (url.pathname === "/api/stock-candle/build-close" && request.method === "GET") {
    return { status: 200, body: await buildSettlement(user, "close") };
  }
  if (url.pathname === "/api/stock-candle/build-quote-claim" && request.method === "GET") {
    return { status: 200, body: await buildSettlement(user, "quote-claim") };
  }
  return { status: 404, body: { error: "not_found" } };
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const result = await route(request);
      if (result.status === 204) {
        response.writeHead(204, {
          "access-control-allow-origin": corsOrigin(request),
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        response.end();
        return;
      }
      sendJson(request, response, result.status, result.body);
    } catch (error) {
      const status = error.statusCode || (/invalid|mismatch|not_ready|not_configured|insufficient/i.test(error.message) ? 400 : 500);
      sendJson(request, response, status, { error: String(error.message || error) });
    }
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8792);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`STOCK CANDLE builder: http://127.0.0.1:${port}`);
  });
}

module.exports = {
  CONFIG_LEN,
  U64_MAX,
  createServer,
  decodeConfig,
  publicManifest,
  stateMeasure,
};
