# STOCK CANDLE - Knowledge Base

# Greske

- Radni simbol `$CANDLE` je već višestruko korišćen na Pump-u, a CandleX je postojeće ime u finansijskom/trading prostoru. Uzrok: generičko ime bez collision provere. Lek: javni identitet je STOCK CANDLE / `$XCNDL`, dok se Candle Ladder koristi samo kao ime mehanike.
- `project_kit init` je napravio fajlove, ali nije upisao `data/project_kits.jsonl`. Uzrok još nije potvrđen. Lek: registraciju proveriti odvojeno i nikad ne izjednačiti postojanje foldera sa uspešnim upisom registra.

# Iskustva

- Jasna hijerarhija je STOCK CANDLE -> `$XCNDL` -> Candle Ladder -> TSLAx. Posetilac mora da vidi sve četiri veze u prvom viewportu.
- TSLAx-first igra stvara nepotrebnu onboarding rupu ako korisnik mora sam da traži quote asset. Najkraći proizvodni put je wallet-signed SOL -> TSLAx kupovina u sajtu, uz direktan TSLAx režim za postojeće vlasnike.
- Današnja read-only Jupiter provera je ponovo našla ExactIn SOL -> TSLAx rutu. To dokazuje dostupnu rutu u tom trenutku, ne trajnu likvidnost niti garantovanu cenu.
- Browser QA je potvrdio da Jupiter quote radi direktno iz statičkog sajta i da je swap POST CORS-dostupan. Najbrži dokazani UX je ipak dve wallet potvrde; spojeni swap+game paket ostaje eksperiment, ne launch tvrdnja.

# Izvori

- `C:\Svemir\skills\svemir-solana\references\93-candle-ladder-design-2026-09-13.md`
- `C:\Svemir\skills\svemir-solana\references\94-candle-ladder-local-proof-2026-09-13.md`
- `C:\Svemir\skills\svemir-solana\references\80-tslax-acquisition-quote-2026-09-11.md`
- Live read-only command on 2026-09-13: `0.01 SOL` quoted `0.00273922 TSLAx`, 1% threshold `0.00271183`, through Whirlpool/GoonFi V2/Riptide; nothing signed or sent.

# Vestine

- Prevesti jedan on-chain invariant u jednu razumljivu rečenicu prvog viewporta.
- Razdvojiti trustless settlement od zamenljivog route-builder interfejsa.

# Odluke

- Javno ime je STOCK CANDLE, simbol `$XCNDL`, mehanika Candle Ladder, a quote asset TSLAx.
- Predloženi domen je `stockcandle.ratchetx.xyz`.
- Primarni ulaz je SOL, sekundarni je direktni TSLAx; oba potpisuje igračev wallet.
- Vizuelni mod je generativni Canvas 2D chart kao merdevine, uz semantički DOM za pravila i stanje.
