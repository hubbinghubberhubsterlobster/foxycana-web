'use strict';
/* =========================================================
   Foxycana – Deck-Assistent
   Baut aus deiner Sammlung die stärksten Decks und zeigt die Meta.
   Kartenstärke = Spielwerte + Fähigkeiten + Marktnachfrage (Cardmarket-Preis
   innerhalb der Seltenheit – gefragte Turnierkarten sind teurer).
   ========================================================= */
const ASSIST = (() => {
  const INK_KEYS = Object.keys(INKS);
  const PAIRS = []; for(let i = 0; i < 6; i++) for(let j = i + 1; j < 6; j++) PAIRS.push([INK_KEYS[i], INK_KEYS[j]]);
  const STYLES = {
    aggro:   {de:'Aggro', info:'Schnell Legende sammeln, günstige Karten', curve:[0,12,15,14,10,5,3,1]},
    midrange:{de:'Midrange', info:'Ausgewogen, starke Karten in jeder Phase', curve:[0,7,12,13,11,8,5,4]},
    control: {de:'Control', info:'Entfernen, Karten ziehen, spät gewinnen', curve:[0,5,10,11,11,9,7,7]}
  };
  // Meta-Stand (Fallback), Quelle: inkdecks.com Core-Meta, Stand 25.10.2026
  const META_FALLBACK = {date:'2026-10-25', source:'inkdecks.com', format:'core', list:[
    ['Evasive','Emerald','Steel',23,49],['Circle','Amber','Emerald',15,68],['Princesses','Amber','Sapphire',9,40],
    ['Shere Khan','Amethyst','Steel',9,47],['Midrange','Amber','Amethyst',7,58],['Retro','Amethyst','Emerald',6,59],
    ['Actions','Emerald','Ruby',4,55],['Merida','Amber','Amethyst',3,83],['Detectives','Amber','Sapphire',3,20],
    ['Midrange','Amethyst','Ruby',3,44],['Aggro','Amber','Steel',3,17],['Aggro','Amber','Emerald',2,58],['Actions','Amber','Ruby',2,64]
  ].map(([name, a, b, share, wr]) => ({name, inks:[a, b], share, wr}))};

  const st = {style:'midrange', inks:[], theme:'', format:'core', mode:'owned', meta:null, metaPick:null, results:null, sel:0};
  let META = null, POWER = null, GROUPS = null;

  /* ---------- Format ---------- */
  function setLegal(code, fmt){
    if(fmt === 'infinity') return true;
    const s = S.sets[code]; if(!s || !s.formats) return true;
    const k = Object.keys(s.formats).find(x => x.toLowerCase() === fmt); if(!k) return true;
    const e = s.formats[k] || {};
    if(e.allowed === false) return false;
    if(e.allowedUntilDate && new Date(e.allowedUntilDate) < new Date()) return false;
    return true;
  }

  /* ---------- Kartenstärke ---------- */
  function baseScore(c){
    const t = ((c.txt && c.txt.en) || '').toLowerCase();
    const k = ((c.kw || []).join(' ') + ' ' + t).toLowerCase();
    const cost = Math.max(1, c.ct || 1);
    let s = 0;
    if(c.t === 'Character') s += ((c.lo || 0) * 1.5 + (c.st || 0) * 0.55 + (c.wp || 0) * 0.5) / cost - 1.6;
    else if(c.t === 'Location') s += ((c.lo || 0) * 1.2 + (c.wp || 0) * 0.25) / cost - 0.4;
    const has = (re, v) => { if(re.test(k)) s += v; };
    has(/\bevasive\b/, 0.55); has(/\bward\b/, 0.35); has(/\brush\b/, 0.3); has(/\bresist\b/, 0.3); has(/\bchallenger\b/, 0.15);
    has(/\bbodyguard\b/, 0.15); has(/\bsupport\b/, 0.15); has(/\bsinger\b/, 0.25); has(/\bshift\b/, 0.2); has(/\bboost\b/, 0.15);
    has(/\breckless\b/, -0.45); has(/\bvanish\b/, -0.15);
    has(/draw (a|an|\d|two|three) cards?/, 0.55); has(/banish (chosen|all|each)/, 0.7); has(/deal \d+ damage/, 0.4);
    has(/return chosen .*to (their|its) player's hand/, 0.45); has(/gain \d+ lore/, 0.35); has(/loses? \d+ lore/, 0.35);
    has(/look at the top/, 0.2); has(/can't (quest|challenge)/, 0.25); has(/exert chosen/, 0.2); has(/\bready\b/, 0.12);
    has(/into (your|their) inkwell/, 0.3); has(/discard/, 0.2); has(/costs? \d+ less/, 0.25);
    s += c.ink ? 0.15 : -0.1;
    return s;
  }
  function fk(c){ return ENGINE.norm(c.name.en + ' ' + (c.ver.en || '')); }
  function buildPower(){
    // Kartengruppen nach Name (alle Drucke zusammen)
    GROUPS = new Map();
    for(const c of S.cards){
      if(!c.col || !c.t) continue;
      const key = fk(c);
      let g = GROUPS.get(key);
      if(!g){ g = {key, cards:[], rep:null, owned:0, price:null}; GROUPS.set(key, g); }
      g.cards.push(c);
    }
    const byRar = {};
    for(const g of GROUPS.values()){
      const base = g.cards.filter(c => !SPECIAL_RAR.has(c.r));
      g.rep = ENGINE.preferPrinting(g.cards);
      const prices = (base.length ? base : g.cards).map(c => priceEUR(c, false)).filter(p => p > 0);
      g.price = prices.length ? Math.min(...prices) : null;
      g.base = baseScore(g.rep);
      const r = (base[0] || g.rep).r;
      (byRar[r] = byRar[r] || []).push(g);
    }
    // Marktnachfrage: Preis-Rang innerhalb der Seltenheit (0..1)
    for(const list of Object.values(byRar)){
      const priced = list.filter(g => g.price != null).sort((a, b) => a.price - b.price);
      priced.forEach((g, i) => g.demand = priced.length > 1 ? i / (priced.length - 1) : 0.5);
      list.forEach(g => { if(g.demand == null) g.demand = 0.3; });
    }
    const all = [...GROUPS.values()].sort((a, b) => a.base - b.base);
    all.forEach((g, i) => { g.basePct = i / Math.max(1, all.length - 1); g.power = 0.45 * g.basePct + 0.55 * g.demand; });
    POWER = true;
  }
  function refreshOwned(){
    for(const g of GROUPS.values()){
      g.owned = 0; g.ownCard = null; let best = -1;
      for(const c of g.cards){ const q = ownedQty(c.id); g.owned += q; if(q > best){ best = q; g.ownCard = q ? c : g.ownCard; } }
    }
  }
  function ensure(){ if(!POWER || !GROUPS) buildPower(); refreshOwned(); }

  /* ---------- Thema aus Archetyp-Namen ---------- */
  function themeFor(name){
    const n = String(name || '').trim(); if(!n) return null;
    const low = n.toLowerCase();
    if(/^(aggro|midrange|control|retro|tempo|ramp|circle)$/.test(low)) return null;
    if(low === 'evasive') return {kind:'kw', v:'evasive', label:'Ausweichend'};
    if(low === 'actions' || low === 'songs') return {kind:'type', v:'Action', label:'Aktionen & Lieder'};
    if(low === 'items') return {kind:'type', v:'Item', label:'Gegenstände'};
    if(low === 'locations') return {kind:'type', v:'Location', label:'Orte'};
    const subs = new Set(); for(const c of S.cards) for(const x of (c.sub || [])) subs.add(x);
    const sing = low.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/s$/, '');
    for(const x of subs){ const xl = x.toLowerCase(); if(xl === low || xl === sing) return {kind:'sub', v:x, label:n}; }
    const names = n.split(/\s*&\s*|\s+and\s+|\s+und\s+/i).map(s => ENGINE.norm(s)).filter(Boolean);
    if(names.length && names.every(nm => S.cards.some(c => ENGINE.norm(c.name.en).includes(nm)))) return {kind:'names', v:names, label:n};
    return null;
  }
  function themeMatch(c, th){
    if(!th) return false;
    if(th.kind === 'kw') return (c.kw || []).some(k => k.toLowerCase().includes(th.v)) || ((c.txt && c.txt.en) || '').toLowerCase().includes(th.v);
    if(th.kind === 'type') return c.t === th.v;
    if(th.kind === 'sub') return (c.sub || []).includes(th.v);
    if(th.kind === 'names'){ const nm = ENGINE.norm(c.name.en); return th.v.some(x => nm.includes(x)); }
    return false;
  }

  /* ---------- Deck bauen ---------- */
  function adjScore(g, style, theme){
    const c = g.rep, cost = c.ct || 0, t = ((c.txt && c.txt.en) || '').toLowerCase();
    let s = g.power;
    if(style === 'aggro'){ if(cost <= 3) s += 0.1; if(cost >= 6) s -= 0.15; if((c.lo || 0) >= 2) s += 0.06; if(/\b(rush|evasive)\b/i.test((c.kw||[]).join(' '))) s += 0.05; }
    if(style === 'control'){ if(/banish|deal \d+ damage|draw|return chosen/.test(t)) s += 0.1; if(c.t === 'Character' && cost <= 2) s -= 0.05; if((c.wp || 0) >= 5) s += 0.04; }
    if(theme && themeMatch(c, theme)) s += 0.22;
    return s;
  }
  function buildDeck(pair, opt){
    const theme = opt.theme, style = opt.style, owned = opt.mode === 'owned';
    const target = STYLES[style].curve;
    const pool = [];
    for(const g of GROUPS.values()){
      const inks = inkList(g.rep); if(!inks.length || !inks.every(k => pair.includes(k))) continue;
      if(!g.cards.some(c => setLegal(c.s, opt.format))) continue;
      const max = g.rep.max === undefined ? 4 : (g.rep.max == null ? 4 : Math.min(4, g.rep.max));
      let sc = adjScore(g, style, theme);
      if(!owned && g.owned) sc += 0.03 * Math.min(4, g.owned);
      pool.push({g, sc, max});
    }
    pool.sort((a, b) => b.sc - a.sc);
    const deck = new Map(), bucket = Array(8).fill(0); let count = 0;
    const b = g => Math.min(7, Math.max(1, g.rep.ct || 1));
    const add = (p, n) => { if(n <= 0) return 0; const cur = deck.get(p.g.key) || {p, n:0}; cur.n += n; deck.set(p.g.key, cur); bucket[b(p.g)] += n; count += n; return n; };
    const room = (p, slack) => Math.ceil(target[b(p.g)] * slack) - bucket[b(p.g)];
    // 1) eigene Karten (bzw. beste Karten im Modus "beste Decks")
    for(const slack of [1.0, 1.35]){
      for(const p of pool){
        if(count >= 60) break;
        const have = (deck.get(p.g.key) || {n:0}).n;
        const lim = owned ? Math.min(p.max, p.g.owned) : p.max;
        let take = Math.min(lim - have, room(p, slack), 60 - count);
        if(have === 0 && take < 2 && lim >= 2 && slack === 1.0) continue;
        if(take > 0 && p.sc > 0.25) add(p, take);
      }
    }
    // 2) falls nötig mit eigenen schwächeren Karten auffüllen
    if(count < 60) for(const p of pool){ if(count >= 60) break; const have = (deck.get(p.g.key) || {n:0}).n; const lim = owned ? Math.min(p.max, p.g.owned) : p.max; add(p, Math.min(lim - have, 60 - count)); }
    // 3) Rest mit den besten fehlenden Karten (Kaufvorschläge)
    if(count < 60) for(const p of pool){ if(count >= 60) break; const have = (deck.get(p.g.key) || {n:0}).n; add(p, Math.min(p.max - have, 60 - count)); }
    // 4) genug Tintenkarten (≥ 44 von 60)
    let ink = 0; for(const x of deck.values()) if(x.p.g.rep.ink) ink += x.n;
    let guard = 0;
    while(ink < 44 && guard++ < 40){
      const weak = [...deck.values()].filter(x => !x.p.g.rep.ink).sort((a, z) => a.p.sc - z.p.sc)[0];
      const repl = pool.find(p => p.g.rep.ink && (deck.get(p.g.key) || {n:0}).n < (owned && guard < 20 ? Math.min(p.max, p.g.owned) : p.max));
      if(!weak || !repl) break;
      weak.n--; bucket[b(weak.p.g)]--; if(!weak.n) deck.delete(weak.p.g.key);
      const cur = deck.get(repl.g.key) || {p:repl, n:0}; cur.n++; deck.set(repl.g.key, cur); bucket[b(repl.g)]++; ink++;
    }
    const lines = [...deck.values()].map(x => ({g:x.p.g, n:x.n, sc:x.p.sc, miss: Math.max(0, x.n - x.p.g.owned)}));
    const total = lines.reduce((s, x) => s + x.n, 0);
    const ownedCopies = lines.reduce((s, x) => s + (x.n - x.miss), 0);
    const quality = total ? lines.reduce((s, x) => s + x.g.power * x.n, 0) / total : 0;
    const missCost = lines.reduce((s, x) => s + (x.g.price || 0) * x.miss, 0);
    const themeCount = theme ? lines.reduce((s, x) => s + (themeMatch(x.g.rep, theme) ? x.n : 0), 0) : 0;
    // Upgrades: starke Karten, die nicht (voll) im Deck sind
    const weakest = lines.length ? Math.min(...lines.map(x => x.sc)) : 0;
    const upgrades = pool.filter(p => p.sc > weakest + 0.05 && (deck.get(p.g.key) || {n:0}).n < p.max && p.g.owned < p.max)
      .slice(0, 10).map(p => ({g:p.g, sc:p.sc, need: p.max - Math.max(p.g.owned, (deck.get(p.g.key) || {n:0}).n)}));
    return {pair, lines, total, ownedCopies, quality, missCost, ink, themeCount, upgrades, style, theme};
  }
  function rank(r, mode){ return mode === 'owned' ? r.quality * 0.6 + (r.ownedCopies / 60) * 0.4 : r.quality; }
  function run(){
    ensure();
    const opt = {style: st.style, theme: st.theme ? themeFor(st.theme) : null, format: st.format, mode: st.mode};
    let pairs = PAIRS;
    if(st.inks.length === 2) pairs = [st.inks];
    else if(st.inks.length === 1) pairs = PAIRS.filter(p => p.includes(st.inks[0]));
    const res = pairs.map(p => buildDeck(p, opt)).filter(r => r.total >= 40);
    res.sort((a, b) => rank(b, st.mode) - rank(a, st.mode));
    st.results = res.slice(0, st.inks.length === 2 ? 1 : 3); st.sel = 0;
  }

  /* ---------- Meta (live von inkdecks.com, sonst letzter Stand) ---------- */
  async function loadMeta(force){
    if(META && !force) return META;
    const mkey = 'meta-' + st.format; const cached = await DB.get(mkey);
    if(cached && !force && Date.now() - cached.fetched < 12 * HOUR){ META = cached; return META; }
    try{
      let res = null;
      if(WEB){ res = await getJSON(wd('meta-' + st.format + '.json')); if(res) res.fetched = Date.now(); }
      else res = parseMetaHtml(await getText('https://inkdecks.com/lorcana-metagame' + (st.format === 'infinity' ? '/infinity' : '')), st.format);
      if(res && res.list && res.list.length >= 4){ META = res; await DB.set(mkey, META); return META; }
    }catch(e){ console.warn('Meta nicht geladen', e); }
    META = cached || (st.format === 'core' ? Object.assign({fetched:0, live:false}, META_FALLBACK) : {fetched:0, live:false, date:null, list:[]});
    return META;
  }

  /* ---------- Oberfläche ---------- */
  const inkDot = k => `<i class="dot" style="background:${INKS[k].c};width:14px;height:14px"></i>`;
  const pairLabel = p => p.map(k => INKS[k].de).join(' & ');
  function chips(name, opts, cur){ return `<div class="chips" style="flex-wrap:wrap">${opts.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="as-set" data-k="${name}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`; }
  function render(){
    if(!S.cards.length) return;
    if(S.ui.assist === 'results') return renderResults();
    if(S.ui.assist === 'deck') return renderDeckView();
    const m = META;
    const themes = topThemes();
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">✨ Deck-Assistent</h1></div>
      <div class="card"><div class="row between"><b>Was ist gerade stark?</b><span class="tiny muted">${m ? (m.live ? 'live · ' : 'Stand ') + fmtDate(m.date) : 'lädt …'}</span></div>
        <div id="as-meta" style="margin-top:8px">${m ? metaList(m) : '<div class="loader" style="width:24px;height:24px;border-width:3px;margin:10px auto"></div>'}</div>
        <div class="tiny muted" style="margin-top:6px">Turnier-Ergebnisse von inkdecks.com (${st.format === 'core' ? 'Core' : 'Infinity'}). Tippe ein Archetyp an, um ihn aus deinen Karten zu bauen.</div></div>
      <h2>Oder: Dein eigenes Deck</h2>
      <label class="lbl">Spielstil</label>${chips('style', Object.entries(STYLES).map(([k, v]) => [k, v.de]), st.style)}
      <div class="tiny muted" style="margin-top:4px">${esc(STYLES[st.style].info)}</div>
      <label class="lbl">Farben (0–2 wählen, leer = automatisch die besten)</label><div class="chips">${INK_KEYS.map(k => `<button class="ink ${st.inks.includes(k) ? 'on' : ''}" data-act="as-ink" data-ink="${k}"><i style="background:${INKS[k].c}"></i></button>`).join('')}<span class="small muted" style="align-self:center">${st.inks.map(k => INKS[k].de).join(' & ') || 'Automatisch'}</span></div>
      <label class="lbl">Thema (optional)</label><select id="as-theme"><option value="">Kein Thema</option>${themes.map(t => `<option value="${esc(t)}" ${st.theme === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <label class="lbl">Karten</label>${chips('mode', [['owned','Nur meine Karten'],['best','Bestes Deck (mit Kauftipps)']], st.mode)}
      <label class="lbl">Format</label>${chips('format', [['core','Core (aktuelle Sets)'],['infinity','Infinity (alle Sets)']], st.format)}
      <button class="btn block" style="margin-top:18px" data-act="as-run">Decks bauen</button>
      <p class="tiny muted">So bewertet Foxycana Karten: Spielwerte und Fähigkeiten plus Nachfrage auf Cardmarket (gefragte Turnierkarten sind innerhalb ihrer Seltenheit teurer).</p>`;
    $('#as-theme').onchange = e => { st.theme = e.target.value; };
    if(m && !m.list.length) $('#as-meta').innerHTML = '<div class="tiny muted">Keine Meta-Daten verfügbar.</div>';
    if(!m) loadMeta().then(() => { if(S.ui.assist === 'wizard') render(); });
  }
  function metaList(m){
    return m.list.slice(0, 10).map((a, i) => `<button class="item" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)" data-act="as-meta" data-i="${i}">
      <span class="muted small" style="width:18px">${i + 1}</span>${inkDot(a.inks[0])}${inkDot(a.inks[1])}
      <div class="grow"><b class="small">${esc(a.name)}</b> <span class="tiny muted">${esc(pairLabel(a.inks))}</span>
      <div class="progress" style="margin-top:4px;height:4px"><i style="width:${Math.min(100, a.share * 3)}%"></i></div></div>
      <div style="text-align:right" class="tiny"><b>${a.share}%</b> Meta<br><span style="color:${a.wr == null ? 'var(--muted)' : a.wr >= 55 ? 'var(--good)' : a.wr < 45 ? 'var(--bad)' : 'var(--text)'}">${a.wr == null ? '–' : a.wr + '%'} Siege</span></div></button>`).join('');
  }
  function topThemes(){
    const cnt = {}; for(const c of S.cards) for(const x of (c.sub || [])) if(!/^(Storyborn|Dreamborn|Floodborn|Song|Hero|Villain|Ally)$/.test(x)) cnt[x] = (cnt[x] || 0) + 1;
    const subs = Object.entries(cnt).filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k]) => /s$/.test(k) ? k + 'es' : /y$/.test(k) ? k.slice(0, -1) + 'ies' : k + 's');
    return ['Evasive', 'Actions', 'Items', 'Locations', ...subs.sort()];
  }
  function stars(q){ const n = Math.max(1, Math.min(5, Math.round(q * 6.5 - 0.5))); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function renderResults(){
    const rs = st.results || [];
    const head = st.metaPick ? `Meta-Deck: ${esc(st.metaPick.name)}` : `${STYLES[st.style].de}${st.theme ? ' · ' + esc(st.theme) : ''}`;
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow ell">Vorschläge</h1></div>
      <div class="muted small" style="margin:-6px 0 12px">${head} · ${st.mode === 'owned' ? 'aus deinen Karten' : 'bestes Deck'} · ${st.format === 'core' ? 'Core' : 'Infinity'}</div>
      ${rs.length ? rs.map((r, i) => `<button class="deck-item" data-act="as-open" data-i="${i}" style="align-items:flex-start">
        <div class="deck-inks">${inkDot(r.pair[0])}${inkDot(r.pair[1])}</div>
        <div class="grow"><b style="display:block">${esc(pairLabel(r.pair))}</b>
          <div class="gold" style="letter-spacing:1px">${stars(r.quality)} <span class="tiny muted">Stärke ${Math.round(r.quality * 100)}</span></div>
          <div class="tiny muted">${r.ownedCopies}/60 Karten hast du${r.theme ? ` · ${r.themeCount}× Thema` : ''} · ${r.ink} tintenfähig</div>
          ${r.total - r.ownedCopies ? `<div class="miss">Es fehlen ${r.total - r.ownedCopies} Karten (ca. ${money(r.missCost)})</div>` : '<div class="tiny" style="color:var(--good)">Komplett spielbar mit deinen Karten ✓</div>'}</div><span class="muted">›</span></button>`).join('')
        : `<div class="empty"><div class="icon">🤔</div>Mit diesen Einstellungen kommt kein Deck zustande. Wähle andere Farben oder „Bestes Deck“.</div>`}`;
  }
  function renderDeckView(){
    const r = (st.results || [])[st.sel]; if(!r){ S.ui.assist = 'results'; return renderResults(); }
    const lines = [...r.lines].sort((a, b) => (a.g.rep.ct || 0) - (b.g.rep.ct || 0) || cName(a.g.rep).localeCompare(cName(b.g.rep), 'de'));
    const curve = Array(9).fill(0); lines.forEach(x => curve[Math.min(8, x.g.rep.ct || 0)] += x.n); const mx = Math.max(1, ...curve);
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow ell">${esc(pairLabel(r.pair))}</h1></div>
      <div class="hero"><div class="row between"><div><div class="lbl">Stärke</div><div class="big">${Math.round(r.quality * 100)}<span style="font-size:16px"> /100</span></div></div><div class="gold" style="font-size:22px">${stars(r.quality)}</div></div>
        <div class="stats"><div><b>${r.total}</b>Karten</div><div><b>${r.ink}</b>tintenfähig</div><div><b style="color:${r.total - r.ownedCopies ? 'var(--bad)' : 'var(--good)'}">${r.total - r.ownedCopies}</b>fehlen</div></div>
        ${r.missCost ? `<div class="tiny" style="color:#ffc9c9;margin-top:8px">Fehlende Karten kosten ca. ${money(r.missCost)}</div>` : ''}</div>
      <button class="btn block" data-act="as-save">Als Deck speichern</button>
      <div class="card" style="margin-top:12px"><b class="small">Kostenkurve</b><div class="curve">${curve.map((n, i) => `<div><span>${n || ''}</span><i style="height:${Math.round(n / mx * 56)}px"></i>${i === 8 ? '8+' : i}</div>`).join('')}</div></div>
      <h3>Deckliste</h3>${lines.map(x => `<div class="deck-line"><span class="cost">${x.g.rep.ct ?? '–'}</span><img src="${esc(cThumb(x.g.ownCard || x.g.rep))}" loading="lazy" data-act="card" data-id="${(x.g.ownCard || x.g.rep).id}">
        <div class="grow" data-act="card" data-id="${(x.g.ownCard || x.g.rep).id}"><div class="ell"><b>${x.n}× ${esc(cName(x.g.rep))}</b></div><div class="tiny muted ell">${esc(cVer(x.g.rep))}${x.miss ? ` <span class="miss">· ${x.miss} fehlt (${money((x.g.price || 0) * x.miss)})</span>` : ''}</div></div>
        <span class="tag">${Math.round(x.g.power * 100)}</span></div>`).join('')}
      ${r.upgrades.length ? `<h3>Lohnt sich noch</h3><p class="tiny muted" style="margin-top:-4px">Starke Karten in diesen Farben, die dir fehlen – sortiert nach Stärke.</p>${r.upgrades.map(u => `<div class="deck-line" data-act="card" data-id="${u.g.rep.id}"><img src="${esc(cThumb(u.g.rep))}" loading="lazy"><div class="grow"><div class="ell"><b>${esc(cName(u.g.rep))}</b></div><div class="tiny muted ell">${esc(cVer(u.g.rep))} · Stärke ${Math.round(u.g.power * 100)} · du hast ${u.g.owned}</div></div><span class="gold small">${money(u.g.price)}</span></div>`).join('')}` : ''}`;
  }

  /* ---------- Aktionen ---------- */
  A['assist-open'] = () => { go({tab:'decks', deck:null, assist:'wizard'}); loadMeta().then(() => { if(S.ui.assist === 'wizard') render(); }); };
  A['as-set'] = el => { st[el.dataset.k] = el.dataset.v; if(el.dataset.k === 'format'){ META = null; } render(); };
  A['as-ink'] = el => { const k = el.dataset.ink; st.inks = st.inks.includes(k) ? st.inks.filter(x => x !== k) : [...st.inks, k].slice(-2); render(); };
  A['as-run'] = () => {
    st.theme = ($('#as-theme') || {}).value || st.theme; st.metaPick = null;
    view.innerHTML = '<div class="boot" style="min-height:50vh"><div class="loader"></div>Baue Decks aus deinen Karten …</div>';
    setTimeout(() => { run(); go({assist:'results'}); }, 30);
  };
  A['as-meta'] = el => {
    const a = META.list[+el.dataset.i]; if(!a) return;
    st.metaPick = a; st.inks = [...a.inks];
    const th = themeFor(a.name); st.theme = th ? a.name : '';
    if(/aggro/i.test(a.name)) st.style = 'aggro'; else if(/control/i.test(a.name)) st.style = 'control'; else st.style = 'midrange';
    view.innerHTML = '<div class="boot" style="min-height:50vh"><div class="loader"></div>Baue ' + esc(a.name) + ' aus deinen Karten …</div>';
    setTimeout(() => { const keep = st.metaPick; run(); st.metaPick = keep; go({assist:'results'}); }, 30);
  };
  A['as-open'] = el => { st.sel = +el.dataset.i; go({assist:'deck'}); };
  A['as-save'] = async () => {
    const r = st.results[st.sel];
    const def = (st.metaPick ? st.metaPick.name + ' ' : (STYLES[st.style].de + ' ')) + pairLabel(r.pair).replace(' & ', '/');
    const name = await promptText('Deck speichern', def); if(!name) return;
    const d = {id:'d' + Date.now(), name, cards:{}, src:'assistant', created: Date.now()};
    for(const x of r.lines){ const c = x.g.ownCard || x.g.rep; d.cards[c.id] = (d.cards[c.id] || 0) + x.n; }
    S.decks.unshift(d); persist(); toast('Deck gespeichert ✓');
    go({tab:'decks', assist:null, deck: d.id});
  };

  /* ---------- Bewertung gespeicherter Decks (Meta-Ranking) ---------- */
  function rateDeck(d){
    if(!S.cards.length) return null;
    if(!POWER || !GROUPS) buildPower();
    let n = 0, pw = 0, illegal = 0; const inks = new Set(), cards = [];
    for(const [id, k] of Object.entries(d.cards || {})){
      const c = S.byId.get(+id) || S.byId.get(id); if(!c) continue;
      const g = GROUPS.get(fk(c));
      n += k; pw += (g ? g.power : 0.3) * k; inkList(c).forEach(x => inks.add(x)); cards.push({c, k});
      if(!g || !g.cards.some(x => setLegal(x.s, 'core'))) illegal += k;
    }
    if(!n) return null;
    const quality = pw / n;
    const m = (META && META.list && META.list.length) ? META : META_FALLBACK;
    let best = null;
    if(inks.size <= 2) for(const a of m.list){
      if(!a.inks.every(x => inks.has(x))) continue;
      const th = themeFor(a.name); let fit = 1;
      if(th){ const tc = cards.reduce((s2, x) => s2 + (themeMatch(x.c, th) ? x.k : 0), 0); fit = tc / n >= 0.2 ? 1 : 0.4; }
      const val = fit * (a.share + (a.wr ?? 50) / 2);
      if(!best || val > best.val) best = {a, fit, val};
    }
    let metaS = 0.35;
    if(best && best.fit === 1) metaS = Math.min(1, (best.a.wr ?? 50) / 100 * 0.7 + Math.min(best.a.share, 25) / 25 * 0.3);
    else if(best) metaS = 0.4;
    let score = 100 * (0.75 * quality + 0.25 * metaS);
    if(n < 60) score -= (60 - n) * 0.5;
    if(illegal) score -= illegal * 0.5;
    if(inks.size > 2) score -= 15;
    score = Math.max(0, Math.round(score));
    const tier = score >= 72 ? 'S' : score >= 63 ? 'A' : score >= 54 ? 'B' : score >= 45 ? 'C' : 'D';
    return {score, tier, quality, arche: best && best.fit === 1 ? best.a : null, illegal, count: n, metaDate: m.date, live: !!m.live};
  }

  return {render, run, loadMeta, rateDeck, metaLoaded: () => !!META, state: st, reset(){ POWER = null; GROUPS = null; }};
})();
window.ASSIST = ASSIST;
