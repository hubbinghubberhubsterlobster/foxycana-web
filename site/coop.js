'use strict';
/* =========================================================
   Foxycana – Koop / Duelle
   Sammlung einer anderen Person importieren (Foxycana-Backup oder CSV) und
   ausgeglichene Decks finden, die gegeneinander Spaß machen – je eins pro Person.
   Diese Decks erscheinen nur hier, nicht unter "Decks".
   ========================================================= */
function partnerById(id){ return S.partners.find(p => p.id === id); }
function partnerEntries(p){
  const out = [];
  for(const [k, e] of Object.entries(p.coll || {})){ const [id, lang, f] = k.split('|'); const c = S.byId.get(+id) || S.byId.get(id); if(c) out.push({c, lang, foil: f === '1', q: e.q, k}); }
  return out;
}
function partnerByKey(p){ const m = new Map(); for(const e of partnerEntries(p)){ const k = gkey(e.c); m.set(k, (m.get(k) || 0) + e.q); } return m; }
function partnerQty(p){ const m = new Map(); for(const e of partnerEntries(p)) m.set(e.c.id, (m.get(e.c.id) || 0) + e.q); return m; }
function partnerStats(p){ let total = 0, value = 0; for(const e of partnerEntries(p)){ total += e.q; value += (priceEUR(e.c, e.foil) || 0) * e.q; } return {total, value}; }
const STYLE_DE = {aggro:'⚡ Aggro', midrange:'⚖️ Midrange', control:'🛡️ Kontrolle'};

/* ---------- Übersicht ---------- */
function renderCoop(){
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">🤝 Koop-Decks</h1></div>
    <p class="muted small" style="margin-top:-4px">Lade die Sammlung von jemand anderem und Foxycana sucht je ein Deck für euch beide, die gut gegeneinander funktionieren – ausgeglichen und mit Spaß. Diese Decks erscheinen nur hier.</p>
    <button class="btn block" data-act="coop-new" style="margin-bottom:14px">➕ Mitspieler hinzufügen</button>
    ${S.partners.map(p => { const st = partnerStats(p), n = S.decks.filter(d => d.coop === p.id && d.side === 'me').length; return `<button class="deck-item" data-act="coop-open" data-id="${p.id}">
      <div style="font-size:28px">🧑</div><div class="grow"><b style="display:block">${esc(p.name)}</b>
      <div class="tiny muted">${st.total} Karten · ${n} ${n === 1 ? 'Duell' : 'Duelle'} gespeichert · Stand ${fmtDate(new Date(p.updated || p.created).toISOString()).split(',')[0]}</div></div>
      <div class="gold small">${money(st.value)}</div></button>`; }).join('')
      || `<div class="empty"><div class="icon">🤝</div><b>Noch keine Mitspieler</b><p>Dein Mitspieler speichert in seiner Foxycana-App unter <b>Mehr → Backup jetzt speichern</b> (oder „Als CSV exportieren“) eine Datei und schickt sie dir. Die lädst du hier.</p></div>`}`;
}
A['coop-open'] = el => go({tab:'coop', partner: el.dataset.id, deck:null, assist:null});

/* ---------- Mitspieler anlegen / Datei laden ---------- */
function collFromFile(text){
  try{
    const j = JSON.parse(text);
    if(j && j.coll && typeof j.coll === 'object'){
      const coll = {}; for(const [k, e] of Object.entries(j.coll)){ const id = k.split('|')[0]; if((S.byId.get(+id) || S.byId.get(id)) && e && e.q > 0) coll[k] = {q: e.q}; }
      return {coll, bad: 0};
    }
  }catch(e){ /* keine JSON-Datei → CSV/Text */ }
  const {out, bad} = parseCardFile(text);
  const coll = {}; for(const x of out){ const k = ckey(x.c.id, x.lang, x.foil); coll[k] = {q: (coll[k] ? coll[k].q : 0) + x.n}; }
  return {coll, bad: bad.length};
}
async function loadPartnerFile(p){
  const t = await pickFile('.json,.csv,.txt,application/json,text/csv,text/plain'); if(!t) return false;
  const {coll, bad} = collFromFile(t);
  const n = Object.values(coll).reduce((s2, e) => s2 + e.q, 0);
  if(!n){ await ask('Nichts erkannt', 'In der Datei habe ich keine Karten gefunden. Nimm ein <b>Foxycana-Backup</b> (Mehr → Backup jetzt speichern) oder den <b>CSV-Export</b> deines Mitspielers.', [{l:'OK', v:true}]); return false; }
  p.coll = coll; p.updated = Date.now(); persist();
  toast(`${n} Karten von ${p.name} geladen${bad ? ` · ${bad} Zeilen nicht erkannt` : ''} ✓`, 3500);
  return true;
}
A['coop-new'] = async () => {
  const name = await promptText('Wie heißt dein Mitspieler?', '', 'z. B. Marius'); if(!name) return;
  const p = {id:'p' + Date.now(), name, created: Date.now(), coll:{}, tourney:false};
  if(!await loadPartnerFile(p)) return;
  S.partners.unshift(p); persist();
  go({tab:'coop', partner: p.id, deck:null, assist:null});
};
A['coop-reload'] = async () => { const p = currentPartner(); closeSheet(); if(p && await loadPartnerFile(p)){ COOP_CACHE = null; renderPartner(); } };

/* ---------- Duelle finden ---------- */
let COOP_CACHE = null;   // {key, mine, theirs, duels}
function currentPartner(){ return partnerById(S.ui.partner); }
function duelKey(p){ return p.id + ':' + (p.tourney ? 1 : 0) + ':' + p.updated + ':' + Object.values(S.coll).reduce((s2, e) => s2 + e.q, 0) + ':' + Object.keys(S.prices).length; }
function computeDuels(p){
  const mine = ASSIST.recsFor(null, !!p.tourney).slice(0, 10);
  const theirs = ASSIST.recsFor(partnerQty(p), !!p.tourney).slice(0, 10);
  const duels = [];
  for(const a of mine) for(const b of theirs){
    const diff = Math.abs(a.rt.score - b.rt.score);
    if(diff > 12) continue;
    const shared = a.pair.filter(k => b.pair.includes(k)).length;
    const avg = (a.rt.score + b.rt.score) / 2;
    const fun = avg - diff * 1.6 + (a.style !== b.style ? 3 : 0) + (shared === 0 ? 3 : shared === 1 ? 1 : -3);
    duels.push({a, b, diff, fun, shared});
  }
  duels.sort((x, y) => y.fun - x.fun);
  // nicht zweimal dasselbe Farbpaar für dieselbe Person
  const usedA = new Map(), usedB = new Map(), pick = [];
  for(const d of duels){ const ka = d.a.pair.join('/'), kb = d.b.pair.join('/'); if((usedA.get(ka) || 0) >= 2 || (usedB.get(kb) || 0) >= 2) continue; usedA.set(ka, (usedA.get(ka) || 0) + 1); usedB.set(kb, (usedB.get(kb) || 0) + 1); pick.push(d); if(pick.length >= 6) break; }
  return {key: duelKey(p), mine, theirs, duels: pick};
}
function balanceLabel(diff){ return diff <= 3 ? '<span style="color:var(--good)">⚖️ sehr ausgeglichen</span>' : diff <= 7 ? '<span style="color:var(--gold)">⚖️ ausgeglichen</span>' : '<span style="color:var(--bad)">⚖️ leicht unausgeglichen</span>'; }
const TCOL = {S:'#F5D58E', A:'#3CCB7F', B:'#1C8FD6', C:'#9A9CB8', D:'#FF6B6B'};
function sideHtml(who, r){
  return `<div class="row" style="gap:8px;align-items:flex-start"><div style="min-width:30px;text-align:center"><b style="font-size:18px;color:${TCOL[r.rt.tier]}">${r.rt.tier}</b><div class="tiny muted">${r.rt.score}</div></div>
    <div class="grow"><div class="tiny muted">${esc(who)}</div><div class="row" style="gap:6px">${inkColDots(r.pair)}<b class="small">${r.pair.map(k => INKS[k].de).join(' & ')}</b></div>
    <div class="tiny muted">${STYLE_DE[r.style]} · ${esc(r.feat.slice(1, 3).join(' · '))}</div></div></div>`;
}
function renderPartner(){
  const p = currentPartner(); if(!p){ S.ui.partner = null; return renderCoop(); }
  const st = partnerStats(p);
  const saved = S.decks.filter(d => d.coop === p.id && d.side === 'me');
  const ready = COOP_CACHE && COOP_CACHE.key === duelKey(p);
  view.innerHTML = `<div class="row" style="margin-bottom:8px">${backBtn()}<h1 class="grow ell" style="margin:0">🤝 Du & ${esc(p.name)}</h1><button class="chip" data-act="coop-menu">⋯</button></div>
    <div class="hero"><div class="row between"><div><div class="lbl">Sammlung von ${esc(p.name)}</div><div class="big">${st.total} <span style="font-size:16px">Karten</span></div></div><div class="gold">${money(st.value)}</div></div>
      <div class="tiny" style="color:#d8d4f2;margin-top:6px">Stand ${fmtDate(new Date(p.updated || p.created).toISOString())} · deine Sammlung: ${collectionStats().total} Karten</div></div>
    <label class="switch-row"><input type="checkbox" data-act="coop-tourney" ${p.tourney ? 'checked' : ''}><span class="switch"></span><span class="small"><b>Turnierspielbar</b> <span class="tiny muted">${p.tourney ? '– nur Core-Karten' : '– aus: alle Editionen, einfach zum Spaß'}</span></span></label>
    ${saved.length ? `<h3>Gespeicherte Duelle</h3>` + saved.map(d => { const o = S.decks.find(x => x.duel === d.duel && x.side === 'them'); const ra = ASSIST.rateDeck(d), rb = o ? ASSIST.rateDeck(o) : null;
      return `<div class="card" style="margin-bottom:8px"><div class="row between"><b class="small">${esc(d.duelName || 'Duell')}</b><button class="chip mini" data-act="duel-delete" data-duel="${d.duel}">🗑</button></div>
        <button class="deck-item" style="margin:8px 0 6px" data-act="deck-open" data-id="${d.id}">${tierBadge(ra)}<div class="grow"><div class="tiny muted">Du</div><b class="ell" style="display:block">${esc(d.name)}</b>${deckStats(d).missing ? `<div class="miss">${deckStats(d).missing} fehlen</div>` : '<div class="tiny" style="color:var(--good)">✓ spielbereit</div>'}</div></button>
        ${o ? `<button class="deck-item" style="margin:0" data-act="deck-open" data-id="${o.id}">${tierBadge(rb)}<div class="grow"><div class="tiny muted">${esc(p.name)}</div><b class="ell" style="display:block">${esc(o.name)}</b>${deckStats(o).missing ? `<div class="miss">${deckStats(o).missing} fehlen bei ${esc(p.name)}</div>` : '<div class="tiny" style="color:var(--good)">✓ spielbereit</div>'}</div></button>` : ''}</div>`; }).join('') : ''}
    <h2>⚔️ Vorschläge für ein Duell</h2>
    <p class="tiny muted" style="margin-top:-6px">Je ein Deck pro Person, nur aus den eigenen Karten. Möglichst gleich stark, unterschiedliche Farben und Spielstile – damit es spannend bleibt.</p>
    <div id="duels">${ready ? duelsHtml(p) : '<div class="boot" style="min-height:100px"><div class="loader" style="width:28px;height:28px"></div><span class="small muted">Vergleiche eure Sammlungen …</span></div>'}</div>`;
  if(!ready) setTimeout(() => { if(currentPartner() !== p) return; COOP_CACHE = computeDuels(p); const el = $('#duels'); if(el) el.innerHTML = duelsHtml(p); }, 60);
}
function duelsHtml(p){
  const c = COOP_CACHE;
  if(!c.mine.length || !c.theirs.length) return `<div class="empty">${!c.mine.length ? 'Du hast' : esc(p.name) + ' hat'} noch keine Farbkombination mit genug Karten für ein vollständiges 60-Karten-Deck.</div>`;
  if(!c.duels.length) return `<div class="empty">Eure stärksten Decks liegen zu weit auseinander für ein faires Duell. Mehr Karten helfen – oder schaltet „Turnierspielbar“ aus.</div>`;
  return c.duels.map((d, i) => `<button class="deck-item" style="display:block;text-align:left" data-act="duel-open" data-i="${i}">
    ${sideHtml('Du', d.a)}<div class="tiny" style="text-align:center;margin:6px 0;color:var(--muted)">— gegen —</div>${sideHtml(p.name, d.b)}
    <div class="row between" style="margin-top:8px"><span class="tiny">${balanceLabel(d.diff)} · Unterschied ${d.diff}</span><span class="muted">›</span></div></button>`).join('');
}
A['coop-tourney'] = () => { const p = currentPartner(); p.tourney = !p.tourney; persist(); COOP_CACHE = null; renderPartner(); };

/* ---------- Ein Duell ansehen / speichern ---------- */
let DUEL = null;
A['duel-open'] = el => { DUEL = COOP_CACHE.duels[+el.dataset.i]; go({tab:'coop', partner: S.ui.partner, duel:true}); };
function duelList(r){
  const lines = [...r.lines].sort((a, b) => (a.g.rep.ct || 0) - (b.g.rep.ct || 0) || cName(a.g.rep).localeCompare(cName(b.g.rep), 'de'));
  return lines.map(x => `<div class="deck-line"><span class="cost">${x.g.rep.ct ?? '–'}</span><img src="${esc(cThumb(x.g.ownCard || x.g.rep))}" loading="lazy" data-act="card" data-id="${(x.g.ownCard || x.g.rep).id}"><div class="grow ell"><b>${x.n}× ${esc(cName(x.g.rep))}</b> <span class="tiny muted">${esc(cVer(x.g.rep))}</span></div></div>`).join('');
}
function renderDuel(){
  const p = currentPartner(); if(!p || !DUEL){ S.ui.duel = false; return renderPartner(); }
  const d = DUEL;
  const half = (who, r) => `<div class="card" style="margin-bottom:12px">${sideHtml(who, r)}
    <div class="row wrap" style="gap:4px;margin-top:8px">${r.feat.map(f => `<span class="tag">${esc(f)}</span>`).join('')}</div>
    <details class="guide-box" style="margin:10px 0 0"><summary>📖 So spielt ${who === 'Du' ? 'du' : esc(who)} dieses Deck</summary>${ASSIST.guide(r.lines.map(x => ({c: x.g.ownCard || x.g.rep, n: x.n})))}</details>
    <details class="guide-box" style="margin:8px 0 0"><summary>🃏 Deckliste (60 Karten)</summary>${duelList(r)}</details></div>`;
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow ell">⚔️ Duell</h1></div>
    <div class="card" style="margin-bottom:12px;text-align:center">${balanceLabel(d.diff)}<div class="tiny muted" style="margin-top:4px">Stärke ${d.a.rt.score} gegen ${d.b.rt.score}${d.shared === 0 ? ' · komplett unterschiedliche Farben' : ''}${d.a.style !== d.b.style ? ' · unterschiedliche Spielstile' : ''}</div></div>
    ${half('Du', d.a)}${half(p.name, d.b)}
    <button class="btn block" data-act="duel-save">💾 Beide Decks speichern</button>`;
}
A['duel-save'] = async () => {
  const p = currentPartner(), d = DUEL; if(!p || !d) return;
  const pl = r => r.pair.map(k => INKS[k].de).join('/');
  const name = await promptText('Name für dieses Duell', `${pl(d.a)} gegen ${pl(d.b)}`); if(!name) return;
  const duel = 'u' + Date.now(), now = Date.now();
  const mk = (r, side, deckName) => ({id:'d' + now + side, name: deckName, cards: Object.assign({}, r.deck.cards), src:'coop', created: now, size:60, coop: p.id, side, duel, duelName: name, tourney: !!p.tourney});
  S.decks.unshift(mk(d.a, 'me', `${pl(d.a)} ${STYLE_DE[d.a.style].split(' ')[1]}`), mk(d.b, 'them', `${pl(d.b)} ${STYLE_DE[d.b.style].split(' ')[1]}`));
  persist(); toast('Duell gespeichert ✓'); NAV.length = 0;
  Object.assign(S.ui, {tab:'coop', partner: p.id, duel:false, deck:null}); render();
};
A['duel-delete'] = async el => {
  const ok = await ask('Duell löschen?', 'Beide Decks dieses Duells werden gelöscht. Die Karten bleiben, wo sie sind.', [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Löschen', v:true, c:'danger'}]);
  if(ok){ S.decks = S.decks.filter(d => d.duel !== el.dataset.duel); persist(); renderPartner(); }
};
A['coop-menu'] = () => openSheet(`<h2>${esc(currentPartner().name)}</h2><div class="list">
  <button class="item" style="width:100%" data-act="coop-reload">📥 Neue Sammlungsdatei laden</button>
  <button class="item" style="width:100%" data-act="coop-rename">✎ Umbenennen</button>
  <button class="item" style="width:100%;color:var(--bad)" data-act="coop-delete">🗑️ Mitspieler löschen</button></div>`);
A['coop-rename'] = async () => { const p = currentPartner(); closeSheet(); const n = await promptText('Umbenennen', p.name); if(n){ p.name = n; persist(); renderPartner(); } };
A['coop-delete'] = async () => {
  const p = currentPartner(); closeSheet();
  const ok = await ask(`${esc(p.name)} löschen?`, 'Die importierte Sammlung und alle Duell-Decks mit dieser Person werden gelöscht. Deine eigene Sammlung bleibt unverändert.', [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Löschen', v:true, c:'danger'}]);
  if(!ok) return;
  S.decks = S.decks.filter(d => d.coop !== p.id); S.partners = S.partners.filter(x => x !== p);
  S.ui.partner = null; NAV.length = 0; persist(); render();
};
