"use strict";

const app = {
  manifest: null,
  provider: null,
  wallet: "",
  mode: "sol",
  quote: null,
  quoteAt: 0,
  gameMeasure: null,
  gameMeasureAt: 0,
  atomicFallback: false,
  busy: false,
  rpcUrl: "",
  chainVerified: false,
  chainState: null,
  chainRefresh: 0,
};

const ui = {};
const SOL_MINT = "So11111111111111111111111111111111111111112";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAX_QUOTE_AGE_MS = 30000;
const MAX_PRICE_IMPACT_PCT = 0.01;
const SLIPPAGE_BPS = 100;

function byId(id) {
  return document.getElementById(id);
}

function shorten(value) {
  if (!value || value.length < 16) return value || "";
  return value.slice(0, 7) + "..." + value.slice(-6);
}

function decimalToRaw(value, decimals) {
  const clean = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(clean)) {
    throw new Error("Enter a positive number.");
  }
  const parts = clean.split(".");
  const fraction = (parts[1] || "").slice(0, decimals).padEnd(decimals, "0");
  const raw = BigInt(parts[0]) * (10n ** BigInt(decimals)) + BigInt(fraction || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero.");
  return raw;
}

function rawToDecimal(value, decimals, maxFraction = 8) {
  const raw = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole.toString();
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

function base58Encode(bytes) {
  if (!bytes.length) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [];
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index];
    for (let place = 0; place < digits.length; place += 1) {
      carry += digits[place] << 8;
      digits[place] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "1".repeat(zeros);
  for (let index = digits.length - 1; index >= 0; index -= 1) result += BASE58[digits[index]];
  return result;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_error) {
    throw new Error("Service returned an unreadable response.");
  }
  if (!response.ok || body.error) {
    const rpcMessage = body.error && typeof body.error === "object" ? body.error.message : body.error;
    throw new Error(rpcMessage || body.errorMessage || "Request failed with HTTP " + response.status + ".");
  }
  return body;
}

async function rpc(method, params) {
  const urls = [app.rpcUrl].concat(app.manifest.rpcUrls || []).filter((url, index, list) => url && list.indexOf(url) === index);
  let lastError = null;
  for (const url of urls) {
    try {
      const body = await fetchJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || [] }),
      });
      app.rpcUrl = url;
      return body.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No public RPC endpoint answered.");
}

function findWalletProvider() {
  if (window.solana && window.solana.isPhantom) return window.solana;
  if (window.backpack && window.backpack.solana) return window.backpack.solana;
  if (window.solflare) return window.solflare;
  if (window.solana) return window.solana;
  return null;
}

function manifestIsConfigured() {
  const m = app.manifest || {};
  const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const rules = m.launchParameters || {};
  const shares = m.creatorFeeSharing || {};
  return Boolean(
    m.deployed === true &&
    m.tradingEnabled === true &&
    m.programImmutable === true &&
    address.test(m.mint || "") &&
    address.test(m.programId || "") &&
    address.test(m.config || "") &&
    address.test(m.pot || "") &&
    address.test(m.potQuoteAta || "") &&
    address.test(m.gameAlt || "") &&
    address.test(m.baseTokenProgram || "") &&
    address.test(m.tslaxTokenProgram || "") &&
    /^https:\/\//.test(m.gameBuilderUrl || "") &&
    /^https:\/\//.test(m.xUrl || "") &&
    /^https:\/\//.test(m.telegramUrl || "") &&
    /^[0-9A-F]{64}$/.test(m.expectedProgramSha256 || "") &&
    rules.windowSeconds === 900 &&
    rules.minimumBaseAmountRaw === "1000000000000" &&
    rules.rungStepRaw === "1000000000000" &&
    rules.successfulRungFeeLamports === "1000000" &&
    rules.initialPotLamports === "50000000" &&
    shares.potShareBps === 6633 &&
    shares.creatorShareBps === 3367 &&
    shares.lockedOnChain === true
  );
}

function manifestIsLaunchReady() {
  return manifestIsConfigured() && app.chainVerified;
}

function atomicSolEntryEnabled() {
  return manifestIsLaunchReady() && app.manifest.atomicSolEntryEnabled === true;
}

function setBusy(value) {
  app.busy = value;
  renderEntry();
}

function setStatus(message, kind = "") {
  ui.tradeStatus.textContent = message;
  ui.tradeStatus.dataset.kind = kind;
}

function setStateStatus(message, kind = "") {
  ui.stateStatus.textContent = message;
  ui.stateStatus.dataset.kind = kind;
}

function readU64(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}

function readI64(bytes, offset) {
  return Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigInt64(offset, true));
}

function addressAt(bytes, offset) {
  return base58Encode(bytes.slice(offset, offset + 32));
}

function zeroAddressAt(bytes, offset) {
  return bytes.slice(offset, offset + 32).every((value) => value === 0);
}

function formatSol(lamports) {
  return rawToDecimal(BigInt(lamports), 9, 6) + " SOL";
}

function decodeGameConfig(bytes) {
  if (bytes.length < 380 || bytes[0] !== 1) throw new Error("Game config has an invalid layout.");
  const topWallet = zeroAddressAt(bytes, 92) ? "" : addressAt(bytes, 92);
  const storedWinner = zeroAddressAt(bytes, 52) ? "" : addressAt(bytes, 52);
  return {
    startTs: readI64(bytes, 3),
    endTs: readI64(bytes, 11),
    minimumBuyRaw: readU64(bytes, 19).toString(),
    entryFeeLamports: readU64(bytes, 27).toString(),
    totalStrikes: readU64(bytes, 35).toString(),
    closed: bytes[51] === 1,
    winner: storedWinner,
    winnerScore: readU64(bytes, 84).toString(),
    leader: topWallet,
    leaderScore: readU64(bytes, 124).toString(),
    baseMint: addressAt(bytes, 236),
    baseTokenProgram: addressAt(bytes, 268),
    rungStepRaw: readU64(bytes, 300).toString(),
    quoteMint: addressAt(bytes, 316),
    quoteTokenProgram: addressAt(bytes, 348),
  };
}

function renderCountdown() {
  if (!app.chainState) return;
  if (app.chainState.closed) {
    ui.closeState.textContent = "CLOSED";
    return;
  }
  const seconds = Math.max(0, app.chainState.endTs - Math.floor(Date.now() / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  ui.closeState.textContent = seconds ? minutes + ":" + rest : "READY TO SETTLE";
  renderStateActions();
}

function renderStateActions() {
  if (!ui.settleButton || !ui.claimButton) return;
  const ready = manifestIsLaunchReady();
  const state = app.chainState;
  const connected = Boolean(app.wallet);
  const afterClose = state && Math.floor(Date.now() / 1000) > state.endTs;
  ui.settleButton.disabled = app.busy || !ready || !connected || !state || state.closed || !afterClose || !state.leader;
  ui.claimButton.disabled = app.busy || !ready || !connected || !state || !state.closed || BigInt(state.prizeRaw || "0") === 0n;
}

function renderChainState() {
  const state = app.chainState;
  if (!state) return;
  ui.potState.textContent = formatSol(state.potLamports);
  ui.prizeState.textContent = state.prizeUi + " TSLAx";
  ui.rungState.textContent = state.closed ? "RACE CLOSED" : "1M XCNDL MORE";
  const leader = state.closed ? state.winner : state.leader;
  const score = state.closed ? state.winnerScore : state.leaderScore;
  ui.leaderState.textContent = leader ? shorten(leader) + " / " + score + " rung" + (score === "1" ? "" : "s") : "NO LEADER";
  ui.stateExplanation.textContent = "Live values are read directly from the verified config, SOL pot and TSLAx token account. Program authority is revoked; the builder is not the source of game state.";
  ui.chartSummary.textContent = "Live board verified: " + state.totalStrikes + " awarded rung" + (state.totalStrikes === "1" ? "" : "s") + ". The yellow line represents the next 1M XCNDL target.";
  renderCountdown();
  renderStateActions();
}

async function hydrateOnChainState() {
  if (!manifestIsConfigured()) return;
  app.chainVerified = false;
  const [configResult, potResult, prizeResult] = await Promise.all([
    rpc("getAccountInfo", [app.manifest.config, { encoding: "base64", commitment: "confirmed" }]),
    rpc("getBalance", [app.manifest.pot, { commitment: "confirmed" }]),
    rpc("getAccountInfo", [app.manifest.potQuoteAta, { encoding: "base64", commitment: "confirmed" }]),
  ]);
  if (!configResult || !configResult.value || configResult.value.owner !== app.manifest.programId) {
    throw new Error("Config account owner does not match the published game program.");
  }
  if (!prizeResult || !prizeResult.value || prizeResult.value.owner !== app.manifest.tslaxTokenProgram) {
    throw new Error("TSLAx prize account owner does not match Token-2022.");
  }
  const bytes = bytesFromBase64(configResult.value.data[0]);
  const decoded = decodeGameConfig(bytes);
  const prizeBytes = bytesFromBase64(prizeResult.value.data[0]);
  if (prizeBytes.length < 72
      || addressAt(prizeBytes, 0) !== app.manifest.tslaxMint
      || addressAt(prizeBytes, 32) !== app.manifest.pot) {
    throw new Error("TSLAx prize account mint or pot authority does not match the public manifest.");
  }
  const prizeRaw = readU64(prizeBytes, 64).toString();
  if (decoded.baseMint !== app.manifest.mint
      || decoded.baseTokenProgram !== app.manifest.baseTokenProgram
      || decoded.quoteMint !== app.manifest.tslaxMint
      || decoded.quoteTokenProgram !== app.manifest.tslaxTokenProgram) {
    throw new Error("Config mint or token-program binding does not match the public manifest.");
  }
  const rules = app.manifest.launchParameters;
  if (decoded.minimumBuyRaw !== rules.minimumBaseAmountRaw
      || decoded.rungStepRaw !== rules.rungStepRaw
      || decoded.entryFeeLamports !== rules.successfulRungFeeLamports
      || decoded.endTs - decoded.startTs !== rules.windowSeconds) {
    throw new Error("On-chain game rules do not match the public manifest.");
  }
  app.chainState = {
    ...decoded,
    potLamports: String(potResult.value),
    prizeRaw,
    prizeUi: rawToDecimal(prizeRaw, 8),
  };
  app.chainVerified = true;
  setStateStatus("Live config, SOL pot and TSLAx prize account verified directly on Solana.", "ok");
  renderManifest();
  renderChainState();
  renderEntry();
}

function renderManifest() {
  const m = app.manifest;
  const ready = manifestIsLaunchReady();
  ui.launchPill.textContent = ready ? "LIVE" : "PRE-LAUNCH";
  ui.chartState.textContent = ready ? "LIVE READ" : "NOT LIVE";
  ui.chartState.classList.toggle("pending", !ready);
  ui.mintState.textContent = m.mint ? shorten(m.mint) : "PENDING";
  ui.programState.textContent = m.programId ? shorten(m.programId) : "PENDING";
  ui.potState.textContent = m.pot ? shorten(m.pot) : "NOT CREATED";
  ui.prizeState.textContent = m.potQuoteAta ? shorten(m.potQuoteAta) : "NOT CREATED";
  if (ready) {
    ui.stateExplanation.textContent = "Verified deployment addresses are frozen in the public manifest. Live account reads activate after launch state hydration.";
  }

  const socialLinks = [
    [ui.xLink, m.xUrl],
    [ui.telegramLink, m.telegramUrl],
  ];
  let visible = 0;
  socialLinks.forEach(([element, href]) => {
    const safe = /^https:\/\//.test(href || "");
    element.hidden = !safe;
    if (safe) {
      element.href = href;
      element.target = "_blank";
      visible += 1;
    }
  });
  ui.socialPending.hidden = visible === socialLinks.length;
}

function renderEntry() {
  const solMode = app.mode === "sol";
  const launchReady = manifestIsLaunchReady();
  const eligible = ui.eligibilityCheck.checked;
  document.querySelectorAll(".mode-tab").forEach((button) => {
    const active = button.dataset.mode === app.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  ui.amountLabel.textContent = solMode ? "SOL to convert" : "Maximum TSLAx budget";
  ui.amountUnit.textContent = solMode ? "SOL" : "TSLAx";
  ui.amountHelp.textContent = solMode
    ? (atomicSolEntryEnabled()
      ? "The site combines SOL, TSLAx and the rung buy when the current route fits one transaction."
      : "The site gets TSLAx first, then prepares the rung buy. Your wallet approves each transaction.")
    : "The builder calculates the next rung and never asks the wallet to spend above this budget.";
  ui.quoteButton.textContent = solMode ? "Check SOL -> TSLAx" : (launchReady ? "Price next rung" : "Check TSLAx balance");
  ui.walletValue.textContent = app.wallet ? shorten(app.wallet) : "Not connected";
  ui.connectWallet.textContent = app.wallet ? shorten(app.wallet) : "Connect wallet";
  ui.connectTop.textContent = app.wallet ? shorten(app.wallet) : "Connect wallet";
  ui.connectWallet.disabled = app.busy;
  ui.connectTop.disabled = app.busy;
  ui.quoteButton.disabled = app.busy || !eligible;
  renderStateActions();

  if (!launchReady) {
    ui.tradeButton.disabled = true;
    ui.tradeButton.textContent = "Trading opens at launch";
    return;
  }
  if (!app.wallet || !eligible) {
    ui.tradeButton.disabled = true;
    ui.tradeButton.textContent = app.wallet ? "Confirm eligibility" : "Connect wallet";
    return;
  }
  if (solMode) {
    const quoteFresh = app.quote && Date.now() - app.quoteAt <= MAX_QUOTE_AGE_MS;
    ui.tradeButton.disabled = app.busy || !quoteFresh;
    const oneSignature = atomicSolEntryEnabled() && !app.atomicFallback;
    ui.tradeButton.textContent = quoteFresh
      ? (oneSignature ? "Buy XCNDL in one signature" : "Get TSLAx with SOL")
      : "Check route first";
  } else {
    const measureFresh = app.gameMeasure && Date.now() - app.gameMeasureAt <= MAX_QUOTE_AGE_MS;
    ui.tradeButton.disabled = app.busy || !measureFresh;
    ui.tradeButton.textContent = measureFresh ? "Cross next rung" : "Price next rung first";
  }
}

async function connectWallet() {
  const provider = findWalletProvider();
  if (!provider) {
    setStatus("No Solana wallet was found in this browser. Open the site in Phantom, Backpack or a wallet-enabled browser.", "error");
    return;
  }
  setBusy(true);
  try {
    const result = await provider.connect();
    app.provider = provider;
    app.wallet = String(result && result.publicKey ? result.publicKey : provider.publicKey || "");
    if (!app.wallet) throw new Error("The wallet connected without exposing an address.");
    setStatus("Wallet connected: " + shorten(app.wallet) + ". No transaction was requested.", "ok");
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    setBusy(false);
  }
}

function validateSolAmount() {
  const raw = decimalToRaw(ui.entryAmount.value, 9);
  if (raw < 1000000n) throw new Error("Use at least 0.001 SOL for a meaningful route check.");
  if (raw > 2000000000n) throw new Error("The site caps one conversion at 2 SOL.");
  return raw;
}

async function quoteSolToTslax() {
  const inputRaw = validateSolAmount();
  const url = new URL(app.manifest.jupiterQuoteApi);
  url.searchParams.set("inputMint", SOL_MINT);
  url.searchParams.set("outputMint", app.manifest.tslaxMint);
  url.searchParams.set("amount", inputRaw.toString());
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("slippageBps", String(SLIPPAGE_BPS));
  url.searchParams.set("restrictIntermediateTokens", "true");
  const quote = await fetchJson(url.toString(), { cache: "no-store" });
  if (quote.inputMint !== SOL_MINT || quote.outputMint !== app.manifest.tslaxMint) {
    throw new Error("Route mint mismatch. Nothing was signed.");
  }
  if (BigInt(quote.inAmount) !== inputRaw || BigInt(quote.otherAmountThreshold) <= 0n) {
    throw new Error("Route amount mismatch. Nothing was signed.");
  }
  const impact = Number(quote.priceImpactPct || "0");
  if (!Number.isFinite(impact) || impact > MAX_PRICE_IMPACT_PCT) {
    throw new Error("Price impact exceeds the 1% site guard.");
  }
  app.quote = quote;
  app.quoteAt = Date.now();
  app.atomicFallback = false;
  const minimum = rawToDecimal(quote.otherAmountThreshold, 8);
  const route = (quote.routePlan || []).map((item) => item.swapInfo && item.swapInfo.label).filter(Boolean).join(" + ");
  ui.quoteValue.textContent = rawToDecimal(inputRaw, 9) + " SOL -> at least " + minimum + " TSLAx";
  const approval = atomicSolEntryEnabled() ? "One-signature game entry will be tried" : "TSLAx conversion is the first approval";
  ui.quoteDetail.textContent = "1% slippage guard" + (route ? " | " + route : "") + ". " + approval + ". Quote expires in 30 seconds.";
  setStatus("Fresh route found. This check did not sign or send anything.", "ok");
}

async function checkTslaxBalance() {
  if (!app.wallet) throw new Error("Connect your wallet before checking its TSLAx balance.");
  const result = await rpc("getTokenAccountsByOwner", [
    app.wallet,
    { mint: app.manifest.tslaxMint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  const total = (result.value || []).reduce((sum, item) => {
    const amount = item.account && item.account.data && item.account.data.parsed && item.account.data.parsed.info.tokenAmount.amount;
    return sum + BigInt(amount || "0");
  }, 0n);
  const requested = decimalToRaw(ui.entryAmount.value, 8);
  ui.quoteValue.textContent = rawToDecimal(total, 8) + " TSLAx in wallet";
  ui.quoteDetail.textContent = total >= requested ? "Balance covers the entered amount." : "Balance is below the entered amount.";
  setStatus("TSLAx balance read from Solana. Nothing was signed.", total >= requested ? "ok" : "warning");
  return { total, requested };
}

async function callGameBuilder(kind, budgetRaw) {
  if (!manifestIsLaunchReady()) throw new Error("Launch manifest is not ready. Game pricing remains disabled.");
  const url = new URL("/api/stock-candle/" + kind, app.manifest.gameBuilderUrl);
  url.searchParams.set("user", app.wallet);
  url.searchParams.set("maxQuoteAmountRaw", budgetRaw.toString());
  return fetchJson(url.toString(), { cache: "no-store" });
}

async function callAtomicEntryBuilder() {
  if (!atomicSolEntryEnabled()) throw new Error("One-signature entry is not enabled for this launch.");
  const url = new URL("/api/stock-candle/build-sol-entry", app.manifest.gameBuilderUrl);
  return fetchJson(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user: app.wallet,
      quoteResponse: app.quote,
      inputAmountRaw: String(app.quote.inAmount),
      minimumTslaxAmountRaw: String(app.quote.otherAmountThreshold),
    }),
  });
}

function verifyAtomicIntent(built) {
  const intent = built && built.intent;
  if (!intent || intent.user !== app.wallet || intent.inputMint !== SOL_MINT || intent.outputMint !== app.manifest.tslaxMint) {
    throw new Error("Combined builder intent did not match this wallet and route.");
  }
  if (String(intent.inputAmountRaw) !== String(app.quote.inAmount)
      || String(intent.minimumTslaxAmountRaw) !== String(app.quote.otherAmountThreshold)) {
    throw new Error("Combined builder amounts did not match the checked quote.");
  }
}

async function measureNextRung() {
  const balance = await checkTslaxBalance();
  if (!manifestIsLaunchReady()) return;
  const measured = await callGameBuilder("measure", balance.requested);
  if (!measured.gates || measured.gates.ok !== true) {
    throw new Error((measured.gates && measured.gates.failures && measured.gates.failures[0]) || "The next rung is not currently buildable.");
  }
  app.gameMeasure = measured;
  app.gameMeasureAt = Date.now();
  const requiredBase = measured.requiredBaseAmountUi || "calculated";
  const requiredQuote = measured.maxQuoteAmountUi || measured.requiredQuoteAmountUi || rawToDecimal(balance.requested, 8);
  ui.quoteValue.textContent = requiredBase + " XCNDL crosses the next rung";
  ui.quoteDetail.textContent = "Maximum " + requiredQuote + " TSLAx. Quote expires in 30 seconds.";
  setStatus("Next rung priced from current on-chain state. Nothing was signed.", "ok");
}

async function inspectEntry() {
  setBusy(true);
  try {
    if (!ui.eligibilityCheck.checked) throw new Error("Confirm TSLAx eligibility before requesting market data.");
    if (app.mode === "sol") await quoteSolToTslax();
    else await measureNextRung();
  } catch (error) {
    app.quote = null;
    ui.quoteValue.textContent = "No valid route or balance result.";
    ui.quoteDetail.textContent = "Nothing was signed.";
    setStatus(String(error.message || error), "error");
  } finally {
    setBusy(false);
  }
}

async function simulateSerializedTransaction(base64) {
  const result = await rpc("simulateTransaction", [base64, {
    encoding: "base64",
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  }]);
  if (!result || result.value.err) {
    throw new Error("On-chain simulation failed: " + JSON.stringify(result && result.value ? result.value.err : "no result"));
  }
  return result.value;
}

async function walletSignAndSendBase64(base64) {
  const provider = app.provider || findWalletProvider();
  if (!provider || typeof provider.request !== "function") {
    throw new Error("This wallet cannot sign the versioned transaction through its browser API.");
  }
  const message = base58Encode(bytesFromBase64(base64));
  const result = await provider.request({
    method: "signAndSendTransaction",
    params: {
      message,
      options: { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 },
    },
  });
  return String(result && result.signature ? result.signature : result || "");
}

async function getTslaxWithSol() {
  if (!manifestIsLaunchReady()) throw new Error("Launch manifest is not ready. Spending remains disabled.");
  if (!app.wallet) throw new Error("Connect your wallet first.");
  if (!app.quote || Date.now() - app.quoteAt > MAX_QUOTE_AGE_MS) throw new Error("The route expired. Check it again.");
  const minimumTslax = rawToDecimal(app.quote.otherAmountThreshold, 8);
  const swap = await fetchJson(app.manifest.jupiterSwapApi, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: app.quote,
      userPublicKey: app.wallet,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: 1000000, global: false, priorityLevel: "high" },
      },
    }),
  });
  if (swap.simulationError) throw new Error("Route builder simulation failed.");
  if (!swap.swapTransaction) throw new Error("Route builder returned no transaction.");
  await simulateSerializedTransaction(swap.swapTransaction);
  setStatus("Simulation passed. Check the wallet transaction carefully before approving it.", "warning");
  const signature = await walletSignAndSendBase64(swap.swapTransaction);
  app.quote = null;
  app.mode = "tslax";
  app.gameMeasure = null;
  ui.entryAmount.value = minimumTslax;
  setStatus("TSLAx conversion sent: " + shorten(signature) + ". Switch complete; confirm it before playing.", "ok");
}

async function playAtomicWithSol() {
  if (!app.wallet) throw new Error("Connect your wallet first.");
  if (!app.quote || Date.now() - app.quoteAt > MAX_QUOTE_AGE_MS) throw new Error("The route expired. Check it again.");
  let built;
  try {
    built = await callAtomicEntryBuilder();
    verifyAtomicIntent(built);
    if (!built.gates || built.gates.ok !== true || !built.transaction || !built.transaction.serializedBase64) {
      throw new Error((built.gates && built.gates.failures && built.gates.failures[0]) || "Combined transaction is not buildable for this route.");
    }
    await simulateSerializedTransaction(built.transaction.serializedBase64);
  } catch (error) {
    app.atomicFallback = true;
    throw new Error("One-signature entry is unavailable for this route. Nothing was signed. Use the same checked route to get TSLAx first, then approve the rung buy. " + String(error.message || error));
  }
  setStatus("Combined SOL to TSLAx to XCNDL simulation passed. Review the single wallet approval.", "warning");
  const signature = await walletSignAndSendBase64(built.transaction.serializedBase64);
  app.quote = null;
  app.gameMeasure = null;
  setStatus("One-signature game entry sent: " + shorten(signature) + ". The board will update after confirmation.", "ok");
}

async function playWithTslax() {
  if (!manifestIsLaunchReady()) throw new Error("Launch manifest is not ready. Spending remains disabled.");
  if (!app.wallet) throw new Error("Connect your wallet first.");
  if (!app.gameMeasure || Date.now() - app.gameMeasureAt > MAX_QUOTE_AGE_MS) throw new Error("The next-rung price expired. Check it again.");
  const quoteRaw = decimalToRaw(ui.entryAmount.value, 8);
  const built = await callGameBuilder("build", quoteRaw);
  if (!built.transaction || !built.transaction.serializedBase64) {
    throw new Error((built.gates && built.gates.failures && built.gates.failures[0]) || "Game builder returned no signable transaction.");
  }
  await simulateSerializedTransaction(built.transaction.serializedBase64);
  setStatus("Game transaction simulation passed. Check the wallet details before approving it.", "warning");
  const signature = await walletSignAndSendBase64(built.transaction.serializedBase64);
  setStatus("Game transaction sent: " + shorten(signature) + ". The board will update after confirmation.", "ok");
}

async function trade() {
  setBusy(true);
  try {
    if (!ui.eligibilityCheck.checked) throw new Error("Confirm TSLAx eligibility first.");
    if (app.mode === "sol") {
      if (atomicSolEntryEnabled() && !app.atomicFallback) await playAtomicWithSol();
      else await getTslaxWithSol();
    }
    else await playWithTslax();
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    setBusy(false);
  }
}

async function runSettlement(kind) {
  setBusy(true);
  try {
    if (!manifestIsLaunchReady()) throw new Error("Live on-chain state is not verified.");
    if (!app.wallet) throw new Error("Connect your wallet first.");
    const route = kind === "close" ? "build-close" : "build-quote-claim";
    const url = new URL("/api/stock-candle/" + route, app.manifest.gameBuilderUrl);
    url.searchParams.set("user", app.wallet);
    const built = await fetchJson(url.toString(), { cache: "no-store" });
    const expectedWinner = app.chainState.closed ? app.chainState.winner : app.chainState.leader;
    if (!built.intent || built.intent.kind !== kind || built.intent.caller !== app.wallet
        || built.intent.config !== app.manifest.config || built.intent.winner !== expectedWinner) {
      throw new Error("Settlement builder intent did not match the verified on-chain state.");
    }
    if (!built.transaction || !built.transaction.serializedBase64) {
      throw new Error((built.gates && built.gates.failures && built.gates.failures[0]) || "Settlement builder returned no transaction.");
    }
    await simulateSerializedTransaction(built.transaction.serializedBase64);
    setStateStatus("Simulation passed. Review the permissionless settlement transaction in your wallet.", "warning");
    const signature = await walletSignAndSendBase64(built.transaction.serializedBase64);
    setStateStatus((kind === "close" ? "SOL settlement" : "TSLAx release") + " sent: " + shorten(signature) + ".", "ok");
    await hydrateOnChainState();
  } catch (error) {
    setStateStatus(String(error.message || error), "error");
  } finally {
    setBusy(false);
  }
}

function drawLadder(canvas, phase) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = rect.width;
  const h = rect.height;
  context.clearRect(0, 0, w, h);
  const ink = "#11110f";
  const green = "#00a867";
  const red = "#de3e35";
  const yellow = "#f3c62f";
  const muted = "#a8a49b";
  const pad = Math.max(22, w * 0.04);
  const plotW = w - pad * 2;
  const plotH = h - 54;

  context.lineWidth = 1;
  context.strokeStyle = muted;
  context.setLineDash([4, 6]);
  for (let rung = 1; rung <= 5; rung += 1) {
    const y = 18 + (plotH / 6) * rung;
    context.beginPath();
    context.moveTo(pad, y);
    context.lineTo(w - pad, y);
    context.stroke();
  }
  context.setLineDash([]);

  const values = [0.14, 0.2, 0.18, 0.29, 0.35, 0.31, 0.43, 0.49, 0.46, 0.58, 0.65, 0.61, 0.72, 0.78, 0.74, 0.86];
  const candleW = Math.max(7, Math.min(18, plotW / values.length * 0.46));
  const step = plotW / values.length;
  values.forEach((value, index) => {
    const previous = index ? values[index - 1] : 0.1;
    const x = pad + step * index + step * 0.5;
    const wiggle = Math.sin(phase + index * 0.8) * 0.008;
    const close = value + wiggle;
    const open = previous;
    const up = close >= open;
    const high = Math.min(0.96, Math.max(close, open) + 0.055);
    const low = Math.max(0.04, Math.min(close, open) - 0.045);
    const y = (point) => 12 + plotH * (1 - point);
    context.strokeStyle = up ? green : red;
    context.fillStyle = up ? green : red;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y(high));
    context.lineTo(x, y(low));
    context.stroke();
    const top = y(Math.max(open, close));
    const bottom = y(Math.min(open, close));
    context.fillRect(x - candleW / 2, top, candleW, Math.max(4, bottom - top));
  });

  const nextY = 12 + plotH * (1 - 0.9);
  context.strokeStyle = yellow;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(pad, nextY);
  context.lineTo(w - pad, nextY);
  context.stroke();
  context.fillStyle = ink;
  context.font = "700 11px monospace";
  context.fillText("NEXT LOCKED RUNG", pad + 5, Math.max(13, nextY - 7));
}

function startCanvas() {
  const canvas = byId("ladderCanvas");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = 0;
  function frame(time) {
    if (!last || time - last > 120) {
      drawLadder(canvas, reduced ? 0 : time / 900);
      last = time;
    }
    if (!reduced) window.requestAnimationFrame(frame);
  }
  drawLadder(canvas, 0);
  if (!reduced) window.requestAnimationFrame(frame);
  window.addEventListener("resize", () => drawLadder(canvas, reduced ? 0 : performance.now() / 900));
}

function bindEvents() {
  ui.connectTop.addEventListener("click", connectWallet);
  ui.connectWallet.addEventListener("click", connectWallet);
  ui.quoteButton.addEventListener("click", inspectEntry);
  ui.tradeButton.addEventListener("click", trade);
  ui.settleButton.addEventListener("click", () => runSettlement("close"));
  ui.claimButton.addEventListener("click", () => runSettlement("quote-claim"));
  ui.eligibilityCheck.addEventListener("change", renderEntry);
  ui.entryAmount.addEventListener("input", () => {
    app.quote = null;
    app.gameMeasure = null;
    app.atomicFallback = false;
    ui.quoteValue.textContent = app.mode === "sol" ? "Route needs a fresh check." : "Balance needs a fresh check.";
    ui.quoteDetail.textContent = "Nothing is signed by checking.";
    renderEntry();
  });
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.addEventListener("click", () => {
      app.mode = button.dataset.mode;
      app.quote = null;
      app.gameMeasure = null;
      app.atomicFallback = false;
      ui.entryAmount.value = app.mode === "sol" ? "0.05" : "0.015";
      ui.quoteValue.textContent = app.mode === "sol" ? "Request a fresh SOL to TSLAx route." : "Connect and check your TSLAx balance.";
      ui.quoteDetail.textContent = "Nothing is signed by checking.";
      renderEntry();
    });
  });
}

async function init() {
  [
    "launchPill", "chartState", "mintState", "programState", "potState", "prizeState", "rungState", "leaderState", "closeState",
    "stateExplanation", "xLink", "telegramLink", "socialPending", "eligibilityCheck", "entryAmount", "amountLabel",
    "amountUnit", "amountHelp", "quoteValue", "quoteDetail", "quoteButton", "tradeButton", "tradeStatus", "walletValue",
    "connectWallet", "connectTop", "settleButton", "claimButton", "stateStatus", "chartSummary",
  ].forEach((id) => { ui[id] = byId(id); });
  bindEvents();
  startCanvas();
  try {
    app.manifest = await fetchJson("manifest.json?v=launch-live-v4", { cache: "no-store" });
    app.rpcUrl = (app.manifest.rpcUrls || [])[0] || "";
    renderManifest();
    renderEntry();
    if (manifestIsConfigured()) {
      try {
        await hydrateOnChainState();
        app.chainRefresh = window.setInterval(() => {
          hydrateOnChainState().catch((error) => {
            app.chainVerified = false;
            setStateStatus("Live state refresh failed: " + String(error.message || error), "error");
            renderManifest();
            renderEntry();
          });
        }, 15000);
      } catch (error) {
        app.chainVerified = false;
        setStateStatus("Live state verification failed: " + String(error.message || error), "error");
        renderManifest();
        renderEntry();
      }
    }
    window.setInterval(renderCountdown, 1000);
  } catch (error) {
    app.manifest = { rpcUrls: [] };
    setStatus("Launch manifest could not be verified. All transaction actions remain disabled.", "error");
    renderEntry();
  }
}

window.addEventListener("DOMContentLoaded", init);
