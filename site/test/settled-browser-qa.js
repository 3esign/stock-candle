"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { headers } = require("C:/Svemir/lib/incognito.js");
const siteUrl = process.argv[2] || "http://127.0.0.1:8791/";
const output = path.resolve(__dirname);
const profile = path.join(output, ".settled-profile-" + Date.now());
fs.mkdirSync(profile);
class Cdp {
  constructor(url) {
    this.n = 0; this.pending = new Map(); this.requests = [];
    this.ws = new WebSocket(url);
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.method === "Network.requestWillBeSent") this.requests.push(m.params.request.url);
      if (!m.id) return;
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id); clearTimeout(p.timer);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    };
  }
  call(method, params = {}) {
    const id = ++this.n;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(()=>{this.pending.delete(id);reject(new Error("CDP timeout: "+method));},20000);
      this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const r = await this.call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}
async function main() {
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--disable-background-networking","--disable-breakpad","--no-first-run","--no-default-browser-check","--remote-debugging-port=9334","--user-data-dir="+profile,"about:blank"],{windowsHide:true,stdio:"ignore",env:{...process.env,TEMP:profile,TMP:profile}});
  let cdp;
  try {
    let targets;
    for (let i=0;i<100;i++) {
      try { targets=await (await fetch("http://127.0.0.1:9334/json/list")).json(); break; } catch { await new Promise(r=>setTimeout(r,100)); }
    }
    assert.ok(targets);
    cdp = new Cdp(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{cdp.ws.onopen=resolve;cdp.ws.onerror=reject;});
    await cdp.call("Page.enable"); await cdp.call("Runtime.enable"); await cdp.call("Network.enable");
    const mask = headers(siteUrl,{vrsta:"html"});
    await cdp.call("Network.setUserAgentOverride",{userAgent:mask["User-Agent"],acceptLanguage:mask["Accept-Language"]});
    const report = {at:new Date().toISOString(),siteUrl,viewports:[]};
    for (const [name,width,height,mobile] of [["desktop",1440,1000,false],["mobile",390,844,true]]) {
      await cdp.call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
      await cdp.call("Page.navigate",{url:siteUrl+"?qa=settled-"+Date.now()});
      let state;
      for (let i=0;i<100;i++) {
        state=await cdp.evaluate("typeof app !== 'undefined' && app.chainVerified ? {closed:app.chainState.closed,prize:app.chainState.prizeRaw,winner:app.chainState.winner}:null");
        if (state) break;
        await new Promise(r=>setTimeout(r,150));
      }
      assert.ok(state,"on-chain state must hydrate in the real browser"); assert.equal(state.closed,true);
      const metrics = await cdp.evaluate(`(() => {
        const canvas = document.getElementById('ladderCanvas');
        const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let colored=0;for(let i=0;i<data.length;i+=16)if(data[i+3]>0&&(data[i]<220||data[i+1]<220||data[i+2]<220))colored++;
        const overflow=[...document.querySelectorAll('body *')].filter(e=>!e.classList.contains('skip')&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none').map(e=>({id:e.id,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.left < -1||e.right>innerWidth+1);
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow,launch:ui.launchPill.textContent,tradeDisabled:ui.tradeButton.disabled,quoteDisabled:ui.quoteButton.disabled,claimDisabled:ui.claimButton.disabled,colored};
      })()`);
      assert.ok(metrics.scrollWidth<=width,"no horizontal scroll, allowing the native scrollbar gutter");assert.deepEqual(metrics.overflow,[]);assert.equal(metrics.launch,"RACE CLOSED");assert.equal(metrics.tradeDisabled,true);assert.equal(metrics.quoteDisabled,true);assert.ok(metrics.colored>500);
      const blocked = await cdp.evaluate(`(async()=>{
        app.wallet=CandleSettlement.winner;ui.eligibilityCheck.checked=true;renderEntry();
        const results=[];for(const f of [quoteSolToTslax,measureNextRung,getTslaxWithSol,playAtomicWithSol,playWithTslax]){try{await f();results.push('UNEXPECTED SUCCESS');}catch(e){results.push(e.message);}}
        return {results,tradeDisabled:ui.tradeButton.disabled,quoteDisabled:ui.quoteButton.disabled,claimDisabled:ui.claimButton.disabled};
      })()`);
      assert.ok(blocked.results.every(s=>s.includes("race is closed")));assert.equal(blocked.tradeDisabled,true);assert.equal(blocked.quoteDisabled,true);if(state.prize==="0")assert.equal(blocked.claimDisabled,true);
      const shot=await cdp.call("Page.captureScreenshot",{format:"png",fromSurface:true});
      fs.writeFileSync(path.join(output,"settled-"+name+".png"),Buffer.from(shot.data,"base64"));
      report.viewports.push({name,state,metrics,blocked});
    }
    report.retiredBuilderRequests=cdp.requests.filter(u=>u.includes("trycloudflare.com"));
    assert.deepEqual(report.retiredBuilderRequests,[]);
    report.browserSettlement = await cdp.evaluate(`(async()=>{
      let mockRequests=0;let requestMethod='';
      app.provider={request:async r=>{mockRequests++;requestMethod=r.method;throw new Error('QA_STOP_BEFORE_REAL_WALLET');}};
      await hydrateOnChainState();
      const prizeRaw=app.chainState.prizeRaw;
      if(BigInt(prizeRaw)>0n)await runSettlement('quote-claim');
      return {prizeRaw,mockRequests,requestMethod,status:ui.stateStatus.textContent};
    })()`);
    if(BigInt(report.browserSettlement.prizeRaw)>0n){assert.equal(report.browserSettlement.mockRequests,1,JSON.stringify(report.browserSettlement));assert.equal(report.browserSettlement.requestMethod,'signAndSendTransaction');assert.match(report.browserSettlement.status,/QA_STOP_BEFORE_REAL_WALLET/);}
    report.sent=false;report.walletSignatureRequested=false;
    fs.writeFileSync(path.join(output,"settled-browser-report.json"),JSON.stringify(report,null,2)+"\n");
    console.log(JSON.stringify(report,null,2));
    console.log("OK: SETTLED_BROWSER_QA_PASS");
  } finally {
    if(cdp)cdp.ws.close();chrome.kill();
    if(chrome.exitCode===null)await Promise.race([once(chrome,"exit"),new Promise(r=>setTimeout(r,2000))]);
    if(!profile.startsWith(output+path.sep))throw new Error("Unsafe profile cleanup");
    for(let i=0;i<20;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await new Promise(r=>setTimeout(r,150));}}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
