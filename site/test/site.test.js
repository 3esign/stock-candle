"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const site = path.resolve(__dirname, "..");
const project = path.resolve(site, "..");
const read = (file) => fs.readFileSync(path.join(site, file), "utf8");
const html = read("index.html");
const css = read("styles.css");
const js = read("app.js");
const manifest = JSON.parse(read("manifest.json"));
const publicRules = read("rules.html");
const rules = fs.readFileSync(path.join(project, "RULES.md"), "utf8");

assert.match(html, /<h1 id="pageTitle">STOCK<br>CANDLE<\/h1>/);
assert.match(html, /launch race is complete/);
assert.match(html, /0\.051 SOL pot was paid/);
assert.match(html, /Race closed/i);
assert.match(html, /1M XCNDL/);
assert.match(html, /id="modeSol"/);
assert.match(html, /id="modeTslax"/);
assert.match(html, /id="eligibilityCheck"/);
assert.match(html, /No price, wallet, pot or leaderboard value shown here is live/i);
assert.match(html, /Not affiliated with Tesla/i);
assert.doesNotMatch(html, /Tesla logo|Tesla car/i);

assert.strictEqual(manifest.deployed, true);
assert.strictEqual(manifest.tradingEnabled, false);
assert.strictEqual(manifest.entryPermanentlyClosed, true);
assert.strictEqual(manifest.settlementMode, "browser");
assert.strictEqual(manifest.programImmutable, true);
assert.strictEqual(manifest.atomicSolEntryEnabled, false);
assert.strictEqual(manifest.launchParameters.windowSeconds, 900);
assert.strictEqual(manifest.launchParameters.minimumBaseAmountRaw, "1000000000000");
assert.strictEqual(manifest.launchParameters.rungStepRaw, "1000000000000");
assert.strictEqual(manifest.launchParameters.successfulRungFeeLamports, "1000000");
assert.strictEqual(manifest.launchParameters.initialPotLamports, "50000000");
assert.strictEqual(manifest.creatorFeeSharing.potShareBps, 6633);
assert.strictEqual(manifest.creatorFeeSharing.creatorShareBps, 3367);
assert.strictEqual(manifest.creatorFeeSharing.lockedOnChain, true);
assert.strictEqual(manifest.mint, "5CmZR4yHKwfTDL5y7PoMJ6kTR9LJBcsdXPBoY9tLT5sF");
assert.strictEqual(manifest.programId, "4NAF1Q253cmH4mviU5eMF3A23qUGxzuwXhkHAoGvAAHB");
assert.strictEqual(manifest.config, "5LN2kPUJqgAbqbDALpi1EUq2CHx84UqPszBmbtc3Brp2");
assert.strictEqual(manifest.pot, "6BztA9ESeDTWN5PsQmMXa3wUTT8wpvWswW6VcAYUTVLN");
assert.strictEqual(manifest.potQuoteAta, "EG9AbYCgksSd7Z5TViBgwY8QYE9kH2xQnU3ThcjqguPN");
assert.strictEqual(manifest.gameAlt, "EhSkfKUZQbQTyd2uhekpsXWSfJx53ZFCBpYVquDNEBP6");
assert.strictEqual(manifest.gameBuilderUrl, "");
assert.strictEqual(manifest.tslaxMint, "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
assert.strictEqual(manifest.expectedProgramSha256, "22EE4F121EC05B9C47CA32001A740FAFAFB46939A2AAF7E402D86E4A9BE29A6B");
assert.strictEqual(manifest.telegramUrl, "https://t.me/chetx");
assert.strictEqual(manifest.xUrl, "https://x.com/SonyxEth/status/2099118851627602318");
assert.strictEqual(manifest.rpcUrls[0], "https://solana-rpc.publicnode.com");
assert.match(html, /<meta name="twitter:creator" content="@SonyxEth">/);
assert.match(html, /<link rel="canonical" href="https:\/\/scandle\.ratchetx\.xyz\/">/);

assert.match(js, /function manifestIsLaunchReady\(\)/);
assert.match(js, /function hydrateOnChainState\(\)/);
assert.doesNotMatch(js, /getTokenAccountBalance/);
assert.match(js, /TSLAx prize account mint or pot authority does not match/);
assert.match(js, /Config mint or token-program binding does not match the public manifest/);
assert.match(js, /On-chain game rules do not match the public manifest/);
assert.match(js, /CandleSettlement\.compile/);
assert.match(js, /Settlement builder intent did not match the verified on-chain state/);
assert.match(js, /m\.deployed === true/);
assert.match(js, /m\.tradingEnabled === true/);
assert.match(js, /Launch manifest is not ready\. Spending remains disabled\./);
assert.match(js, /swapMode", "ExactIn"/);
assert.match(js, /Price impact exceeds the 1% site guard/);
assert.match(js, /simulateSerializedTransaction\(swap\.swapTransaction\)/);
assert.ok(js.indexOf("simulateSerializedTransaction(swap.swapTransaction)") < js.indexOf("walletSignAndSendBase64(swap.swapTransaction)"));
assert.match(js, /build-sol-entry/);
assert.match(js, /function verifyAtomicIntent\(built\)/);
assert.match(js, /One-signature entry is unavailable for this route\. Nothing was signed\./);
assert.ok(js.indexOf("simulateSerializedTransaction(built.transaction.serializedBase64)") < js.indexOf("walletSignAndSendBase64(built.transaction.serializedBase64)"));
assert.match(js, /provider\.request\(\{/);
assert.doesNotMatch(js, /secretKey|Keypair|data\/secrets|\.env/);

assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /aspect-ratio: 16 \/ 8\.4/);
assert.doesNotMatch(css, /font-size:\s*clamp\([^)]*vw/);

assert.match(rules, /Status: live on Solana mainnet/);
assert.match(rules, /The builder never holds funds or a player key/);
assert.match(rules, /Frozen Launch Values/);
assert.match(rules, /repeatable/i);
assert.match(publicRules, /The ladder<br>only goes up/);
assert.match(publicRules, /Frozen launch rules/);
assert.strictEqual(read("CNAME").trim(), "scandle.ratchetx.xyz");

for (const file of ["index.html", "rules.html", "styles.css", "app.js", "settlement.js", "manifest.json", "serve.js", "assets/xcndl-token.svg"]) {
  assert.ok(Buffer.from(read(file), "utf8").every((byte) => byte < 128), file + " must remain ASCII");
}

console.log("OK: STOCK_CANDLE_SITE_GATES_PASS");
