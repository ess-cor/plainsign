import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox","--disable-gpu"] });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8765/plainsign/monad-lab.html");
console.log("loaded");
const r = await p.evaluate(async () => { const t=Date.now(); try { const res = await fetch("https://rpc.monad.xyz", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})}); return [(await res.text()).slice(0,60), Date.now()-t]; } catch(e) { return [String(e), Date.now()-t]; } });
console.log(r);
await b.close();
