# STOCK CANDLE - Pre-launch QA

Final launch verification: 2026-09-13. Mainnet deployment, token creation, initialization, fee lock, ALT freeze, founder entry/transfer and program authority revocation are confirmed.

## Static Gates

Command: `node site/test/site.test.js`

Result: `STOCK_CANDLE_SITE_PRELAUNCH_GATES_PASS`.

The test verifies the first-viewport identity and frozen economics, SOL and TSLAx entry modes, risk copy, empty launch addresses, disabled spend path, ExactIn/price-impact guards, direct and combined simulation-before-sign order, atomic-entry failover, direct on-chain state binding checks, settlement intent checks, responsive CSS, reduced motion, public rules and CNAME.

Command: `node builder/rung.test.js`

Result: `STOCK_CANDLE_RUNG_PRICING_PASS`. First rung, ordinary next rung, sell recovery, already-crossed target, budget rejection and invalid-u64 cases pass.

Command: `node builder/server.test.js`

Result: `STOCK_CANDLE_BUILDER_CONTRACT_PASS`. Exact config offsets decode, the live manifest contract passes, and health discloses `signs:false` plus `sends:false`.

## Browser Gates

Command: `node site/test/browser-qa.js https://scandle.ratchetx.xyz/`

- desktop: `1440x1000`, scroll width `1440`, zero overflowing visible elements;
- mobile: `390x844`, scroll width `390`, zero overflowing visible elements;
- Canvas colored samples are nonzero on desktop and mobile;
- launch state: `LIVE`; without a connected wallet the trade button remains disabled on both;
- real browser UI quote at the latest pass: `0.05 SOL -> at least 0.01362529 TSLAx`;
- Jupiter quote CORS: success with positive TSLAx output;
- Jupiter swap POST CORS: endpoint reached; intentionally empty body returned HTTP `422`, proving the browser can receive the response without building or signing a transaction.

Screenshots:

- `site/test/desktop-1440.png`
- `site/test/mobile-390.png`
- `site/test/mobile-entry-390.png`

## Honest Verdict

Verified: live manifest gates, rung-pricing math, actual browser layout at desktop/mobile device metrics, nonblank Canvas, direct config/SOL-pot/Token-2022-prize reads, browser quote path and swap endpoint reachability. The underlying CANDLE WSL LiteSVM regression is 11/11 green, including prefunded-PDA recovery, SOL close and repeatable TSLAx-prize claims.

Concluded: a player can be offered TSLAx acquisition inside the site without custody or a private RPC. One-signature entry is packet-feasible and the browser contract is ready; two wallet approvals remain the safe runtime fallback.

Not verified: an independent player's real browser-wallet send through the public page or the optional one-signature combined SOL route. The founder path proved the final Pump wrapper on mainnet; the public builder proved final-account measure and stays no-key/no-send. Program authority is null, fee sharing is locked and ALT authority is null.
