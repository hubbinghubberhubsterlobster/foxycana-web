'use strict';
/* =========================================================
   Foxycana – Erkennung: Texterkennung → Karte (DE/EN)
   ========================================================= */
const ENGINE = (() => {
  let IDX = null;

  function norm(s){
    return String(s || '').toUpperCase()
      .replace(/Ä/g,'A').replace(/Ö/g,'O').replace(/Ü/g,'U').replace(/ß/g,'SS')
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^A-Z0-9]+/g,' ').trim();
  }
  function bg(s){
    const t = s.replace(/ /g,''); const m = new Map();
    for(let i = 0; i < t.length - 1; i++){ const b = t.substr(i,2); m.set(b, (m.get(b) || 0) + 1); }
    if(t.length === 1) m.set(t, 1);
    return {m, n: Math.max(1, t.length - 1)};
  }
  function dice(A, B){
    if(!A.m.size || !B.m.size) return 0;
    let inter = 0;
    const [small, big] = A.m.size < B.m.size ? [A, B] : [B, A];
    for(const [k, v] of small.m){ const w = big.m.get(k); if(w) inter += Math.min(v, w); }
    return 2 * inter / (A.n + B.n);
  }
  function sim(target, tbg, line){
    if(line.n === target) return 1;
    if(line.n.length > target.length + 1 && (' ' + line.n + ' ').includes(' ' + target + ' ')) return 0.94;
    return dice(tbg, line.bg);
  }

  function build(){
    const names = new Map(), byNum = new Map(), byFull = new Map();
    for(const c of S.cards){
      for(const L of ['en','de']){
        const nn = norm(c.name[L]); if(nn.length < 2) continue;
        let e = names.get(nn);
        if(!e){ e = {n:nn, bg:bg(nn), ids:new Set(), langs:new Set()}; names.set(nn, e); }
        e.ids.add(c.id); e.langs.add(L);
        const fk = norm(c.name[L] + ' ' + (c.ver[L] || ''));
        if(!byFull.has(fk)) byFull.set(fk, []);
        if(!byFull.get(fk).includes(c)) byFull.get(fk).push(c);
      }
      if(c.n != null){ const k = c.s + '|' + c.n; if(!byNum.has(k)) byNum.set(k, []); byNum.get(k).push(c); }
    }
    IDX = {names:[...names.values()], byNum, byFull, fullKeys:[...byFull.keys()].map(k => ({k, bg:bg(k)}))};
    return IDX;
  }
  function idx(){ return IDX || build(); }

  /* Sammlernummer unten links, z. B. "12/204 • DE • 3" */
  function parseCollector(lines){
    for(const l of lines){
      let t = String(l.t || '').toUpperCase().replace(/[•·∙●◆|]/g,' ');
      t = t.replace(/(\d)O/g,'$10').replace(/O(\d)/g,'0$1');
      const m = t.match(/(\d{1,3})\s*[A-E]?\s*[\/⁄]\s*(\d{2,3})(.*)$/);
      if(!m) continue;
      const rest = m[3] || '';
      const lm = rest.match(/\b(EN|DE|FR|IT|JA|ZH)\b/);
      const sm = rest.match(/\b(Q\d{1,2}|\d{1,2})\s*$/) || rest.match(/(?:EN|DE|FR|IT|JA|ZH)\W*(Q?\d{1,2})/);
      return {num:+m[1], total:+m[2], lang: lm ? lm[1].toLowerCase() : '', set: sm ? sm[1] : ''};
    }
    return null;
  }

  function preferPrinting(cards){
    // Beim Scannen in ein Bundle: Drucke aus dem Set des Bundles zuerst
    if(window.SCAN_SET){ const inSet = cards.filter(c => c.s === window.SCAN_SET); if(inSet.length) cards = inSet; }
    return [...cards].sort((a, b) => {
      const sa = SPECIAL_RAR.has(a.r) ? 1 : 0, sb = SPECIAL_RAR.has(b.r) ? 1 : 0;
      if(sa !== sb) return sa - sb;
      const qa = /^\d+$/.test(a.s) ? +a.s : -1, qb = /^\d+$/.test(b.s) ? +b.s : -1;
      return qb - qa;
    })[0];
  }
  function sameNameLangs(c){ return norm(c.name.de) === norm(c.name.en) && norm(c.ver.de) === norm(c.ver.en); }

  /**
   * res: {lines:[{t,x,y,w,h}], w, h} aus der Texterkennung
   * Rückgabe: null | {empty:true} | {c, lang, strong, ambiguous, score}
   */
  function identify(res){
    const I = idx();
    const raw = (res && res.lines) || [];
    const lines = raw.map(l => {
      const n = norm(l.t).replace(/^\d{1,2}\s+/, '').replace(/\s+\d{1,2}$/, '');
      return {n, bg: bg(n)};
    }).filter(l => l.n.length >= 2);
    if(lines.length < 2) return {empty:true};

    const col = parseCollector(raw);

    // 1) Namen finden
    const cand = [];
    for(const e of I.names){
      let best = 0;
      for(const l of lines){ const s = sim(e.n, e.bg, l); if(s > best) best = s; }
      if(best >= 0.7) cand.push({e, s:best});
    }
    cand.sort((a, b) => b.s - a.s);

    // 2) Version (Untertitel) prüfen
    const scored = new Map();
    for(const {e, s} of cand.slice(0, 10)){
      for(const id of e.ids){
        const c = S.byId.get(id); if(!c) continue;
        for(const L of e.langs){
          if(norm(c.name[L]) !== e.n) continue;
          const vn = norm(c.ver[L]);
          let vs = 1;
          if(vn){
            const vb = bg(vn); vs = 0;
            for(const l of lines){ const x = sim(vn, vb, l); if(x > vs) vs = x; }
          }
          const total = vn ? s * 0.5 + vs * 0.5 : s * 0.92;
          const prev = scored.get(id);
          if(!prev || total > prev.total) scored.set(id, {c, L, s, vs, hasV: !!vn, total});
        }
      }
    }
    const list = [...scored.values()].sort((a, b) => b.total - a.total);

    let pick = null, strong = false, ambiguous = false;

    // 3) Sammlernummer nutzen, wenn lesbar
    if(col){
      if(col.set && S.sets[col.set]){
        const arr = I.byNum.get(col.set + '|' + col.num) || [];
        if(arr.length){
          const hit = list.find(x => arr.includes(x.c));
          if(hit){ pick = hit; strong = hit.total >= 0.62; }
          else if(arr.length === 1){ pick = {c:arr[0], L:null, total:0.75}; }
        }
      }
      if(!pick){
        const m = list.filter(x => x.c.n === col.num);
        if(m.length){
          pick = m[0];
          const others = m.filter(x => x.c !== m[0].c && x.total > m[0].total - 0.04);
          strong = m[0].total >= 0.78 && !others.length;
        }
      }
    }

    // 4) Nur über den Namen
    if(!pick && list.length){
      const best = list[0];
      if(best.total < 0.8) return null;
      const fk = norm(best.c.name.en + ' ' + best.c.ver.en);
      const same = list.filter(x => norm(x.c.name.en + ' ' + x.c.ver.en) === fk && x.total >= best.total - 0.03);
      const rival = list.find(x => norm(x.c.name.en + ' ' + x.c.ver.en) !== fk);
      if(rival && rival.total > best.total - 0.06) return null;
      if(same.length > 1){
        const pc = preferPrinting(same.map(x => x.c));
        pick = same.find(x => x.c === pc) || best; ambiguous = true;
      } else pick = best;
    }
    if(!pick) return null;

    // 5) Sprache
    let lang = '';
    if(col && (col.lang === 'de' || col.lang === 'en')) lang = col.lang;
    else if(pick.L && !sameNameLangs(pick.c)) lang = pick.L;
    const sl = S.settings.scanLang;
    if(sl !== 'auto') lang = sl;
    if(!lang) lang = S.settings.defaultLang;

    return {c: pick.c, lang, strong, ambiguous, score: pick.total, col};
  }

  /* Alle Drucke mit gleichem Namen (für "Druck prüfen") */
  function printings(c){
    const fk = norm(c.name.en + ' ' + c.ver.en);
    return S.cards.filter(x => norm(x.name.en + ' ' + x.ver.en) === fk);
  }

  /* Freitext-Suche nach Name */
  function findByName(text){
    const I = idx();
    const k = norm(text);
    if(I.byFull.has(k)) return I.byFull.get(k);
    const tb = bg(k); let best = null, bs = 0;
    for(const f of I.fullKeys){ const s = dice(tb, f.bg); if(s > bs){ bs = s; best = f.k; } }
    return bs >= 0.86 ? I.byFull.get(best) : null;
  }

  /* Deckliste: "4 Mickey Mouse - Brave Little Tailor" */
  function parseDecklist(text){
    const ok = [], bad = [];
    for(const raw of String(text || '').split(/\r?\n/)){
      const line = raw.trim(); if(!line || /^(#|\/\/)/.test(line)) continue;
      const m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      if(!m){ bad.push(line); continue; }
      const found = findByName(m[2]);
      if(found && found.length) ok.push({c: preferPrinting(found), n: +m[1]});
      else bad.push(line);
    }
    return {ok, bad};
  }

  /* CSV lesen (Komma, Semikolon oder Tab) */
  function parseCSV(text){
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cur = '', q = false;
    for(let i = 0; i < text.length; i++){
      const ch = text[i];
      if(q){
        if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if(ch === '"') q = true;
      else if(ch === sep){ row.push(cur); cur = ''; }
      else if(ch === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
      else if(ch !== '\r') cur += ch;
    }
    if(cur || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim()));
  }

  return { norm, identify, printings, findByName, parseDecklist, parseCSV, preferPrinting, parseCollector, reset(){ IDX = null; }, build };
})();
window.ENGINE = ENGINE;
