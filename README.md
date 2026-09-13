# STOCK CANDLE

STOCK CANDLE is a fully on-chain Solana launch race paired with TSLAx: every verified `$XCNDL` buy that crosses the next irreversible candle level earns one rung, and the leading wallet receives the live SOL pot when the window closes.

## Identity

| Surface | Value |
|---|---|
| Product | STOCK CANDLE |
| Token | `$XCNDL` |
| Game | Candle Ladder |
| Quote asset | TSLAx on Solana |
| Easy entry | SOL to TSLAx inside the site |
| Proposed site | `stockcandle.ratchetx.xyz` |

STOCK CANDLE is an independent on-chain game. It is not Tesla, Tesla stock, a Tesla product, or an offer of equity.

## What Is Real

| Part | State |
|---|---|
| Game program | Implemented at `C:\Svemir\skills\svemir-solana\lab\candle-fuse` |
| Local SBF proof | 9/9 LiteSVM tests pass with real Token-2022 movement and rollback checks |
| Pump proof | Current `buy_v2` account shape and a real STOCX trade replay are covered |
| SOL to TSLAx route | ExactIn route exists through Jupiter; any swap still requires the player's wallet signature |
| Public product | This project owns the site, public rules, metadata, launch copy and QA |
| Mainnet launch | Not deployed; no `$XCNDL` mint or program CA exists yet |
| Social metadata | Final X post and Telegram URL are required before metadata is frozen |

## Build Order

1. Freeze public rules and display units.
2. Build and test the mobile-first site in pre-launch mode.
3. Add a wallet-signed SOL to TSLAx entry path and direct TSLAx path.
4. Re-run live Pump, TSLAx extension, Jupiter-route and packet-size gates.
5. Receive the final Telegram URL and publish the final X post.
6. Freeze metadata, state exact funding requirement, rehearse, then ask for explicit deploy approval.

## Honest Verdict

Verified: the core Candle Ladder program and local adversarial tests, current TSLAx quote support evidence, and a live read-only SOL to TSLAx route on 2026-09-13.

Concluded: the user should be able to enter with SOL without separately discovering where TSLAx trades. The conversion settles on-chain and remains wallet-signed; the route builder is replaceable infrastructure, not game authority.

Not done: `$XCNDL` creation, program deploy, config initialization, launch funding, metadata publication, DNS publication, or any irreversible transaction.
