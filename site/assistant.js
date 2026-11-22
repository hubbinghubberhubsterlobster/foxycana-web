'use strict';
/* =========================================================
   Foxycana – Deck-Assistent
   1) Was ist gerade stark (Turnier-Meta)  2) Dein bestes Deck (automatisch)  3) Selbst bauen
   Kartenstärke = Spielwerte + Fähigkeiten + Marktnachfrage (Cardmarket-Preis
   innerhalb der Seltenheit – gefragte Turnierkarten sind teurer).
   ========================================================= */
const ASSIST = (() => {
  const INK_KEYS = Object.keys(INKS);
  const PAIRS = []; for(let i = 0; i < 6; i++) for(let j = i + 1; j < 6; j++) PAIRS.push([INK_KEYS[i], INK_KEYS[j]]);
  const STYLES = {
    auto:    {de:'Egal', info:'Foxycana wählt, was mit deinen Karten am besten passt', curve:[0,7,12,13,11,8,5,4]},
    aggro:   {de:'Schnell (Aggro)', info:'Früh viele günstige Charaktere, schnell 20 Legende sammeln', curve:[0,12,15,14,10,5,3,1]},
    midrange:{de:'Ausgewogen (Midrange)', info:'Starke Karten in jeder Spielphase, flexibel', curve:[0,7,12,13,11,8,5,4]},
    control: {de:'Kontrolle (Control)', info:'Gegner ausbremsen, Karten ziehen, spät gewinnen', curve:[0,5,10,11,11,9,7,7]}
  };
  // Meta-Stand (Fallback), Quelle: inkdecks.com Core-Meta, Stand 25.10.2026
  const META_FALLBACK = {date:'2026-10-25', source:'inkdecks.com', format:'core', list:[
    ['Evasive','Emerald','Steel',23,49],['Circle','Amber','Emerald',15,68],['Princesses','Amber','Sapphire',9,40],
    ['Shere Khan','Amethyst','Steel',9,47],['Midrange','Amber','Amethyst',7,58],['Retro','Amethyst','Emerald',6,59],
    ['Actions','Emerald','Ruby',4,55],['Merida','Amber','Amethyst',3,83],['Detectives','Amber','Sapphire',3,20],
    ['Midrange','Amethyst','Ruby',3,44],['Aggro','Amber','Steel',3,17],['Aggro','Amber','Emerald',2,58],['Actions','Amber','Ruby',2,64]
  ].map(([name, a, b, share, wr]) => ({name, inks:[a, b], share, wr}))};


  const st = {style:'auto', inks:[], format:'core', mode:'owned', prefs:{}, wish:'', pins:[], wishInfo:null,
    metaPick:null, results:null, sel:0, title:'', best:null, bestKey:''};
  let META = null, POWER = null, GROUPS = null;

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


  /* ---------- Wünsche: Schlüsselwörter, Kartentypen, Gruppen, Effekte ---------- */
  const EFFECTS = {
    removal:{de:'Gegner entfernen', re:/banish chosen|banish all|deal \d+ damage|return chosen .*to (their|its) player's hand/},
    draw:{de:'Karten ziehen', re:/draw (a|an|\d|two|three) cards?/},
    lore:{de:'Viel Legende', test: c => (c.lo || 0) >= 3 || /gain \d+ lore/.test((c.txt && c.txt.en || '').toLowerCase())},
    cheap:{de:'Günstige Karten (1–2)', test: c => (c.ct || 0) <= 2},
    big:{de:'Große Karten (6+)', test: c => (c.ct || 0) >= 6}
  };
  function prefLabel(key){
    const [kind, v] = key.split(':');
    if(kind === 'kw') return kwDe(v);
    if(kind === 'sub') return subDe(v);
    if(kind === 'type') return ({Action:'Aktionen', Item:'Gegenstände', Location:'Orte', Character:'Charaktere'})[v] || v;
    if(kind === 'song') return 'Lieder';
    if(kind === 'eff') return EFFECTS[v].de;
    return v;
  }
  function prefMatch(c, key){
    const [kind, v] = key.split(':');
    if(kind === 'kw') return (c.kw || []).some(k => kwBase(k) === v);
    if(kind === 'sub') return (c.sub || []).includes(v);
    if(kind === 'type') return c.t === v;
    if(kind === 'song') return (c.sub || []).includes('Song');
    if(kind === 'eff'){ const e = EFFECTS[v]; return e.re ? e.re.test(((c.txt && c.txt.en) || '').toLowerCase()) : e.test(c); }
    if(kind === 'name'){ const nm = ENGINE.norm(c.name.en); return v.split('|').some(x => nm.includes(x)); }
    return false;
  }
  function prefOptions(){
    const kwc = {}, subc = {};
    for(const c of S.cards){ (c.kw || []).forEach(k => { const b = kwBase(k); if(b) kwc[b] = (kwc[b] || 0) + 1; }); (c.sub || []).forEach(x => subc[x] = (subc[x] || 0) + 1); }
    const kws = Object.keys(kwc).filter(k => kwc[k] >= 5).sort((a, b) => kwDe(a).localeCompare(kwDe(b), 'de')).map(k => 'kw:' + k);
    const subs = Object.keys(subc).filter(k => subc[k] >= 8 && !/^(Storyborn|Dreamborn|Floodborn|Song)$/.test(k)).sort((a, b) => subDe(a).localeCompare(subDe(b), 'de')).map(k => 'sub:' + k);
    return {
      'Spielweise': Object.keys(EFFECTS).map(k => 'eff:' + k),
      'Schlüsselwörter': kws,
      'Kartentypen': ['type:Action', 'song:Song', 'type:Item', 'type:Location'],
      'Gruppen (Klassifizierungen)': subs
    };
  }
  // Archetyp-Name aus der Meta → passender Wunsch
  function metaPref(name){
    const n = String(name || '').trim(), low = n.toLowerCase();
    if(/^(aggro|midrange|control|retro|tempo|ramp|circle)$/.test(low)) return null;
    if(low === 'actions') return 'type:Action';
    if(low === 'songs') return 'song:Song';
    if(low === 'items') return 'type:Item';
    if(low === 'locations') return 'type:Location';
    const kws = new Set(); for(const c of S.cards) (c.kw || []).forEach(k => kws.add(kwBase(k)));
    for(const k of kws) if(k.toLowerCase() === low) return 'kw:' + k;
    const sing = low.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/s$/, '');
    const subs = new Set(); for(const c of S.cards) (c.sub || []).forEach(x => subs.add(x));
    for(const x of subs){ const xl = x.toLowerCase(); if(xl === low || xl === sing) return 'sub:' + x; }
    const names = n.split(/\s*&\s*|\s+and\s+|\s+und\s+/i).map(s => ENGINE.norm(s)).filter(Boolean);
    if(names.length && names.every(nm => S.cards.some(c => ENGINE.norm(c.name.en).includes(nm)))) return 'name:' + names.join('|');
    return null;
  }
  function metaNameDe(name){
    const low = String(name).toLowerCase();
    const fixed = {aggro:'Aggro (schnell)', midrange:'Midrange (ausgewogen)', control:'Kontrolle', actions:'Aktionen', songs:'Lieder', items:'Gegenstände', locations:'Orte'};
    if(fixed[low]) return fixed[low];
    const p = metaPref(name);
    if(p && (p.startsWith('kw:') || p.startsWith('sub:'))) return prefLabel(p);
    return name;
  }
  function metaTier(a){ if(a.share >= 15 || (a.share >= 5 && (a.wr || 0) >= 60)) return 'S'; if(a.share >= 7 || (a.wr || 0) >= 55) return 'A'; if(a.share >= 3) return 'B'; return 'C'; }

  /* ---------- Freitext: Karten und Wünsche erkennen ---------- */
  function parseWish(text){
    const pins = [], prefs = {}, unknown = [];
    const all = prefOptions(); const allKeys = Object.values(all).flat();
    for(let part of String(text || '').split(/[\n,;]+/)){
      part = part.trim(); if(!part) continue;
      let mode = 'rec';
      if(/^(kein|keine|ohne|nicht|vermeide)\b/i.test(part)){ mode = 'avoid'; part = part.replace(/^(kein|keine|ohne|nicht|vermeide)\s+/i, ''); }
      else if(/^(muss|nur|viele|unbedingt)\b/i.test(part)){ mode = 'req'; part = part.replace(/^(muss|nur|viele|unbedingt)\s+/i, ''); }
      const pn = ENGINE.norm(part);
      const exact = allKeys.find(k => ENGINE.norm(prefLabel(k)) === pn || ENGINE.norm(k.split(':')[1]) === pn);
      if(exact){ prefs[exact] = mode; continue; }
      let cards = ENGINE.findByName(part);
      if(!cards || !cards.length) cards = S.cards.filter(c => ENGINE.norm(c.name.de) === pn || ENGINE.norm(c.name.en) === pn);
      if(!cards.length){
        const key = allKeys.find(k => { const l = ENGINE.norm(prefLabel(k)); return pn.length >= 4 && l.length >= 4 && (l.startsWith(pn) || pn.startsWith(l)); });
        if(key){ prefs[key] = mode; continue; }
      }
      if(cards && cards.length){ const k = fk(ENGINE.preferPrinting(cards)); if(mode === 'avoid') prefs['name:' + ENGINE.norm(cards[0].name.en)] = 'avoid'; else if(!pins.includes(k)) pins.push(k); continue; }
      unknown.push(part);
    }
    return {pins, prefs, unknown};
  }

  /* ---------- Deck bauen ---------- */
  function adjScore(g, opt){
    const c = g.rep, cost = c.ct || 0, t = ((c.txt && c.txt.en) || '').toLowerCase();
    let s = g.power;
    if(opt.style === 'aggro'){ if(cost <= 3) s += 0.1; if(cost >= 6) s -= 0.15; if((c.lo || 0) >= 2) s += 0.06; if(/\b(rush|evasive)\b/i.test((c.kw||[]).join(' '))) s += 0.05; }
    if(opt.style === 'control'){ if(/banish|deal \d+ damage|draw|return chosen/.test(t)) s += 0.1; if(c.t === 'Character' && cost <= 2) s -= 0.05; if((c.wp || 0) >= 5) s += 0.04; }
    for(const [k, m] of Object.entries(opt.prefs || {})) if(prefMatch(c, k)) s += m === 'req' ? 0.4 : m === 'avoid' ? -0.7 : 0.18;
    if(opt.pins && opt.pins.includes(g.key)) s += 5;
    return s;
  }
  function buildDeck(pair, opt){
    const owned = opt.mode === 'owned';
    const target = STYLES[opt.style].curve;
    const pool = [];
    for(const g of GROUPS.values()){
      const inks = inkList(g.rep); if(!inks.length || !inks.every(k => pair.includes(k))) continue;
      if(!g.cards.some(c => setLegal(c.s, opt.format))) continue;
      const max = g.rep.max === undefined ? 4 : (g.rep.max == null ? 4 : Math.min(4, g.rep.max));
      let sc = adjScore(g, opt);
      if(!owned && g.owned) sc += 0.03 * Math.min(4, g.owned);
      pool.push({g, sc, max});
    }
    pool.sort((a, b) => b.sc - a.sc);
    const deck = new Map(), bucket = Array(8).fill(0); let count = 0;
    const b = g => Math.min(7, Math.max(1, g.rep.ct || 1));
    const add = (p, n) => { if(n <= 0) return 0; const cur = deck.get(p.g.key) || {p, n:0}; cur.n += n; deck.set(p.g.key, cur); bucket[b(p.g)] += n; count += n; return n; };
    const room = (p, slack) => Math.ceil(target[b(p.g)] * slack) - bucket[b(p.g)];
    const lim = p => owned && !(opt.pins && opt.pins.includes(p.g.key)) ? Math.min(p.max, p.g.owned) : p.max;
    for(const slack of [1.0, 1.35]){
      for(const p of pool){
        if(count >= 60) break;
        const have = (deck.get(p.g.key) || {n:0}).n, L = lim(p);
        const take = Math.min(L - have, room(p, slack), 60 - count);
        if(have === 0 && take < 2 && L >= 2 && slack === 1.0) continue;
        if(take > 0 && p.sc > 0.25) add(p, take);
      }
    }
    if(count < 60) for(const p of pool){ if(count >= 60) break; const have = (deck.get(p.g.key) || {n:0}).n; add(p, Math.min(lim(p) - have, 60 - count)); }
    if(count < 60) for(const p of pool){ if(count >= 60) break; if(p.sc < -0.2) continue; const have = (deck.get(p.g.key) || {n:0}).n; add(p, Math.min(p.max - have, 60 - count)); }
    let ink = 0; for(const x of deck.values()) if(x.p.g.rep.ink) ink += x.n;
    let guard = 0;
    while(ink < 44 && guard++ < 40){
      const weak = [...deck.values()].filter(x => !x.p.g.rep.ink && !(opt.pins && opt.pins.includes(x.p.g.key))).sort((a, z) => a.p.sc - z.p.sc)[0];
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
    const weakest = lines.length ? Math.min(...lines.map(x => x.sc)) : 0;
    const upgrades = pool.filter(p => p.sc > weakest + 0.05 && (deck.get(p.g.key) || {n:0}).n < p.max && p.g.owned < p.max)
      .slice(0, 10).map(p => ({g:p.g, sc:p.sc}));
    return {pair, lines, total, ownedCopies, quality, missCost, ink, upgrades, opt};
  }
  function rank(r, mode){ return mode === 'owned' ? r.quality * 0.6 + (r.ownedCopies / 60) * 0.4 : r.quality; }
  function runWith(opt, inks, n){
    ensure();
    let pairs = PAIRS;
    if(inks.length === 2) pairs = [inks];
    else if(inks.length === 1) pairs = PAIRS.filter(p => p.includes(inks[0]));
    const res = pairs.map(p => buildDeck(p, opt)).filter(r => r.total >= 40);
    res.sort((a, b) => rank(b, opt.mode) - rank(a, opt.mode));
    return res.slice(0, n);
  }
  function asDeck(r){ const d = {cards:{}}; for(const x of r.lines){ const c = x.g.ownCard || x.g.rep; d.cards[c.id] = (d.cards[c.id] || 0) + x.n; } return d; }

  /* ---------- Deck analysieren: Eigenschaften & Spielanleitung ---------- */
  function analyze(cards){ // cards: [{c, n}]
    let n = 0, cost = 0, ink = 0, lore = 0, chars = 0; const kw = {}, sub = {}, eff = {removal:0, draw:0}, types = {};
    for(const {c, n: k} of cards){
      n += k; cost += (c.ct || 0) * k; if(c.ink) ink += k; types[c.t] = (types[c.t] || 0) + k;
      if(c.t === 'Character'){ chars += k; lore += (c.lo || 0) * k; }
      (c.kw || []).forEach(x => { const b = kwBase(x); kw[b] = (kw[b] || 0) + k; });
      (c.sub || []).forEach(x => { if(!/^(Storyborn|Dreamborn|Floodborn|Hero|Villain|Ally)$/.test(x)) sub[x] = (sub[x] || 0) + k; });
      const t = ((c.txt && c.txt.en) || '').toLowerCase();
      if(EFFECTS.removal.re.test(t)) eff.removal += k; if(EFFECTS.draw.re.test(t)) eff.draw += k;
    }
    const avg = n ? cost / n : 0;
    const style = avg < 3.1 ? 'aggro' : avg > 4.1 ? 'control' : 'midrange';
    return {n, avg, ink, lore: chars ? lore / chars : 0, chars, kw, sub, eff, types, style, songs: sub.Song || 0};
  }
  function features(a){
    const f = [];
    f.push(`${({aggro:'⚡ Schnell (Aggro)', midrange:'⚖️ Ausgewogen (Midrange)', control:'🛡️ Kontrolle'})[a.style]} · Ø Kosten ${a.avg.toFixed(1).replace('.', ',')}`);
    const topKw = Object.entries(a.kw).filter(([k]) => !/^(Shift|Singer|Boost)$/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 2);
    for(const [k, v] of topKw) if(v >= 6) f.push(`${v}× ${kwDe(k)}`);
    if(a.eff.removal >= 6) f.push(`${a.eff.removal}× Gegner entfernen`);
    if(a.eff.draw >= 6) f.push(`${a.eff.draw}× Karten ziehen`);
    if(a.songs >= 6) f.push(`${a.songs}× Lieder`);
    const topSub = Object.entries(a.sub).filter(([k]) => k !== 'Song').sort((x, y) => y[1] - x[1])[0];
    if(topSub && topSub[1] >= 10) f.push(`${topSub[1]}× ${subDe(topSub[0])}`);
    if((a.types.Item || 0) >= 6) f.push(`${a.types.Item}× Gegenstände`);
    if((a.types.Location || 0) >= 4) f.push(`${a.types.Location}× Orte`);
    return f;
  }
  function guide(cards){
    if(!cards.length) return '';
    const a = analyze(cards); const p = [];
    const plan = {
      aggro: 'Du willst <b>schnell 20 Legende</b> sammeln, bevor sich der Gegner sortiert. Spiele in den ersten Zügen günstige Charaktere und schick sie sofort auf Legendensuche (erschöpfen = questen). Herausforderungen nur, wenn sie dir einen klaren Vorteil bringen – jede Runde ohne Legende ist verloren.',
      midrange: 'Du spielst <b>flexibel</b>: früh solide Charaktere, in der Mitte des Spiels die stärksten Karten. Sammle stetig Legende, aber räume gefährliche Gegner-Charaktere mit Herausforderungen oder Entfernung ab. Entscheide jede Runde: Was bringt mehr – Legende oder den Gegner bremsen?',
      control: 'Du spielst auf <b>Zeit</b>: Bremse den Gegner mit Entfernung und günstigen Blockern, zieh Karten und gewinne später mit deinen großen, starken Karten. Nicht hetzen – erst wenn das Spielfeld sicher ist, fängst du richtig an, Legende zu sammeln.'
    }[a.style];
    p.push(`<p><b>Plan:</b> ${plan}</p>`);
    p.push(`<p><b>Tintenfass:</b> ${a.ink} von ${a.n} Karten sind tintenfähig${a.ink < 44 ? ' – eher wenig, pass auf, dass du früh genug Tinte bekommst' : ''}. Lege in den ersten 4–5 Zügen jede Runde eine Karte ins Tintenfass – am besten Doppelte oder Karten, die du erst spät brauchst.</p>`);
    p.push(`<p><b>Starthand:</b> ${a.style === 'aggro' ? 'Behalte Karten mit Kosten 1–3. Tausche alles ab 5 Kosten aus.' : a.style === 'control' ? 'Behalte Entfernung, Karten-Zieher und 2–3er Blocker. Sehr teure Karten (7+) lieber austauschen.' : 'Behalte eine gute Mischung aus 1–4 Kosten. Mehr als eine Karte mit 6+ Kosten lieber austauschen.'}</p>`);
    const mech = [];
    const has = k => (a.kw[k] || 0) >= 3;
    if(has('Evasive')) mech.push(`<b>${kwDe('Evasive')}</b>: Diese Charaktere können nur von anderen mit ${kwDe('Evasive')} herausgefordert werden – perfekt, um ungestört Legende zu sammeln.`);
    if(has('Rush')) mech.push(`<b>${kwDe('Rush')}</b>: Kann sofort herausfordern – nutze das, um gegnerische Quester direkt abzuräumen.`);
    if(has('Ward')) mech.push(`<b>${kwDe('Ward')}</b>: Gegner können diese Charaktere nicht mit Effekten auswählen – schwer zu entfernen.`);
    if(has('Bodyguard')) mech.push(`<b>${kwDe('Bodyguard')}</b>: Kann erschöpft ins Spiel kommen und muss zuerst herausgefordert werden – schützt deine wichtigen Charaktere.`);
    if(has('Challenger')) mech.push(`<b>${kwDe('Challenger')}</b>: Bekommt beim Herausfordern zusätzliche Stärke – gut zum Abräumen.`);
    if(has('Resist')) mech.push(`<b>${kwDe('Resist')}</b>: Nimmt weniger Schaden – hält lange auf dem Feld.`);
    if(has('Support')) mech.push(`<b>${kwDe('Support')}</b>: Gibt beim Questen seine Stärke an einen anderen Charakter weiter.`);
    if(has('Shift')) mech.push(`<b>${kwDe('Shift')}</b>: Lege die starke Version günstiger direkt auf einen Charakter mit gleichem Namen – sie übernimmt dessen Zustand und kann oft sofort loslegen.`);
    if(has('Singer') || a.songs >= 4) mech.push(`<b>Lieder & ${kwDe('Singer')}</b>: Lieder kannst du statt mit Tinte auch gratis singen lassen, indem du einen passenden Charakter erschöpfst – spart viel Tinte.`);
    if(has('Reckless')) mech.push(`<b>${kwDe('Reckless')}</b>: Kann keine Legende sammeln und muss herausfordern – setze diese Charaktere gezielt zum Abräumen ein.`);
    if(a.eff.removal >= 6) mech.push(`<b>Entfernung</b> (${a.eff.removal} Karten): Heb sie dir für die gefährlichsten Gegner-Charaktere auf, nicht für den ersten.`);
    if(a.eff.draw >= 6) mech.push(`<b>Karten ziehen</b> (${a.eff.draw} Karten): Halte deine Hand voll, besonders wenn das Spiel länger dauert.`);
    if((a.types.Item || 0) >= 6) mech.push(`<b>Gegenstände</b>: Bleiben dauerhaft liegen – früh ausspielen, damit sie lange wirken.`);
    if((a.types.Location || 0) >= 4) mech.push(`<b>Orte</b>: Bringen jede Runde Legende. Bewege Charaktere dorthin und beschütze sie.`);
    if(mech.length) p.push(`<p><b>Die Technik:</b></p><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5">${mech.map(m => `<li>${m}</li>`).join('')}</ul>`);
    if(!POWER || !GROUPS) buildPower();
    const key = [...cards].map(x => ({x, g: GROUPS.get(fk(x.c))})).filter(y => y.g).sort((u, v) => v.g.power - u.g.power).slice(0, 4);
    if(key.length) p.push(`<p><b>Schlüsselkarten:</b> ${key.map(y => `${esc(cName(y.x.c))}${cVer(y.x.c) ? ' – ' + esc(cVer(y.x.c)) : ''}`).join(', ')}. Diese Karten tragen das Deck – spiele sie zum richtigen Zeitpunkt und schütze sie.</p>`);
    return `<div class="playguide">${p.join('')}</div>`;
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
      const pk = metaPref(a.name); let fit = 1;
      if(pk){ const tc = cards.reduce((s2, x) => s2 + (prefMatch(x.c, pk) ? x.k : 0), 0); fit = tc / n >= 0.2 ? 1 : 0.4; }
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
    const arche = best && best.fit === 1 ? Object.assign({}, best.a, {name: metaNameDe(best.a.name)}) : null;
    return {score, tier, quality, arche, illegal, count: n, metaDate: m.date, live: !!m.live};
  }

  /* ---------- Oberfläche ---------- */
  const inkDot = k => `<i class="dot" style="background:${INKS[k].c};width:14px;height:14px"></i>`;
  const pairLabel = p => p.map(k => INKS[k].de).join(' & ');
  const TC = {S:'#F5D58E', A:'#3CCB7F', B:'#1C8FD6', C:'#9A9CB8', D:'#FF6B6B'};
  function chips(name, opts, cur){ return `<div class="chips" style="flex-wrap:wrap">${opts.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="as-set" data-k="${name}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`; }
  function stars(q){ const n = Math.max(1, Math.min(5, Math.round(q * 6.5 - 0.5))); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function collKey(){ return Object.values(S.coll).reduce((s, e) => s + e.q, 0) + ':' + Object.keys(S.coll).length + ':' + Object.keys(S.prices).length; }
  function resultCard(r, i, act){
    const d = asDeck(r), rt = rateDeck(d), a = analyze(r.lines.map(x => ({c:x.g.rep, n:x.n})));
    return `<button class="deck-item" data-act="${act}" data-i="${i}" style="align-items:flex-start">
      <div style="text-align:center;min-width:40px"><div style="font-weight:800;font-size:22px;color:${TC[rt.tier]}">${rt.tier}</div><div class="tiny muted">${rt.score}</div></div>
      <div class="grow"><div class="row" style="gap:6px">${inkDot(r.pair[0])}${inkDot(r.pair[1])}<b>${esc(pairLabel(r.pair))}</b></div>
        ${rt.arche ? `<div class="tiny" style="color:var(--gold2);margin-top:2px">≈ Meta-Deck „${esc(rt.arche.name)}“</div>` : ''}
        <div class="row wrap" style="gap:4px;margin-top:6px">${features(a).map(f => `<span class="tag">${esc(f)}</span>`).join('')}</div>
        <div class="tiny muted" style="margin-top:6px">${r.ownedCopies}/60 Karten hast du${r.total - r.ownedCopies ? ` · <span class="miss">${r.total - r.ownedCopies} fehlen (ca. ${money(r.missCost)})</span>` : ' · <span style="color:var(--good)">komplett spielbar ✓</span>'}</div></div><span class="muted">›</span></button>`;
  }
  function render(){
    if(!S.cards.length) return;
    if(S.ui.assist === 'results') return renderResults();
    if(S.ui.assist === 'deck') return renderDeckView();
    const m = META;
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">✨ Deck-Assistent</h1></div>

      <div class="card"><div class="row between"><b>🏆 Gerade stark in Turnieren</b><span class="tiny muted">${m ? (m.live ? 'aktuell · ' : 'Stand ') + fmtDate(m.date) : 'lädt …'}</span></div>
        <p class="tiny muted" style="margin:4px 0 6px">Das sind <b>keine Empfehlungen für dich</b>, sondern die Decks, die Turnierspieler gerade am meisten spielen (inkdecks.com, Format ${st.format === 'core' ? 'Core' : 'Infinity'}). <b>Anteil</b> = wie oft gespielt, <b>Siege</b> = wie oft gewonnen. Rechts siehst du, wie viele der 60 Karten du dafür schon hast. Tippe ein Deck an, um es zu sehen.</p>
        <div id="as-meta">${m ? metaList(m) : '<div class="loader" style="width:24px;height:24px;border-width:3px;margin:10px auto"></div>'}</div></div>

      <h2>✨ Dein bestes Deck</h2>
      <p class="tiny muted" style="margin-top:-6px">Automatisch aus deiner Sammlung gebaut – die stärksten Decks, die du jetzt schon (fast) komplett spielen kannst.</p>
      <div id="as-best">${st.best && st.bestKey === collKey() ? st.best.map((r, i) => resultCard(r, i, 'as-best')).join('') : '<div class="boot" style="min-height:90px"><div class="loader" style="width:28px;height:28px"></div><span class="small muted">Rechne …</span></div>'}</div>

      <h2>🛠️ Selbst bauen</h2>
      <div class="card">
        <label class="lbl" style="margin-top:0">Spielstil</label>${chips('style', Object.entries(STYLES).map(([k, v]) => [k, v.de]), st.style)}
        <div class="tiny muted" style="margin-top:4px">${esc(STYLES[st.style].info)}</div>
        <label class="lbl">Farben (0–2 wählen, leer = Foxycana sucht die beste Kombination)</label><div class="chips">${INK_KEYS.map(k => `<button class="ink ${st.inks.includes(k) ? 'on' : ''}" data-act="as-ink" data-ink="${k}"><i style="background:${INKS[k].c}"></i></button>`).join('')}<span class="small muted" style="align-self:center">${st.inks.map(k => INKS[k].de).join(' & ') || 'Automatisch'}</span></div>
        <label class="lbl">Was soll das Deck können? <span class="tiny">Tippen: <span style="color:var(--gold)">Empfehlen</span> → <span style="color:var(--good)">Vorgeben</span> → <span style="color:var(--bad)">Vermeiden</span> → aus</span></label>
        ${Object.entries(prefOptions()).map(([grp, keys]) => keys.length ? `<div class="tiny muted" style="margin:8px 0 4px">${esc(grp)}</div><div class="chips" style="flex-wrap:wrap">${keys.map(k => { const md = st.prefs[k]; return `<button class="chip pref ${md || ''}" data-act="as-pref" data-k="${esc(k)}">${md === 'req' ? '✓ ' : md === 'avoid' ? '✕ ' : md === 'rec' ? '★ ' : ''}${esc(prefLabel(k))}</button>`; }).join('')}</div>` : '').join('')}
        <label class="lbl">Eigene Wünsche (frei schreiben)</label>
        <textarea class="field" id="as-wish" style="min-height:90px;font-family:inherit" placeholder="z. B.:&#10;Elsa – Schneekönigin&#10;viele Lieder&#10;keine Gegenstände&#10;Stitch">${esc(st.wish)}</textarea>
        <div class="tiny muted" style="margin-top:4px">Eine Sache pro Zeile oder mit Komma. Kartennamen kommen auf jeden Fall rein. „viele …“/„muss …“ = vorgeben, „keine …“/„ohne …“ = vermeiden.</div>
        ${st.wishInfo ? `<div class="tiny" style="margin-top:6px">${st.wishInfo}</div>` : ''}
        <label class="lbl">Karten</label>${chips('mode', [['owned','Nur meine Karten'],['best','Bestes Deck (mit Kauftipps)']], st.mode)}
        <label class="lbl">Format</label>${chips('format', [['core','Core (aktuelle Sets)'],['infinity','Infinity (alle Sets)']], st.format)}
        <button class="btn block" style="margin-top:16px" data-act="as-run">Decks bauen</button>
      </div>
      <p class="tiny muted">So bewertet Foxycana Karten: Spielwerte und Fähigkeiten plus Nachfrage auf Cardmarket (gefragte Turnierkarten sind innerhalb ihrer Seltenheit teurer). Das ist eine Einschätzung, keine Garantie.</p>`;
    const w = $('#as-wish'); if(w) w.oninput = () => { st.wish = w.value; };
    if(m && !m.list.length) $('#as-meta').innerHTML = '<div class="tiny muted">Keine Meta-Daten verfügbar.</div>';
    if(!m) loadMeta().then(() => { if(S.ui.assist === 'wizard') render(); });
    else if(!st.metaHave || st.metaHaveKey !== collKey() + st.format) setTimeout(computeMetaHave, 30);
    if(!(st.best && st.bestKey === collKey())) setTimeout(computeBest, 60);
  }
  function computeBest(){
    if(S.ui.assist !== 'wizard') return;
    st.best = runWith({style:'auto', prefs:{}, pins:[], format: st.format, mode:'owned'}, [], 3);
    st.bestKey = collKey();
    const el = $('#as-best'); if(el) el.innerHTML = st.best.length ? st.best.map((r, i) => resultCard(r, i, 'as-best')).join('') : '<div class="empty">Noch zu wenige Karten für ein Deck – scanne mehr Karten oder füge Fertigdecks hinzu.</div>';
  }
  function metaOpt(a, mode){ const pk = metaPref(a.name); return {style: /aggro/i.test(a.name) ? 'aggro' : /control/i.test(a.name) ? 'control' : 'midrange', prefs: pk ? {[pk]:'rec'} : {}, pins:[], format: st.format, mode}; }
  function computeMetaHave(){
    if(!META || S.ui.assist !== 'wizard') return;
    ensure();
    st.metaHave = META.list.slice(0, 10).map(a => { const r = buildDeck(a.inks, metaOpt(a, 'best')); return r.ownedCopies; });
    st.metaHaveKey = collKey() + st.format;
    const el = $('#as-meta'); if(el) el.innerHTML = metaList(META);
  }
  function metaList(m){
    return m.list.slice(0, 10).map((a, i) => { const t = metaTier(a), have = st.metaHave && st.metaHaveKey === collKey() + st.format ? st.metaHave[i] : null;
      return `<button class="item" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)" data-act="as-meta" data-i="${i}">
      <div style="min-width:24px;text-align:center;font-weight:800;color:${TC[t]}">${t}</div>${inkDot(a.inks[0])}${inkDot(a.inks[1])}
      <div class="grow"><b class="small">${esc(metaNameDe(a.name))}</b>${metaNameDe(a.name) !== a.name ? ` <span class="tiny muted">(${esc(a.name)})</span>` : ''}<div class="tiny muted">${esc(pairLabel(a.inks))} · ${a.share}% Anteil · <span style="color:${a.wr == null ? 'var(--muted)' : a.wr >= 55 ? 'var(--good)' : a.wr < 45 ? 'var(--bad)' : 'var(--text)'}">${a.wr == null ? '–' : a.wr + '%'} Siege</span></div></div>
      <div style="text-align:right;min-width:52px" class="tiny">${have == null ? '' : `<b style="color:${have >= 54 ? 'var(--good)' : have >= 30 ? 'var(--gold)' : 'var(--muted)'}">${have}/60</b><br><span class="muted">hast du</span>`}</div></button>`; }).join('');
  }
  function renderResults(){
    const rs = st.results || [];
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow ell">Vorschläge</h1></div>
      <div class="muted small" style="margin:-6px 0 12px">${esc(st.title)} · ${st.mode === 'owned' ? 'aus deinen Karten' : 'bestes Deck mit Kauftipps'} · ${st.format === 'core' ? 'Core' : 'Infinity'}</div>
      ${rs.length ? rs.map((r, i) => resultCard(r, i, 'as-open')).join('') : `<div class="empty"><div class="icon">🤔</div>Mit diesen Einstellungen kommt kein Deck zustande. Wähle andere Farben, weniger Vorgaben oder „Bestes Deck“.</div>`}`;
  }
  function renderDeckView(){
    const r = (st.results || [])[st.sel]; if(!r){ S.ui.assist = 'results'; return renderResults(); }
    const lines = [...r.lines].sort((a, b) => (a.g.rep.ct || 0) - (b.g.rep.ct || 0) || cName(a.g.rep).localeCompare(cName(b.g.rep), 'de'));
    const cards = lines.map(x => ({c: x.g.ownCard || x.g.rep, n: x.n}));
    const rt = rateDeck(asDeck(r)), a = analyze(cards);
    const curve = Array(9).fill(0); lines.forEach(x => curve[Math.min(8, x.g.rep.ct || 0)] += x.n); const mx = Math.max(1, ...curve);
    view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow ell">${esc(st.metaPick ? metaNameDe(st.metaPick.name) : pairLabel(r.pair))}</h1></div>
      <div class="hero"><div class="row between"><div><div class="lbl">Stufe ${rt.tier} · ${esc(pairLabel(r.pair))}</div><div class="big">${rt.score}<span style="font-size:16px"> /100</span></div></div><div style="font-size:40px;font-weight:800;color:${TC[rt.tier]}">${rt.tier}</div></div>
        <div class="stats"><div><b>${r.total}</b>Karten</div><div><b>${r.ink}</b>tintenfähig</div><div><b style="color:${r.total - r.ownedCopies ? 'var(--bad)' : 'var(--good)'}">${r.total - r.ownedCopies}</b>fehlen</div></div>
        ${r.missCost ? `<div class="tiny" style="color:#ffc9c9;margin-top:8px">Fehlende Karten kosten ca. ${money(r.missCost)}</div>` : ''}</div>
      <div class="row wrap" style="gap:6px;margin-bottom:12px">${features(a).map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>
      ${rt.arche ? `<div class="card small" style="margin-bottom:12px">🏆 Entspricht dem Meta-Deck <b>${esc(rt.arche.name)}</b> – ${rt.arche.share}% der Turnierdecks, ${rt.arche.wr ?? '–'}% Siege.</div>` : ''}
      <details class="guide-box"><summary>📖 So spielst du dieses Deck</summary>${guide(cards)}</details>
      <div class="row" style="gap:8px"><button class="btn grow" data-act="as-save">Als Deck speichern</button>${st.mode === 'owned' ? `<button class="btn ghost" data-act="as-alt">Mit Kauftipps</button>` : `<button class="btn ghost" data-act="as-alt">Nur meine</button>`}</div>
      <div class="card" style="margin-top:12px"><b class="small">Kostenkurve</b><div class="curve">${curve.map((n, i) => `<div><span>${n || ''}</span><i style="height:${Math.round(n / mx * 56)}px"></i>${i === 8 ? '8+' : i}</div>`).join('')}</div></div>
      <h3>Deckliste</h3>${lines.map(x => `<div class="deck-line"><span class="cost">${x.g.rep.ct ?? '–'}</span><img src="${esc(cThumb(x.g.ownCard || x.g.rep))}" loading="lazy" data-act="card" data-id="${(x.g.ownCard || x.g.rep).id}">
        <div class="grow" data-act="card" data-id="${(x.g.ownCard || x.g.rep).id}"><div class="ell"><b>${x.n}× ${esc(cName(x.g.rep))}</b></div><div class="tiny muted ell">${esc(cVer(x.g.rep))}${x.miss ? ` <span class="miss">· ${x.miss} fehlt (${money((x.g.price || 0) * x.miss)})</span>` : ''}</div></div>
        <span class="tag">${Math.round(x.g.power * 100)}</span></div>`).join('')}
      ${r.upgrades.length ? `<h3>Lohnt sich noch</h3><p class="tiny muted" style="margin-top:-4px">Starke Karten in diesen Farben, die dir fehlen – sortiert nach Stärke.</p>${r.upgrades.map(u => `<div class="deck-line" data-act="card" data-id="${u.g.rep.id}"><img src="${esc(cThumb(u.g.rep))}" loading="lazy"><div class="grow"><div class="ell"><b>${esc(cName(u.g.rep))}</b></div><div class="tiny muted ell">${esc(cVer(u.g.rep))} · Stärke ${Math.round(u.g.power * 100)} · du hast ${u.g.owned}</div></div><span class="gold small">${money(u.g.price)}</span></div>`).join('')}` : ''}`;
  }

  /* ---------- Aktionen ---------- */
  function busy(text){ view.innerHTML = `<div class="boot" style="min-height:50vh"><div class="loader"></div>${esc(text)}</div>`; }
  A['assist-open'] = () => { go({tab:'decks', deck:null, assist:'wizard'}); if(!META) loadMeta().then(() => { if(S.ui.assist === 'wizard') render(); }); };
  A['as-set'] = el => { st[el.dataset.k] = el.dataset.v; if(el.dataset.k === 'format'){ META = null; st.best = null; st.metaHave = null; } render(); };
  A['as-ink'] = el => { const k = el.dataset.ink; st.inks = st.inks.includes(k) ? st.inks.filter(x => x !== k) : [...st.inks, k].slice(-2); render(); };
  A['as-pref'] = el => { const k = el.dataset.k, order = [undefined, 'rec', 'req', 'avoid']; const nx = order[(order.indexOf(st.prefs[k]) + 1) % 4]; if(nx) st.prefs[k] = nx; else delete st.prefs[k]; const y = window.scrollY; render(); window.scrollTo(0, y); };
  A['as-run'] = () => {
    ensure();
    const wish = parseWish(st.wish);
    const prefs = Object.assign({}, st.prefs, wish.prefs);
    const info = [];
    if(wish.pins.length) info.push('Karten: ' + wish.pins.map(k => esc(cName(GROUPS.get(k).rep))).join(', '));
    if(Object.keys(wish.prefs).length) info.push('Wünsche: ' + Object.entries(wish.prefs).map(([k, m]) => (m === 'avoid' ? 'ohne ' : m === 'req' ? 'viele ' : '') + esc(prefLabel(k))).join(', '));
    if(wish.unknown.length) info.push('<span style="color:var(--bad)">Nicht erkannt: ' + wish.unknown.map(esc).join(', ') + '</span>');
    st.wishInfo = info.join('<br>'); st.metaPick = null;
    const parts = [STYLES[st.style].de, ...Object.entries(prefs).filter(([, m]) => m !== 'avoid').map(([k]) => prefLabel(k))];
    st.title = parts.join(' · ');
    busy('Baue Decks aus deinen Karten …');
    setTimeout(() => { st.results = runWith({style: st.style, prefs, pins: wish.pins, format: st.format, mode: st.mode}, st.inks, st.inks.length === 2 ? 1 : 3); st.sel = 0; go({assist:'results'}); }, 30);
  };
  A['as-best'] = el => { st.results = st.best; st.sel = +el.dataset.i; st.metaPick = null; st.title = 'Dein bestes Deck'; st.mode = 'owned'; go({assist:'deck'}); };
  A['as-meta'] = el => {
    const a = META.list[+el.dataset.i]; if(!a) return;
    st.metaPick = a; st.title = 'Meta-Deck: ' + metaNameDe(a.name);
    busy('Baue „' + metaNameDe(a.name) + '“ …');
    setTimeout(() => { ensure(); st.results = [buildDeck(a.inks, metaOpt(a, st.mode))]; st.sel = 0; go({assist:'deck'}); }, 30);
  };
  A['as-alt'] = () => {
    const r = st.results[st.sel]; st.mode = st.mode === 'owned' ? 'best' : 'owned';
    ensure(); const opt = Object.assign({}, r.opt, {mode: st.mode});
    st.results[st.sel] = buildDeck(r.pair, opt); render();
  };
  A['as-open'] = el => { st.sel = +el.dataset.i; go({assist:'deck'}); };
  A['as-save'] = async () => {
    const r = st.results[st.sel];
    const def = (st.metaPick ? metaNameDe(st.metaPick.name) + ' ' : '') + pairLabel(r.pair).replace(' & ', '/');
    const name = await promptText('Deck speichern', def); if(!name) return;
    const d = {id:'d' + Date.now(), name, cards: asDeck(r).cards, src:'assistant', created: Date.now()};
    S.decks.unshift(d); persist(); toast('Deck gespeichert ✓ – freie Karten wurden zugeordnet');
    go({tab:'decks', assist:null, deck: d.id});
  };

  return {render, loadMeta, rateDeck, guide, analyze, features, metaLoaded: () => !!META, state: st, reset(){ POWER = null; GROUPS = null; st.best = null; st.metaHave = null; }};
})();
window.ASSIST = ASSIST;
