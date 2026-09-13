# STOCK CANDLE - Deploy Gates

No deploy or irreversible transaction until every box is independently verified.

- [x] Public game window, minimum buy, rung step and entry fee frozen.
- [x] Standard Pump `$XCNDL` decimals/supply and initial TSLAx curve replayed against those values.
- [x] Current Pump QuoteControl still supports TSLAx (rechecked 2026-09-13 after metadata upload).
- [x] Current TSLAx Token-2022 extensions remain compatible and asset is not paused (live extension atom passed).
- [x] SOL -> TSLAx ExactIn route, price-impact guard and browser CORS rechecked against the public HTTPS site.
- [ ] SOL -> TSLAx wallet path tested on an isolated low-value rehearsal.
- [ ] Direct TSLAx -> game transaction fits and simulates with the final accounts.
- [ ] Combined SOL -> TSLAx -> XCNDL -> rung transaction fits, validates echoed intent and fully simulates with final accounts before `atomicSolEntryEnabled` is set true.
- [x] Program SBF hash, program ID, candidate mint and config/pot derivations frozen.
- [x] SOL settlement, repeatable TSLAx-prize claim, rollback, sell/rebuy, wrong-account and tie tests pass from release source.
- [x] Site mobile/desktop visual QA and no-overlap checks pass.
- [x] X post URL supplied and frozen in metadata (`https://x.com/SonyxEth/status/2099118851627602318`).
- [x] Telegram URL supplied by Semir and frozen in metadata (`https://t.me/chetx`).
- [x] Exact SOL/TSLAx funding requirement freshly measured; launch wallet is funded above the current `0.479290218 SOL` recommendation.
- [x] Semir explicitly approved token creation, program deploy, init, funding and authority revocation.
- [x] Post-deploy readback publishes CA, program, config, pot, signatures and honest authority state.
