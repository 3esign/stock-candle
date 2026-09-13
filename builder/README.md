# STOCK CANDLE Builder Contract

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
