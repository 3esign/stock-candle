"use strict";

// STOCK CANDLE mainnet administration. Read-only by default. Every command
// that can spend or mutate state has a separate literal confirmation gate.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { headers: incognitoHeaders } = require("C:/Svemir/lib/incognito.js");

const MODULES = "C:/Svemir/tools/solana-cli/scripts-scratch/node_modules";
const requireFromTools = (name) => require(path.join(MODULES, name));
const BN = requireFromTools("bn.js");
const {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = requireFromTools("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} = requireFromTools("@solana/spl-token");
const {
  bondingCurvePda,
  creatorVaultPda,
  feeSharingConfigPda,
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  PumpSdk,
} = requireFromTools("@pump-fun/pump-sdk");
const {
  coinCreatorVaultAtaPda,
  coinCreatorVaultAuthorityPda,
} = requireFromTools("@pump-fun/pump-swap-sdk");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey("4NAF1Q253cmH4mviU5eMF3A23qUGxzuwXhkHAoGvAAHB");
const MINT = new PublicKey("5CmZR4yHKwfTDL5y7PoMJ6kTR9LJBcsdXPBoY9tLT5sF");
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const DEPLOYER = new PublicKey("ExBhtaQXzQvTYreqjy2E9ZdvoxJWrBEnwooD2ceGTFgE");
const SEMIR = new PublicKey("HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM");
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const PUMP_BUYBACK_FEE_RECIPIENT = new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");
const PROGRAM_SO = "C:/Svemir/skills/svemir-solana/lab/candle-fuse/target/deploy/candle_fuse_lab.so";
const PROGRAM_KEYPAIR = "C:/Svemir/skills/svemir-solana/lab/candle-fuse/target/deploy/candle_fuse_lab-keypair.json";
const DEPLOYER_KEYPAIR = "C:/Svemir/tools/solana-cli/artifacts/stockpulse-mainnet/stockpulse-deployer.json";
const MINT_KEYPAIR = "C:/Svemir/data/keys/stock-candle/xcndl-mint.json";
const SOLANA = "C:/Svemir/tools/solana-cli/solana-release/bin/solana.exe";
const SOLANA_KEYGEN = "C:/Svemir/tools/solana-cli/solana-release/bin/solana-keygen.exe";
const RECEIPT_PATH = path.resolve(__dirname, "onchain.receipt.json");
const EXPECTED_SO_BYTES = 30648;
const EXPECTED_SO_SHA256 = "22EE4F121EC05B9C47CA32001A740FAFAFB46939A2AAF7E402D86E4A9BE29A6B";
const PROGRAM_MAX_LEN = 30720;
const CONFIG_LEN = 380;
const WINDOW_SECONDS = 900;
const MIN_BUY_RAW = 1_000_000_000_000n;
const RUNG_STEP_RAW = 1_000_000_000_000n;
const ENTRY_FEE_LAMPORTS = 1_000_000n;
const POT_SEED_LAMPORTS = 50_000_000n;
const FOUNDER_BUY_RAW = 5_000_000_000_000n;
const MAX_U64 = (1n << 64n) - 1n;
const MAX_PACKET_BYTES = 1232;
const EXPECTED_GAME_ALT_ADDRESS_COUNT = 21;
const CONFIRMATIONS = {
  "deploy-program": "STOCK_CANDLE_PROGRAM_MAINNET",
  init: "STOCK_CANDLE_INIT_MAINNET",
  fees: "STOCK_CANDLE_FEE_SHARE_MAINNET",
  alt: "STOCK_CANDLE_ALT_MAINNET",
  "lock-program": "STOCK_CANDLE_LOCK_PROGRAM_MAINNET",
};

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requireSendGate(command) {
  if (!hasFlag("--send")) return false;
  const expected = CONFIRMATIONS[command];
  if (!expected || argValue("--mainnet-confirm") !== expected) {
    throw new Error(`mainnet ${command} blocked; expected --send --mainnet-confirm ${expected}`);
  }
  return true;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function keypairPubkey(filePath) {
  const result = spawnSync(SOLANA_KEYGEN, ["pubkey", filePath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`could not verify keypair public key: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function loadKeypair(filePath) {
  const bytes = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function makeConnection() {
  return new Connection(RPC, {
    commitment: "confirmed",
    fetchMiddleware: (url, options, fetchFn) => fetchFn(url, {
      ...options,
      headers: {
        ...incognitoHeaders(url, { vrsta: "json" }),
        ...(options.headers || {}),
      },
    }),
  });
}

function saveReceipt(patch) {
  const current = fs.existsSync(RECEIPT_PATH)
    ? JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"))
    : {};
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify({ ...current, ...patch }, null, 2) + "\n");
}

function pda(seeds, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function i64(value) {
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(BigInt(value));
  return out;
}

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function localArtifact() {
  const bytes = fs.readFileSync(PROGRAM_SO);
  return {
    bytes,
    size: bytes.length,
    hash: sha256(bytes),
    matches: bytes.length === EXPECTED_SO_BYTES && sha256(bytes) === EXPECTED_SO_SHA256,
  };
}

function addresses() {
  const [programData] = pda([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE);
  const [config, configBump] = pda([Buffer.from("candle_config"), MINT.toBuffer()]);
  const [pot, potBump] = pda([Buffer.from("candle_pot"), config.toBuffer()]);
  const potQuoteAta = getAssociatedTokenAddressSync(
    TSLAX_MINT,
    pot,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return { programData, config, configBump, pot, potBump, potQuoteAta };
}

function decodeProgram(programInfo) {
  if (!programInfo || programInfo.data.length < 36) return null;
  return {
    tag: programInfo.data.readUInt32LE(0),
    programData: new PublicKey(programInfo.data.subarray(4, 36)).toBase58(),
  };
}

function decodeProgramData(programDataInfo, artifact) {
  if (!programDataInfo || programDataInfo.data.length < 45) return null;
  const data = programDataInfo.data;
  const hasAuthority = data[12] === 1;
  const elf = data.subarray(45);
  const prefixMatches = elf.length >= artifact.bytes.length
    && elf.subarray(0, artifact.bytes.length).equals(artifact.bytes);
  const paddingAllZero = elf.subarray(artifact.bytes.length).every((byte) => byte === 0);
  return {
    tag: data.readUInt32LE(0),
    slot: data.readBigUInt64LE(4).toString(),
    authority: hasAuthority ? new PublicKey(data.subarray(13, 45)).toBase58() : null,
    elfBytes: elf.length,
    elfSha256: sha256(elf),
    prefixMatches,
    paddingAllZero,
  };
}

function decodeConfig(info) {
  if (!info || info.data.length < CONFIG_LEN) return null;
  const data = info.data;
  return {
    isInit: data[0],
    configBump: data[1],
    potBump: data[2],
    startTs: Number(data.readBigInt64LE(3)),
    endTs: Number(data.readBigInt64LE(11)),
    minBuyRaw: data.readBigUInt64LE(19).toString(),
    entryFeeLamports: data.readBigUInt64LE(27).toString(),
    closed: data[51] === 1,
    winner: new PublicKey(data.subarray(52, 84)).toBase58(),
    baseMint: new PublicKey(data.subarray(236, 268)).toBase58(),
    baseTokenProgram: new PublicKey(data.subarray(268, 300)).toBase58(),
    rungStepRaw: data.readBigUInt64LE(300).toString(),
    quoteMint: new PublicKey(data.subarray(316, 348)).toBase58(),
    quoteTokenProgram: new PublicKey(data.subarray(348, 380)).toBase58(),
  };
}

function summarizeSharing(sdk, info) {
  if (!info) return null;
  const decoded = sdk.decodeSharingConfig(info);
  return {
    admin: decoded.admin.toBase58(),
    adminRevoked: Boolean(decoded.adminRevoked),
    shareholders: decoded.shareholders.map((row) => ({
      address: row.address.toBase58(),
      shareBps: row.shareBps,
    })),
  };
}

function sharingIsFinal(summary, pot) {
  if (!summary || !summary.adminRevoked || summary.shareholders.length !== 2) return false;
  const shares = new Map(summary.shareholders.map((row) => [row.address, row.shareBps]));
  return shares.get(pot.toBase58()) === 6633 && shares.get(SEMIR.toBase58()) === 3367;
}

async function readStatus(connection) {
  const artifact = localArtifact();
  const a = addresses();
  const sharingConfig = feeSharingConfigPda(MINT);
  const receipt = fs.existsSync(RECEIPT_PATH)
    ? JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"))
    : {};
  const altKey = receipt.gameAlt?.address ? new PublicKey(receipt.gameAlt.address) : null;
  const [programInfo, programDataInfo, mintInfo, quoteInfo, configInfo, potInfo, potAtaInfo, sharingInfo, balance, altResult] = await Promise.all([
    connection.getAccountInfo(PROGRAM_ID, "confirmed"),
    connection.getAccountInfo(a.programData, "confirmed"),
    connection.getAccountInfo(MINT, "confirmed"),
    connection.getAccountInfo(TSLAX_MINT, "confirmed"),
    connection.getAccountInfo(a.config, "confirmed"),
    connection.getAccountInfo(a.pot, "confirmed"),
    connection.getAccountInfo(a.potQuoteAta, "confirmed"),
    connection.getAccountInfo(sharingConfig, "confirmed"),
    connection.getBalance(DEPLOYER, "confirmed"),
    altKey ? connection.getAddressLookupTable(altKey, { commitment: "confirmed" }) : Promise.resolve({ value: null }),
  ]);
  const sdk = new PumpSdk(connection);
  const programHeader = decodeProgram(programInfo);
  const programData = decodeProgramData(programDataInfo, artifact);
  const sharing = summarizeSharing(sdk, sharingInfo);
  return {
    network: "mainnet-beta",
    launchWallet: { address: DEPLOYER.toBase58(), balanceLamports: balance, balanceSol: balance / 1e9 },
    program: {
      address: PROGRAM_ID.toBase58(),
      exists: Boolean(programInfo),
      executable: Boolean(programInfo?.executable),
      owner: programInfo?.owner.toBase58() || null,
      header: programHeader,
      programData,
      localArtifact: { size: artifact.size, sha256: artifact.hash, matches: artifact.matches },
      liveMatches: Boolean(programHeader
        && programHeader.programData === a.programData.toBase58()
        && programData?.prefixMatches
        && programData?.paddingAllZero),
    },
    token: {
      mint: MINT.toBase58(),
      exists: Boolean(mintInfo),
      owner: mintInfo?.owner.toBase58() || null,
      quoteMint: TSLAX_MINT.toBase58(),
      quoteExists: Boolean(quoteInfo),
      quoteOwner: quoteInfo?.owner.toBase58() || null,
    },
    game: {
      config: a.config.toBase58(),
      configBump: a.configBump,
      configState: decodeConfig(configInfo),
      pot: a.pot.toBase58(),
      potBump: a.potBump,
      potLamports: potInfo?.lamports || 0,
      potQuoteAta: a.potQuoteAta.toBase58(),
      potQuoteAtaExists: Boolean(potAtaInfo),
    },
    feeSharing: {
      address: sharingConfig.toBase58(),
      state: sharing,
      final: sharingIsFinal(sharing, a.pot),
    },
    gameAlt: altKey ? {
      address: altKey.toBase58(),
      exists: Boolean(altResult.value),
      authority: altResult.value?.state.authority?.toBase58() || null,
      addressCount: altResult.value?.state.addresses.length || 0,
      deactivationSlot: altResult.value?.state.deactivationSlot.toString() || null,
    } : null,
  };
}

async function buildVersioned(connection, payer, instructions, lookups = [], signers = []) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookups);
  const transaction = new VersionedTransaction(message);
  if (signers.length) transaction.sign(signers);
  const bytes = Buffer.from(transaction.serialize()).length;
  if (bytes > MAX_PACKET_BYTES) throw new Error(`transaction is ${bytes} bytes, over ${MAX_PACKET_BYTES}`);
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: signers.length > 0,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  });
  return { transaction, latest, simulation, bytes };
}

async function sendBuilt(connection, built) {
  if (built.simulation.value.err) throw new Error(`simulation failed: ${JSON.stringify(built.simulation.value.err)}`);
  const signature = await connection.sendRawTransaction(Buffer.from(built.transaction.serialize()), { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: built.latest.blockhash,
    lastValidBlockHeight: built.latest.lastValidBlockHeight,
  }, "confirmed");
  if (confirmation.value.err) throw new Error(`confirmed transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}

function assertProgramReady(status) {
  if (!status.program.localArtifact.matches) throw new Error("local SBF artifact drifted");
  if (!status.program.executable || status.program.owner !== BPF_LOADER_UPGRADEABLE.toBase58()) {
    throw new Error("live program is not an executable upgradeable-loader account");
  }
  if (status.program.header?.tag !== 2 || status.program.programData?.tag !== 3) {
    throw new Error("live program or ProgramData loader-state tag is invalid");
  }
  if (!status.program.liveMatches) throw new Error("live program is absent or does not match the frozen SBF");
  if (status.program.programData.authority !== DEPLOYER.toBase58()) {
    throw new Error("program upgrade authority is not the launch wallet during setup");
  }
}

async function commandDeployProgram(connection) {
  const send = requireSendGate("deploy-program");
  const status = await readStatus(connection);
  if (!status.program.localArtifact.matches) throw new Error("frozen SBF size/hash mismatch");
  if (keypairPubkey(PROGRAM_KEYPAIR) !== PROGRAM_ID.toBase58()) throw new Error("program keypair public key mismatch");
  if (keypairPubkey(DEPLOYER_KEYPAIR) !== DEPLOYER.toBase58()) throw new Error("deployer keypair public key mismatch");
  if (status.program.exists) {
    console.log(JSON.stringify(status.program, null, 2));
    if (!status.program.liveMatches) throw new Error("program address exists with unexpected bytes");
    return;
  }
  const plan = {
    action: "deploy-program",
    sent: false,
    programId: PROGRAM_ID.toBase58(),
    elfBytes: EXPECTED_SO_BYTES,
    elfSha256: EXPECTED_SO_SHA256,
    maxLen: PROGRAM_MAX_LEN,
    cliPreflight: true,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!send) return;

  const result = spawnSync(SOLANA, [
    "program", "deploy", PROGRAM_SO,
    "--program-id", PROGRAM_KEYPAIR,
    "--upgrade-authority", DEPLOYER_KEYPAIR,
    "--fee-payer", DEPLOYER_KEYPAIR,
    "--keypair", DEPLOYER_KEYPAIR,
    "--url", RPC,
    "--commitment", "confirmed",
    "--max-len", String(PROGRAM_MAX_LEN),
    "--use-rpc",
    "--output", "json",
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`program deploy failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  const after = await readStatus(connection);
  assertProgramReady(after);
  saveReceipt({ programDeploy: { at: new Date().toISOString(), signature: output.signature || null, ...after.program } });
  console.log(JSON.stringify({ sent: true, cli: output, readback: after.program }, null, 2));
}

function initInstruction(a, startTs) {
  const endTs = startTs + WINDOW_SECONDS;
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: DEPLOYER, isSigner: true, isWritable: true },
      { pubkey: MINT, isSigner: true, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TSLAX_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.pot, isSigner: false, isWritable: false },
      { pubkey: a.potQuoteAta, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0, a.configBump, a.potBump]),
      i64(startTs),
      i64(endTs),
      u64(MIN_BUY_RAW),
      u64(ENTRY_FEE_LAMPORTS),
      u64(RUNG_STEP_RAW),
    ]),
  });
}

function configIsFinal(config, a, startTs = null) {
  return Boolean(config
    && config.isInit === 1
    && config.configBump === a.configBump
    && config.potBump === a.potBump
    && (startTs === null || config.startTs === startTs)
    && config.endTs - config.startTs === WINDOW_SECONDS
    && config.minBuyRaw === MIN_BUY_RAW.toString()
    && config.entryFeeLamports === ENTRY_FEE_LAMPORTS.toString()
    && config.baseMint === MINT.toBase58()
    && config.baseTokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()
    && config.rungStepRaw === RUNG_STEP_RAW.toString()
    && config.quoteMint === TSLAX_MINT.toBase58()
    && config.quoteTokenProgram === TOKEN_2022_PROGRAM_ID.toBase58());
}

async function commandInit(connection) {
  const send = requireSendGate("init");
  const status = await readStatus(connection);
  const a = addresses();
  assertProgramReady(status);
  if (!status.token.exists || status.token.owner !== TOKEN_2022_PROGRAM_ID.toBase58()) {
    throw new Error("XCNDL mint is absent or not Token-2022");
  }
  if (status.game.configState) {
    if (!configIsFinal(status.game.configState, a)) throw new Error("existing config does not match frozen rules");
    console.log(JSON.stringify({ alreadyInitialized: true, game: status.game }, null, 2));
    return;
  }
  const startArg = argValue("--start-ts");
  const startTs = startArg ? Number(startArg) : Math.floor(Date.now() / 1000) + 300;
  if (!Number.isSafeInteger(startTs) || startTs <= Math.floor(Date.now() / 1000) + 60) {
    throw new Error("start timestamp must be an integer at least 60 seconds in the future");
  }
  const instructions = [
    initInstruction(a, startTs),
    SystemProgram.transfer({ fromPubkey: DEPLOYER, toPubkey: a.pot, lamports: Number(POT_SEED_LAMPORTS) }),
  ];
  const signers = send ? [loadKeypair(DEPLOYER_KEYPAIR), loadKeypair(MINT_KEYPAIR)] : [];
  if (send && signers[0].publicKey.toBase58() !== DEPLOYER.toBase58()) throw new Error("deployer key mismatch");
  if (send && signers[1].publicKey.toBase58() !== MINT.toBase58()) throw new Error("mint key mismatch");
  const built = await buildVersioned(connection, DEPLOYER, instructions, [], signers);
  console.log(JSON.stringify({
    action: "init",
    sent: false,
    startTs,
    endTs: startTs + WINDOW_SECONDS,
    potSeedLamports: POT_SEED_LAMPORTS.toString(),
    accounts: status.game,
    packetBytes: built.bytes,
    simulationErr: built.simulation.value.err,
    simulationUnits: built.simulation.value.unitsConsumed,
  }, null, 2));
  if (built.simulation.value.err) throw new Error("init simulation failed; nothing was sent");
  if (!send) return;
  const signature = await sendBuilt(connection, built);
  const after = await readStatus(connection);
  if (!configIsFinal(after.game.configState, a, startTs)) throw new Error("config readback mismatch");
  if (after.game.potLamports < Number(POT_SEED_LAMPORTS)) throw new Error("pot seed readback is too low");
  saveReceipt({ gameInit: { at: new Date().toISOString(), signature, startTs, endTs: startTs + WINDOW_SECONDS, ...after.game } });
  console.log(JSON.stringify({ sent: true, signature, readback: after.game }, null, 2));
}

async function feeInstructions(connection, a) {
  const sdk = new PumpSdk(connection);
  const online = new OnlinePumpSdk(connection);
  const sharingConfig = feeSharingConfigPda(MINT);
  const pumpCreatorVault = creatorVaultPda(sharingConfig);
  const pumpCreatorVaultAta = getAssociatedTokenAddressSync(TSLAX_MINT, pumpCreatorVault, true, TOKEN_2022_PROGRAM_ID);
  const swapCreatorVaultAuthority = coinCreatorVaultAuthorityPda(sharingConfig);
  const swapCreatorVaultAta = coinCreatorVaultAtaPda(swapCreatorVaultAuthority, TSLAX_MINT, TOKEN_2022_PROGRAM_ID);
  const deployerQuoteAta = getAssociatedTokenAddressSync(TSLAX_MINT, DEPLOYER, true, TOKEN_2022_PROGRAM_ID);
  const resolved = await online.resolveQuoteMint(TSLAX_MINT);
  if (!resolved.quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("TSLAx quote token program drifted");
  return [
    createAssociatedTokenAccountIdempotentInstruction(DEPLOYER, deployerQuoteAta, DEPLOYER, TSLAX_MINT, TOKEN_2022_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(DEPLOYER, swapCreatorVaultAta, swapCreatorVaultAuthority, TSLAX_MINT, TOKEN_2022_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(DEPLOYER, pumpCreatorVaultAta, pumpCreatorVault, TSLAX_MINT, TOKEN_2022_PROGRAM_ID),
    await sdk.createFeeSharingConfig({ creator: DEPLOYER, mint: MINT, pool: null }),
    await sdk.updateFeeSharesV2({
      authority: DEPLOYER,
      mint: MINT,
      currentShareholders: [DEPLOYER],
      newShareholders: [
        { address: a.pot, shareBps: 6633 },
        { address: SEMIR, shareBps: 3367 },
      ],
      quoteMint: TSLAX_MINT,
      quoteTokenProgram: TOKEN_2022_PROGRAM_ID,
    }),
  ];
}

async function commandFees(connection) {
  const send = requireSendGate("fees");
  const status = await readStatus(connection);
  const a = addresses();
  assertProgramReady(status);
  if (!configIsFinal(status.game.configState, a)) throw new Error("game config is not initialized with frozen rules");
  if (status.feeSharing.final) {
    console.log(JSON.stringify({ alreadyFinal: true, feeSharing: status.feeSharing }, null, 2));
    return;
  }
  if (status.feeSharing.state) throw new Error("fee-sharing config exists but is not the final locked split");
  const instructions = await feeInstructions(connection, a);
  const signers = send ? [loadKeypair(DEPLOYER_KEYPAIR)] : [];
  const built = await buildVersioned(connection, DEPLOYER, instructions, [], signers);
  console.log(JSON.stringify({
    action: "fees",
    sent: false,
    potShareBps: 6633,
    creatorShareBps: 3367,
    creatorWallet: SEMIR.toBase58(),
    packetBytes: built.bytes,
    simulationErr: built.simulation.value.err,
    simulationUnits: built.simulation.value.unitsConsumed,
  }, null, 2));
  if (built.simulation.value.err) throw new Error("fee-sharing simulation failed; nothing was sent");
  if (!send) return;
  const signature = await sendBuilt(connection, built);
  const after = await readStatus(connection);
  if (!after.feeSharing.final) throw new Error("fee-sharing readback is not final and locked");
  saveReceipt({ feeSharing: { at: new Date().toISOString(), signature, ...after.feeSharing } });
  console.log(JSON.stringify({ sent: true, signature, readback: after.feeSharing }, null, 2));
}

async function buildFounderWrapper(connection, a) {
  const online = new OnlinePumpSdk(connection);
  const [global, bondingCurve, resolved] = await Promise.all([
    online.fetchGlobal(),
    online.fetchBondingCurve(MINT),
    online.resolveQuoteMint(TSLAX_MINT),
  ]);
  if (!resolved.quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("TSLAx quote token program drifted");
  const pumpBuy = await PUMP_SDK.getBuyV2InstructionRaw({
    user: DEPLOYER,
    mint: MINT,
    creator: bondingCurve.creator,
    amount: new BN(FOUNDER_BUY_RAW.toString()),
    quoteAmount: new BN(MAX_U64.toString()),
    feeRecipient: global.feeRecipient,
    buybackFeeRecipient: PUMP_BUYBACK_FEE_RECIPIENT,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteMint: TSLAX_MINT,
    quoteTokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  const [record, recordBump] = pda([Buffer.from("candle_player"), a.config.toBuffer(), DEPLOYER.toBuffer()]);
  const wrapper = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: DEPLOYER, isSigner: true, isWritable: true },
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.pot, isSigner: false, isWritable: true },
      { pubkey: record, isSigner: false, isWritable: true },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pumpBuy.keys,
    ],
    data: Buffer.concat([Buffer.from([1, recordBump, a.configBump, a.potBump]), pumpBuy.data]),
  });
  return { wrapper, pumpBuy, record };
}

function commonLookupAddresses(wrapper, pumpBuy, record) {
  const dynamic = new Set([
    DEPLOYER.toBase58(),
    record.toBase58(),
    pumpBuy.keys[14].pubkey.toBase58(),
    pumpBuy.keys[15].pubkey.toBase58(),
    pumpBuy.keys[20].pubkey.toBase58(),
    pumpBuy.keys[21].pubkey.toBase58(),
  ]);
  const excluded = new Set([
    ...dynamic,
    PROGRAM_ID.toBase58(),
    PUMP_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(),
    ComputeBudgetProgram.programId.toBase58(),
  ]);
  const seen = new Set();
  const result = [];
  for (const key of wrapper.keys) {
    const value = key.pubkey.toBase58();
    if (key.isSigner || excluded.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(key.pubkey);
  }
  return result;
}

async function waitForAlt(connection, altAddress, expected) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [slot, result] = await Promise.all([
      connection.getSlot("confirmed"),
      connection.getAddressLookupTable(altAddress, { commitment: "confirmed" }),
    ]);
    const table = result.value;
    if (table && BigInt(slot) > BigInt(table.state.lastExtendedSlot)) {
      const actual = table.state.addresses.map((key) => key.toBase58());
      if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i].toBase58())) {
        throw new Error("ALT address readback differs from the frozen ordered list");
      }
      return table;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("ALT did not become active before timeout");
}

async function commandAlt(connection) {
  const send = requireSendGate("alt");
  const status = await readStatus(connection);
  const a = addresses();
  assertProgramReady(status);
  if (!configIsFinal(status.game.configState, a)) throw new Error("game config is not initialized");
  if (!status.feeSharing.final) throw new Error("fee sharing is not final and locked");
  if (status.gameAlt?.exists) {
    if (status.gameAlt.authority !== null || status.gameAlt.addressCount !== EXPECTED_GAME_ALT_ADDRESS_COUNT) {
      throw new Error(`existing game ALT is not the expected frozen ${EXPECTED_GAME_ALT_ADDRESS_COUNT}-address table`);
    }
    console.log(JSON.stringify({ alreadyFinal: true, gameAlt: status.gameAlt }, null, 2));
    return;
  }

  const { wrapper, pumpBuy, record } = await buildFounderWrapper(connection, a);
  const lookupAddresses = commonLookupAddresses(wrapper, pumpBuy, record);
  if (lookupAddresses.length !== EXPECTED_GAME_ALT_ADDRESS_COUNT) {
    throw new Error(`expected ${EXPECTED_GAME_ALT_ADDRESS_COUNT} static game addresses, found ${lookupAddresses.length}`);
  }
  const recentSlot = await connection.getSlot("finalized");
  const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
    authority: DEPLOYER,
    payer: DEPLOYER,
    recentSlot,
  });
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    lookupTable: altAddress,
    authority: DEPLOYER,
    payer: DEPLOYER,
    addresses: lookupAddresses,
  });
  const signers = send ? [loadKeypair(DEPLOYER_KEYPAIR)] : [];
  const setup = await buildVersioned(connection, DEPLOYER, [createIx, extendIx], [], signers);
  console.log(JSON.stringify({
    action: "alt",
    sent: false,
    recentSlot,
    address: altAddress.toBase58(),
    addressCount: lookupAddresses.length,
    addresses: lookupAddresses.map((key) => key.toBase58()),
    setupPacketBytes: setup.bytes,
    simulationErr: setup.simulation.value.err,
  }, null, 2));
  if (setup.simulation.value.err) throw new Error("ALT setup simulation failed; nothing was sent");
  if (!send) return;
  const setupSignature = await sendBuilt(connection, setup);
  const activeTable = await waitForAlt(connection, altAddress, lookupAddresses);
  const founderMessage = new TransactionMessage({
    payerKey: DEPLOYER,
    recentBlockhash: (await connection.getLatestBlockhash("confirmed")).blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), wrapper],
  }).compileToV0Message([activeTable]);
  const founderPacketBytes = Buffer.from(new VersionedTransaction(founderMessage).serialize()).length;
  if (founderPacketBytes > MAX_PACKET_BYTES) throw new Error(`founder wrapper packet is too large: ${founderPacketBytes}`);

  const freezeIx = AddressLookupTableProgram.freezeLookupTable({
    lookupTable: altAddress,
    authority: DEPLOYER,
  });
  const freeze = await buildVersioned(connection, DEPLOYER, [freezeIx], [], signers);
  if (freeze.simulation.value.err) throw new Error("ALT freeze simulation failed");
  const freezeSignature = await sendBuilt(connection, freeze);
  const frozen = (await connection.getAddressLookupTable(altAddress, { commitment: "confirmed" })).value;
  if (!frozen || frozen.state.authority !== undefined) throw new Error("ALT readback is not frozen");
  saveReceipt({
    gameAlt: {
      at: new Date().toISOString(),
      address: altAddress.toBase58(),
      addressCount: lookupAddresses.length,
      addresses: lookupAddresses.map((key) => key.toBase58()),
      setupSignature,
      freezeSignature,
      founderPacketBytes,
      authority: null,
    },
  });
  console.log(JSON.stringify({
    sent: true,
    address: altAddress.toBase58(),
    setupSignature,
    freezeSignature,
    founderPacketBytes,
    authority: null,
  }, null, 2));
}

async function commandLockProgram(connection) {
  const send = requireSendGate("lock-program");
  const status = await readStatus(connection);
  const a = addresses();
  assertProgramReady(status);
  if (!configIsFinal(status.game.configState, a)) throw new Error("game config is not final");
  if (!status.feeSharing.final) throw new Error("fee sharing is not final");
  if (!status.gameAlt?.exists || status.gameAlt.authority !== null || status.gameAlt.addressCount !== EXPECTED_GAME_ALT_ADDRESS_COUNT) {
    throw new Error("game ALT is not final and frozen");
  }
  const receipt = fs.existsSync(RECEIPT_PATH)
    ? JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf8"))
    : {};
  if (!receipt.founderBuy?.signature || !receipt.founderTransfer?.signature) {
    throw new Error("founder mainnet wrapper proof and transfer receipts are required before immutability");
  }
  console.log(JSON.stringify({
    action: "lock-program",
    sent: false,
    program: PROGRAM_ID.toBase58(),
    currentAuthority: status.program.programData.authority,
    finalAuthority: null,
    founderProof: receipt.founderBuy.signature,
  }, null, 2));
  if (!send) return;

  const result = spawnSync(SOLANA, [
    "program", "set-upgrade-authority", PROGRAM_ID.toBase58(),
    "--final",
    "--upgrade-authority", DEPLOYER_KEYPAIR,
    "--keypair", DEPLOYER_KEYPAIR,
    "--url", RPC,
    "--commitment", "confirmed",
    "--output", "json",
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`program lock failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  const after = await readStatus(connection);
  if (!after.program.liveMatches || after.program.programData.authority !== null) {
    throw new Error("program lock readback failed");
  }
  saveReceipt({ programLock: { at: new Date().toISOString(), signature: output.signature || null, ...after.program } });
  console.log(JSON.stringify({ sent: true, cli: output, readback: after.program }, null, 2));
}

async function main() {
  const command = process.argv[2] || "status";
  const connection = makeConnection();
  if (command === "status") {
    console.log(JSON.stringify(await readStatus(connection), null, 2));
    return;
  }
  if (command === "deploy-program") return commandDeployProgram(connection);
  if (command === "init") return commandInit(connection);
  if (command === "fees") return commandFees(connection);
  if (command === "alt") return commandAlt(connection);
  if (command === "lock-program") return commandLockProgram(connection);
  throw new Error(`unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("ERROR:", error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIG_LEN,
  DEPLOYER,
  ENTRY_FEE_LAMPORTS,
  EXPECTED_GAME_ALT_ADDRESS_COUNT,
  MINT,
  MIN_BUY_RAW,
  POT_SEED_LAMPORTS,
  PROGRAM_ID,
  RUNG_STEP_RAW,
  TSLAX_MINT,
  WINDOW_SECONDS,
  addresses,
  commonLookupAddresses,
  configIsFinal,
  decodeConfig,
  initInstruction,
};
