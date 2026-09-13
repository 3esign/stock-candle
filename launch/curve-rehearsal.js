"use strict";

// Read-only launch atom: price candidate XCNDL rung sizes against the current
// Pump TSLAx quote-control state. No key files, signatures or transactions.
const path = require("path");
const { headers: incognitoHeaders } = require("C:\\Svemir\\lib\\incognito.js");

const MODULES = "C:\\Svemir\\tools\\solana-cli\\scripts-scratch\\node_modules";
const requireFromTools = (name) => require(path.join(MODULES, name));
const BN = requireFromTools("bn.js");
const { Connection, PublicKey } = requireFromTools("@solana/web3.js");
const {
  getBuySolAmountFromTokenAmount,
  OnlinePumpSdk,
} = requireFromTools("@pump-fun/pump-sdk");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const BASE_DECIMALS = 6;
const QUOTE_DECIMALS = 8;
const SLIPPAGE_BPS = 100n;
const RUNG_SIZES_UI = [1_000_000, 2_000_000, 5_000_000, 10_000_000];

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

function ui(raw, decimals) {
  const value = BigInt(raw.toString());
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addSlippage(raw) {
  const value = BigInt(raw.toString());
  return (value * (10_000n + SLIPPAGE_BPS) + 9_999n) / 10_000n;
}

async function retry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw new Error(`${label} failed: ${lastError && lastError.message ? lastError.message : lastError}`);
}

async function main() {
  const sdk = new OnlinePumpSdk(makeConnection());
  const [global, feeConfig, quoteControl, resolvedQuote] = await Promise.all([
    retry("Pump global read", () => sdk.fetchGlobal()),
    retry("Pump fee config read", () => sdk.fetchFeeConfig()),
    retry("Pump quote-control read", () => sdk.fetchQuoteControl()),
    retry("TSLAx quote resolve", () => sdk.resolveQuoteMint(TSLAX_MINT)),
  ]);

  const quoteEntry = quoteControl && quoteControl.mints.find((entry) => entry.mint.equals(TSLAX_MINT));
  if (!quoteEntry) throw new Error("TSLAx is not in the current Pump QuoteControl list.");

  const rows = RUNG_SIZES_UI.map((amountUi) => {
    const amountRaw = new BN(String(amountUi * (10 ** BASE_DECIMALS)));
    const cost = getBuySolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: amountRaw,
      quoteMint: TSLAX_MINT,
      quoteControl,
    });
    const maxCost = addSlippage(cost);
    return {
      xcndlUi: String(amountUi),
      xcndlRaw: amountRaw.toString(),
      tslaxCostRaw: cost.toString(),
      tslaxCostUi: ui(cost, QUOTE_DECIMALS),
      tslaxMaxAtOnePercentRaw: maxCost.toString(),
      tslaxMaxAtOnePercentUi: ui(maxCost, QUOTE_DECIMALS),
    };
  });

  console.log(JSON.stringify({
    verifiedAt: new Date().toISOString(),
    network: "mainnet-beta",
    sent: false,
    tslax: {
      mint: TSLAX_MINT.toBase58(),
      supportedNow: true,
      quoteTokenProgram: resolvedQuote.quoteTokenProgram.toBase58(),
      initialVirtualQuoteReservesRaw: quoteEntry.initialVirtualQuoteReserves.toString(),
    },
    pricing: rows,
  }, null, 2));
  console.log("OK: STOCK_CANDLE_INITIAL_CURVE_REHEARSED_NOT_SENT");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
