# STOCK CANDLE

**Current status, 2026-09-13:** the immutable 15-minute race is closed and the 0.051 SOL prize is settled. The public site disables all entry and SOL conversion, displays the recorded winner, and composes repeatable TSLAx claims locally with MiniSol. It no longer needs a temporary transaction-builder server. Late TSLAx fees remain payable to the same on-chain winner by a wallet-signed permissionless claim. The launch/build sections below describe the completed launch history.

STOCK CANDLE is a fully on-chain Solana launch race paired with TSLAx: every verified `$XCNDL` buy that crosses the next irreversible 1,000,000-token level earns one rung, and the leading wallet receives the SOL pot plus TSLAx creator-fee prize when the 15-minute window closes.

## Identity

| Surface | Value |
|---|---|
| Product | STOCK CANDLE |
| Token | `$XCNDL` |
| Game | Candle Ladder |
| Quote asset | TSLAx on Solana |
| Easy entry | SOL to TSLAx inside the site |
| Site | `scandle.ratchetx.xyz` |

STOCK CANDLE is an independent on-chain game. It is not Tesla, Tesla stock, a Tesla product, or an offer of equity.

## What Is Real

| Part | State |
|---|---|
| Game program | Implemented at `C:\Svemir\skills\svemir-solana\lab\candle-fuse` |
| Local SBF proof | 11/11 LiteSVM tests pass with real Token-2022 movement, rollback and prefunded-PDA recovery checks |
| Pump proof | Current `buy_v2` account shape and a real STOCX trade replay are covered |
| SOL entry | ExactIn Jupiter route is integrated; one signature is preferred when the combined route fits, with a two-approval fallback |
| Prize path | Full SOL pot closes to the leader; full TSLAx pot balance and later fee arrivals remain claimable by that same winner |
| Public product | This project owns the site, public rules, metadata, launch copy and QA |
| Mainnet launch | Live: `$XCNDL` mint `5CmZR4...5sF`, program `4NAF1Q...AAHB`, config `5LN2kP...Brp2` |
| Social metadata | Telegram is `https://t.me/chetx`; launch post is `https://x.com/SonyxEth/status/2099118851627602318` |

## Build Order

1. Freeze public rules and display units. Done locally: 15 minutes, 1M XCNDL step/minimum, 0.001 SOL awarded-rung fee and 0.05 SOL seed.
2. Build and test the mobile-first site in pre-launch mode.
3. Implement the final-account builder behind the prepared browser contract.
4. Re-run live Pump, TSLAx extension, Jupiter-route, combined simulation and packet-size gates.
5. Telegram, DNS and the launch X post are set; finish custom-domain HTTPS verification.
6. Freeze metadata, state exact funding requirement, rehearse, then ask for explicit deploy approval.

The disclosed founder entry bought `5,514,041.162 XCNDL` through the same game path, earned exactly one rung, and transferred the full purchased balance to Semir's public wallet.

## Honest Verdict

Verified: the core Candle Ladder program and local adversarial tests, current TSLAx quote support evidence, and a live read-only SOL to TSLAx route on 2026-09-13.

Concluded: the user should be able to enter with SOL without separately discovering where TSLAx trades. The conversion settles on-chain and remains wallet-signed; the route builder is replaceable infrastructure, not game authority. A sampled combined packet fits one signature, but its public feature flag remains off until final-mint runtime proof.

Live now: `$XCNDL`, the immutable program, frozen 15-minute config, 0.05 SOL pot seed, locked creator-fee split and frozen game ALT are on mainnet. Founder buy and transfer readbacks pass; a public browser-wallet transaction by an independent player remains unobserved.
