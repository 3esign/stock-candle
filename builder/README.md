# STOCK CANDLE Builder Contract

The builder is a replaceable, no-custody transaction composer. It reads finalized game and Pump accounts, calls `priceNextRung`, requests current Pump/Jupiter instructions and returns an unsigned v0 transaction. It never receives a secret key.

## Routes

- `GET /api/stock-candle/measure?user=<wallet>&maxQuoteAmountRaw=<u64>` returns the exact base-token amount needed for the next rung and a bounded TSLAx quote.
- `GET /api/stock-candle/build?user=<wallet>&maxQuoteAmountRaw=<u64>` returns the direct TSLAx -> XCNDL -> rung transaction.
- `POST /api/stock-candle/build-sol-entry` accepts the wallet and the exact checked Jupiter quote, then returns one SOL -> TSLAx -> XCNDL -> rung transaction when the final packet fits and simulates.

Every build response must include `gates.ok`, `gates.failures`, `intent` and `transaction.serializedBase64`. The SOL entry intent must echo `user`, `inputMint`, `outputMint`, `inputAmountRaw` and `minimumTslaxAmountRaw` so the browser can reject a mismatched response before simulation.

The manifest flag `atomicSolEntryEnabled` stays false until a final-mint transaction passes packet-size, account-derivation, amount-sufficiency and full runtime simulation gates. The site falls back to two wallet approvals without taking custody.
