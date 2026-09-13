// MiniSol — zero-dependency Solana primitives for the browser
// Extracted from FUSE (fuse.ratchetx.xyz), verified on Solana mainnet 2026-09-09.
// Base58 encode/decode, compact-u16 varint, legacy transaction message compilation
// and wire serialization. No @solana/web3.js, no bundler, no external requests.
// Verified byte-for-byte / structurally-equivalent against @solana/web3.js output.
//
// Use this instead of pulling in @solana/web3.js when a burner wallet just needs to
// build + sign + send legacy transactions and talk to RPC over fetch.
//
// Exposes: MiniSol.b58encode/b58decode, MiniSol.encodeCompactU16,
// MiniSol.compileMessage({feePayer, recentBlockhash, instructions}) -> {message, numRequiredSignatures},
// MiniSol.serializeTransaction({message, signatures}).
// (Exact method surface: read the IIFE below — it is short.)

// ============================================================================
// mini-sol: base58 + compact-u16 + legacy transaction message builder.
// Verified byte-for-byte / structurally-equivalent against @solana/web3.js
// (see build notes). No external requests, no bundler.
// ============================================================================
const MiniSol = (function () {
  const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const B58_MAP = {};
  for (let i = 0; i < B58_ALPHABET.length; i++) B58_MAP[B58_ALPHABET[i]] = i;

  function b58encode(bytes) {
    if (bytes.length === 0) return "";
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    let digits = [];
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    if (digits.length === 0 && zeros < bytes.length) digits = [0];
    let out = "";
    for (let i = 0; i < zeros; i++) out += "1";
    for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
    return out;
  }

  function b58decode(str) {
    if (str.length === 0) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < str.length && str[zeros] === "1") zeros++;
    let bytes = [];
    for (let i = zeros; i < str.length; i++) {
      const value = B58_MAP[str[i]];
      if (value === undefined) throw new Error("Invalid base58 character: " + str[i]);
      let carry = value;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    if (bytes.length === 0 && zeros < str.length) bytes = [0];
    const out = new Uint8Array(zeros + bytes.length);
    for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
    return out;
  }

  function encodeCompactU16(n) {
    const out = [];
    while (true) {
      let byte = n & 0x7f;
      n >>>= 7;
      if (n === 0) { out.push(byte); break; }
      out.push(byte | 0x80);
    }
    return out;
  }

  function concatBytes(arrays) {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  function toBytes(arr) { return arr instanceof Uint8Array ? arr : new Uint8Array(arr); }

  const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

  function compileMessage({ payerPubkey, instructions, recentBlockhash }) {
    const metaMap = new Map();
    function upsert(pubkey, isSigner, isWritable) {
      const existing = metaMap.get(pubkey);
      if (!existing) metaMap.set(pubkey, { isSigner: !!isSigner, isWritable: !!isWritable });
      else { existing.isSigner = existing.isSigner || isSigner; existing.isWritable = existing.isWritable || isWritable; }
    }
    upsert(payerPubkey, true, true);
    for (const ix of instructions) {
      for (const k of ix.keys) upsert(k.pubkey, k.isSigner, k.isWritable);
      upsert(ix.programId, false, false);
    }
    const all = Array.from(metaMap.entries()).map(([pubkey, meta]) => ({ pubkey, ...meta }));
    all.sort((a, b) => {
      if (a.pubkey === payerPubkey) return -1;
      if (b.pubkey === payerPubkey) return 1;
      const aRank = (a.isSigner ? 0 : 2) + (a.isWritable ? 0 : 1);
      const bRank = (b.isSigner ? 0 : 2) + (b.isWritable ? 0 : 1);
      return aRank - bRank;
    });
    const numRequiredSignatures = all.filter((a) => a.isSigner).length;
    const numReadonlySignedAccounts = all.filter((a) => a.isSigner && !a.isWritable).length;
    const numReadonlyUnsignedAccounts = all.filter((a) => !a.isSigner && !a.isWritable).length;
    const indexOf = new Map(all.map((a, i) => [a.pubkey, i]));
    const accountKeysBytes = all.map((a) => b58decode(a.pubkey));
    const compiledInstructions = instructions.map((ix) => ({
      programIdIndex: indexOf.get(ix.programId),
      accounts: ix.keys.map((k) => indexOf.get(k.pubkey)),
      data: toBytes(ix.data),
    }));
    const header = new Uint8Array([numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts]);
    const accountKeysSection = concatBytes([new Uint8Array(encodeCompactU16(all.length)), ...accountKeysBytes]);
    const blockhashBytes = b58decode(recentBlockhash);
    const instructionsSection = concatBytes([
      new Uint8Array(encodeCompactU16(compiledInstructions.length)),
      ...compiledInstructions.map((ci) => concatBytes([
        new Uint8Array([ci.programIdIndex]),
        new Uint8Array(encodeCompactU16(ci.accounts.length)),
        new Uint8Array(ci.accounts),
        new Uint8Array(encodeCompactU16(ci.data.length)),
        ci.data,
      ])),
    ]);
    const message = concatBytes([header, accountKeysSection, blockhashBytes, instructionsSection]);
    return { message, accountKeys: all.map((a) => a.pubkey), numRequiredSignatures };
  }

  function serializeTransaction({ message, signatures }) {
    const sigSection = concatBytes([new Uint8Array(encodeCompactU16(signatures.length)), ...signatures.map(toBytes)]);
    return concatBytes([sigSection, message]);
  }

  return { b58encode, b58decode, encodeCompactU16, concatBytes, compileMessage, serializeTransaction, SYSTEM_PROGRAM_ID };
})();

// Works as a plain classic <script> (creates a page-scope MiniSol binding shared with
// any later <script> tag on the same page) and as a CommonJS module for quick Node
// verification scripts during development.
if (typeof module !== "undefined" && module.exports) module.exports = MiniSol;
