// Records the Monad technical demo and the pitch video. Run from the plainsign dir:
//   node ../media/record-monad.mjs   (after ../tools/setup-media.sh, on the same machine)
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const media = path.resolve(root, "../media");
const build = path.join(media, "build");
const ext = path.join(media, "ext-rec");
const narration = JSON.parse(readFileSync(path.join(media, "monad-narration.json"), "utf8"));
mkdirSync(build, { recursive: true });
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1e8, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ").slice(0, 200)} failed: ${(r.stderr || "").slice(-2000)}`);
  return (r.stdout || "").trim();
};
const probe = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const tts = (text, file) => { try { if (readFileSync(file).length > 1000) return; } catch {} return run("python3", ["-m", "piper", "-m", path.join(media, "voices/en_US-ryan-high.onnx"), "-f", file, "--length-scale", "0.95", "--sentence-silence", "0.25"], { input: text }); };
const stamp = (v) => { const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = v % 60; return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`; };
function ass(segments, label, total) {
  let out = `[Script Info]\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,DejaVu Sans,34,&H00FFFFFF,&H00FFFFFF,&H0009101C,&H9009101C,0,0,0,0,100,100,0,0,3,7,0,2,90,90,28,1\nStyle: Label,DejaVu Sans,24,&H00FFB8C9,&H00FFFFFF,&H0009101C,&H9009101C,0,0,0,0,100,100,0,0,3,5,0,7,24,24,16,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 1,0:00:00.00,${stamp(total)},Label,,0,0,0,,${label}\n`;
  for (const seg of segments) {
    const sentences = seg.text.match(/[^.!?:]+[.!?:]+|[^.!?:]+$/g).map((s) => s.trim());
    const words = seg.text.split(/\s+/).length;
    let t = 0;
    for (const s of sentences) {
      const d = (seg.speech * s.split(/\s+/).length) / words;
      out += `Dialogue: 0,${stamp(seg.start + t)},${stamp(seg.start + t + d)},Caption,,0,0,0,,${s}\n`;
      t += d;
    }
  }
  return out;
}

// 1. Narration audio
narration.demo.forEach((s, i) => tts(s.text, path.join(build, `demo-${i}.wav`)));
narration.pitch.forEach((s, i) => tts(s.text, path.join(build, `pitch-${i}.wav`)));

// 2. Local relay to Monad mainnet RPC (Chromium in this sandbox cannot reach the internet directly;
//    the relay forwards each JSON-RPC call unchanged to https://rpc.monad.xyz and returns the real response).
const relay = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  let body = ""; for await (const c of req) body += c;
  try {
    const r = await fetch("https://rpc.monad.xyz", { method: "POST", headers: { "content-type": "application/json" }, body });
    res.setHeader("content-type", "application/json"); res.end(await r.text());
  } catch (e) { res.statusCode = 502; res.end(String(e)); }
});
await new Promise((r) => relay.listen(8766, "127.0.0.1", r));

// 3. Extension build pointing Monad RPC at the relay
if (!process.env.SKIP_EXT) run("npm", ["run", "build"], { cwd: root, env: { ...process.env, VITE_MONAD_RPC: "http://127.0.0.1:8766/", VITE_E2E: "1", VITE_E2E_MOCK_ENRICH: "0", VITE_E2E_MOCK_LLM: "0", VITE_LLM_KEY: " ", VITE_ALCHEMY_KEY: " " } });
if (!process.env.SKIP_EXT) { rmSync(ext, { recursive: true, force: true }); run("cp", ["-r", path.join(root, ".output/chrome-mv3"), ext]); }

// 4. Demo recording
const vidDir = path.join(build, "vid"); rmSync(vidDir, { recursive: true, force: true }); mkdirSync(vidDir);
const ctx = await chromium.launchPersistentContext(mkdtempSync("/tmp/prof-"), {
  executablePath: "/usr/bin/chromium", headless: true, viewport: { width: 1600, height: 900 },
  recordVideo: { dir: vidDir, size: { width: 1600, height: 900 } },
  args: ["--no-sandbox", "--disable-gpu", "--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
await ctx.addInitScript({ path: path.join(root, "tests/e2e/mock-wallet.js") });
const page = await ctx.newPage();
const video = page.video();
const shadow = (sel) => page.evaluate((s) => document.getElementById("plainsign-root")?.shadowRoot?.querySelector(s)?.click(), sel);
const verdict = () => page.waitForFunction(() => /Safe|Caution|Danger/.test(document.getElementById("plainsign-root")?.shadowRoot?.querySelector(".ps-card h1")?.textContent ?? ""), null, { timeout: 15000 });
const verdictText = () => page.evaluate(() => document.getElementById("plainsign-root")?.shadowRoot?.querySelector(".ps-card")?.innerText ?? "");
const clickTab = (name) => page.evaluate((n) => [...(document.getElementById("plainsign-root")?.shadowRoot?.querySelectorAll(".ps-toggle button") ?? [])].find((b) => b.textContent.trim() === n)?.click(), name);
const segments = [];
const transcript = [];
const started = Date.now();
await page.goto("http://127.0.0.1:8765/plainsign/monad-lab.html?walletChainId=0x8f");
await page.waitForFunction(() => Boolean(window.__plainsign?.wrapped));
for (let i = 0; i < narration.demo.length; i++) {
  const seg = narration.demo[i];
  const req = async (name) => { await page.click(`[data-req="${name}"]`); await verdict(); };
  switch (seg.scene) {
    case "connect": await page.click("#connect"); break;
    case "wrap": await req("wrap"); break;
    case "wrap-continue": await shadow(".ps-continue"); break;
    case "approve": await req("approve"); break;
    case "reject": await shadow(".ps-reject"); break;
    case "permit2": await req("permit2"); break;
    case "wrongchain": await shadow(".ps-reject"); await req("wrongchain"); break;
    case "technical": await clickTab("Technical"); break;
    case "login": await shadow(".ps-reject"); await req("login"); break;
    case "hash": await shadow(".ps-reject"); await req("hash"); break;
    case "review": await shadow(".ps-reject"); await page.goto("http://127.0.0.1:8765/plainsign/review.html"); await page.getByRole("button", { name: /Imitation WMON/ }).click(); break;
    case "evidence": await page.goto("http://127.0.0.1:8765/plainsign/monad-mainnet-check.json"); break;
  }
  await page.waitForTimeout(400);
  const speech = probe(path.join(build, `demo-${i}.wav`));
  segments.push({ ...seg, start: (Date.now() - started) / 1000, speech });
  transcript.push({ scene: seg.scene, verdict: (await verdictText()).slice(0, 300) });
  await page.screenshot({ path: path.join(media, `scene-${seg.scene}.png`) });
  if (seg.scene === "technical") { await page.waitForTimeout(speech * 500); await page.evaluate(() => { const r = document.getElementById("plainsign-root")?.shadowRoot; r?.querySelector(".ps-body")?.scrollBy?.(0, 400); r?.querySelector(".ps-card")?.scrollBy?.(0, 400); }); await page.waitForTimeout(speech * 500 + 800); }
  else await page.waitForTimeout(speech * 1000 + 800);
}
await page.waitForTimeout(800);
const total = (Date.now() - started) / 1000;
await ctx.close();
relay.close();
writeFileSync(path.join(build, "demo-transcript.json"), JSON.stringify(transcript, null, 2));
const raw = await video.path();
// trim the page-load lead-in so audio aligns: segments are relative to `started`; video began slightly earlier
const lead = Math.max(0, probe(raw) - total);
writeFileSync(path.join(build, "demo.ass"), ass(segments, "PlainSign 0.3.0 · real extension · Monad mainnet RPC (chain 143) · automated test wallet · synthetic narration", total));
const ins = segments.flatMap((_, i) => ["-i", path.join(build, `demo-${i}.wav`)]);
const mix = segments.map((s, i) => `[${i}:a]adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`).join(";") + ";" + segments.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${segments.length}:normalize=0,apad[a]`;
run("ffmpeg", ["-y", "-loglevel", "error", ...ins, "-filter_complex", mix, "-map", "[a]", "-t", String(total), path.join(build, "demo-audio.wav")]);
run("ffmpeg", ["-y", "-loglevel", "error", "-ss", lead.toFixed(2), "-i", raw, "-i", path.join(build, "demo-audio.wav"), "-vf", `scale=1920:1080,ass=${path.join(build, "demo.ass")}`, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", path.join(media, "monad-demo.mp4")]);

// 5. Pitch: slides + narration
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-gpu"] });
const sp = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const pitchSegs = []; let t = 0; const parts = [];
for (let i = 0; i < narration.pitch.length; i++) {
  await sp.goto(`file://${path.join(media, "slides.html")}?n=${narration.pitch[i].slide}`); await sp.waitForTimeout(300);
  const img = path.join(build, `slide-${i}.png`); await sp.screenshot({ path: img });
  const wav = path.join(build, `pitch-${i}.wav`); const speech = probe(wav); const dur = speech + 0.7;
  pitchSegs.push({ ...narration.pitch[i], start: t, speech }); t += dur;
  const part = path.join(build, `pitch-${i}.mp4`); parts.push(part);
  run("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "24", "-i", img, "-i", wav, "-filter_complex", "[1:a]apad=pad_dur=0.7[a]", "-map", "0:v", "-map", "[a]", "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", part]);
}
await browser.close();
writeFileSync(path.join(build, "pitch-concat.txt"), parts.map((p) => `file '${p}'`).join("\n"));
run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(build, "pitch-concat.txt"), "-c", "copy", path.join(build, "pitch-joined.mp4")]);
writeFileSync(path.join(build, "pitch.ass"), ass(pitchSegs, "PlainSign · Mohamed Adib, solo · synthetic narration", t));
run("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(build, "pitch-joined.mp4"), "-vf", `ass=${path.join(build, "pitch.ass")}`, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", path.join(media, "monad-pitch.mp4")]);
console.log(JSON.stringify({ demo: probe(path.join(media, "monad-demo.mp4")), pitch: probe(path.join(media, "monad-pitch.mp4")), lead }));
