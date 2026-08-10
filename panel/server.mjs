// NadirGold QA Panel — lokal sunucu (bağımlılıksız, sadece Node built-in)
// Jira proxy + verdict/kanıt sunumu + test tetikleme + SSE canlı akış
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "panel-data");
const VERDICTS = path.join(DATA, "verdicts");
const EVIDENCE = path.join(DATA, "evidence");
const PORT = Number(process.env.PANEL_PORT || 4646);

for (const d of [DATA, VERDICTS, EVIDENCE]) fs.mkdirSync(d, { recursive: true });

// ---- Jira credentials ----
const credFile = path.join(os.homedir(), ".jira-credentials");
const creds = Object.fromEntries(
  fs.readFileSync(credFile, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const JIRA = creds.JIRA_HOST;
const AUTH = "Basic " + Buffer.from(`${creds.JIRA_EMAIL}:${creds.JIRA_TOKEN}`).toString("base64");

async function jira(pathAndQuery) {
  const res = await fetch(JIRA + pathAndQuery, { headers: { Authorization: AUTH, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

// ---- ADF → düz metin ----
function adfText(node) {
  if (!node) return "";
  let out = "";
  if (node.type === "text") out += node.text || "";
  if (node.type === "hardBreak") out += "\n";
  for (const c of node.content || []) out += adfText(c);
  if (["paragraph", "heading", "listItem", "codeBlock", "blockquote"].includes(node.type)) out += "\n";
  return out;
}

// ---- Görünümler (JQL) ----
const VIEWS = {
  test: "project = NSB AND status = Test ORDER BY updated DESC",
  v2: 'project = NSB AND component = "New-Backend" AND statusCategory != Done ORDER BY updated DESC',
  all: "project = NSB AND statusCategory != Done ORDER BY updated DESC",
};
const cache = new Map(); // view -> {at, data}
const CACHE_MS = 60_000;

async function getCards(view) {
  const hit = cache.get(view);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const jql = VIEWS[view] || VIEWS.test;
  const q = new URLSearchParams({ jql, fields: "summary,status,assignee,components,updated,priority,issuetype,issuelinks", maxResults: "100" });
  const d = await jira(`/rest/api/3/search/jql?${q}`);
  const data = {
    fetchedAt: new Date().toISOString(),
    issues: (d.issues || []).map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      assignee: i.fields.assignee?.displayName || "—",
      components: (i.fields.components || []).map((c) => c.name),
      updated: i.fields.updated,
      priority: i.fields.priority?.name || "-",
      type: i.fields.issuetype?.name,
      links: (i.fields.issuelinks || []).map((l) => {
        const o = l.inwardIssue || l.outwardIssue;
        return o ? { key: o.key, status: o.fields?.status?.name, cat: o.fields?.status?.statusCategory?.key, rel: l.type?.name } : null;
      }).filter(Boolean),
    })),
  };
  cache.set(view, { at: Date.now(), data });
  return data;
}

async function getCardDetail(key) {
  const d = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,components,updated,priority,issuetype,description,comment,issuelinks`);
  const f = d.fields;
  return {
    key: d.key,
    summary: f.summary,
    status: f.status?.name,
    assignee: f.assignee?.displayName || "—",
    components: (f.components || []).map((c) => c.name),
    updated: f.updated,
    priority: f.priority?.name || "-",
    type: f.issuetype?.name,
    description: f.description ? adfText(f.description).trim() : "",
    links: (f.issuelinks || []).map((l) => {
      const other = l.inwardIssue || l.outwardIssue;
      return other ? { key: other.key, summary: other.fields?.summary, status: other.fields?.status?.name, cat: other.fields?.status?.statusCategory?.key, rel: l.type?.name } : null;
    }).filter(Boolean),
    comments: (f.comment?.comments || []).map((c) => ({ id: c.id, author: c.author?.displayName, created: c.created, text: adfText(c.body).trim() })),
    verdict: readVerdict(key),
  };
}

// ---- Verdicts ----
function readVerdict(key) {
  const p = path.join(VERDICTS, `${key}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function allVerdicts() {
  const out = {};
  for (const f of fs.readdirSync(VERDICTS).filter((f) => f.endsWith(".json"))) {
    try { const v = JSON.parse(fs.readFileSync(path.join(VERDICTS, f), "utf8")); out[v.card] = v; } catch {}
  }
  return out;
}

// ---- Retest tetikleyicisi: bağlı blocker kapanınca haber ver ----
const BLOCKER_STATE = path.join(DATA, "blocker-state.json");
const RETEST_ALERTS = path.join(DATA, "retest-alerts.json");
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

function notifyMac(title, msg) {
  if (process.platform !== "darwin") return;
  spawn("osascript", ["-e", `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)} sound name "Glass"`]).on("error", () => {});
}

const KNOWN_CARDS = path.join(DATA, "known-cards.json");
const NEWCARD_ALERTS = path.join(DATA, "newcard-alerts.json");

async function checkBlockers() {
  try {
    const [a, b] = await Promise.all([getCards("v2"), getCards("test")]);
    const cards = new Map();
    for (const i of [...a.issues, ...b.issues]) cards.set(i.key, i);

    // yeni kart tespiti (ilk taramada sadece baseline alınır, alarm üretilmez)
    const known = readJson(KNOWN_CARDS, null);
    if (known) {
      const ncAlerts = readJson(NEWCARD_ALERTS, []);
      let ncChanged = false;
      for (const [key, c] of cards) {
        if (!known.includes(key) && !ncAlerts.some((x) => x.card === key)) {
          ncAlerts.push({ card: key, summary: c.summary, assignee: c.assignee, status: c.status, at: new Date().toISOString(), seen: false });
          ncChanged = true;
          broadcast("newcard", { card: key, summary: c.summary, status: c.status });
          notifyMac("QA Panel — Yeni kart", `${key} (${c.status}): ${c.summary.slice(0, 80)}`);
          console.log(`YENİ kart: ${key} (${c.status}) — ${c.summary.slice(0, 60)}`);
        }
      }
      if (ncChanged) fs.writeFileSync(NEWCARD_ALERTS, JSON.stringify(ncAlerts, null, 1));
    }
    fs.writeFileSync(KNOWN_CARDS, JSON.stringify([...cards.keys()], null, 1));
    const prev = readJson(BLOCKER_STATE, {});
    const now = {};
    const alerts = readJson(RETEST_ALERTS, []);
    let changed = false;
    for (const card of cards.values()) {
      for (const l of card.links || []) {
        now[l.key] = { status: l.status, cat: l.cat };
        const p = prev[l.key];
        const closedNow = l.cat === "done" || ["Ready For Stage", "Ready for Prod"].includes(l.status);
        if (p && p.cat === "new" && closedNow) {
          const id = `${card.key}:${l.key}:${l.status}`;
          if (!alerts.some((x) => x.id === id)) {
            alerts.push({ id, card: card.key, cardSummary: card.summary, blocker: l.key, from: p.status, to: l.status, at: new Date().toISOString(), seen: false });
            changed = true;
            broadcast("retest", { card: card.key, blocker: l.key, to: l.status });
            notifyMac("QA Panel — Retest'e hazır", `${card.key}: blocker ${l.key} → ${l.status}`);
            console.log(`RETEST alarmı: ${card.key} (blocker ${l.key}: ${p.status} → ${l.status})`);
          }
        }
      }
    }
    fs.writeFileSync(BLOCKER_STATE, JSON.stringify(now, null, 1));
    if (changed) fs.writeFileSync(RETEST_ALERTS, JSON.stringify(alerts, null, 1));
  } catch (e) { console.log("blocker kontrolü hatası:", e.message); }
}
setInterval(checkBlockers, 90_000);
setTimeout(checkBlockers, 5_000);

// ---- Jira'ya yorum gönderme (SADECE panel'deki "Jira'ya Gönder" butonuyla tetiklenir) ----
function textToAdf(text) {
  const content = [];
  let bullets = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { bullets = null; continue; }
    const m = line.match(/^\s*[•\-]\s+(.*)$/);
    if (m) {
      if (!bullets) { bullets = { type: "bulletList", content: [] }; content.push(bullets); }
      bullets.content.push({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: m[1] }] }] });
    } else {
      bullets = null;
      content.push({ type: "paragraph", content: [{ type: "text", text: line }] });
    }
  }
  return { type: "doc", version: 1, content: content.length ? content : [{ type: "paragraph", content: [{ type: "text", text: text }] }] };
}

async function jiraPostComment(card, text, attach) {
  const attached = [];
  for (const name of attach || []) {
    const p = path.join(EVIDENCE, path.basename(name));
    if (!fs.existsSync(p)) continue;
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(p)], { type: "image/png" }), path.basename(name));
    const r = await fetch(`${JIRA}/rest/api/3/issue/${card}/attachments`, {
      method: "POST",
      headers: { Authorization: AUTH, "X-Atlassian-Token": "no-check" },
      body: form,
    });
    if (r.ok) attached.push(name);
  }
  const r = await fetch(`${JIRA}/rest/api/3/issue/${card}/comment`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ body: textToAdf(text) }),
  });
  if (!r.ok) throw new Error(`Jira yorum hatası ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return { commentId: d.id, attached };
}

// ---- API V1↔V2 diff: iki uçtan ham yanıt toplar (diff istemcide hesaplanır) ----
async function fetchApi(base, pathAndQuery, method, body, extraCookie) {
  const headers = { accept: "application/json", "device-type": "web" };
  if (extraCookie) headers.cookie = extraCookie;
  if (customerBearer) headers.authorization = `Bearer ${customerBearer}`;
  if (body) headers["content-type"] = "application/json";
  const started = Date.now();
  try {
    const r = await fetch(base + pathAndQuery, { method, headers, body: body || undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, ms: Date.now() - started, json, raw: json ? undefined : text.slice(0, 500) };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, error: String(e.message || e) };
  }
}

async function apiDiff({ v1Path, v2Path, method = "GET", body = "" }) {
  if (!authCookieHeader) await refreshAuth();
  const [v1, v2] = await Promise.all([
    fetchApi("https://api.nadirgold.dev", v1Path, method, body),
    fetchApi("https://www.nadirgold.dev/api/v2", v2Path, method, body, authCookieHeader + "; NG_API_V2=1"),
  ]);
  return { v1: { ...v1, url: "api.nadirgold.dev" + v1Path }, v2: { ...v2, url: "www.nadirgold.dev/api/v2" + v2Path } };
}

// ---- Koşumlar (whitelist) ----
const runsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "runs.json"), "utf8"));
let activeRun = null; // {id, proc, def}
let runCounter = 0;

// ---- SSE ----
const sseClients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}
fs.watch(VERDICTS, () => broadcast("verdicts", { at: Date.now() }));

function startRun(runId) {
  const def = runsConfig.runs[runId];
  if (!def) return { error: "Bilinmeyen koşum: " + runId };
  if (activeRun) return { error: `Zaten koşan bir iş var: ${activeRun.def.label}` };
  const id = `run-${++runCounter}-${runId}`;
  const proc = spawn(def.cmd, def.args, { cwd: REPO, env: { ...process.env } });
  activeRun = { id, proc, def };
  broadcast("run-start", { id, label: def.label });
  const onLine = (buf) => {
    for (const line of buf.toString().split("\n")) if (line.trim()) broadcast("run-log", { id, line: line.slice(0, 500) });
  };
  proc.stdout.on("data", onLine);
  proc.stderr.on("data", onLine);
  proc.on("close", (code) => {
    broadcast("run-end", { id, code });
    activeRun = null;
    cache.clear();
  });
  return { id };
}

// ---- V1/V2 canlı snapshot (panel içi karşılaştırma) ----
let pwBrowser = null;
const pwContexts = {}; // mode -> context
const snapCache = new Map(); // key -> {at, buf, apiVer}
const SNAP_MS = 5 * 60_000;

async function getContext(mode) {
  if (!pwBrowser) {
    const { chromium } = await import("@playwright/test");
    pwBrowser = await chromium.launch({ headless: true });
  }
  if (!pwContexts[mode]) {
    pwContexts[mode] = await pwBrowser.newContext({
      storageState: path.join(REPO, "playwright/.auth/dev-user.json"),
      viewport: { width: 1280, height: 800 },
    });
    if (mode === "v2") await pwContexts[mode].addCookies([{ name: "NG_API_V2", value: "1", domain: ".nadirgold.dev", path: "/" }]);
  }
  return pwContexts[mode];
}

async function snapshot(pagePath, mode, fullPage) {
  const key = `${mode}:${pagePath}:${fullPage}`;
  const hit = snapCache.get(key);
  if (hit && Date.now() - hit.at < SNAP_MS) return hit;
  const ctx = await getContext(mode);
  const page = await ctx.newPage();
  try {
    const url = "https://www.nadirgold.dev" + pagePath + (mode === "v2" ? (pagePath.includes("?") ? "&" : "?") + "apiV2=1" : "");
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const apiVer = resp?.headers()["x-api-version"] || "?";
    await page.waitForTimeout(2500);
    if (fullPage) { for (let y = 0; y < 5; y++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(400); } await page.evaluate(() => window.scrollTo(0, 0)); }
    const buf = await page.screenshot({ fullPage: !!fullPage });
    const entry = { at: Date.now(), buf, apiVer };
    snapCache.set(key, entry);
    return entry;
  } finally { await page.close(); }
}

// ---- Canlı iframe proxy'leri: 4647=V1, 4648=V2 (auth cookie'leri sunucu enjekte eder) ----
// access_token kısa ömürlü — Playwright ile tazelenir (AUTHP_SESSION_ID ile sessiz yenileme),
// proxy 302→auth görünce bir kez tazeleyip yeniden dener.
let authCookieHeader = null;
let authCookiesArr = [];
let customerBearer = null; // NG_AUTH cookie'sindeki müşteri JWT'si (customer/* uçları için)
let authRefreshing = null;
function extractBearer() {
  try {
    const ng = authCookiesArr.find((c) => c.name === "NG_AUTH");
    if (!ng) return;
    const obj = JSON.parse(Buffer.from(decodeURIComponent(ng.value), "base64").toString("utf8"));
    customerBearer = obj.token || null;
  } catch { customerBearer = null; }
}
async function refreshAuth() {
  if (authRefreshing) return authRefreshing;
  authRefreshing = (async () => {
    const ctx = await getContext("v1");
    const page = await ctx.newPage();
    try {
      await page.goto("https://www.nadirgold.dev/", { waitUntil: "domcontentloaded", timeout: 45000 });
      const cookies = await ctx.cookies("https://www.nadirgold.dev");
      authCookiesArr = cookies.filter((c) => c.name !== "NG_API_V2");
      authCookieHeader = authCookiesArr.map((c) => `${c.name}=${c.value}`).join("; ");
      extractBearer();
      await ctx.storageState({ path: path.join(REPO, "playwright/.auth/dev-user.json") });
      console.log("auth tazelendi:", new Date().toISOString());
    } finally { await page.close(); authRefreshing = null; }
  })();
  return authRefreshing;
}
const parseCookieHeader = (s) =>
  Object.fromEntries((s || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i), x.slice(i + 1)];
  }));

const CORS = {
  "Access-Control-Allow-Origin": `http://localhost:${PORT}`,
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, device-type, Authorization",
};

function startProxy(port, mode) {
  http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    try {
      // /__api/<endpoint> → mod'a göre doğru API tabanına gider (iframe içinde ham JSON görünümü)
      let upstream;
      if (req.url.startsWith("/__api/")) {
        const ep = req.url.slice("/__api".length);
        upstream = mode === "v1" ? "https://api.nadirgold.dev" + ep : "https://www.nadirgold.dev/api/v2" + ep;
      } else {
        upstream = "https://www.nadirgold.dev" + req.url;
      }
      if (!authCookieHeader) await refreshAuth();
      let body;
      if (req.method !== "GET" && req.method !== "HEAD") {
        body = await new Promise((ok) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => ok(Buffer.concat(chunks))); });
      }
      const doFetch = () => {
        // auth cookie'leri + tarayıcıdan gelenler (tarayıcınınki öncelikli); NG_API_V2 modu her zaman sunucu belirler
        const jar = { ...Object.fromEntries(authCookiesArr.map((c) => [c.name, c.value])), ...parseCookieHeader(req.headers.cookie) };
        delete jar.NG_API_V2;
        if (mode === "v2") jar.NG_API_V2 = "1";
        const headers = {
          cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
          "user-agent": req.headers["user-agent"] || "Mozilla/5.0",
          accept: req.headers["accept"] || "*/*",
          "accept-language": req.headers["accept-language"] || "tr",
          "device-type": req.headers["device-type"] || "web",
        };
        for (const h of ["content-type", "device-type", "x-requested-with", "authorization"]) if (req.headers[h]) headers[h] = req.headers[h];
        if (!headers.authorization && customerBearer) headers.authorization = `Bearer ${customerBearer}`;
        return fetch(upstream, { method: req.method, headers, body, redirect: "manual" });
      };
      let r = await doFetch();
      if (r.status >= 300 && r.status < 400 && (r.headers.get("location") || "").includes("auth.nadirgold.dev")) {
        await refreshAuth();
        r = await doFetch();
      }
      const out = {};
      r.headers.forEach((v, k) => {
        if (["set-cookie", "content-encoding", "content-length", "x-frame-options", "content-security-policy", "strict-transport-security"].includes(k)) return;
        if (k === "location") { try { const u = new URL(v, upstream); out[k] = u.host.endsWith("nadirgold.dev") ? u.pathname + u.search : v; } catch { out[k] = v; } return; }
        out[k] = v;
      });
      let buf = Buffer.from(await r.arrayBuffer());
      // HTML yanıtlarında auth cookie'lerini localhost'a da yaz — sayfa içi JS oturumu görsün
      // (NG_API_V2 asla client'a yazılmaz: localhost portları cookie kavanozunu paylaşır, modlar karışırdı)
      if ((out["content-type"] || "").includes("text/html") && authCookiesArr.length) {
        out["set-cookie"] = authCookiesArr.map((c) => `${c.name}=${c.value}; Path=/; SameSite=Lax`);
      }
      // HTML'e konum raporlayıcı enjekte et: iframe içi gezinmeyi panele postMessage'la bildirir
      if ((out["content-type"] || "").includes("text/html")) {
        const reporter = `<script>(function(){var M="${mode}",O="http://localhost:${PORT}";
var send=function(){try{parent.postMessage({__qa:1,mode:M,path:location.pathname+location.search},O)}catch(e){}};
var p=history.pushState,q=history.replaceState;history.pushState=function(){p.apply(this,arguments);send()};history.replaceState=function(){q.apply(this,arguments);send()};
addEventListener("popstate",send);addEventListener("hashchange",send);
var err=function(m){try{parent.postMessage({__qaErr:1,mode:M,msg:String(m).slice(0,300)},O)}catch(e){}};
addEventListener("error",function(e){err(e.message||("kaynak yüklenemedi: "+((e.target&&(e.target.src||e.target.href))||e.type)))},true);
addEventListener("unhandledrejection",function(e){err((e.reason&&e.reason.message)||e.reason||"unhandledrejection")});
var ce=console.error;console.error=function(){err([].slice.call(arguments).map(String).join(" "));return ce.apply(console,arguments)};
addEventListener("message",function(e){if(!e.data||!e.data.__qaCollect)return;
var imgs=[].slice.call(document.images),hosts={};
imgs.forEach(function(i){try{hosts[new URL(i.currentSrc||i.src,location.href).host]=1}catch(x){}});
try{parent.postMessage({__qaStats:1,mode:M,stats:{
title:document.title,path:location.pathname,
headings:[].slice.call(document.querySelectorAll("h1,h2,h3")).map(function(h){return h.tagName+": "+(h.textContent||"").trim().slice(0,80)}).filter(function(s){return s.length>4}).slice(0,30),
links:document.querySelectorAll("a[href]").length,
imgs:imgs.length,
broken:imgs.filter(function(i){return i.complete&&i.naturalWidth===0}).length,
hosts:Object.keys(hosts),
textLen:(document.body&&document.body.innerText||"").length
}},O)}catch(x){}});
send();})();</script>`;
        const html = buf.toString("utf8");
        buf = Buffer.from(html.includes("</body>") ? html.replace("</body>", reporter + "</body>") : html + reporter, "utf8");
      }
      res.writeHead(r.status, { ...out, ...CORS });
      res.end(buf);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", ...CORS });
      res.end("proxy hatası: " + String(e.message || e));
    }
  }).listen(port, "127.0.0.1", () => console.log(`${mode.toUpperCase()} canlı proxy: http://localhost:${port}`));
}
startProxy(PORT + 1, "v1");
startProxy(PORT + 2, "v2");

// ---- HTTP ----
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  try {
    if (url.pathname === "/api/cards") return send(200, await getCards(url.searchParams.get("view") || "test"));
    if (url.pathname.startsWith("/api/card/")) return send(200, await getCardDetail(url.pathname.split("/").pop()));
    if (url.pathname === "/api/verdicts") return send(200, allVerdicts());
    if (url.pathname === "/api/runs") return send(200, { runs: runsConfig.runs, active: activeRun ? { id: activeRun.id, label: activeRun.def.label } : null });
    if (url.pathname === "/api/refresh") { cache.clear(); return send(200, { ok: true }); }
    if (url.pathname === "/api/snapshot") {
      const p = url.searchParams.get("path") || "/";
      if (!p.startsWith("/")) return send(400, { error: "path / ile başlamalı" });
      const mode = url.searchParams.get("mode") === "v2" ? "v2" : "v1";
      const full = url.searchParams.get("full") !== "0";
      const snap = await snapshot(p, mode, full);
      res.writeHead(200, { "Content-Type": "image/png", "X-Api-Version": snap.apiVer, "Cache-Control": "no-store" });
      return res.end(snap.buf);
    }
    if (url.pathname === "/api/retest-alerts") return send(200, readJson(RETEST_ALERTS, []).filter((a) => !a.seen));
    if (url.pathname === "/api/newcard-alerts") return send(200, readJson(NEWCARD_ALERTS, []).filter((a) => !a.seen));
    if (url.pathname === "/api/newcard-ack" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { card } = JSON.parse(body || "{}");
        const alerts = readJson(NEWCARD_ALERTS, []);
        alerts.forEach((a) => { if (a.card === card) a.seen = true; });
        fs.writeFileSync(NEWCARD_ALERTS, JSON.stringify(alerts, null, 1));
        send(200, { ok: true });
      });
      return;
    }
    if (url.pathname === "/api/verdict" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { card, verdict, summary, notes, aiEvaluation } = JSON.parse(body || "{}");
          if (!/^NSB-\d+$/.test(card || "")) return send(400, { error: "geçersiz kart" });
          if (!["PASS", "FAIL", "BLOCKED", "UNTESTED", "BUG", "ERROR"].includes(verdict)) return send(400, { error: "geçersiz verdict" });
          if (!summary?.trim()) return send(400, { error: "özet zorunlu" });
          const p = path.join(VERDICTS, `${card}.json`);
          const prev = readJson(p, { card, history: [] });
          const entry = {
            date: new Date().toISOString(), verdict, summary: summary.trim(),
            notes: (notes || []).filter((n) => n.trim()),
            evidence: prev.latest?.evidence || [],
            aiEvaluation: (aiEvaluation || "").trim(), manual: true,
          };
          prev.latest = entry;
          prev.history = [entry, ...(prev.history || [])].slice(0, 30);
          fs.writeFileSync(p, JSON.stringify(prev, null, 2));
          send(200, { ok: true });
        } catch (e) { send(500, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === "/api/retest-ack" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { card } = JSON.parse(body || "{}");
        const alerts = readJson(RETEST_ALERTS, []);
        alerts.forEach((a) => { if (a.card === card) a.seen = true; });
        fs.writeFileSync(RETEST_ALERTS, JSON.stringify(alerts, null, 1));
        send(200, { ok: true });
      });
      return;
    }
    if (url.pathname === "/api/apidiff" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const p = JSON.parse(body || "{}");
          if (!p.v1Path?.startsWith("/") || !p.v2Path?.startsWith("/")) return send(400, { error: "path'ler / ile başlamalı" });
          send(200, await apiDiff(p));
        } catch (e) { send(500, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === "/api/jira-comment" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { card, text, attach } = JSON.parse(body || "{}");
          if (!/^NSB-\d+$/.test(card || "") || !text?.trim()) return send(400, { error: "card ve text zorunlu" });
          const result = await jiraPostComment(card, text, attach);
          cache.clear();
          send(200, result);
        } catch (e) { send(500, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { id } = JSON.parse(body || "{}");
        const r = startRun(id);
        send(r.error ? 409 : 200, r);
      });
      return;
    }
    if (url.pathname === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (url.pathname.startsWith("/evidence/")) {
      const name = path.basename(decodeURIComponent(url.pathname.slice("/evidence/".length)));
      const p = path.join(EVIDENCE, name);
      if (!fs.existsSync(p)) return send(404, { error: "yok" });
      return send(200, fs.readFileSync(p), MIME[path.extname(p)] || "application/octet-stream");
    }
    // statik
    const file = url.pathname === "/" ? "index.html" : path.basename(url.pathname);
    const p = path.join(__dirname, "public", file);
    if (fs.existsSync(p)) return send(200, fs.readFileSync(p), MIME[path.extname(p)] || "text/plain");
    return send(404, { error: "yok" });
  } catch (e) {
    return send(500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`QA Panel hazır: http://localhost:${PORT}`);
});
