# STOCK CANDLE - Deploy Gates

No deploy or irreversible transaction until every box is independently verified.

- [x] Public game window, minimum buy, rung step and entry fee frozen.
- [x] Standard Pump `$XCNDL` decimals/supply and initial TSLAx curve replayed against those values.
- [ ] Current Pump QuoteControl still supports TSLAx.
- [ ] Current TSLAx Token-2022 extensions remain compatible and asset is not paused.
- [ ] SOL -> TSLAx ExactIn route, price-impact guard and browser CORS rechecked.
- [ ] SOL -> TSLAx wallet path tested on an isolated low-value rehearsal.
- [ ] Direct TSLAx -> game transaction fits and simulates with the final accounts.
- [ ] Combined SOL -> TSLAx -> XCNDL -> rung transaction fits, validates echoed intent and fully simulates with final accounts before `atomicSolEntryEnabled` is set true.
- [ ] Program SBF hash, source hash, program ID and config derivations frozen.
- [x] SOL settlement, repeatable TSLAx-prize claim, rollback, sell/rebuy, wrong-account and tie tests pass from release source.
- [ ] Site mobile/desktop visual QA and no-overlap checks pass.
- [ ] X post URL supplied and frozen in metadata.
- [x] Telegram URL supplied by Semir and frozen in metadata (`https://t.me/chetx`).
- [ ] Exact SOL/TSLAx funding requirement freshly measured.
- [ ] Semir explicitly approves token creation, program deploy, init, funding and any authority revocation.
- [ ] Post-deploy readback publishes CA, program, config, pot, signatures and honest authority state.
