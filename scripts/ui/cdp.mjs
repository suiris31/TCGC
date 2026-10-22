// Pilote de Chrome (ou Edge) par le protocole DevTools, sans dépendance npm : lancement sans écran, un onglet isolé
// par format (cookies et stockage à part), émulation du format, clics et touchers réels, captures, et relevé des
// erreurs de la console et des réponses HTTP en erreur.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome ou Edge dans les dossiers habituels (Windows d'abord) ; CHROME_PATH l'emporte
export function findBrowser() {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome ou Edge introuvable : installe Chrome, ou indique son chemin dans CHROME_PATH');
  return found;
}

// Lance le navigateur sur un profil vide (profileDir) et s'y connecte
export async function launchBrowser({ executable = findBrowser(), profileDir, headless = true }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    ...(headless ? ['--headless=new'] : []),
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--mute-audio', '--hide-scrollbars',
    '--lang=fr-FR', '--accept-lang=fr-FR,fr', '--window-size=1440,900', 'about:blank',
  ];
  const proc = spawn(executable, args, { stdio: 'ignore' });
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  let ws;
  for (let i = 0; i < 150 && !ws; i++) {
    await sleep(100);
    if (proc.exitCode !== null) throw new Error(`le navigateur s'est arrêté au démarrage (code ${proc.exitCode})`);
    try {
      const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      if (port && wsPath) ws = `ws://127.0.0.1:${port}${wsPath}`;
    } catch {
      // pas encore prêt
    }
  }
  if (!ws) {
    proc.kill();
    throw new Error('le navigateur ne répond pas au protocole DevTools');
  }
  const browser = new Browser(proc, ws);
  await browser.connect();
  return browser;
}

export class Browser {
  constructor(proc, url) {
    this.proc = proc;
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.sessions = new Map();   // sessionId -> Page
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('connexion DevTools impossible')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method} : ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method && msg.sessionId) {
        this.sessions.get(msg.sessionId)?.onEvent(msg.method, msg.params);
      }
    });
  }

  send(method, params = {}, sessionId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`délai dépassé : ${method}`));
      }, timeout);
    });
  }

  // Nouvel onglet dans un contexte vierge (comme une fenêtre de navigation privée) : cookies, stockage et cache à part
  async newPage() {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId, browserContextId);
    this.sessions.set(sessionId, page);
    await page.init();
    return page;
  }

  async close() {
    try {
      await this.send('Browser.close', {}, undefined, 5000);
    } catch {
      // déjà fermé
    }
    try { this.ws?.close(); } catch { /* rien */ }
    await sleep(300);
    if (this.proc.exitCode === null) this.proc.kill();
  }
}

export class Page {
  constructor(browser, sessionId, targetId, contextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.contextId = contextId;
    this.format = null;
    this.events = [];          // erreurs relevées depuis le dernier drain()
    this.inflight = new Map(); // requêtes en cours (pour attendre le calme du réseau)
    this.lastNetwork = Date.now();
    this.waiters = [];         // attentes d'un événement (nextEvent)
  }

  send(method, params = {}, timeout) {
    return this.browser.send(method, params, this.sessionId, timeout);
  }

  async init() {
    await Promise.all(['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable'].map((m) => this.send(m)));
    // l'ancien travailleur de service (cache hors ligne) ne s'interpose pas : chaque essai part du serveur
    await this.send('Network.setBypassServiceWorker', { bypass: true });
  }

  onEvent(method, p) {
    const now = Date.now();
    this.waiters = this.waiters.filter((w) => (w.method === method ? (w.resolve(p), false) : true));
    if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
      this.events.push({ kind: 'console', text: p.args.map((a) => a.value ?? a.description ?? '').join(' ') });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails;
      this.events.push({ kind: 'exception', text: d.exception?.description?.split('\n')[0] ?? d.text });
    } else if (method === 'Log.entryAdded' && p.entry.level === 'error' && p.entry.source !== 'network') {
      this.events.push({ kind: 'console', text: p.entry.text });
    } else if (method === 'Network.requestWillBeSent') {
      if (!['EventSource', 'WebSocket'].includes(p.type)) this.inflight.set(p.requestId, now);
      this.lastNetwork = now;
    } else if (method === 'Network.responseReceived') {
      if (p.response.status >= 400) this.events.push({ kind: 'http', status: p.response.status, method: p.response.requestHeaders?.[':method'], url: p.response.url });
    } else if (method === 'Network.loadingFinished') {
      this.inflight.delete(p.requestId);
      this.lastNetwork = now;
    } else if (method === 'Network.loadingFailed') {
      this.inflight.delete(p.requestId);
      this.lastNetwork = now;
      if (!p.canceled && p.blockedReason === undefined) this.events.push({ kind: 'network', text: p.errorText });
    }
  }

  // Les erreurs relevées depuis l'appel précédent
  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // Script exécuté au début de chaque document (avant le code de la page)
  addInitScript(source) {
    return this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  // Format d'écran : taille, facteur de pixels, toucher, orientation
  async setFormat(f) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: f.width, height: f.height, deviceScaleFactor: f.scale, mobile: f.mobile,
      screenOrientation: f.width > f.height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
    await this.send('Emulation.setTouchEmulationEnabled', f.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await this.send('Emulation.setEmulatedMedia', {
      features: f.touch
        ? [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }]
        : [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }],
    });
    await this.send('Emulation.setUserAgentOverride', { userAgent: f.userAgent, acceptLanguage: 'fr-FR,fr', platform: f.mobile ? 'Android' : 'Win32' });
    await this.send('Emulation.setLocaleOverride', { locale: 'fr-FR' }).catch(() => {});
    this.format = f;
  }

  // Prochain événement `method` du protocole
  nextEvent(method) {
    return new Promise((resolve) => this.waiters.push({ method, resolve }));
  }

  async navigate(url) {
    const loaded = this.nextEvent('Page.loadEventFired');
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`navigation vers ${url} : ${r.errorText}`);
    if (r.loaderId) await Promise.race([loaded, sleep(30000)]);
  }

  // Évalue une expression dans la page et renvoie sa valeur (les promesses sont attendues)
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, 60000);
    if (r.exceptionDetails) throw new Error(`erreur dans la page : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  // Appelle fn(...args) dans la page (fn est envoyée sous forme de texte : elle ne voit que ses arguments)
  call(fn, ...args) {
    return this.evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
  }

  // Attend que fn(...args), exécutée dans la page, renvoie une valeur vraie ; la renvoie
  async waitFor(fn, args = [], { timeout = 20000, interval = 100, what = 'condition' } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await this.call(fn, ...args).catch(() => undefined);
      if (v) return v;
      if (Date.now() > end) throw new Error(`délai dépassé en attendant : ${what}`);
      await sleep(interval);
    }
  }

  // Attend que la page se calme : plus de requête en cours depuis quiet ms, polices et images chargées
  async settle({ quiet = 400, timeout = 10000 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const idle = this.inflight.size === 0 && Date.now() - this.lastNetwork >= quiet;
      if (idle) {
        const ready = await this.evaluate(`document.fonts.status === 'loaded' && [...document.images].every((i) => i.complete)`).catch(() => false);
        if (ready) break;
      }
      await sleep(100);
    }
    await this.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))').catch(() => {});
  }

  // Touche ou clique au point (x, y) de la fenêtre, comme un vrai doigt ou une vraie souris
  async pointAt(x, y) {
    if (this.format?.touch) {
      // un appui bref : Chrome en tire le clic, comme d'un vrai doigt (synthesizeTapGesture reste bloqué sans écran)
      await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    }
  }

  // Éloigne la souris de la page (pas d'effet de survol sur les captures)
  async mouseAway() {
    if (!this.format?.touch) await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  }

  async key(key, code = key, keyCode = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  // Capture de ce qu'on voit à l'écran, en PNG
  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' }, 60000);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  async clearCache() {
    await this.send('Network.clearBrowserCache');
  }

  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId }).catch(() => {});
    this.browser.sessions.delete(this.sessionId);
  }
}
