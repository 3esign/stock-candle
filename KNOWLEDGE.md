# STOCK CANDLE - Knowledge Base

# Greske

- Radni simbol `$CANDLE` je već višestruko korišćen na Pump-u, a CandleX je postojeće ime u finansijskom/trading prostoru. Uzrok: generičko ime bez collision provere. Lek: javni identitet je STOCK CANDLE / `$XCNDL`, dok se Candle Ladder koristi samo kao ime mehanike.
- `project_kit init` je napravio fajlove, ali nije upisao `data/project_kits.jsonl`. Uzrok još nije potvrđen. Lek: registraciju proveriti odvojeno i nikad ne izjednačiti postojanje foldera sa uspešnim upisom registra.
- Browser QA je prijavio neodredjen `Uncaught` kada je stari lokalni server prestao da radi. Uzrok nije bio DOM ni Canvas nego error stranica bez `ladderCanvas`. Lek: pre tumacenja CDP greske proveriti origin i podici cist server.
- Copy promena je oborila test koji je i dalje zahtevao staru recenicu. Uzrok je test vezan za red reci umesto za novu javnu tvrdnju. Lek: promena launch obecanja uvek menja copy i odgovarajuci gate u istom potezu.
- Prvi hardening buildera je pogresno ucinio `atomicSolEntryEnabled=true` uslovom za sve rute. Uzrok je mesanje opcione SOL optimizacije sa osnovnom launch spremnoscu. Lek: atomic flag proverava samo atomic endpoint; direct TSLAx i settlement moraju ostati nezavisni.

# Iskustva

- Jasna hijerarhija je STOCK CANDLE -> `$XCNDL` -> Candle Ladder -> TSLAx. Posetilac mora da vidi sve četiri veze u prvom viewportu.
- TSLAx-first igra stvara nepotrebnu onboarding rupu ako korisnik mora sam da traži quote asset. Najkraći proizvodni put je wallet-signed SOL -> TSLAx kupovina u sajtu, uz direktan TSLAx režim za postojeće vlasnike.
- Današnja read-only Jupiter provera je ponovo našla ExactIn SOL -> TSLAx rutu. To dokazuje dostupnu rutu u tom trenutku, ne trajnu likvidnost niti garantovanu cenu.
- Browser QA je potvrdio da Jupiter quote radi direktno iz statičkog sajta i da je swap POST CORS-dostupan. Najnoviji spojeni `SOL -> TSLAx -> XCNDL -> rung` uzorak staje u 1.039 bajtova sa 193 bajta rezerve i jednim potpisom, ali ostaje iza feature flaga dok konačni mint ne prođe runtime simulaciju; dve potvrde su fallback.
- CANDLE wrapper ne dopušta kupovinu bez runda: ako `curve_after` ne pređe sledeći target, ceo Pump CPI se vraća. Zato javni UI ne sme da traži nasumičan `$XCNDL` amount; mora da pročita curve/high-water stanje, izračuna minimalni crossing buy i prikaže TSLAx budžet pre potpisa.
- Pump creator-fee share za TSLAx-pair stize kao TSLAx u pot ATA, ne kao lamports. SOL-only close bi ostavio deo obecane nagrade van pobednikovog puta. Program zato pamti pobednika pri close-u i dozvoljava ponovljiv permissionless TSLAx claim samo tom odredistu, ukljucujuci kasne fee distribucije.
- Svezi pocetni Pump replay daje 1M XCNDL oko 0.01101093 TSLAx, 2M oko 0.02204241, 5M oko 0.05526078 i 10M oko 0.1110414 pre 1% slippage zastite. Korak 1M je jedini od kandidata koji razumno staje u podrazumevani 0.05 SOL onboarding pri trenutnoj ruti.
- Live tabla ne sme verovati samo javnom JSON-u. Browser pre otkljucavanja proverava owner configa, oba minta, oba token programa i on-chain window/minimum/step/fee protiv manifesta.
- Kratak launch ne zahteva custody ni privatni RPC kao deo pravila: lokalni no-key builder moze privremeno da bude dostupan kroz HTTPS tunnel, dok program i browser ponovo proveravaju njegov izlaz. Builder mora objaviti `signs:false`, `sends:false` i ostati `configured:false` do finalnih adresa i zamrznutog ALT-a.
- DNS CNAME moze javno proraditi pre GitHub Pages custom-domain TLS sertifikata. Launch link se ne objavljuje dok direktan HTTPS fetch ne vrati 200 sa ispravnim host sertifikatom; HTTP 200 sam nije dovoljan dokaz spremnosti.
- Builder manifest gate mora proveravati zamrznutu ekonomiju, X/Telegram URL, artefact hash i aktivan zamrznut ALT, ne samo prisustvo adresa i `deployed=true`.
- Sistem-owned PDA koji je napadac unapred napunio jednim lamportom ne sme ici kroz obican `CreateAccount`. Program dopunjava rentu, radi signed `Allocate` i `Assign`; posebni LiteSVM testovi sada pokrivaju i config i player-record PDA.

# Izvori

- `C:\Svemir\skills\svemir-solana\references\93-candle-ladder-design-2026-09-13.md`
- `C:\Svemir\skills\svemir-solana\references\94-candle-ladder-local-proof-2026-09-13.md`
- `C:\Svemir\skills\svemir-solana\references\95-candle-ladder-sol-entry-packet-2026-09-13.md`
- `C:\Svemir\skills\svemir-solana\references\80-tslax-acquisition-quote-2026-09-11.md`
- Live read-only command on 2026-09-13: `0.01 SOL` quoted `0.00273922 TSLAx`, 1% threshold `0.00271183`, through Whirlpool/GoonFi V2/Riptide; nothing signed or sent.
- `launch/curve-rehearsal.js`, 2026-09-13: live Pump QuoteControl i initial-curve cene za 1M/2M/5M/10M XCNDL; `sent:false`.
- `launch/cost-rehearsal.js`, 2026-09-13 posle prefunded-PDA popravke: sekvencijalni deploy peak `0.3342996 SOL`, postojeci balans `0.104485737`, manjak `0.229813863`; povratni buffer nije dvaput racunat.

# Vestine

- Prevesti jedan on-chain invariant u jednu razumljivu rečenicu prvog viewporta.
- Razdvojiti trustless settlement od zamenljivog route-builder interfejsa.
- Izračunati najmanji base buy koji prelazi monotonu granicu i odbiti build ako quote prelazi igračev TSLAx budžet.
- Dekodirati kompaktan 380-bajtni on-chain config u browseru i fail-closed povezati ga sa javnim manifestom.
- Sastaviti i dvaput simulirati direct/atomic/settlement v0 transakcije bez citanja keypaira: prvi put u builderu, drugi put u browseru pre wallet dijaloga.

# Odluke

- Javno ime je STOCK CANDLE, simbol `$XCNDL`, mehanika Candle Ladder, a quote asset TSLAx.
- Konacni domen je `scandle.ratchetx.xyz`; Semir dodaje DNS tek kada su X i Telegram URL spremni.
- Primarni ulaz je SOL, sekundarni je direktni TSLAx; oba potpisuje igračev wallet.
- Primarni SOL UX prvo pokušava jednu atomsku transakciju, a automatski prelazi na dva potpisa ako trenutna ruta ne stane ili ne prođe simulaciju.
- Vizuelni mod je generativni Canvas 2D chart kao merdevine, uz semantički DOM za pravila i stanje.
- Launch pravila su 15 minuta, 1M XCNDL minimum i korak, 0.001 SOL fee samo za nagradjeni rung i 0.05 SOL pocetni pot.
- Pobednik dobija ceo SOL pot i sav TSLAx u pot ATA; 66.33% Pump creator-fee udela ide pot PDA-u, 33.67% creator walletu, uz planirano trajno zakljucavanje fee-sharing konfiguracije.
- Sajt, javni materijali i builder ugovor zavrsavaju se pre bilo kog deploya; pravi XCNDL CA se objavljuje poslednji.
- Telegram launch URL je `https://t.me/chetx`; DNS CNAME za `scandle.ratchetx.xyz` je 2026-09-13 javno procitan kao `3esign.github.io` sa TTL 600.
