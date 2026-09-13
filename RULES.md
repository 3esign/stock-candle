# STOCK CANDLE - Public Rules Draft

Status: pre-launch. Values marked `TBD` are not launch promises.

## The Game In One Sentence

Buy `$XCNDL` with TSLAx through STOCK CANDLE; if the verified buy pushes the Pump curve across the next locked candle level, your wallet earns one rung, and the wallet with the most rungs receives the live SOL pot after the window.

## Entry Paths

- `Play with SOL`: the site requests a fresh ExactIn SOL -> TSLAx route, shows minimum output and price impact, simulates, then asks the player's wallet to sign. After confirmation, the player approves the separate game buy. This two-approval path is the reliable launch default until a combined packet is measured and proved.
- `Play with TSLAx`: skips conversion and builds the game buy directly for a wallet that already has TSLAx.
- No route is guaranteed. If no safe route is available, the SOL path stops before signing and the direct TSLAx path remains usable.
- The builder never holds funds or a player key. A player may replace our builder and call the deployed program directly.

## On-Chain Rules

- One atomic game instruction CPI-calls Pump `buy_v2` and records state only after the real buy succeeds.
- The config is bound to one `$XCNDL` mint and its token program.
- The program compares the requested buy with observed player and curve token deltas.
- One transaction can earn at most one rung, even if it crosses several levels.
- Sells never lower `last_awarded_balance`; an old rung cannot be reclaimed by sell-and-rebuy.
- Ties favor the wallet that reached the tied score first.
- Anyone may call settlement after the end time.
- The full stored lamport pot is paid once to the on-chain leader; failed settlement rolls back.

## Values To Freeze Before Deploy

| Parameter | Draft |
|---|---:|
| Window | `TBD` |
| Minimum `$XCNDL` buy | `TBD` after final curve replay |
| Candle step | `TBD` after final supply/curve replay |
| Entry fee to SOL pot | `TBD` after current cost/economics measurement |
| Winner | Most rungs; first wallet wins a tie |
| Payout | 100% of the on-chain game pot |
| Pump creator mode | Regular creator fee mode; no holder-reward promise |

## Trust Boundary

Trustless after launch means the game rules, rung records, leader and pot settlement are enforced by the deployed program. The website, public RPC and route builder are replaceable interfaces; they can fail or disappear without owning the game or player funds.

## Risk And Identity

- `$XCNDL` is a game token paired with TSLAx. It is not Tesla stock and does not grant Tesla equity.
- TSLAx is an external tokenized-equity asset with its own issuer, technical controls, market risks and geographic restrictions.
- Participation does not guarantee a reward, profit, liquidity or continued route availability. Network, swap, Pump and game fees may exceed any reward.
- STOCK CANDLE is independent and is not affiliated with Tesla or the TSLAx issuer.
