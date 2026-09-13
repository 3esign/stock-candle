# STOCK CANDLE Builder Contract

**Retired after race close, 2026-09-13:** the live site now builds permissionless settlement in `site/settlement.js` and uses direct public RPC. Its manifest permanently closes entry and clears the temporary builder URL. This server remains the historical launch implementation and intentionally reports configured=false for the settled manifest. No replacement tunnel is required.

The builder is a replaceable, no-custody transaction composer. It reads finalized game and Pump accounts, calls `priceNextRung`, requests current Pump/Jupiter instructions and returns an unsigned v0 transaction. It never receives a secret key.

## Routes

- `GET /api/stock-candle/measure?user=<wallet>&maxQuoteAmountRaw=<u64>` returns the exact base-token amount needed for the next rung and a bounded TSLAx quote.
- `GET /api/stock-candle/build?user=<wallet>&maxQuoteAmountRaw=<u64>` returns the direct TSLAx -> XCNDL -> rung transaction.
- `POST /api/stock-candle/build-sol-entry` accepts the wallet and the exact checked Jupiter quote, then returns one SOL -> TSLAx -> XCNDL -> rung transaction when the final packet fits and simulates.
- `GET /api/stock-candle/build-close?user=<wallet>` returns the permissionless post-window SOL-pot settlement transaction.
- `GET /api/stock-candle/build-quote-claim?user=<wallet>` returns the permissionless transaction that sends the current pot TSLAx balance to the already-recorded winner.

Every build response must include `gates.ok`, `gates.failures`, `intent` and `transaction.serializedBase64`. The SOL entry intent must echo `user`, `inputMint`, `outputMint`, `inputAmountRaw` and `minimumTslaxAmountRaw` so the browser can reject a mismatched response before simulation.

Settlement intents echo `kind`, `caller`, `config` and the current on-chain `winner`. The browser compares them with its own config-account read before simulation. Quote-prize claims remain repeatable after close so later Pump creator-fee distributions can only go to the recorded winner.

The manifest flag `atomicSolEntryEnabled` stays false until a final-mint transaction passes packet-size, account-derivation, amount-sufficiency and full runtime simulation gates. The site falls back to two wallet approvals without taking custody.

## Local launch service

`server.js` implements all five routes with the Node standard-library HTTP server. It loads the already-installed Solana/Pump libraries from the shared toolchain, never reads a keypair, and re-reads `site/manifest.json` on every request. Until final CA/config/pot/ALT values are present, fee sharing is locked, and `deployed` plus `tradingEnabled` are true, `/health` reports `configured:false` and every transaction route fails closed.

Run it during rehearsal or the short launch window:

```powershell
node builder/server.js 8792
```

The service also requires the published game ALT to have `authority:null`. Every returned transaction is simulated by RPC before its bytes leave the builder, and the browser simulates the same bytes again before opening the wallet.
