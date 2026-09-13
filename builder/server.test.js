"use strict";

const assert = require("assert");
const { once } = require("events");
const {
  CONFIG_LEN,
  U64_MAX,
  createServer,
  decodeConfig,
  manifestConfigured,
  publicManifest,
} = require("./server.js");

function writeKey(buffer, offset, fill) {
  buffer.fill(fill, offset, offset + 32);
}

async function main() {
  const data = Buffer.alloc(CONFIG_LEN);
  data[0] = 1;
  data[1] = 254;
  data[2] = 253;
  data.writeBigInt64LE(1000n, 3);
  data.writeBigInt64LE(1900n, 11);
  data.writeBigUInt64LE(1_000_000_000_000n, 19);
  data.writeBigUInt64LE(1_000_000n, 27);
  data.writeBigUInt64LE(3n, 35);
  data.writeBigUInt64LE(2n, 124);
  data.writeBigUInt64LE(1_000_000_000_000n, 300);
  data.writeBigUInt64LE(U64_MAX, 308);
  writeKey(data, 92, 4);
  writeKey(data, 236, 5);
  writeKey(data, 268, 6);
  writeKey(data, 316, 7);
  writeKey(data, 348, 8);
  const decoded = decodeConfig({ data });
  assert.strictEqual(decoded.configBump, 254);
  assert.strictEqual(decoded.potBump, 253);
  assert.strictEqual(decoded.endTs - decoded.startTs, 900);
  assert.strictEqual(decoded.minimumBuyRaw, 1_000_000_000_000n);
  assert.strictEqual(decoded.entryFeeLamports, 1_000_000n);
  assert.strictEqual(decoded.leaderScore, 2n);
  assert.strictEqual(decoded.lastAwardedBalanceRaw, U64_MAX);

  const readyManifest = {
    product: "STOCK CANDLE",
    symbol: "XCNDL",
    network: "mainnet-beta",
    siteUrl: "https://scandle.ratchetx.xyz/",
    deployed: true,
    tradingEnabled: true,
    programImmutable: true,
    atomicSolEntryEnabled: true,
    launchParameters: {
      windowSeconds: 900,
      minimumBaseAmountRaw: "1000000000000",
      rungStepRaw: "1000000000000",
      successfulRungFeeLamports: "1000000",
      initialPotLamports: "50000000",
      tieBreak: "first-to-score",
    },
    creatorFeeSharing: { potShareBps: 6633, creatorShareBps: 3367, lockedOnChain: true },
    tslaxMint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    mint: "11111111111111111111111111111111",
    programId: "11111111111111111111111111111111",
    config: "11111111111111111111111111111111",
    pot: "11111111111111111111111111111111",
    potQuoteAta: "11111111111111111111111111111111",
    gameAlt: "11111111111111111111111111111111",
    baseTokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    tslaxTokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    expectedProgramSha256: "22EE4F121EC05B9C47CA32001A740FAFAFB46939A2AAF7E402D86E4A9BE29A6B",
    gameBuilderUrl: "https://builder.example.test",
    xUrl: "https://x.com/SonyxEth/status/123456789",
    telegramUrl: "https://t.me/chetx",
  };
  assert.strictEqual(manifestConfigured(readyManifest), true);
  assert.strictEqual(manifestConfigured({ ...readyManifest, xUrl: "" }), false);
  assert.strictEqual(manifestConfigured({ ...readyManifest, atomicSolEntryEnabled: false }), true);
  assert.strictEqual(manifestConfigured({
    ...readyManifest,
    launchParameters: { ...readyManifest.launchParameters, windowSeconds: 901 },
  }), false);

  assert.strictEqual(publicManifest().configured, true);
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const healthBody = await health.json();
    assert.strictEqual(health.status, 200);
    assert.strictEqual(healthBody.configured, true);
    assert.strictEqual(healthBody.signs, false);
    assert.strictEqual(healthBody.sends, false);
    assert.strictEqual(healthBody.program, publicManifest().manifest.programId);
  } finally {
    server.close();
    await once(server, "close");
  }

  console.log("OK: STOCK_CANDLE_BUILDER_CONTRACT_PASS");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
