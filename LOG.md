# STOCK CANDLE - Log radnji (append-only)

Vreme · um · radnja · rezultat. Vodi `node tools/project_kit.js log`.

- 2026-09-13T08:37:37.390Z · svemir-init · kit kreiran · ok
- 2026-09-13T09:24:00+02:00 · Codex/Svemir · radni identitet promenjen iz RUNG u STOCK CANDLE / `$XCNDL`; Candle Ladder ostaje ime mehanike · ok
- 2026-09-13T09:26:00+02:00 · Codex/Svemir · definisana rečenica artefakta, zabranjeni lažni elementi i launch redosled pre crtanja · ok
- 2026-09-13T09:34:00+02:00 · Codex/Svemir · proverena sveža read-only Jupiter ExactIn ruta `0.01 SOL -> 0.00273922 TSLAx`; ništa potpisano ni poslato · ok
- 2026-09-13T09:38:00+02:00 · Codex/Svemir · SOL ulaz izabran kao primarni onboarding, direktni TSLAx kao sekundarni put · ok
- 2026-09-13T10:02:00+02:00 · Codex/Svemir · izgrađen statički pre-launch sajt, wallet-signed SOL->TSLAx put, direktni TSLAx put, token SVG/PNG i javna rules stranica · ok
- 2026-09-13T10:07:00+02:00 · Codex/Svemir · desktop 1440x1000 i mobilni 390x844 browser QA: nema horizontalnog overflow-a, Canvas nije prazan, trade je zaključan; live browser quote i CORS provera prolaze · ok
- 2026-09-13T10:12:00+02:00 · Codex/Svemir · projekat dobio sopstveni git i upisan u `!Projekti/INDEX.md` i `KATALOG.jsonl`; centralni `data/project_kits.jsonl` ostaje nedostupan za upis · partial
- 2026-09-13T10:22:00+02:00 · Codex/Svemir · ispravljen player UX: TSLAx je maksimalni budžet, builder automatski računa najmanji `$XCNDL` buy koji prelazi sledeći on-chain rung · ok
- 2026-09-13T13:30:00+02:00 · Codex/Svemir · dodat smart-entry browser ugovor: jedan atomski SOL->TSLAx->XCNDL potpis iza final-runtime flaga, sa automatskim fallbackom na dve potvrde; dodat testiran rung-pricing core · ok
- 2026-09-13T13:38:00+02:00 · Codex/Svemir · ponovljeni static, builder, desktop/mobile/CDP i WSL LiteSVM testovi; 0 overflow-a, realni Jupiter quote, 9/9 programskih testova · ok
- 2026-09-13T13:45:00+02:00 · Codex/Svemir · CANDLE program prosiren quote-mint vezivanjem i permissionless ponovljivom TSLAx isplatom snimljenom pobedniku; WSL LiteSVM ponovo 9/9 · ok
- 2026-09-13T13:49:00+02:00 · Codex/Svemir · live read-only Pump replay izmerio pocetni 1M XCNDL rung na 0.01101093 TSLAx, odnosno 0.01112104 sa 1% zastitom; nista poslato · ok
- 2026-09-13T13:52:00+02:00 · Codex/Svemir · launch ekonomija zamrznuta na 15 min / 1M minimum i korak / 0.001 SOL uspesan rung / 0.05 SOL seed / 66.33% TSLAx fee share ka potu · ok
- 2026-09-13T13:57:00+02:00 · Codex/Svemir · prvi viewport, rules, metadata i X draft uskladjeni sa SOL+TSLAx nagradom; dodat direktan RPC readback i permissionless settlement UI ugovor · ok
- 2026-09-13T13:58:00+02:00 · Codex/Svemir · static, builder i browser QA ponovo zeleni; desktop/mobilni overflow 0, pre-launch fail-closed, live Jupiter quote radi · ok
- 2026-09-13T14:02:00+02:00 · Codex/Svemir · Semir izabrao konacni javni domen `scandle.ratchetx.xyz`; CNAME, metadata, OG i X copy uskladjeni pre DNS-a · ok
