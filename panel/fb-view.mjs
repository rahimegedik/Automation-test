// Firebase DebugView'ı panel içinde göstermek için: ayrı profilli Chrome + CDP screencast.
// Konsol X-Frame-Options gönderdiği için iframe'e gömülemiyor; bunun yerine kendi Chrome örneğimizin
// ekranını MJPEG olarak panele yansıtıp tıklama/klavye olaylarını CDP ile geri iletiyoruz (MobAI'ın telefon yansıtması gibi).
// Giriş: "login" modunda profil görünür pencerede açılır (debug portu yok), kullanıcı Google'a bir kez girer.
// Yayın: aynı profil headless açılır, sadece 127.0.0.1'deki debug portundan bağlanılır.
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = Number(process.env.FBV_CDP_PORT || 9333);
const VIEW = { width: 1200, height: 1000 };

export function createFbView({ repo, broadcast = () => {} }) {
  const PROFILE = path.join(repo, ".chrome-debugview");
  let proc = null, mode = null; // "login" | "stream"
  let ws = null, msgId = 0;
  const pending = new Map();
  let lastFrame = null, frameMeta = { deviceWidth: VIEW.width, deviceHeight: VIEW.height };
  const viewers = new Set();
  // yansıtmada en son açılan DebugView adresi (⌂ ve ▶ bunu kullanır; ⚙ ayarı gerekmez)
  const DV_URL_FILE = path.join(repo, "panel-data", "fbv.json");
  let dvUrl = (() => { try { return JSON.parse(fs.readFileSync(DV_URL_FILE, "utf8")).dvUrl || null; } catch { return null; } })();
  let status = { mode: null, url: null, error: null };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function kill() {
    clearInterval(dvTimer); dvWorld = null;
    try { ws?.close(); } catch {}
    ws = null;
    if (proc) { try { proc.kill(); } catch {} proc = null; }
    mode = null;
    status = { ...status, mode: null };
  }
  // önceki (panel yeniden başlamadan kalmış) Chrome örneği profili kilitler — sadece bu profile ait olanları kapat
  function killStray() {
    return new Promise((ok) => spawn("pkill", ["-f", "--", `--user-data-dir=${PROFILE}`]).on("close", ok).on("error", ok));
  }
  const strayAlive = () => new Promise((ok) => spawn("pgrep", ["-f", "--", `--user-data-dir=${PROFILE}`]).on("close", (c) => ok(c === 0)).on("error", () => ok(false)));
  async function waitExit() {
    await killStray();
    // yeni Chrome, kapanmakta olan eskisine devredip çıkmasın: süreç gerçekten bitene kadar bekle
    for (let i = 0; i < 50 && (await strayAlive()); i++) await sleep(200);
    // aynı profil iki Chrome'da açılamaz — önceki tamamen kapansın
    for (let i = 0; i < 30 && fs.existsSync(path.join(PROFILE, "SingletonLock")); i++) await sleep(200);
  }

  function send(method, params = {}) {
    if (!ws || ws.readyState !== 1) return Promise.reject(new Error("DebugView yayını bağlı değil"));
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      pending.set(id, { ok, fail });
      setTimeout(() => pending.has(id) && (pending.delete(id), fail(new Error(method + " zaman aşımı"))), 15000);
    });
  }

  function pushFrame(buf) {
    lastFrame = buf;
    for (const res of viewers) writeFrame(res, buf);
  }
  function writeFrame(res, buf) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
    res.write(buf);
    res.write("\r\n");
  }

  async function login(url) {
    kill(); await waitExit();
    proc = spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "--window-size=1100,900", url || "https://console.firebase.google.com/"], { stdio: "ignore" });
    mode = "login";
    status = { mode, url, error: null };
    proc.on("close", () => { if (mode === "login") { proc = null; mode = null; status = { ...status, mode: null }; } });
    return status;
  }

  async function start(url) {
    url = url || dvUrl || "https://console.firebase.google.com/";
    kill(); await waitExit();
    const p = spawn(CHROME, [
      `--user-data-dir=${PROFILE}`, "--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--remote-debugging-address=127.0.0.1",
      "--no-first-run", "--no-default-browser-check", `--window-size=${VIEW.width},${VIEW.height}`, url,
    ], { stdio: ["ignore", "ignore", fs.openSync(path.join(repo, "panel-data", "fbv-chrome.log"), "w")] });
    proc = p; mode = "stream";
    status = { mode, url, error: null };
    p.on("close", (code, sig) => { if (proc === p) { proc = null; mode = null; status = { ...status, mode: null, error: `Chrome kapandı (kod ${code}${sig ? ", " + sig : ""}) — panel-data/fbv-chrome.log` }; } });

    let target = null;
    for (let i = 0; i < 125 && !target; i++) { // ilk açılışta profil oluşturma ~10 sn sürebilir
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = list.find((t) => t.type === "page");
      } catch {}
    }
    if (!target) { kill(); throw new Error("Chrome debug portu açılmadı (" + CDP_PORT + ")"); }

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("CDP bağlantısı kurulamadı")); });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const h = pending.get(m.id); pending.delete(m.id);
        return m.error ? h.fail(new Error(m.error.message)) : h.ok(m.result);
      }
      if (m.method === "Page.screencastFrame") {
        frameMeta = m.params.metadata;
        send("Page.screencastFrameAck", { sessionId: m.params.sessionId }).catch(() => {});
        pushFrame(Buffer.from(m.params.data, "base64"));
      } else if (m.method === "Page.frameNavigated") {
        if (!m.params.frame.parentId) {
          status = { ...status, url: m.params.frame.url };
          if (/^https:\/\/console\.firebase\.google\.com\/project\/[^/]+\/analytics\/.*debugview/.test(m.params.frame.url) && m.params.frame.url !== dvUrl) {
            dvUrl = m.params.frame.url;
            try { fs.writeFileSync(DV_URL_FILE, JSON.stringify({ dvUrl }, null, 1)); } catch {}
          }
        }
        dvWorld = null;
      }
    };
    ws.onclose = () => { if (mode === "stream") status = { ...status, error: "CDP bağlantısı kapandı" }; };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
    dvWorld = null; clearInterval(dvTimer); dvTimer = setInterval(readDv, 3000);
    await send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
    return status;
  }

  // ---- Girdi: panel görüntüdeki oranı (0..1) yollar, burada CSS piksele çevrilir ----
  const KEYS = {
    Enter: { code: "Enter", keyCode: 13, text: "\r" }, Backspace: { code: "Backspace", keyCode: 8 }, Tab: { code: "Tab", keyCode: 9 },
    Escape: { code: "Escape", keyCode: 27 }, Delete: { code: "Delete", keyCode: 46 },
    ArrowUp: { code: "ArrowUp", keyCode: 38 }, ArrowDown: { code: "ArrowDown", keyCode: 40 }, ArrowLeft: { code: "ArrowLeft", keyCode: 37 }, ArrowRight: { code: "ArrowRight", keyCode: 39 },
    PageUp: { code: "PageUp", keyCode: 33 }, PageDown: { code: "PageDown", keyCode: 34 }, Home: { code: "Home", keyCode: 36 }, End: { code: "End", keyCode: 35 },
  };
  async function input(e) {
    const x = Math.round((e.rx || 0) * frameMeta.deviceWidth), y = Math.round((e.ry || 0) * frameMeta.deviceHeight);
    if (e.type === "click") {
      for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    } else if (e.type === "move") {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    } else if (e.type === "wheel") {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: e.dx || 0, deltaY: e.dy || 0 });
    } else if (e.type === "text") {
      await send("Input.insertText", { text: String(e.text || "") });
    } else if (e.type === "key" && KEYS[e.key]) {
      const k = KEYS[e.key];
      const mods = (e.meta ? 4 : 0) | (e.ctrl ? 2 : 0) | (e.shift ? 8 : 0);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: e.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: mods, text: k.text });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: e.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: mods });
    } else if (e.type === "navigate" && /^https:\/\//.test(e.url || "")) {
      await send("Page.navigate", { url: e.url });
    } else if (e.type === "reload") {
      await send("Page.reload");
    } else if (e.type === "back") {
      await send("Runtime.evaluate", { expression: "history.back()" });
    }
    return { ok: true };
  }

  // ---- DebugView event listesini oku (GA içeriği analytics.google.com frame'inde; izole dünyada innerText) ----
  // Saat ile AM/PM arasında dar bölünmez boşluk (U+202F) var — \s ile eşleşir.
  // Akış yeni→eski sıralı; bir saniye etiketi, üstündeki (kendinden önce gelen) event adlarının zamanıdır.
  const DV_EXTRACT = `(() => {
    const lines = document.body.innerText.split("\\n").map((l) => l.trim()).filter(Boolean);
    const TIME = /^(\\d{1,2}):(\\d\\d):(\\d\\d)\\s*([AP]M)$/, NAME = /^[A-Za-z_][A-Za-z0-9_]*( \\(_[A-Za-z0-9]+\\))?$/;
    const di = lines.indexOf("Debug Device"), cnt = +lines[di + 1] || 0;
    const dev = cnt > 0 ? lines[di + 2] || "" : "";
    const out = []; let pending = [], started = false;
    for (const l of lines) {
      if (/^(TOP EVENTS|USER PROPERTIES)/i.test(l)) break;
      const t = l.match(TIME);
      if (t) {
        started = true;
        const sec = ((+t[1] % 12) + (t[4] === "PM" ? 12 : 0)) * 3600 + +t[2] * 60 + +t[3];
        const seen = {};
        for (const name of pending) { seen[name] = (seen[name] || 0) + 1; out.push({ label: l, sec, name, k: seen[name] }); }
        pending = [];
        continue;
      }
      if (started && NAME.test(l) && !/^\\d+s$/.test(l) && l !== "new") pending.push(l);
    }
    return { device: dev, events: out };
  })()`;
  let dvFloor = -1; // Temizle: bu saniyeye kadarki (sayfada hâlâ duran) eventler yeniden eklenmez
  let dvWorld = null, dvEvents = new Map(), dvSeq = 0, dvDevice = "", dvTimer = null, dvAt = null, dvError = null;
  async function readDv() {
    if (mode !== "stream" || !ws || ws.readyState !== 1) return;
    try {
      if (!dvWorld) {
        const tree = (await send("Page.getFrameTree")).frameTree;
        const frames = []; (function f(n) { frames.push(n.frame); (n.childFrames || []).forEach(f); })(tree);
        const ga = frames.find((f) => f.url.startsWith("https://analytics.google.com"));
        if (!ga) throw new Error("DebugView sayfası açık değil — ⌂ ile DebugView'a dönün");
        dvWorld = (await send("Page.createIsolatedWorld", { frameId: ga.id, worldName: "qa-dv" })).executionContextId;
      }
      const r = await send("Runtime.evaluate", { contextId: dvWorld, expression: DV_EXTRACT, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      const { device, events } = r.result.value;
      dvDevice = device; dvAt = new Date().toISOString(); dvError = null;
      const fresh = [];
      for (const e of events) {
        const key = `${e.label}|${e.name}|${e.k}`;
        if (dvEvents.has(key) || e.sec <= dvFloor) continue;
        const ev = { id: ++dvSeq, key, name: e.name.replace(/ \(_[A-Za-z0-9]+\)$/, ""), label: e.label, sec: e.sec, at: dvAt };
        dvEvents.set(key, ev); fresh.push(ev);
      }
      if (dvEvents.size > 2000) dvEvents = new Map([...dvEvents].slice(-1000));
      if (fresh.length) broadcast("dv-events", { events: fresh });
      broadcast("dv-status", dvStatus());
    } catch (e) {
      dvWorld = null; // frame yeniden yüklenmiş olabilir
      dvError = String(e.message || e);
      broadcast("dv-status", dvStatus());
    }
  }
  const dvStatus = () => ({ reading: mode === "stream" && !!ws, device: dvDevice, at: dvAt, error: dvError, count: dvEvents.size });

  function stream(req, res) {
    res.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=frame", "Cache-Control": "no-store", Connection: "keep-alive" });
    viewers.add(res);
    if (lastFrame) writeFrame(res, lastFrame);
    req.on("close", () => viewers.delete(res));
  }

  return {
    login, start, input, stream,
    dvList: () => ({ status: dvStatus(), events: [...dvEvents.values()] }),
    dvClear: () => { dvFloor = Math.max(dvFloor, ...[...dvEvents.values()].map((e) => e.sec)); dvEvents.clear(); broadcast("dv-clear", {}); return { ok: true }; },
    stop: () => { kill(); return status; },
    status: () => ({ ...status, dvUrl, profileReady: fs.existsSync(path.join(PROFILE, "Default", "Cookies")) }),
  };
}
