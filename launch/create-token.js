"use strict";

// Pump token creation is fail-closed: the default path only simulates. The
// separate upload flag publishes metadata but never sends a Solana transaction.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { headers: incognitoHeaders } = require("C:/Svemir/lib/incognito.js");

const MODULES = "C:/Svemir/tools/solana-cli/scripts-scratch/node_modules";
const requireFromTools = (name) => require(path.join(MODULES, name));
const { Connection, Keypair, PublicKey, Transaction } = requireFromTools("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID } = requireFromTools("@solana/spl-token");
const { bondingCurvePda, OnlinePumpSdk, PumpSdk } = requireFromTools("@pump-fun/pump-sdk");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const EXPECTED_MINT = "5CmZR4yHKwfTDL5y7PoMJ6kTR9LJBcsdXPBoY9tLT5sF";
const EXPECTED_DEPLOYER = "ExBhtaQXzQvTYreqjy2E9ZdvoxJWrBEnwooD2ceGTFgE";
const MINT_KEYPAIR = "C:/Svemir/data/keys/stock-candle/xcndl-mint.json";
const DEPLOYER_KEYPAIR = "C:/Svemir/tools/solana-cli/artifacts/stockpulse-mainnet/stockpulse-deployer.json";
const IMAGE_PATH = path.resolve(__dirname, "..", "site", "assets", "xcndl-token.png");
const METADATA_TEMPLATE = path.resolve(__dirname, "metadata.template.json");
const METADATA_RECEIPT = path.resolve(__dirname, "metadata.uploaded.json");
const MOCK_METADATA_URI = "https://scandle.ratchetx.xyz/metadata-preflight.json";
const REQUIRED_CONFIRM = "STOCK_CANDLE_CREATE_V2_MAINNET";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

const SEND = process.argv.includes("--send");
const UPLOAD_METADATA = process.argv.includes("--upload-metadata");
const METADATA_URI_ARG = argValue("--metadata-uri");
const CONFIRM = argValue("--mainnet-confirm");

function loadKeypair(filePath) {
  const bytes = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function readMetadata() {
  const metadata = JSON.parse(fs.readFileSync(METADATA_TEMPLATE, "utf8"));
  const expected = {
    name: "STOCK CANDLE",
    symbol: "XCNDL",
    external_url: "https://scandle.ratchetx.xyz/",
    twitter: "https://x.com/SonyxEth/status/2099118851627602318",
    telegram: "https://t.me/chetx",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) throw new Error(`metadata ${key} drift: ${JSON.stringify(metadata[key])}`);
  }
  if (!metadata.description || !Array.isArray(metadata.attributes)) {
    throw new Error("metadata description or attributes are missing");
  }
  return metadata;
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

async function uploadMetadata(metadata) {
  const image = fs.readFileSync(IMAGE_PATH);
  const form = new FormData();
  form.append("file", new Blob([image], { type: "image/png" }), "xcndl-token.png");
  form.append("name", metadata.name);
  form.append("symbol", metadata.symbol);
  form.append("description", metadata.description);
  form.append("twitter", metadata.twitter);
  form.append("telegram", metadata.telegram);
  form.append("website", metadata.external_url);
  form.append("showName", "true");

  const url = "https://pump.fun/api/ipfs";
  const response = await fetch(url, {
    method: "POST",
    headers: incognitoHeaders(url, { vrsta: "upload" }),
    body: form,
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`metadata upload failed with HTTP ${response.status}: ${responseText.slice(0, 400)}`);
  const body = JSON.parse(responseText);
  const metadataUri = body.metadataUri || body.metadata_uri || body.uri;
  if (!metadataUri) throw new Error("metadata upload response has no URI");

  const receipt = {
    uploadedAt: new Date().toISOString(),
    metadataUri,
    imageUri: body.metadata?.image || body.imageUri || null,
    name: metadata.name,
    symbol: metadata.symbol,
    twitter: metadata.twitter,
    telegram: metadata.telegram,
    website: metadata.external_url,
    imageSha256: crypto.createHash("sha256").update(image).digest("hex").toUpperCase(),
  };
  fs.writeFileSync(METADATA_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

async function main() {
  if (SEND && CONFIRM !== REQUIRED_CONFIRM) {
    throw new Error(`mainnet send blocked; pass --send --mainnet-confirm ${REQUIRED_CONFIRM} only after Semir says DEPLOY`);
  }
  if (SEND && !METADATA_URI_ARG && !fs.existsSync(METADATA_RECEIPT)) {
    throw new Error("mainnet send blocked; upload metadata first or pass a verified --metadata-uri");
  }

  const metadata = readMetadata();
  let receipt = fs.existsSync(METADATA_RECEIPT)
    ? JSON.parse(fs.readFileSync(METADATA_RECEIPT, "utf8"))
    : null;
  if (UPLOAD_METADATA) receipt = await uploadMetadata(metadata);
  const metadataUri = METADATA_URI_ARG || receipt?.metadataUri || MOCK_METADATA_URI;

  const mint = loadKeypair(MINT_KEYPAIR);
  const deployer = loadKeypair(DEPLOYER_KEYPAIR);
  if (mint.publicKey.toBase58() !== EXPECTED_MINT) throw new Error("candidate mint keypair does not match the frozen public key");
  if (deployer.publicKey.toBase58() !== EXPECTED_DEPLOYER) throw new Error("deployer keypair does not match the funded launch wallet");

  const connection = makeConnection();
  const sdk = new PumpSdk(connection);
  const onlineSdk = new OnlinePumpSdk(connection);
  const curve = bondingCurvePda(mint.publicKey);
  const [resolvedQuote, existing, balance] = await Promise.all([
    onlineSdk.resolveQuoteMint(TSLAX_MINT),
    connection.getMultipleAccountsInfo([mint.publicKey, curve], "confirmed"),
    connection.getBalance(deployer.publicKey, "confirmed"),
  ]);
  if (!resolvedQuote.quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`TSLAx token program changed: ${resolvedQuote.quoteTokenProgram.toBase58()}`);
  }
  if (existing[0] || existing[1]) throw new Error("candidate mint or bonding curve already exists; refusing duplicate creation");

  const createIx = await sdk.createV2Instruction({
    mint: mint.publicKey,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadataUri,
    creator: deployer.publicKey,
    user: deployer.publicKey,
    mayhemMode: false,
    cashback: false,
    quoteMint: TSLAX_MINT,
    quoteTokenProgram: resolvedQuote.quoteTokenProgram,
  });
  const tx = new Transaction().add(createIx);
  tx.feePayer = deployer.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(deployer, mint);
  const simulation = await connection.simulateTransaction(tx);

  const report = {
    network: "mainnet-beta",
    sent: false,
    regularMode: true,
    holderRewards: false,
    mayhemMode: false,
    mint: mint.publicKey.toBase58(),
    bondingCurve: curve.toBase58(),
    creator: deployer.publicKey.toBase58(),
    quoteMint: TSLAX_MINT.toBase58(),
    quoteTokenProgram: resolvedQuote.quoteTokenProgram.toBase58(),
    metadataUri,
    metadataUploaded: Boolean(receipt),
    launchWalletSol: balance / 1e9,
    simulationErr: simulation.value.err,
    simulationUnits: simulation.value.unitsConsumed,
  };
  console.log(JSON.stringify(report, null, 2));
  if (simulation.value.err) {
    console.log(JSON.stringify(simulation.value.logs, null, 2));
    throw new Error("Pump create simulation failed; nothing was sent");
  }
  if (!SEND) return;

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }, "confirmed");
  if (confirmation.value.err) throw new Error(`create transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  const created = await connection.getMultipleAccountsInfo([mint.publicKey, curve], "confirmed");
  if (!created[0] || !created[1]) throw new Error("create confirmed but mint/curve readback is incomplete");
  console.log(JSON.stringify({
    sent: true,
    signature,
    mint: mint.publicKey.toBase58(),
    pumpUrl: `https://pump.fun/coin/${mint.publicKey.toBase58()}`,
  }, null, 2));
}

main().catch((error) => {
  console.error("ERROR:", error.message || error);
  if (error.logs) console.error(JSON.stringify(error.logs, null, 2));
  process.exitCode = 1;
});
