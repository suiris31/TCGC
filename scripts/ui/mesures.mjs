// Mesures d'un écran, exécutées dans la page (la fonction est envoyée telle quelle au navigateur : elle ne doit rien
// utiliser d'extérieur). Ne compte que ce qu'on voit et qu'on peut toucher : dans la fenêtre, au premier plan (pas sous
// une fenêtre ouverte par-dessus). Les chiffres des libellés sont remplacés par # (dates, numéros de partie) pour que
// deux lancements donnent le même rapport.
export function measure({ minTarget = 44, minFont = 11, max = 30 } = {}) {
  const W = innerWidth;
  const H = innerHeight;
  const doc = document.documentElement;
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\d+/g, '#');
  const short = (s, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  // nom lisible d'un élément : son repère data-ui, sinon balise, classes et texte
  const describe = (el) => {
    const ui = el.getAttribute?.('data-ui');
    const text = short(clean(el.innerText || el.textContent || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.getAttribute?.('alt') || ''));
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : '';
    return `${ui ? `[${ui}]` : `${el.tagName.toLowerCase()}${cls}`}${text ? ` « ${text} »` : ''}`;
  };
  const inView = (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
  // au premier plan : le point au centre de la partie visible désigne l'élément (ou un de ses enfants, ou son parent
  // quand l'élément ne capte pas le pointeur)
  const onTop = (el, r) => {
    const x = (Math.max(0, r.left) + Math.min(W, r.right)) / 2;
    const y = (Math.max(0, r.top) + Math.min(H, r.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)));
  };
  const shown = (el) => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.opacity !== '0';
  };
  // un visuel de carte (carte du plateau, vignette faite d'une image sans texte) ne compte pas
  const cardVisual = (el) => Boolean(el.closest('[data-ui="table.card"]'))
    || (el.querySelector('img') && !clean(el.innerText) && !el.getAttribute('aria-label'));

  // ---------- Défilement horizontal ----------
  const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
  const overflow = scrollWidth > W + 1;
  const offenders = overflow
    ? [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0) || (r.right <= W + 1 && r.left >= -1) || getComputedStyle(el).position === 'fixed') return false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false;
      }
      return true;
    }).slice(0, 8).map((el) => `${describe(el)} [${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}]`)
    : [];

  // ---------- Cibles cliquables ----------
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=checkbox], [role=radio], [role=menuitem], [role=option], [role=switch], [tabindex]:not([tabindex="-1"])';
  const set = new Set(document.querySelectorAll(SEL));
  // éléments rendus cliquables par le code (curseur en main), sans être dans une cible déjà comptée
  for (const el of document.querySelectorAll('body *')) {
    if (set.has(el) || getComputedStyle(el).cursor !== 'pointer') continue;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
    if (el.closest(SEL)) continue;
    set.add(el);
  }
  let targets = 0;
  const small = [];
  for (const raw of set) {
    // une case à cocher dans son libellé : on touche le libellé
    const el = (raw.matches('input[type=checkbox], input[type=radio]') && raw.closest('label')) || raw;
    const r = el.getBoundingClientRect();
    if (!inView(r) || !shown(el) || !onTop(el, r) || cardVisual(el)) continue;
    targets++;
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) small.push(`${Math.round(r.width)}×${Math.round(r.height)} ${describe(el)}`);
  }

  // ---------- Textes ----------
  const scaleOf = (el) => {
    if (el instanceof SVGElement) {
      const m = el.getScreenCTM?.();
      return m ? Math.hypot(m.a, m.b) : 1;
    }
    const w = el.offsetWidth;
    return w > 0 ? el.getBoundingClientRect().width / w : 1;
  };
  const tiny = [];
  let texts = 0;
  let minSize = Infinity;
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || el.closest('script, style, noscript, option')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!inView(r) || !shown(el) || !onTop(el, r)) continue;
    seen.add(el);
    texts++;
    const size = parseFloat(getComputedStyle(el).fontSize) * scaleOf(el);
    minSize = Math.min(minSize, size);
    if (size < minFont - 0.05) tiny.push(`${size.toFixed(1)} px ${describe(el)}`);
  }

  return {
    adresse: location.hash || '/',
    // hauteur à faire défiler : la page, ou le plus grand conteneur qui défile (l'appli défile souvent dans un conteneur)
    page: {
      largeur: scrollWidth,
      hauteur: Math.max(doc.scrollHeight, document.body.scrollHeight, ...[...document.querySelectorAll('body *')]
        .filter((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.getBoundingClientRect().height > 0)
        .map((el) => el.scrollHeight)),
    },
    defilementHorizontal: overflow,
    debordements: offenders,
    cibles: { total: targets, petites: small.length, liste: small.slice(0, max) },
    textes: { total: texts, petits: tiny.length, min: Number.isFinite(minSize) ? Math.round(minSize * 10) / 10 : null, liste: tiny.slice(0, max) },
  };
}
