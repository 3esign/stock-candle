"use strict";

const app = {
  manifest: null,
  provider: null,
  wallet: "",
  mode: "sol",
  quote: null,
  quoteAt: 0,
  busy: false,
  rpcUrl: "",
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
    throw new Error(body.error || body.errorMessage || "Request failed with HTTP " + response.status + ".");
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

function manifestIsLaunchReady() {
  const m = app.manifest || {};
  const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return Boolean(
    m.deployed === true &&
    m.tradingEnabled === true &&
    address.test(m.mint || "") &&
    address.test(m.programId || "") &&
    address.test(m.config || "") &&
    address.test(m.pot || "") &&
    /^https:\/\//.test(m.gameBuilderUrl || "")
  );
}

function setBusy(value) {
  app.busy = value;
  renderEntry();
}

function setStatus(message, kind = "") {
  ui.tradeStatus.textContent = message;
  ui.tradeStatus.dataset.kind = kind;
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
  ui.amountLabel.textContent = solMode ? "SOL to convert" : "TSLAx to spend";
  ui.amountUnit.textContent = solMode ? "SOL" : "TSLAx";
  ui.amountHelp.textContent = solMode
    ? "A fresh ExactIn route is checked before your wallet is asked to sign."
    : "Your TSLAx stays in your wallet until you approve the game transaction.";
  ui.quoteButton.textContent = solMode ? "Check SOL -> TSLAx" : "Check TSLAx balance";
  ui.walletValue.textContent = app.wallet ? shorten(app.wallet) : "Not connected";
  ui.connectWallet.textContent = app.wallet ? shorten(app.wallet) : "Connect wallet";
  ui.connectTop.textContent = app.wallet ? shorten(app.wallet) : "Connect wallet";
  ui.connectWallet.disabled = app.busy;
  ui.connectTop.disabled = app.busy;
  ui.quoteButton.disabled = app.busy || !eligible;

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
    ui.tradeButton.textContent = quoteFresh ? "Get TSLAx with SOL" : "Check route first";
  } else {
    ui.tradeButton.disabled = app.busy;
    ui.tradeButton.textContent = "Play with TSLAx";
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
  const minimum = rawToDecimal(quote.otherAmountThreshold, 8);
  const route = (quote.routePlan || []).map((item) => item.swapInfo && item.swapInfo.label).filter(Boolean).join(" + ");
  ui.quoteValue.textContent = rawToDecimal(inputRaw, 9) + " SOL -> at least " + minimum + " TSLAx";
  ui.quoteDetail.textContent = "1% slippage guard" + (route ? " | " + route : "") + ". Quote expires in 30 seconds.";
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
}

async function inspectEntry() {
  setBusy(true);
  try {
    if (!ui.eligibilityCheck.checked) throw new Error("Confirm TSLAx eligibility before requesting market data.");
    if (app.mode === "sol") await quoteSolToTslax();
    else await checkTslaxBalance();
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
  ui.entryAmount.value = "0.001";
  setStatus("TSLAx conversion sent: " + shorten(signature) + ". Switch complete; confirm it before playing.", "ok");
}

async function playWithTslax() {
  if (!manifestIsLaunchReady()) throw new Error("Launch manifest is not ready. Spending remains disabled.");
  if (!app.wallet) throw new Error("Connect your wallet first.");
  const quoteRaw = decimalToRaw(ui.entryAmount.value, 8);
  const url = new URL("/api/stock-candle/build", app.manifest.gameBuilderUrl);
  url.searchParams.set("user", app.wallet);
  url.searchParams.set("quoteAmountRaw", quoteRaw.toString());
  const built = await fetchJson(url.toString(), { cache: "no-store" });
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
    if (app.mode === "sol") await getTslaxWithSol();
    else await playWithTslax();
  } catch (error) {
    setStatus(String(error.message || error), "error");
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
  ui.eligibilityCheck.addEventListener("change", renderEntry);
  ui.entryAmount.addEventListener("input", () => {
    app.quote = null;
    ui.quoteValue.textContent = app.mode === "sol" ? "Route needs a fresh check." : "Balance needs a fresh check.";
    ui.quoteDetail.textContent = "Nothing is signed by checking.";
    renderEntry();
  });
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.addEventListener("click", () => {
      app.mode = button.dataset.mode;
      app.quote = null;
      ui.entryAmount.value = app.mode === "sol" ? "0.01" : "0.001";
      ui.quoteValue.textContent = app.mode === "sol" ? "Request a fresh SOL to TSLAx route." : "Connect and check your TSLAx balance.";
      ui.quoteDetail.textContent = "Nothing is signed by checking.";
      renderEntry();
    });
  });
}

async function init() {
  [
    "launchPill", "chartState", "mintState", "programState", "potState", "rungState", "leaderState", "closeState",
    "stateExplanation", "xLink", "telegramLink", "socialPending", "eligibilityCheck", "entryAmount", "amountLabel",
    "amountUnit", "amountHelp", "quoteValue", "quoteDetail", "quoteButton", "tradeButton", "tradeStatus", "walletValue",
    "connectWallet", "connectTop",
  ].forEach((id) => { ui[id] = byId(id); });
  bindEvents();
  startCanvas();
  try {
    app.manifest = await fetchJson("manifest.json", { cache: "no-store" });
    app.rpcUrl = (app.manifest.rpcUrls || [])[0] || "";
    renderManifest();
    renderEntry();
  } catch (error) {
    app.manifest = { rpcUrls: [] };
    setStatus("Launch manifest could not be verified. All transaction actions remain disabled.", "error");
    renderEntry();
  }
}

window.addEventListener("DOMContentLoaded", init);
