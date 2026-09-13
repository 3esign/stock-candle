"use strict";

// The race is immutable and settled. These public addresses were derived from
// its finalized winner; the program independently enforces the destination ATA.
const CandleSettlement = (() => {
  const sol = typeof module !== "undefined" && module.exports ? require("./minisol.js") : MiniSol;
  const winner = "ExBhtaQXzQvTYreqjy2E9ZdvoxJWrBEnwooD2ceGTFgE";
  const winnerQuoteAta = "7BhJfpPcePEbo8NXCjXpmHkdyKFwW23B7nU5xD6K84QU";
  const associated = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  function compile({ manifest: m, state, caller, recentBlockhash, kind, now = Math.floor(Date.now() / 1000) }) {
    if (m.programId !== "4NAF1Q253cmH4mviU5eMF3A23qUGxzuwXhkHAoGvAAHB"
        || m.config !== "5LN2kPUJqgAbqbDALpi1EUq2CHx84UqPszBmbtc3Brp2"
        || m.pot !== "6BztA9ESeDTWN5PsQmMXa3wUTT8wpvWswW6VcAYUTVLN"
        || m.potQuoteAta !== "EG9AbYCgksSd7Z5TViBgwY8QYE9kH2xQnU3ThcjqguPN"
        || m.tslaxMint !== "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB"
        || m.tslaxTokenProgram !== "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        || state.configBump !== 255 || state.potBump !== 255) throw new Error("Settlement address binding mismatch.");
    const key = (pubkey, isWritable, isSigner = false) => ({ pubkey, isWritable, isSigner });
    let keys;
    if (kind === "close") {
      if (state.closed || now <= state.endTs || state.leader !== winner) throw new Error("SOL settlement is not ready or is already complete.");
      keys = [key(caller,true,true), key(m.config,true), key(m.pot,true), key(winner,true), key(sol.SYSTEM_PROGRAM_ID,false)];
    } else if (kind === "quote-claim") {
      if (!state.closed || state.winner !== winner || BigInt(state.prizeRaw || "0") <= 0n) throw new Error("No TSLAx prize is available to release.");
      keys = [key(caller,true,true), key(m.config,false), key(m.pot,false), key(winner,false), key(m.potQuoteAta,true), key(winnerQuoteAta,true), key(m.tslaxMint,false), key(m.tslaxTokenProgram,false), key(sol.SYSTEM_PROGRAM_ID,false), key(associated,false)];
    } else throw new Error("Unknown settlement action.");
    for (const address of [caller, recentBlockhash, m.programId, ...keys.map(k => k.pubkey)]) {
      if (typeof address !== "string" || sol.b58decode(address).length !== 32) throw new Error("Invalid settlement address or blockhash.");
    }
    const instruction = { programId: m.programId, keys, data: new Uint8Array([kind === "close" ? 2 : 3, state.configBump, state.potBump]) };
    const compiled = sol.compileMessage({ payerPubkey: caller, recentBlockhash, instructions: [instruction] });
    if (compiled.numRequiredSignatures !== 1) throw new Error("Unexpected settlement signer.");
    const wire = sol.serializeTransaction({ message: compiled.message, signatures: [new Uint8Array(64)] });
    if (wire.length > 1232) throw new Error("Settlement packet is too large.");
    return { wire, instruction, winner, winnerQuoteAta };
  }
  return { compile, winner, winnerQuoteAta };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CandleSettlement;
