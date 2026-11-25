'use strict';
/* =========================================================
   Foxycana – Synergien
   Jede Karte bekommt
     has   = was sie IST (Klassifizierung, Schlüsselwort, Gegenstand, Ort, Lied, Name …)
     wants = was ihr TEXT braucht ("deine Prinzessinnen", "wenn du ein Lied spielst", Gestaltwandel …)
   Ein Deck ist stimmig, wenn die "wants" der Karten durch genug "has"-Karten im Deck bedient werden.
   ========================================================= */
const SYN = (() => {
  const SKIP_SUB = new Set(['Storyborn', 'Dreamborn', 'Song']);
  const KW_WANT = ['Evasive', 'Rush', 'Ward', 'Bodyguard', 'Challenger', 'Resist', 'Support', 'Reckless', 'Vanish', 'Boost'];
  // wie viele "has"-Karten ein Thema braucht, damit es trägt
  function need(tag){
    if(tag.startsWith('name:')) return 2;
    if(tag === 'location') return 5;
    if(tag === 'item') return 7;
    if(tag === 'song') return 7;
    if(tag === 'singer') return 5;
    if(tag === 'damage') return 6;
    return 9; // Klassifizierungen & Schlüsselwörter
  }
  const plural = w => /ss$|sh$|ch$|x$/.test(w) ? [w, w + 'es'] : /y$/.test(w) && !/[aeiou]y$/.test(w) ? [w, w.slice(0, -1) + 'ies'] : [w, w + 's'];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let SUB_RE = null;
  function subPatterns(){
    if(SUB_RE) return SUB_RE;
    const subs = new Set(); for(const c of S.cards) for(const x of (c.sub || [])) if(!SKIP_SUB.has(x)) subs.add(x);
    SUB_RE = [...subs].map(x => ({x, re: new RegExp('\\b(' + plural(x.toLowerCase()).map(escRe).join('|') + ')\\b', 'g')}));
    return SUB_RE;
  }
  // Steht vor dem Treffer "opposing/opponent/chosen"? Dann ist es Entfernung, keine Synergie.
  function hostile(t, idx){ const pre = t.slice(Math.max(0, idx - 28), idx); return /opposing|opponent|chosen (?:opposing )?$|banish|damaged? to/.test(pre); }

  function tagsOf(c){
    // Erinnerungstext in Klammern ignorieren – z. B. "(Only characters with Evasive can challenge …)" ist keine Synergie
    const t = ((c.txt && c.txt.en) || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
    const has = new Set(), wants = new Map();
    const want = (tag, w) => { if((wants.get(tag) || 0) < w) wants.set(tag, w); };
    for(const x of (c.sub || [])) if(!SKIP_SUB.has(x)) has.add('sub:' + x);
    if((c.sub || []).includes('Song')) has.add('song');
    for(const k of (c.kw || [])){ const b = kwBase(k); if(b) has.add('kw:' + b); if(b === 'Singer') has.add('singer'); }
    if(c.t === 'Item') has.add('item');
    if(c.t === 'Location') has.add('location');
    if(/deal \d+ damage|put \d+ damage|\d+ damage counters?/.test(t)) has.add('damage');
    has.add('name:' + ENGINE.norm(c.name.en));
    if(!t) return {has, wants};
    // Klassifizierungen im Text ("your Princess characters", "another Pirate" …)
    for(const {x, re} of subPatterns()){
      re.lastIndex = 0; let m;
      while((m = re.exec(t))){ if(!hostile(t, m.index)){ want('sub:' + x, 1); break; } }
    }
    // Schlüsselwörter, die gebraucht werden ("characters with Evasive")
    for(const k of KW_WANT){
      const kl = k.toLowerCase();
      if(new RegExp('(characters?|ones?|cards?) with ' + kl + '\\b|your ' + kl + ' characters').test(t)) want('kw:' + k, 1);
    }
    // Gegenstände
    if(/\b(your items?|an item|items? you have|for each item|play an item|item cards?|another item|other items?)\b/.test(t) && !/(chosen|opposing) item/.test(t)) want('item', 1);
    // Orte
    if(c.t !== 'Location' && /\bmove\b|\bmoves\b|at a location|your locations?|locations? you have|play a location|to a location|another location/.test(t)) want('location', 1);
    // Lieder
    if(c.t !== 'Action' && /\b(sing|sings|sung|play a song|song cards?|a song)\b/.test(t)) want('song', 1);
    if(has.has('singer')) want('song', 0.7);
    if(has.has('song')) want('singer', 0.4);
    // Schaden
    if(/(your|an opponent has a|opponents? have a) damaged|for each damage|damage on (it|them|this)/.test(t)) want('damage', 0.6);
    // Gestaltwandel: braucht eine andere Version mit gleichem Namen
    if((c.kw || []).some(k => kwBase(k) === 'Shift') || /\bshift \d/.test(t)) want('name:' + ENGINE.norm(c.name.en), 1);
    // "named X"
    for(const m of t.matchAll(/named ([a-z0-9' .\-]+?)(?:[,.;!]| and | or | in | from | to |$)/g)){
      const n = ENGINE.norm(m[1]); if(n && n !== ENGINE.norm(c.name.en)) want('name:' + n, 0.8);
    }
    return {has, wants};
  }

  function prepare(groups){
    SUB_RE = null;
    for(const g of groups.values()){ const tg = tagsOf(g.rep); g.has = tg.has; g.wants = tg.wants; g.nameKey = ENGINE.norm(g.rep.name.en); }
  }

  function label(tag){
    const [k, ...r] = tag.split(':'), v = r.join(':');
    if(k === 'sub') return subDe(v);
    if(k === 'kw') return kwDe(v);
    if(k === 'name'){ const c = S.cards.find(x => ENGINE.norm(x.name.en) === v); return (c ? cName(c) : v) + '-Versionen'; }
    return ({item:'Gegenstände', location:'Orte', song:'Lieder', singer:'Sänger', damage:'Schaden verteilen'})[k] || tag;
  }

  /* Deck bewerten: lines = [{g, n}] */
  function evaluate(lines, N){
    const hasCnt = new Map(), wantCnt = new Map();
    for(const x of lines){ for(const t of x.g.has) hasCnt.set(t, (hasCnt.get(t) || 0) + x.n); for(const t of x.g.wants.keys()) wantCnt.set(t, (wantCnt.get(t) || 0) + x.n); }
    let part = 0, orphan = 0;
    const orphans = [];
    for(const x of lines){
      // eigene Exemplare zählen bei "name:" nicht (Gestaltwandel braucht eine ANDERE Version)
      let sat = 0, wsum = 0, involved = false;
      for(const [t, w] of x.g.wants){
        let sup = hasCnt.get(t) || 0;
        if(t.startsWith('name:') || x.g.has.has(t)) sup -= x.n;
        const s = Math.min(1, sup / need(t));
        sat += s * w; wsum += w;
        if(s >= 0.6) involved = true;
        if(w >= 0.8 && s < 0.35){ orphan += x.n; orphans.push({g: x.g, tag: t, sup: Math.max(0, sup), n: x.n}); }
      }
      for(const t of x.g.has){ if(t.startsWith('name:')) continue; const wc = (wantCnt.get(t) || 0) - (x.g.wants.has(t) ? x.n : 0); if(wc >= 4) involved = true; }
      if(involved) part += x.n;
    }
    const total = lines.reduce((s, x) => s + x.n, 0) || 1;
    const packages = [];
    for(const [t, wc] of wantCnt){
      const hc = hasCnt.get(t) || 0;
      if(t.startsWith('name:')){ if(hc >= 4 && wc >= 1) packages.push({tag:t, has:hc, wants:wc}); continue; }
      if(wc >= 3 && hc >= Math.min(need(t), 5)) packages.push({tag:t, has:hc, wants:wc});
    }
    packages.sort((a, b) => (b.has + b.wants * 2) - (a.has + a.wants * 2));
    return {synergy: part / total, orphanShare: orphan / total, orphans, packages, hasCnt, wantCnt};
  }

  /* Deck bauen: pool = [{g, sc, lim, max}] – wählt Karte für Karte die mit dem besten Wert inkl. Synergie */
  function build(pool, o){
    const N = o.N, target = o.target, INKMIN = Math.round(N * 0.72);
    const deck = new Map(), hasCnt = new Map(), wantCnt = new Map(), bucket = Array(8).fill(0);
    let count = 0, nonInk = 0;
    const bk = g => Math.min(7, Math.max(1, g.rep.ct || 1));
    // was der Pool insgesamt hergibt (für "kann dieses Thema überhaupt tragen?")
    const avail = new Map(); for(const p of pool) for(const t of p.g.has) avail.set(t, (avail.get(t) || 0) + p.lim);
    const theme = o.theme;
    function value(p){
      const g = p.g, have = (deck.get(g.key) || {n:0}).n;
      let v = p.sc;
      // bedient Karten im Deck, die das hier brauchen
      let give = 0; for(const t of g.has){ const wc = wantCnt.get(t) || 0; if(wc){ const h = hasCnt.get(t) || 0; give += wc * (h < need(t) ? 0.05 : 0.015); } }
      v += Math.min(0.45, give);
      // wird selbst bedient (oder kann es noch werden)
      for(const [t, w] of g.wants){
        const h = (hasCnt.get(t) || 0) - (t.startsWith('name:') || g.has.has(t) ? have : 0);
        const pot = (avail.get(t) || 0) - (t.startsWith('name:') || g.has.has(t) ? p.lim : 0);
        if(pot < need(t) * 0.5) v -= 0.3 * w;                         // Thema geht mit diesen Karten nicht auf
        else v += w * (0.06 + 0.22 * Math.min(1, h / need(t)));
      }
      if(theme && (g.has.has(theme) || g.wants.has(theme))) v += 0.28;
      v += 0.035 * Math.min(3, have);                                   // lieber 3–4 Exemplare als viele Einzelstücke
      const b = bk(g); if(bucket[b] >= target[b] * 1.3) v -= 0.3; else if(bucket[b] >= target[b]) v -= 0.08;
      if(!g.rep.ink && nonInk >= N - INKMIN) v -= 0.5;
      return v;
    }
    function add(p, d){
      const g = p.g, cur = deck.get(g.key) || {p, n:0};
      cur.n += d; if(cur.n <= 0) deck.delete(g.key); else deck.set(g.key, cur);
      count += d; bucket[bk(g)] += d; if(!g.rep.ink) nonInk += d;
      for(const t of g.has) hasCnt.set(t, (hasCnt.get(t) || 0) + d);
      for(const t of g.wants.keys()) wantCnt.set(t, (wantCnt.get(t) || 0) + d);
    }
    // Vorgaben zuerst (angepinnte Karten)
    for(const p of pool) if(p.pin) add(p, Math.min(p.lim, N - count));
    function fill(){
      while(count < N){
        let best = null, bv = -1e9;
        for(const p of pool){ const have = (deck.get(p.g.key) || {n:0}).n; if(have >= p.lim) continue; const v = value(p); if(v > bv){ bv = v; best = p; } }
        if(!best) break;
        // zwei auf einmal, wenn möglich (stabilere Decks), sonst eine
        const have = (deck.get(best.g.key) || {n:0}).n;
        add(best, Math.min(have === 0 ? 2 : 1, best.lim - have, N - count));
      }
    }
    fill();
    // Aufräumen: Karten ohne Partner rauswerfen und neu auffüllen
    for(let round = 0; round < 6; round++){
      const lines = [...deck.values()].map(x => ({g:x.p.g, n:x.n}));
      const ev = evaluate(lines, N);
      const bad = ev.orphans.filter(o2 => !deck.get(o2.g.key).p.pin).sort((a, b) => deck.get(a.g.key).p.sc - deck.get(b.g.key).p.sc)[0];
      if(!bad || deck.get(bad.g.key).p.sc > 0.85) break;
      const p = deck.get(bad.g.key).p, n = deck.get(bad.g.key).n;
      add(p, -n); p.lim = 0;   // nicht wieder nehmen
      fill();
    }
    return deck;
  }

  return {prepare, evaluate, build, label, need, tagsOf};
})();
window.SYN = SYN;
