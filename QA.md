# STOCK CANDLE - Pre-launch QA

Verified: 2026-09-13. No wallet key was read. Nothing was signed, sent, deployed or spent.

## Static Gates

Command: `node site/test/site.test.js`

Result: `STOCK_CANDLE_SITE_PRELAUNCH_GATES_PASS`.

The test verifies the first-viewport identity, SOL and TSLAx entry modes, risk copy, empty launch manifest, disabled spend path, ExactIn/price-impact guards, simulation-before-sign order, responsive CSS, reduced motion, public rules and CNAME.

## Browser Gates

Command: `node site/test/browser-qa.js http://127.0.0.1:8791/`

- desktop: `1440x1000`, scroll width `1440`, zero overflowing visible elements;
- mobile: `390x844`, scroll width `390`, zero overflowing visible elements;
- Canvas colored samples: `3627` desktop and `1598` mobile on the latest run;
- launch state: `PRE-LAUNCH` and trade button disabled on both;
- real browser UI quote: `0.01 SOL -> at least 0.00271639 TSLAx` at the latest sampled moment;
- Jupiter quote CORS: success with positive TSLAx output;
- Jupiter swap POST CORS: endpoint reached; intentionally empty body returned HTTP `422`, proving the browser can receive the response without building or signing a transaction.

Screenshots:

- `site/test/desktop-1440.png`
- `site/test/mobile-390.png`
- `site/test/mobile-entry-390.png`

## Honest Verdict

Verified: static fail-closed behavior, actual browser layout at desktop/mobile device metrics, nonblank Canvas, direct browser quote path and swap endpoint reachability.

Concluded: a player can be offered TSLAx acquisition inside the site without custody or a private RPC. The reliable launch design is two wallet approvals: SOL -> TSLAx, then TSLAx -> game buy.

Not verified: a real browser-wallet SOL swap through this new page, the final game builder, a combined single-signature packet, deployed account reads, final economics, DNS publication or any mainnet launch action.
