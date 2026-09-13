"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { compile, winner, winnerQuoteAta } = require("../settlement.js");
const manifest = require("../manifest.json");
const mods = "C:/Svemir/tools/solana-cli/scripts-scratch/node_modules/";
const { PublicKey, Transaction, TransactionMessage, TransactionInstruction } = require(mods + "@solana/web3.js");
const {getAssociatedTokenAddressSync} = require(mods + "@solana/spl-token");
assert.equal(getAssociatedTokenAddressSync(new PublicKey(manifest.tslaxMint),new PublicKey(winner),false,new PublicKey(manifest.tslaxTokenProgram)).toBase58(), winnerQuoteAta);
const state = { configBump:255,potBump:255,closed:true,winner,leader:winner,prizeRaw:"1000",endTs:1 };
const hash = "11111111111111111111111111111111";
for (const caller of [winner,"HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM"]) {
  for (const kind of ["close","quote-claim"]) {
    const result = compile({manifest,state:{...state,closed:kind!=="close"},caller,recentBlockhash:hash,kind});
    const decoded = Transaction.from(result.wire);
    const ix = result.instruction;
    const reference = new TransactionMessage({payerKey:new PublicKey(caller),recentBlockhash:hash,instructions:[new TransactionInstruction({programId:new PublicKey(ix.programId),keys:ix.keys.map(k=>({...k,pubkey:new PublicKey(k.pubkey)})),data:Buffer.from(ix.data)})]}).compileToLegacyMessage();
    const normalized = tx => ({ payer:tx.feePayer.toBase58(), blockhash:tx.recentBlockhash, instructions:tx.instructions.map(i=>({program:i.programId.toBase58(),data:i.data.toString("hex"),keys:i.keys.map(k=>({key:k.pubkey.toBase58(),signer:k.isSigner,writable:k.isWritable}))})) });
    assert.deepEqual(normalized(decoded),normalized(Transaction.populate(reference)),"all decoded instructions, privileges and signer must match the SDK");
    assert.equal(decoded.signatures.length,1);
    assert.equal(decoded.signatures[0].publicKey.toBase58(),caller);
    assert.equal(decoded.instructions.length,1);
    assert.equal(decoded.instructions[0].keys[3].pubkey.toBase58(),winner);
    assert.equal(decoded.signatures[0].signature,null);
    assert.ok(result.wire.length<=1232);
  }
}
const input = {manifest,state,caller:winner,recentBlockhash:hash,kind:"quote-claim"};
assert.throws(()=>compile({...input,state:{...state,prizeRaw:"0"}}),/No TSLAx/);
assert.throws(()=>compile({...input,state:{...state,winner:hash}}),/No TSLAx/);
assert.throws(()=>compile({...input,manifest:{...manifest,potQuoteAta:hash}}),/binding/);
assert.throws(()=>compile({...input,kind:"close"}),/already complete/);
assert.throws(()=>compile({...input,kind:"unknown"}),/Unknown/);
assert.throws(()=>compile({...input,caller:"abc"}),/Invalid/);

async function main() {
  let requests = 0;
  const sandbox = {window:{addEventListener(){}},TextEncoder,TextDecoder,Uint8Array,DataView,Date,URL,console,fetch:async()=>{requests++;throw new Error("Unexpected network call");}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../app.js"),"utf8"),sandbox);
  sandbox.fixtureManifest = JSON.parse(JSON.stringify(manifest));
  vm.runInContext("app.manifest = fixtureManifest; app.chainVerified = true; app.wallet = '"+winner+"'; app.chainState = { closed:true, startTs:1, endTs:Date.now()/1000+100 };",sandbox);
  assert.equal(vm.runInContext("entryIsOpen()",sandbox),false);
  for (const fn of ["quoteSolToTslax","measureNextRung","getTslaxWithSol","playAtomicWithSol","playWithTslax"]) await assert.rejects(vm.runInContext(fn+"()",sandbox),/race is closed/);
  assert.equal(requests,0,"closed race must not request a swap, builder or wallet transaction");
  vm.runInContext("app.manifest.tradingEnabled=true; app.manifest.entryPermanentlyClosed=false; app.manifest.gameBuilderUrl='https://builder.example.test'; app.chainState.closed=false;",sandbox);
  assert.equal(vm.runInContext("entryIsOpen()",sandbox),true);
  for (const change of ["app.chainState.endTs=1", "app.chainState.startTs=Date.now()/1000+1000", "app.chainVerified=false"]) {
    vm.runInContext("app.chainVerified=true; app.chainState.startTs=1; app.chainState.endTs=Date.now()/1000+100; "+change,sandbox);
    assert.equal(vm.runInContext("entryIsOpen()",sandbox),false);
  }
  vm.runInContext("hydrateOnChainState = async () => { app.chainVerified=true; app.chainState.closed=true; };",sandbox);
  await assert.rejects(vm.runInContext("refreshEntryBeforeSigning()",sandbox),/race is closed/);
  console.log("OK: SETTLED_RACE_GATES_AND_LOCAL_SETTLEMENT_PASS");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
