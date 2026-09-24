// Firebase Analytics event akışı — cihaz logundan (DebugView'a giden eventlerin aynısı)
// iOS: pymobiledevice3 syslog (FIRAnalyticsDebugEnabled ile SDK event+parametreleri basar)
// Android: adb logcat FA/FA-SVC (debug.firebase.analytics.app + log.tag.FA VERBOSE)
// Firebase DebugView'ın public API'si yok; bu yüzden kaynak cihaz logu. Upload 2xx = Google'a ulaştı.
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execFile } from "child_process";

// MobAI kendi adb sunucusunu (5037) tutuyor — farklı sürüm adb client sunucuyu öldürüp MobAI'ı koparır,
// bu yüzden önce MobAI'ın paketlediği adb.
const ADB_CANDIDATES = [
  path.join(os.homedir(), "Library/Application Support/mobai/bin/adb"),
  path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb"),
];
const ADB = ADB_CANDIDATES.find((p) => fs.existsSync(p)) || "adb";

export const APP_PRESETS = {
  ios: { bundle: "com.nmr.nadir-ios.test", label: "NadirGoldTest (iOS)" },
  android: { bundle: "com.nadirgold.app.test", activity: "com.nadirgold.MainActivity", label: "NadirGold Dev (Android)" },
};

const MAX_EVENTS = 1000;

export function createFaStream({ repo, evidenceDir, broadcast }) {
  const PMD = path.join(repo, ".venv-ios/bin/pymobiledevice3");
  let events = [];
  let seq = 0;
  let proc = null;
  let want = null; // {deviceId, platform} — stop() ile null olur, yoksa proses ölünce yeniden başlar
  let restartTimer = null;
  let status = { running: false, deviceId: null, platform: null, since: null, restarts: 0, lastError: null, debug: null };

  const setStatus = (patch) => { status = { ...status, ...patch }; broadcast("fa-status", status); };
  const push = (ev) => {
    ev.id = ++seq;
    events.push(ev);
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    broadcast("fa-event", ev);
    if (ev.debug && status.debug !== true) setStatus({ debug: true }); // ga_debug=1 → DebugView'a işaretli
  };
  // upload başarılı → o ana kadar gönderilmemiş eventleri işaretle
  const markUploaded = (code) => {
    const ids = [];
    for (const e of events) if (e.kind === "event" && !e.uploaded) { e.uploaded = code; ids.push(e.id); }
    if (ids.length) broadcast("fa-uploaded", { ids, code });
  };

  // ---- iOS parametre bloğu: "    key (_x) = value;" satırları, iç içe ( ) / { } desteği ----
  function parseIosParams(lines) {
    const params = {};
    let cur = null, depth = 0, buf = "";
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (cur) {
        buf += "\n" + line.trim();
        depth += (line.match(/[({]/g) || []).length - (line.match(/[)}]/g) || []).length;
        if (depth <= 0) { params[cur] = buf.replace(/;$/, ""); cur = null; }
        continue;
      }
      const m = line.match(/^\s*(.+?)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1].replace(/\s*\(_[^)]*\)$/, "").replace(/^"|"$/g, "");
      let val = m[2];
      const open = (val.match(/[({]/g) || []).length - (val.match(/[)}]/g) || []).length;
      if (open > 0) { cur = key; depth = open; buf = val; continue; }
      params[key] = val.replace(/;$/, "").replace(/^"(.*)"$/, "$1");
    }
    return params;
  }

  // ---- Android Bundle[{a(_x)=1, b=2}] ----
  function parseBundle(s) {
    const params = {};
    let depth = 0, tok = "";
    const parts = [];
    for (const ch of s) {
      if ("[{(".includes(ch)) depth++;
      if ("]})".includes(ch)) depth--;
      if (ch === "," && depth === 0) { parts.push(tok); tok = ""; } else tok += ch;
    }
    if (tok.trim()) parts.push(tok);
    for (const p of parts) {
      const i = p.indexOf("=");
      if (i < 0) continue;
      params[p.slice(0, i).trim().replace(/\(_[^)]*\)$/, "")] = p.slice(i + 1).trim();
    }
    return params;
  }

  // ---- iOS satır işleyici (çok satırlı entry'ler: başlık + devam satırları) ----
  let iosBlock = null; // {header, lines}
  const TS_RE = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s/;
  function flushIos() {
    if (!iosBlock) return;
    const { header, lines } = iosBlock;
    iosBlock = null;
    const ts = (header.match(TS_RE) || [])[1] || new Date().toISOString();
    const level = (header.match(/<([A-Z]+)>:/) || [])[1] || "";
    const code = (header.match(/\[(I-[A-Z]+\d+)\]/) || [])[1] || "";
    const msg = header.replace(/^.*?\[FirebaseAnalytics\]\[[^\]]+\]\s*/, "");
    if (code === "I-ACS023072") {
      const m = msg.match(/event params: ([^,]+),/);
      const params = parseIosParams(lines.filter((l) => l.trim() !== "}"));
      const meta = {};
      for (const k of Object.keys(params)) if (k.startsWith("ga_")) { meta[k] = params[k]; delete params[k]; }
      return push({ kind: "event", ts, name: m ? m[1].trim() : "?", origin: meta.ga_event_origin || "", debug: meta.ga_debug === "1", params, meta, uploaded: false });
    }
    if (code === "I-ACS023087") {
      const m = msg.match(/Name, value: (.+?)(?: \(_[^)]*\))?, (.*)$/); // "user_id (_id), 203478"
      return push({ kind: "userprop", ts, name: m ? m[1] : msg, value: m ? m[2] : "" });
    }
    if (code === "I-ACS023044") {
      const m = msg.match(/Code, size: (\d+)/);
      return markUploaded(m ? Number(m[1]) : 200);
    }
    if (code === "I-ACS024000") return setStatus({ debug: true });
    if (level === "WARNING" || level === "ERROR" || /invalid|too long|exceed|reserved|not allowed|dropp/i.test(msg)) {
      return push({ kind: "warn", ts, level, code, msg: [msg, ...lines].join("\n").slice(0, 2000) });
    }
  }
  function onIosLine(line) {
    if (TS_RE.test(line)) {
      flushIos();
      if (line.includes("[FirebaseAnalytics]")) {
        iosBlock = { header: line, lines: [] };
        if (!line.trimEnd().endsWith("{")) flushIos(); // tek satırlık entry (upload, user property) — bekletme
      }
    } else if (iosBlock) {
      iosBlock.lines.push(line);
      if (line.trim() === "}") flushIos();
    }
  }

  // ---- Android satır işleyici ----
  const recent = new Map(); // dedupe: FE + SVC aynı eventi iki kez basabilir
  function onAndroidLine(line) {
    if (!/\b(FA|FA-SVC)\b/.test(line)) return;
    const ts = (line.match(/^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)/) || [])[1] || new Date().toISOString();
    let m = line.match(/Logging event(?: \(FE\))?: (?:origin=([^,]+),name=)?([A-Za-z0-9_]+)(?:\([^)]*\))?,\s*(?:params=)?Bundle\[\{(.*)\}\]/);
    if (m) {
      const params = parseBundle(m[3]);
      const meta = {};
      for (const k of Object.keys(params)) if (k.startsWith("ga_")) { meta[k] = params[k]; delete params[k]; }
      const key = m[2] + JSON.stringify(params);
      const now = Date.now();
      if (recent.has(key) && now - recent.get(key) < 2000) return;
      recent.set(key, now);
      if (recent.size > 200) recent.clear();
      return push({ kind: "event", ts, name: m[2], origin: m[1] || meta.ga_event_origin || "", debug: meta.ga_debug === "1", params, meta, uploaded: false });
    }
    if ((m = line.match(/Setting user property(?: \(FE\))?: ([^,]+), (.*)$/))) return push({ kind: "userprop", ts, name: m[1], value: m[2] });
    if ((m = line.match(/Successful upload\. Got network response\. code, size: (\d+)/i))) return markUploaded(Number(m[1]));
    if (/ W\/FA|\/FA.*\b(invalid|too long|exceed|reserved|not allowed)/i.test(line) || / [WE] FA/.test(line)) {
      return push({ kind: "warn", ts, level: "WARNING", code: "", msg: line.slice(0, 2000) });
    }
  }

  function spawnReader() {
    const { deviceId, platform } = want;
    let cmd, args, onLine;
    if (platform === "ios") {
      if (!fs.existsSync(PMD)) { setStatus({ running: false, lastError: "pymobiledevice3 yok: .venv-ios kurulu değil (python3 -m venv .venv-ios && .venv-ios/bin/pip install pymobiledevice3)" }); want = null; return; }
      cmd = PMD; args = ["syslog", "live", "--udid", deviceId, "-m", "FirebaseAnalytics"]; onLine = onIosLine;
    } else {
      cmd = ADB; args = ["-s", deviceId, "logcat", "-v", "time", "-T", "1", "FA:V", "FA-SVC:V", "*:S"]; onLine = onAndroidLine;
    }
    const p = spawn(cmd, args, { env: { ...process.env, PYTHONWARNINGS: "ignore", PYTHONUNBUFFERED: "1" } });
    proc = p;
    let rest = "";
    const onData = (buf) => {
      const text = rest + buf.toString();
      const lines = text.split("\n");
      rest = lines.pop();
      for (const l of lines) onLine(l);
    };
    p.stdout.on("data", onData);
    let errTail = "";
    p.stderr.on("data", (b) => { errTail = (errTail + b.toString()).slice(-500); });
    p.on("error", (e) => setStatus({ lastError: String(e.message || e) }));
    p.on("close", (code) => {
      if (proc !== p) return;
      proc = null;
      flushIos();
      if (!want) return setStatus({ running: false });
      // adb/syslog EOF ile sessizce ölebiliyor (MobAI adb'yi resetler) → yeniden bağlan
      setStatus({ running: false, lastError: `okuyucu kapandı (kod ${code}) ${errTail.replace(/\s+/g, " ").trim().slice(-200)} — yeniden bağlanıyor`, restarts: status.restarts + 1 });
      restartTimer = setTimeout(() => want && spawnReader(), 2000);
    });
    setStatus({ running: true, deviceId, platform, since: status.deviceId === deviceId ? status.since : new Date().toISOString(), lastError: null });
  }

  function start({ deviceId, platform }) {
    if (!deviceId || !["ios", "android"].includes(platform)) throw new Error("deviceId + platform (ios|android) zorunlu");
    stop();
    want = { deviceId, platform };
    status.restarts = 0;
    status.debug = null;
    spawnReader();
    return status;
  }
  function stop() {
    want = null;
    clearTimeout(restartTimer);
    if (proc) { const p = proc; proc = null; p.kill(); }
    iosBlock = null;
    setStatus({ running: false });
    return status;
  }

  const run = (cmd, args) => new Promise((ok) => execFile(cmd, args, { timeout: 60_000 }, (err, stdout, stderr) =>
    ok({ ok: !err, out: (stdout + stderr).trim().slice(-800) })));

  // Uygulamayı Firebase debug modunda (yeniden) başlat. iOS'ta bayrak kalıcıdır: kapatmak için enable=false.
  async function debugLaunch({ deviceId, platform, bundle, enable = true }) {
    const preset = APP_PRESETS[platform] || {};
    bundle = bundle || preset.bundle;
    if (!/^[\w.-]+$/.test(bundle || "") || !/^[\w:.-]+$/.test(deviceId || "")) throw new Error("geçersiz bundle/deviceId");
    const steps = [];
    if (platform === "ios") {
      const flags = enable ? ["-FIRDebugEnabled", "-FIRAnalyticsDebugEnabled"] : ["-FIRDebugDisabled", "-noFIRAnalyticsDebugEnabled"];
      steps.push(await run("xcrun", ["devicectl", "device", "process", "launch", "--terminate-existing", "--device", deviceId, bundle, "--", ...flags]));
    } else {
      const sh = (...a) => run(ADB, ["-s", deviceId, "shell", ...a]);
      steps.push(await sh("setprop", "debug.firebase.analytics.app", enable ? bundle : ".none."));
      for (const tag of ["FA", "FA-SVC"]) steps.push(await sh("setprop", `log.tag.${tag}`, enable ? "VERBOSE" : "INFO"));
      steps.push(await sh("am", "force-stop", bundle));
      if (enable) {
        const act = bundle === APP_PRESETS.android.bundle ? `${bundle}/${preset.activity}` : null;
        steps.push(await (act ? sh("am", "start", "-n", act) : sh("monkey", "-p", bundle, "-c", "android.intent.category.LAUNCHER", "1")));
      }
    }
    const ok = steps.every((s) => s.ok);
    if (ok) setStatus({ debug: enable });
    return { ok, steps };
  }

  function save({ card, expected, debugview }) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `fa-events-${card && /^NSB-\d+$/.test(card) ? card + "-" : ""}${stamp}.json`;
    fs.writeFileSync(path.join(evidenceDir, name), JSON.stringify({ savedAt: new Date().toISOString(), device: status, expected: expected || [], events, debugview: debugview || null }, null, 1));
    return { file: name, count: events.length };
  }

  return {
    start, stop, debugLaunch, save,
    clear: () => { events = []; broadcast("fa-clear", {}); return { ok: true }; },
    list: () => ({ status, events, presets: APP_PRESETS }),
  };
}
