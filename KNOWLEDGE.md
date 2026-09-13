# STOCK CANDLE - Knowledge Base

# Greske

- 2026-09-13: Desktop QA initially expected scrollWidth to equal the viewport width. Cause: native Chrome reserved a 15-pixel vertical scrollbar gutter. Remedy: require scrollWidth <= viewport width and separately reject any visible element extending outside it.

- 2026-09-13: A raw-byte comparison between MiniSol and the SDK failed on equivalent settlement messages. Cause: both compilers use valid but different ordering for equally privileged accounts. Remedy: deserialize both with the SDK and compare every instruction, account privilege, fee payer and blockhash; do not confuse a different account index layout with a different transaction.

- 2026-09-13: The live UI treated a configured deployment as an open race and still allowed the first SOL-to-TSLAx purchase after close. Cause: entry eligibility did not check the immutable config's start/end/closed fields. Remedy: block quotes and every purchase entry point before network/signing when the round is closed, expired, unstarted or unverified; recheck immediately before a signature.
- 2026-09-13: Explicit browser Accept-Encoding headers made GitHub CLI return invalid UTF-8. Cause: gh does not automatically decompress when this header is manually supplied. Remedy: derive headers through incognito but omit Accept-Encoding for gh and let its transport negotiate compression.

- Radni simbol `$CANDLE` je već višestruko korišćen na Pump-u, a CandleX je postojeće ime u finansijskom/trading prostoru. Uzrok: generičko ime bez collision provere. Lek: javni identitet je STOCK CANDLE / `$XCNDL`, dok se Candle Ladder koristi samo kao ime mehanike.
- `project_kit init` je napravio fajlove, ali nije upisao `data/project_kits.jsonl`. Uzrok još nije potvrđen. Lek: registraciju proveriti odvojeno i nikad ne izjednačiti postojanje foldera sa uspešnim upisom registra.
- Browser QA je prijavio neodredjen `Uncaught` kada je stari lokalni server prestao da radi. Uzrok nije bio DOM ni Canvas nego error stranica bez `ladderCanvas`. Lek: pre tumacenja CDP greske proveriti origin i podici cist server.
- Copy promena je oborila test koji je i dalje zahtevao staru recenicu. Uzrok je test vezan za red reci umesto za novu javnu tvrdnju. Lek: promena launch obecanja uvek menja copy i odgovarajuci gate u istom potezu.
- Prvi hardening buildera je pogresno ucinio `atomicSolEntryEnabled=true` uslovom za sve rute. Uzrok je mesanje opcione SOL optimizacije sa osnovnom launch spremnoscu. Lek: atomic flag proverava samo atomic endpoint; direct TSLAx i settlement moraju ostati nezavisni.
- Prvi XCNDL create rehearsal je vratio `Invalid arguments` pre RPC simulacije. Uzrok: instalirani `web3.js` legacy `simulateTransaction(Transaction)` overload tumaci drugi objekat kao signer listu, ne kao config. Lek: za vec potpisanu legacy transakciju koristi isti jednorecni poziv kao provereni STOCX launcher.
- Prvi STOCK CANDLE quick tunnel se povezao ali javno vracao Cloudflare 404. Uzrok iz startup loga: `cloudflared tunnel --url` je ucitao postojeci korisnicki `config.yml` i credential-file iako je trebalo da bude accountless quick tunnel. Lek: launch quick tunnel uvek dobija eksplicitan minimalni projektni `--config`.
- Eksplicitan `builder/cloudflared-quick.yml` uklonio je inherited tunnel profil: novi javni health radi, objavljuje `signs:false` i `sends:false`, a trade endpoint ostaje 503 dok finalni manifest nije on-chain potvrdjen.
- Prvi finalni ALT pokušaj je bez slanja stao na očekivanih 22 naspram 21 jedinstvene statičke adrese. Uzrok: modelirani prelaunch Pump account shape imao je jednu statičku adresu više od deduplikovanog živog XCNDL `buy_v2`; lek je zamrznuti i testirati stvarni final-mint skup od 21 adrese, ne raniji modelirani broj.
- Prvi javni post-launch browser QA dobio je stari `PRE-LAUNCH` iako je cache-busted manifest već bio živ. Uzrok: GitHub Pages CDN je još služio neversionirani `app.js`/manifest put; lek je verzionisati oba launch resursa u HTML-u i JS fetch-u, jer samo `cache: no-store` u klijentu nije dovoljno za trenutni shared-cache prelaz.
- Javni `api.mainnet-beta.solana.com` vraća browser-originu `403 Access forbidden`, dok `solana-rpc.publicnode.com` iz iste javne stranice vraća potvrđen mainnet slot. Lek: browser manifest koristi provereni PublicNode kao prvi read-only RPC, zvanični endpoint kao fallback, a objektne JSON-RPC greške pretvara u čitljivu poruku.
- PublicNode dozvoljava `getAccountInfo` i `getBalance`, ali indeksirani `getTokenAccountBalance` traži lični token. Lek: Token-2022 pot ATA se čita kao običan account, pa browser lokalno proverava token-program owner, TSLAx mint, pot authority i u64 amount; live tabla ne zavisi od indeksiranog RPC servisa.

# Iskustva

- 2026-09-13: The launch builder process had exited while its quick-tunnel URL remained published. A settled immutable race only needs its read-only board and repeatable winner claim; both can work from the static site with a locally composed transaction and no temporary builder.

- Jasna hijerarhija je STOCK CANDLE -> `$XCNDL` -> Candle Ladder -> TSLAx. Posetilac mora da vidi sve četiri veze u prvom viewportu.
- TSLAx-first igra stvara nepotrebnu onboarding rupu ako korisnik mora sam da traži quote asset. Najkraći proizvodni put je wallet-signed SOL -> TSLAx kupovina u sajtu, uz direktan TSLAx režim za postojeće vlasnike.
- Današnja read-only Jupiter provera je ponovo našla ExactIn SOL -> TSLAx rutu. To dokazuje dostupnu rutu u tom trenutku, ne trajnu likvidnost niti garantovanu cenu.
- Browser QA je potvrdio da Jupiter quote radi direktno iz statičkog sajta i da je swap POST CORS-dostupan. Najnoviji spojeni `SOL -> TSLAx -> XCNDL -> rung` uzorak staje u 1.039 bajtova sa 193 bajta rezerve i jednim potpisom, ali ostaje iza feature flaga dok konačni mint ne prođe runtime simulaciju; dve potvrde su fallback.
- Ponovljeni route atom posle metadata upload-a dobio je drugu Jupiter putanju (Byreal -> Whirlpool): spojeni paket je porastao na `1,211 / 1,232` bajtova, samo 21 bajt rezerve. To potvrdjuje da feature flag mora zavisiti od svake sveze rute i da dve potvrde nisu samo teorijski fallback.
- CANDLE wrapper ne dopušta kupovinu bez runda: ako `curve_after` ne pređe sledeći target, ceo Pump CPI se vraća. Zato javni UI ne sme da traži nasumičan `$XCNDL` amount; mora da pročita curve/high-water stanje, izračuna minimalni crossing buy i prikaže TSLAx budžet pre potpisa.
- Pump creator-fee share za TSLAx-pair stize kao TSLAx u pot ATA, ne kao lamports. SOL-only close bi ostavio deo obecane nagrade van pobednikovog puta. Program zato pamti pobednika pri close-u i dozvoljava ponovljiv permissionless TSLAx claim samo tom odredistu, ukljucujuci kasne fee distribucije.
- Svezi pocetni Pump replay daje 1M XCNDL oko 0.01101093 TSLAx, 2M oko 0.02204241, 5M oko 0.05526078 i 10M oko 0.1110414 pre 1% slippage zastite. Korak 1M je jedini od kandidata koji razumno staje u podrazumevani 0.05 SOL onboarding pri trenutnoj ruti.
- Live tabla ne sme verovati samo javnom JSON-u. Browser pre otkljucavanja proverava owner configa, oba minta, oba token programa i on-chain window/minimum/step/fee protiv manifesta.
- Kratak launch ne zahteva custody ni privatni RPC kao deo pravila: lokalni no-key builder moze privremeno da bude dostupan kroz HTTPS tunnel, dok program i browser ponovo proveravaju njegov izlaz. Builder mora objaviti `signs:false`, `sends:false` i ostati `configured:false` do finalnih adresa i zamrznutog ALT-a.
- DNS CNAME moze javno proraditi pre GitHub Pages custom-domain TLS sertifikata. Launch link se ne objavljuje dok direktan HTTPS fetch ne vrati 200 sa ispravnim host sertifikatom; HTTP 200 sam nije dovoljan dokaz spremnosti.
- Kada validan GitHub Pages CNAME ostane `HTTPS eligible` ali sertifikat ne nastane posle standardnog cekanja, zvanicni remove/re-add custom-domain postupak je ovde odmah pokrenuo novi CNAME commit i odobren sertifikat; posle toga je `https_enforced=true` i direktan host fetch 200.
- Builder manifest gate mora proveravati zamrznutu ekonomiju, X/Telegram URL, artefact hash i aktivan zamrznut ALT, ne samo prisustvo adresa i `deployed=true`.
- Finalni XCNDL `buy_v2` daje 21 jedinstvenu statičku ALT adresu posle uklanjanja signer/dinamičkih/programskih adresa; vrednost je potvrđena pre ALT kreiranja i postaje deo authority-lock readbacka.
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
- Finalni launch post je `https://x.com/SonyxEth/status/2099118851627602318`; sajt koristi isti URL kao jedini javni X izvor.
- Founder plan je 5,000,000 XCNDL kroz isti wrapper, zatim transfer tokena na `HXFDa...C1HvM`; jedna velika kupovina po programu osvaja samo jedan rung.
- Launch wallet `ExBhta...TFgE` je posle Semirovog transfera pročitan na `0.494485737 SOL`, iznad poslednje izmerene preporuke `0.479290218 SOL`; ovo je stanje pre bilo kog STOCK CANDLE potpisa ili slanja.
- Finalni Pump metadata URI je `https://ipfs.io/ipfs/bafkreihsmhrmjdnqmzosbfor4mzef3rxhgp3f7zv7ciw7eefagczjx3eqm`; Pinata gateway je nezavisno vratio tacan naziv, simbol, opis, image CID, X, Telegram i website. Direktni `ipfs.io` fetch sa ovog tela je Cloudflare-challenge 403, sto nije nestanak sadrzaja.
- TSLAx extension atom je neposredno pred launch ponovo prosao: mint nije paused, nema TransferFeeConfig, NonTransferable ni hook extra-account; aktuelni 478-byte ATA rent je `0.00307848 SOL`.
- 2026-09-13: Late distribution arrived during closeout: the TSLAx pot changed from zero to 0.11261659 between finalized reads. Both mainnet simulation and browser simulation then passed the local claim. The upstream Pump TSLAx vault retained 1 raw unit, the AMM vault zero. A previously empty pot is a timestamped observation, not a permanent settled balance.
