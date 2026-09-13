"use strict";

const assert = require("assert");
const admin = require("./mainnet-admin.js");
const founder = require("./founder-entry.js");

const a = admin.addresses();
assert.strictEqual(a.config.toBase58(), "5LN2kPUJqgAbqbDALpi1EUq2CHx84UqPszBmbtc3Brp2");
assert.strictEqual(a.configBump, 255);
assert.strictEqual(a.pot.toBase58(), "6BztA9ESeDTWN5PsQmMXa3wUTT8wpvWswW6VcAYUTVLN");
assert.strictEqual(a.potBump, 255);
assert.strictEqual(a.potQuoteAta.toBase58(), "EG9AbYCgksSd7Z5TViBgwY8QYE9kH2xQnU3ThcjqguPN");

const startTs = 1_800_000_000;
const init = admin.initInstruction(a, startTs);
assert.strictEqual(init.programId.toBase58(), admin.PROGRAM_ID.toBase58());
assert.strictEqual(init.keys.length, 10);
assert.strictEqual(init.data.length, 43);
assert.deepStrictEqual([...init.data.subarray(0, 3)], [0, 255, 255]);
assert.strictEqual(Number(init.data.readBigInt64LE(3)), startTs);
assert.strictEqual(Number(init.data.readBigInt64LE(11)), startTs + admin.WINDOW_SECONDS);
assert.strictEqual(init.data.readBigUInt64LE(19), admin.MIN_BUY_RAW);
assert.strictEqual(init.data.readBigUInt64LE(27), admin.ENTRY_FEE_LAMPORTS);
assert.strictEqual(init.data.readBigUInt64LE(35), admin.RUNG_STEP_RAW);

const frozenConfig = {
  isInit: 1,
  configBump: a.configBump,
  potBump: a.potBump,
  startTs,
  endTs: startTs + admin.WINDOW_SECONDS,
  minBuyRaw: admin.MIN_BUY_RAW.toString(),
  entryFeeLamports: admin.ENTRY_FEE_LAMPORTS.toString(),
  baseMint: admin.MINT.toBase58(),
  baseTokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  rungStepRaw: admin.RUNG_STEP_RAW.toString(),
  quoteMint: admin.TSLAX_MINT.toBase58(),
  quoteTokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
};
assert.strictEqual(admin.configIsFinal(frozenConfig, a, startTs), true);
assert.strictEqual(admin.configIsFinal({ ...frozenConfig, rungStepRaw: "1" }, a, startTs), false);

const founderAddresses = founder.gameAddresses();
assert.strictEqual(founderAddresses.config.toBase58(), a.config.toBase58());
assert.strictEqual(founderAddresses.pot.toBase58(), a.pot.toBase58());
assert.strictEqual(founderAddresses.record.toBase58(), "BM8VDDMpo9hPdQUwuYn8rxtNGUWYFSwegg44N2vbCyVh");
assert.strictEqual(founder.FOUNDER_MIN_BUY_RAW, 1_000_000_000_000n);
assert.strictEqual(founder.INPUT_LAMPORTS, 220_000_000n);
assert.strictEqual(admin.EXPECTED_GAME_ALT_ADDRESS_COUNT, 21);
assert.strictEqual(founder.addSlippage(5_526_078n), 5_581_339n);
assert.strictEqual(founder.ui(5_000_000_000_000n, 6), "5000000");

console.log("OK: STOCK_CANDLE_ADMIN_LAYOUT_PASS");
