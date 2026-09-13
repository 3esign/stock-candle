"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { once } = require("events");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const siteUrl = process.argv[2] || "http://127.0.0.1:8791/";
const port = 9334;
const testRoot = path.resolve(__dirname);
const profile = path.resolve(testRoot, ".chrome-profile");

if (!profile.startsWith(testRoot + path.sep)) throw new Error("Unsafe Chrome profile path.");
if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.socket = new WebSocket(url);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      const waiters = this.events.get(message.method) || [];
      this.events.delete(message.method);
      waiters.forEach((resolve) => resolve(message.params || {}));
    };
  }

  ready() {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error("CDP WebSocket failed."));
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  wait(method) {
    return new Promise((resolve) => {
      const waiters = this.events.get(method) || [];
      waiters.push(resolve);
      this.events.set(method, waiters);
    });
  }

  close() {
    this.socket.close();
  }
}

async function pollJson(url, attempts = 80) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("Chrome debugging endpoint did not start.");
}

async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
  return result.result.value;
}

async function removeProfile() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
      if (!fs.existsSync(profile)) return;
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Chrome QA profile remained locked: " + profile);
}

async function loadViewport(cdp, name, width, height, mobile) {
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  const loaded = cdp.wait("Page.loadEventFired");
  await cdp.call("Page.navigate", { url: siteUrl + "?qa=" + name });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 800));

  const metrics = await evaluate(cdp, `(() => {
    const visible = [...document.body.querySelectorAll("*")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.classList.contains("skip") && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const overflow = visible.map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, id: element.id, cls: element.className, left: rect.left, right: rect.right, width: rect.width };
    }).filter((item) => item.left < -1 || item.right > innerWidth + 1);
    const canvas = document.getElementById("ladderCanvas");
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] > 0 && (pixels[index] < 220 || pixels[index + 1] < 220 || pixels[index + 2] < 220)) colored += 1;
    }
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: overflow.slice(0, 12),
      h1: document.getElementById("pageTitle").innerText.replace(/\\s+/g, " ").trim(),
      lead: document.querySelector(".lead").textContent.trim(),
      launch: document.getElementById("launchPill").textContent.trim(),
      tradeDisabled: document.getElementById("tradeButton").disabled,
      stateStatus: document.getElementById("stateStatus").textContent.trim(),
      canvasColoredSamples: colored
    };
  })()`);
  const shot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(path.join(testRoot, name + ".png"), Buffer.from(shot.data, "base64"));
  return metrics;
}

async function main() {
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profile,
    "about:blank",
  ], { windowsHide: true, stdio: "ignore" });

  let cdp;
  try {
    const targets = await pollJson("http://127.0.0.1:" + port + "/json/list");
    const page = targets.find((target) => target.type === "page");
    assert.ok(page && page.webSocketDebuggerUrl, "Chrome page target must exist");
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");

    const desktop = await loadViewport(cdp, "desktop-1440", 1440, 1000, false);
    const mobile = await loadViewport(cdp, "mobile-390", 390, 844, true);
    await evaluate(cdp, `(() => {
      const check = document.getElementById("eligibilityCheck");
      check.checked = true;
      check.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("quoteButton").click();
      return true;
    })()`);
    let uiQuote;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      uiQuote = await evaluate(cdp, `(() => ({
        value: document.getElementById("quoteValue").textContent,
        detail: document.getElementById("quoteDetail").textContent,
        status: document.getElementById("tradeStatus").textContent
      }))()`);
      if (/at least .* TSLAx/.test(uiQuote.value)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await evaluate(cdp, `(() => {
      scrollTo(0, document.getElementById("play").offsetTop);
      return scrollY;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const entryShot = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(path.join(testRoot, "mobile-entry-390.png"), Buffer.from(entryShot.data, "base64"));
    const cors = await evaluate(cdp, `(async () => {
      const quoteUrl = new URL("https://lite-api.jup.ag/swap/v1/quote");
      quoteUrl.searchParams.set("inputMint", "${SOL_MINT}");
      quoteUrl.searchParams.set("outputMint", "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
      quoteUrl.searchParams.set("amount", "10000000");
      quoteUrl.searchParams.set("swapMode", "ExactIn");
      quoteUrl.searchParams.set("slippageBps", "100");
      const quoteResponse = await fetch(quoteUrl);
      const quote = await quoteResponse.json();
      let swapStatus = 0;
      let swapReachable = false;
      try {
        const swapResponse = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        swapStatus = swapResponse.status;
        swapReachable = true;
      } catch (_error) {}
      return { quoteOk: quoteResponse.ok, quoteOut: quote.outAmount || "", swapReachable, swapStatus };
    })()`);
    const rpcProbe = await evaluate(cdp, `(async () => {
      const urls = [
        "https://api.mainnet-beta.solana.com",
        "https://solana-rpc.publicnode.com",
        "https://rpc.ankr.com/solana",
        "https://solana.api.onfinality.io/public"
      ];
      return Promise.all(urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [{ commitment: "confirmed" }] })
          });
          const body = await response.json();
          return { url, status: response.status, slot: body.result || 0, error: body.error?.message || "" };
        } catch (error) {
          return { url, status: 0, slot: 0, error: String(error?.message || error) };
        }
      }));
    })()`);

    console.log(JSON.stringify({ desktop, mobile, uiQuote, cors, rpcProbe }, null, 2));
    for (const metrics of [desktop, mobile]) {
      assert.strictEqual(metrics.scrollWidth, metrics.innerWidth, JSON.stringify(metrics.overflow));
      assert.deepStrictEqual(metrics.overflow, []);
      assert.strictEqual(metrics.h1, "STOCK CANDLE");
      assert.match(metrics.lead, /SOL or TSLAx.*\$XCNDL.*1,000,000-token.*SOL pot.*TSLAx fee prize/);
      assert.strictEqual(metrics.launch, "LIVE");
      assert.strictEqual(metrics.tradeDisabled, true);
      assert.ok(metrics.canvasColoredSamples > 500, "Canvas must contain visible chart pixels");
    }
    assert.strictEqual(cors.quoteOk, true);
    assert.ok(BigInt(cors.quoteOut) > 0n, "Browser quote must return TSLAx");
    assert.strictEqual(cors.swapReachable, true, "Browser must reach Jupiter swap POST through CORS");
    assert.match(uiQuote.value, /SOL -> at least .* TSLAx/);
    assert.match(uiQuote.status, /Fresh route found/);

    console.log("OK: STOCK_CANDLE_BROWSER_QA_PASS");
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    if (chrome.exitCode === null) {
      await Promise.race([once(chrome, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    await removeProfile();
  }
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
