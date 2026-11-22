'use strict';
/* =========================================================
   Foxycana – Oberfläche
   ========================================================= */
const A = {};          // Klick-Aktionen (data-act)
const view = $('#view');

/* ---------- Toast / Sheet / Dialoge ---------- */
let toastT = null;
function toast(msg, ms=2200){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
let sheetOnClose = null;
function openSheet(html, onClose=null){ $('#sheet').innerHTML = html; $('#sheet').scrollTop = 0; $('#sheet-wrap').classList.add('open'); sheetOnClose = onClose; }
function closeSheet(){ if(!$('#sheet-wrap').classList.contains('open')) return; $('#sheet-wrap').classList.remove('open'); const f = sheetOnClose; sheetOnClose = null; if(f) f(); }
function sheetOpen(){ return $('#sheet-wrap').classList.contains('open'); }
A['sheet-close'] = closeSheet;

function ask(title, text, buttons){
  return new Promise(res => {
    const bs = buttons || [{l:'Abbrechen', v:false, c:'ghost'}, {l:'OK', v:true}];
    openSheet(`<h2>${esc(title)}</h2>${text ? `<p class="muted">${text}</p>` : ''}<div class="actions" style="flex-wrap:wrap">${bs.map((b,i) => `<button class="btn ${b.c||''}" data-ask="${i}">${esc(b.l)}</button>`).join('')}</div>`, () => res(null));
    $$('#sheet [data-ask]').forEach(el => el.onclick = () => { const v = bs[+el.dataset.ask].v; sheetOnClose = null; closeSheet(); res(v); });
  });
}
function promptText(title, value='', placeholder=''){
  return new Promise(res => {
    openSheet(`<h2>${esc(title)}</h2><input class="field" id="pt-in" value="${esc(value)}" placeholder="${esc(placeholder)}"><div class="actions"><button class="btn ghost" data-pt="0">Abbrechen</button><button class="btn" data-pt="1">OK</button></div>`, () => res(null));
    const inp = $('#pt-in'); setTimeout(() => inp.focus(), 250);
    const done = ok => { const v = inp.value.trim(); sheetOnClose = null; closeSheet(); res(ok ? v : null); };
    $$('#sheet [data-pt]').forEach(el => el.onclick = () => done(el.dataset.pt === '1'));
    inp.onkeydown = e => { if(e.key === 'Enter') done(true); };
  });
}

/* ---------- Kleine Bausteine ---------- */
const LOGO = `<svg viewBox="0 0 108 108" style="stroke:none"><path fill="#F28C28" d="M34,30 L46,45 L62,45 L74,30 L76,53 C76,67 66,78 54,82 C42,78 32,67 32,53 Z"/><path fill="#8A3B12" d="M37,36 L45,45 L38,47 Z M71,36 L63,45 L70,47 Z"/><path fill="#FFF4E6" d="M39,59 C46,62 50,66 54,75 C58,66 62,62 69,59 C66,70 61,77 54,81 C47,77 42,70 39,59 Z"/><circle fill="#1B1530" cx="46.1" cy="56" r="2.6"/><circle fill="#1B1530" cx="61.9" cy="56" r="2.6"/><path fill="#1B1530" d="M51.2,74 L56.8,74 L54,77.6 Z"/><path fill="#E3B65C" d="M54,25 L55.6,30.4 L61,32 L55.6,33.6 L54,39 L52.4,33.6 L47,32 L52.4,30.4 Z"/></svg>`;
const ICON_SEARCH = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;
function inkButtons(sel, act){
  return Object.entries(INKS).map(([k, v]) => `<button class="ink ${sel.includes(k) ? 'on' : ''}" data-act="${act}" data-ink="${k}" title="${v.de}"><i style="background:${v.c}"></i></button>`).join('');
}
function tile(c, o={}){
  const L = o.lang || dl();
  return `<button class="tile ${o.missing ? 'missing' : ''}" data-act="card" data-id="${c.id}">
    <div class="img"><img loading="lazy" src="${esc(cThumb(c, L))}" alt="" onerror="this.classList.add('err')"><div class="ph">${esc(cName(c))}</div>
      ${o.q ? `<span class="qty">×${o.q}</span>` : ''}${o.qf ? `<span class="foil">✦ ${o.qf}</span>` : ''}</div>
    <div class="tname">${esc(cName(c))}</div><div class="tsub">${esc(cVer(c) || TYPE_DE[c.t] || c.t)}</div>
    <div class="tprice">${o.price != null ? money(o.price) : money(priceEUR(c, false))}</div></button>`;
}
function stepper(attrs, q){
  return `<div class="stepper"><button data-act="own" ${attrs} data-d="-1">−</button><b>${q}</b><button data-act="own" ${attrs} data-d="1">+</button></div>`;
}

/* ---------- Navigation ---------- */
/* Verlauf: Zurück-Knopf und Android-Zurückwischen gehen zur vorherigen Ansicht */
const NAV = [];
function snap(){ const u = S.ui; return {tab:u.tab, deck:u.deck, assist:u.assist, mode:u.mode, set:u.set, sort:u.sort, q:u.q, inks:[...u.inks], rarity:u.rarity, type:u.type, lang:u.lang, foil:u.foil, y: window.scrollY}; }
function go(ch){ NAV.push(snap()); if(NAV.length > 50) NAV.shift(); Object.assign(S.ui, ch); S.ui.limit = 240; render(); window.scrollTo(0, 0); }
function goBack(){ if(!NAV.length) return false; const st = NAV.pop(); const y = st.y; delete st.y; Object.assign(S.ui, st); render(); setTimeout(() => window.scrollTo(0, y || 0), 0); return true; }
function backBtn(){ return NAV.length ? `<button class="round back" data-act="back" aria-label="Zurück">‹</button>` : ''; }
A.back = () => { if(!goBack()) go({tab:'collection', deck:null, assist:null}); };
A.tab = el => { const t = el.dataset.tab; if(t === S.ui.tab && !S.ui.deck && !S.ui.assist){ window.scrollTo(0, 0); return; } go({tab:t, deck:null, assist:null}); };
function render(){
  $$('#nav .nav-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === S.ui.tab));
  if(!S.cards.length){ return; }
  const t = S.ui.tab;
  if(t === 'collection') renderCollection();
  else if(t === 'sets') renderSets();
  else if(t === 'decks') S.ui.assist ? ASSIST.render() : S.ui.deck ? renderDeck() : renderDecks();
  else renderMore();
}

/* =========================================================
   Sammlung
   ========================================================= */
function filterActive(){ const u = S.ui; return (u.set ? 1 : 0) + (u.rarity ? 1 : 0) + (u.type ? 1 : 0) + (u.lang ? 1 : 0) + (u.foil ? 1 : 0); }
function matchCard(c){
  const u = S.ui;
  if(u.inks.length && !inkList(c).some(k => u.inks.includes(k))) return false;
  if(u.set && c.s !== u.set) return false;
  if(u.rarity && c.r !== u.rarity) return false;
  if(u.type && c.t !== u.type) return false;
  if(u.q){
    const q = ENGINE.norm(u.q);
    const hay = ENGINE.norm([c.name.de, c.ver.de, c.name.en, c.ver.en, c.n != null ? '#' + c.n : '', (c.sub||[]).join(' ')].join(' '));
    if(!q.split(' ').every(w => hay.includes(w)) && String(c.n) !== u.q.replace('#','')) return false;
  }
  return true;
}
function renderCollection(){
  const st = collectionStats(), u = S.ui;
  view.innerHTML = `
    <div class="row between"><div class="logo">${backBtn()}${LOGO}<h1 style="margin:0">Foxycana</h1></div>
      <span class="tag">${esc(S.settings.currency)}</span></div>
    <div class="hero" style="margin-top:12px">
      <svg class="spark" viewBox="0 0 24 24" style="fill:#E3B65C;stroke:none"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/></svg>
      <div class="lbl">Sammlungswert</div><div class="big">${money(st.value)}</div>
      <div class="stats"><div><b>${st.total}</b>Karten</div><div><b>${st.unique}</b>verschiedene</div><div><b>${S.decks.length}</b>Decks</div></div>
      <div class="tiny" style="color:#b9b3dc;margin-top:8px">Cardmarket-Preisguide · ${({trend:'Trendpreis',low:'Ab-Preis',avg30:'30-Tage-Schnitt'})[S.settings.priceBasis]} · Stand ${fmtDate(S.priceDate)}</div>
      <div class="tiny" id="sync" style="color:#9fe3bf;margin-top:2px">${esc(S.syncMsg || '')}</div>
    </div>
    <div class="seg"><button class="${u.mode==='owned'?'on':''}" data-act="mode" data-m="owned">Meine Karten</button><button class="${u.mode==='all'?'on':''}" data-act="mode" data-m="all">Alle Karten</button></div>
    <div class="search">${ICON_SEARCH}<input id="q" placeholder="Name, Version oder #Nummer" value="${esc(u.q)}"></div>
    <div class="row" style="margin-bottom:12px"><div class="chips grow">${inkButtons(u.inks, 'ink')}</div>
      <button class="chip ${filterActive() ? 'on' : ''}" data-act="filters">Filter ${filterActive() ? `<span class="badge">${filterActive()}</span>` : ''}</button></div>
    ${u.set ? `<div class="row" style="margin:-4px 0 12px"><span class="chip on">${esc(setName(u.set))}</span><button class="chip" data-act="clear-set">✕ Set</button></div>` : ''}
    <div id="grid-info" class="muted small" style="margin-bottom:8px"></div>
    <div id="grid" class="grid"></div><div id="grid-more"></div>`;
  const q = $('#q'); let qt = null;
  q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { S.ui.q = q.value.trim(); S.ui.limit = 240; renderGrid(); }, 180); };
  renderGrid();
}
function renderGrid(){
  const u = S.ui, grid = $('#grid'); if(!grid) return;
  let items;
  if(u.mode === 'owned'){
    items = [...ownedById().values()].filter(a => matchCard(a.c)
      && (!u.lang || a.langs[u.lang]) && (!u.foil || (u.foil === 'foil' ? a.qf > 0 : a.q - a.qf > 0)));
    const so = u.sort;
    items.sort((a, b) => so === 'name' ? cName(a.c).localeCompare(cName(b.c), 'de') : so === 'new' ? b.t - a.t : so === 'qty' ? b.q - a.q
      : so === 'number' ? cmpNum(a.c, b.c) : (b.value - a.value) || cName(a.c).localeCompare(cName(b.c), 'de'));
  } else {
    const own = ownedById();
    items = S.cards.filter(matchCard).map(c => { const a = own.get(c.id); return {c, q: a ? a.q : 0, qf: a ? a.qf : 0, value: priceEUR(c, false) || 0, t: a ? a.t : 0}; });
    const so = u.sort;
    items.sort((a, b) => so === 'name' ? cName(a.c).localeCompare(cName(b.c), 'de') : so === 'value' ? b.value - a.value : so === 'qty' ? b.q - a.q : so === 'new' ? b.t - a.t : cmpNum(a.c, b.c));
  }
  const shown = items.slice(0, u.limit);
  $('#grid-info').textContent = items.length ? `${items.length} ${items.length === 1 ? 'Karte' : 'Karten'}` + (u.mode === 'all' ? ` · ${items.filter(i => i.q).length} im Besitz` : '') : '';
  if(!items.length){
    grid.innerHTML = '';
    $('#grid-more').innerHTML = u.mode === 'owned' && !Object.keys(S.coll).length
      ? `<div class="empty"><div class="icon">🦊</div><b>Noch keine Karten</b><p>Tippe unten auf den Scan-Knopf, leg das Handy in deinen Ständer und schieb eine Karte nach der anderen drunter.</p><button class="btn" data-act="scan-open">Scanner starten</button><p class="small">Oder unter <b>Decks</b> ein gekauftes Fertigdeck hinzufügen.</p><button class="btn ghost small" data-act="backup-import">♻️ Backup wiederherstellen</button></div>`
      : `<div class="empty">Keine Karten gefunden.</div>`;
    return;
  }
  grid.innerHTML = shown.map(a => tile(a.c, {q:a.q, qf:a.qf, missing: u.mode === 'all' && !a.q, price: u.mode === 'owned' ? (a.q ? a.value / a.q : null) : null,
    lang: u.mode === 'owned' && a.langs ? (Object.entries(a.langs).sort((x,y) => y[1]-x[1])[0] || [dl()])[0] : dl()})).join('');
  $('#grid-more').innerHTML = items.length > shown.length ? `<div style="text-align:center;margin:18px 0"><button class="btn ghost" data-act="more-cards">Weitere ${Math.min(240, items.length - shown.length)} anzeigen</button></div>` : '';
}
function setOrder(code){ const s = S.sets[code]; return s && s.release ? s.release : (/^\d+$/.test(code) ? String(2000 + +code) : '9999'); }
function cmpNum(a, b){ const sa = setOrder(a.s), sb = setOrder(b.s); if(sa !== sb) return sa < sb ? -1 : 1; return (a.n ?? 9999) - (b.n ?? 9999) || String(a.v).localeCompare(String(b.v)); }
A.mode = el => { S.ui.mode = el.dataset.m; S.ui.limit = 240; if(S.ui.mode === 'all' && S.ui.sort === 'value' && !S.ui.set) S.ui.sort = 'number'; renderCollection(); };
A.ink = el => { const k = el.dataset.ink, a = S.ui.inks; S.ui.inks = a.includes(k) ? a.filter(x => x !== k) : [...a, k]; $$('[data-act="ink"]').forEach(b => b.classList.toggle('on', S.ui.inks.includes(b.dataset.ink))); renderGrid(); };
A['more-cards'] = () => { S.ui.limit += 240; renderGrid(); };
A['clear-set'] = () => { S.ui.set = ''; renderCollection(); };
A.filters = () => {
  const u = S.ui;
  const sets = Object.values(S.sets).sort((a, b) => setOrder(a.code) < setOrder(b.code) ? -1 : 1);
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  openSheet(`<h2>Filter & Sortierung</h2>
    <label class="lbl">Sortieren nach</label><select id="f-sort">${[['value','Wert'],['name','Name'],['number','Set & Nummer'],['new','Zuletzt hinzugefügt'],['qty','Anzahl']].map(([v,l]) => opt(v,l,u.sort)).join('')}</select>
    <label class="lbl">Set</label><select id="f-set">${opt('', 'Alle Sets', u.set)}${sets.map(s => opt(s.code, setName(s.code) + ' (' + s.code + ')', u.set)).join('')}</select>
    <label class="lbl">Seltenheit</label><select id="f-rar">${opt('', 'Alle', u.rarity)}${RARITIES.map(r => opt(r, RAR_DE[r], u.rarity)).join('')}</select>
    <label class="lbl">Kartentyp</label><select id="f-type">${opt('', 'Alle', u.type)}${Object.entries(TYPE_DE).map(([k,v]) => opt(k, v, u.type)).join('')}</select>
    <label class="lbl">Sprache (Meine Karten)</label><select id="f-lang">${opt('', 'Alle', u.lang)}${opt('de','Deutsch',u.lang)}${opt('en','Englisch',u.lang)}</select>
    <label class="lbl">Ausführung (Meine Karten)</label><select id="f-foil">${opt('', 'Alle', u.foil)}${opt('normal','Normal',u.foil)}${opt('foil','Foil',u.foil)}</select>
    <div class="actions"><button class="btn ghost" data-act="filters-reset">Zurücksetzen</button><button class="btn" data-act="filters-apply">Anwenden</button></div>`);
};
A['filters-apply'] = () => { const u = S.ui; u.sort = $('#f-sort').value; u.set = $('#f-set').value; u.rarity = $('#f-rar').value; u.type = $('#f-type').value; u.lang = $('#f-lang').value; u.foil = $('#f-foil').value; u.limit = 240; closeSheet(); renderCollection(); };
A['filters-reset'] = () => { Object.assign(S.ui, {set:'', rarity:'', type:'', lang:'', foil:'', inks:[], q:'', sort: S.ui.mode === 'owned' ? 'value' : 'number'}); closeSheet(); renderCollection(); };

/* =========================================================
   Sets
   ========================================================= */
function renderSets(){
  const own = ownedById();
  const sets = Object.values(S.sets).sort((a, b) => setOrder(b.code) < setOrder(a.code) ? -1 : 1);
  const rows = sets.map(s => {
    const cards = S.cards.filter(c => c.s === s.code);
    const base = s.base || cards.filter(c => !SPECIAL_RAR.has(c.r)).length || cards.length;
    const ownedBase = new Set(cards.filter(c => own.has(c.id) && (c.n == null || c.n <= base)).map(c => c.n ?? c.id)).size;
    const ownedAll = cards.filter(c => own.has(c.id)).length;
    let value = 0; for(const c of cards){ const a = own.get(c.id); if(a) value += a.value; }
    const pct = base ? Math.min(100, Math.round(ownedBase / base * 100)) : 0;
    return `<button class="deck-item" data-act="open-set" data-set="${esc(s.code)}">
      <div class="grow"><div class="row between"><b class="ell">${esc(setName(s.code))}</b><span class="gold small">${money(value)}</span></div>
      <div class="muted tiny" style="margin:2px 0 7px">Set ${esc(s.code)}${s.release ? ' · ' + fmtDate(s.release) : ''} · ${ownedBase}/${base} Basis${ownedAll > ownedBase ? ' · ' + (ownedAll - ownedBase) + ' Spezial' : ''}</div>
      <div class="progress"><i style="width:${pct}%"></i></div></div><span class="muted small" style="width:38px;text-align:right">${pct}%</span></button>`;
  }).join('');
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">Sets</h1></div><p class="muted small" style="margin-top:-6px">Wie viel von jedem Set du schon hast. Tippe ein Set an, um fehlende Karten zu sehen.</p>${rows}`;
}
A['open-set'] = el => { go({tab:'collection', mode:'all', set: el.dataset.set, sort:'number', q:'', inks:[], rarity:'', type:'', lang:'', foil:''}); S.ui.limit = 400; renderGrid(); };

/* =========================================================
   Kartendetail
   ========================================================= */
let detailState = {id:null, lang:null};
A.card = el => openCard(+el.dataset.id || el.dataset.id);
function openCard(id, lang){
  const c = S.byId.get(id); if(!c) return;
  detailState = {id, lang: lang || detailState.lang || dl()};
  const L = detailState.lang;
  const p = priceRec(c);
  const prints = ENGINE.printings(c).filter(x => x.id !== c.id);
  const cmUrl = c.cmu ? c.cmu.replace('/en/', '/de/') : `https://www.cardmarket.com/de/Lorcana/Products/Search?searchString=${encodeURIComponent(c.name.en + (c.ver.en ? ' ' + c.ver.en : ''))}`;
  const stat = (v, l) => `<div><b>${v ?? '–'}</b><span>${l}</span></div>`;
  const txt = c.txt[L] || c.txt.en;
  openSheet(`
    ${c.name.de !== c.name.en || c.ver.de !== c.ver.en || c.img.de ? `<div class="seg" style="max-width:220px;margin:0 auto 10px"><button class="${L==='de'?'on':''}" data-act="detail-lang" data-l="de">Deutsch</button><button class="${L==='en'?'on':''}" data-act="detail-lang" data-l="en">Englisch</button></div>` : ''}
    <img class="detail-img" src="${esc(cImg(c, L))}" alt="" onerror="this.style.visibility='hidden'">
    <h2 style="text-align:center;margin-bottom:2px">${esc(cName(c, L))}</h2>
    ${cVer(c, L) ? `<div class="muted" style="text-align:center">${esc(cVer(c, L))}</div>` : ''}
    <div class="row wrap" style="justify-content:center;margin-top:8px;gap:6px">${inkDots(c)} <span class="tag">${esc(TYPE_DE[c.t] || c.t)}</span> <span class="tag">${esc(RAR_DE[c.r] || c.r)}</span> <span class="tag">${esc(setName(c.s))} #${c.n ?? '–'}${esc(c.v)}</span></div>
    <div class="kv">${stat(c.ct, 'Kosten')}${stat(c.ink ? '✓' : '✕', 'Tintenfass')}${c.t === 'Character' ? stat(c.st, 'Stärke') + stat(c.wp, 'Willenskraft') : stat(c.wp, 'Willenskraft') + stat(c.lo, 'Legende')}</div>
    ${c.t === 'Character' ? `<div class="muted small" style="text-align:center;margin-top:-4px">Legende: ${c.lo ?? '–'}</div>` : ''}
    ${txt ? `<h3>Kartentext</h3><div class="cardtext">${esc(txt)}</div>` : ''}
    <h3>Preise (Cardmarket)</h3>
    ${p ? `<div class="prices">
      <div><span>Trend</span><b>${money(p.t)}</b></div><div><span>Ab</span><b>${money(p.l)}</b></div>
      <div><span>Schnitt 30 Tage</span><b>${money(p.a30)}</b></div><div><span>Foil Trend</span><b>${money(p.tf)}</b></div></div>`
      : `<div class="muted small">Für diese Karte gibt es noch keinen Cardmarket-Preis.</div>`}
    <button class="btn ghost block" style="margin-top:10px" data-act="open-url" data-url="${esc(cmUrl)}">Auf Cardmarket ansehen ↗</button>
    <h3>In deiner Sammlung</h3><div id="own-rows">${ownRows(c)}</div>
    ${prints.length ? `<h3>Andere Drucke</h3><div class="chips">${prints.map(x => `<button class="chip" data-act="card" data-id="${x.id}">${esc(setName(x.s))} #${x.n ?? '–'}${esc(x.v)} · ${esc(RAR_DE[x.r] || x.r)}</button>`).join('')}</div>` : ''}
  `);
}
function ownRows(c){
  const rows = [['de',0,'Deutsch'],['de',1,'Deutsch · Foil'],['en',0,'Englisch'],['en',1,'Englisch · Foil']];
  for(const L of ['fr','it']) for(const f of [0,1]) if(qtyOf(c.id, L, f)) rows.push([L, f, L.toUpperCase() + (f ? ' · Foil' : '')]);
  return rows.map(([L, f, label]) => `<div class="own-row"><div class="grow">${label}<div class="tiny muted">${money(priceEUR(c, !!f))} pro Karte</div></div>${stepper(`data-id="${c.id}" data-lang="${L}" data-foil="${f}"`, qtyOf(c.id, L, f))}</div>`).join('');
}
A['detail-lang'] = el => openCard(detailState.id, el.dataset.l);
A.own = el => {
  const id = +el.dataset.id || el.dataset.id;
  addCard(id, el.dataset.lang, el.dataset.foil === '1', +el.dataset.d);
  const c = S.byId.get(id); const box = $('#own-rows'); if(box && c) box.innerHTML = ownRows(c);
  refreshBehindSheet();
};
function refreshBehindSheet(){ if(S.ui.tab === 'collection') { renderGrid(); const h = $('.hero .big'); if(h) h.textContent = money(collectionStats().value); } else if(S.ui.tab === 'decks' && S.ui.deck) renderDeck(); else if(S.ui.tab === 'sets') renderSets(); }
A['open-url'] = el => { const u = el.dataset.url; if(NATIVE) NATIVE.openUrl(u); else window.open(u, '_blank'); };

/* =========================================================
   Suche (für Decks und manuelles Hinzufügen)
   ========================================================= */
let searchCb = null, searchInks = null;
function openSearch(title, onPick, inks=null){
  searchCb = onPick; searchInks = inks;
  openSheet(`<h2>${esc(title)}</h2><div class="search">${ICON_SEARCH}<input id="sq" placeholder="Kartenname suchen …"></div><div id="sres" class="list"></div>`);
  const q = $('#sq'); setTimeout(() => q.focus(), 250);
  let t = null; q.oninput = () => { clearTimeout(t); t = setTimeout(() => searchResults(q.value), 150); };
  searchResults('');
}
function searchResults(text){
  const q = ENGINE.norm(text);
  let res = S.cards.filter(c => !searchInks || inkList(c).every(k => searchInks.includes(k)));
  if(q) res = res.filter(c => { const h = ENGINE.norm([c.name.de, c.ver.de, c.name.en, c.ver.en].join(' ')); return q.split(' ').every(w => h.includes(w)); });
  else res = res.filter(c => ownedQty(c.id));
  res.sort(cmpNum).reverse();
  $('#sres').innerHTML = res.slice(0, 50).map(c => `<button class="item" style="width:100%;text-align:left" data-act="search-pick" data-id="${c.id}">
    <img src="${esc(cThumb(c))}" style="width:40px;height:56px;border-radius:5px;object-fit:cover;background:var(--surface2)" loading="lazy">
    <div class="grow"><b class="ell" style="display:block">${esc(cName(c))}</b><div class="tiny muted ell">${esc(cVer(c))} · ${esc(cNumLabel(c))}</div></div>
    <div style="text-align:right"><div class="gold small">${money(priceEUR(c,false))}</div><div class="tiny muted">${ownedQty(c.id)}× im Besitz</div></div></button>`).join('')
    || `<div class="empty">${q ? 'Nichts gefunden.' : 'Tippe einen Namen ein.'}</div>`;
}
A['search-pick'] = el => { const c = S.byId.get(+el.dataset.id || el.dataset.id); if(c && searchCb) searchCb(c); };

/* =========================================================
   Decks
   ========================================================= */
function deckStats(d){
  let count = 0, value = 0, missing = 0, missingValue = 0, inkable = 0; const inks = new Set(); const curve = Array(9).fill(0); const types = {};
  for(const [id, n] of Object.entries(d.cards)){
    const c = S.byId.get(+id) || S.byId.get(id); if(!c) continue;
    count += n; inkList(c).forEach(k => inks.add(k));
    const p = priceEUR(c, false) || 0; value += p * n;
    const have = ownedQty(c.id); if(have < n){ missing += n - have; missingValue += p * (n - have); }
    if(c.ink) inkable += n; curve[Math.min(8, c.ct || 0)] += n; types[c.t] = (types[c.t] || 0) + n;
  }
  return {count, value, missing, missingValue, inkable, inks:[...inks], curve, types};
}
function inkColDots(inks){ return inks.map(k => `<i class="dot" style="background:${(INKS[k]||{}).c}"></i>`).join(''); }
const TIER_COL = {S:'#F5D58E', A:'#3CCB7F', B:'#1C8FD6', C:'#9A9CB8', D:'#FF6B6B'};
function tierBadge(r){ return r ? `<div style="text-align:center;min-width:44px"><div style="font-weight:800;font-size:20px;color:${TIER_COL[r.tier]}">${r.tier}</div><div class="tiny muted">${r.score}</div></div>` : '<div style="min-width:44px"></div>'; }
function renderDecks(){
  const rated = S.decks.map(d => ({d, r: window.ASSIST ? ASSIST.rateDeck(d) : null})).sort((a, b) => (b.r ? b.r.score : -1) - (a.r ? a.r.score : -1));
  if(window.ASSIST && !ASSIST.metaLoaded() && !renderDecks.loading){ renderDecks.loading = true; ASSIST.loadMeta().then(() => { if(S.ui.tab === 'decks' && !S.ui.deck && !S.ui.assist) renderDecks(); }); }
  const list = rated.map(({d, r}, i) => { const st = deckStats(d); return `<button class="deck-item" data-act="deck-open" data-id="${d.id}">
      ${tierBadge(r)}
      <div class="deck-inks">${inkColDots(st.inks) || '<i class="dot" style="background:var(--line)"></i>'}</div>
      <div class="grow"><b class="ell" style="display:block">${esc(d.name)}</b>
      <div class="tiny muted">${st.count} Karten · ${st.inks.map(k => INKS[k].de).join('/') || 'leer'}${d.src === 'prebuilt' ? ' · Fertigdeck' : ''}</div>
      ${r && r.arche ? `<div class="tiny muted ell">≈ Meta: ${esc(r.arche.name)} (${r.arche.share}% · ${r.arche.wr ?? '–'}% Siege)</div>` : ''}
      ${st.missing ? `<div class="miss">${st.missing} fehlen (${money(st.missingValue)})</div>` : st.count ? '<div class="tiny" style="color:var(--good)">Alle Karten vorhanden</div>' : ''}</div>
      <div style="text-align:right"><div class="gold small">${money(st.value)}</div>${r ? `<div class="tiny muted">#${i + 1}</div>` : ''}</div></button>`; }).join('');
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">Decks</h1></div>
    <button class="deck-item assist-cta" data-act="assist-open"><span style="font-size:26px">✨</span><div class="grow"><b style="display:block">Deck-Assistent</b><span class="tiny muted">Baut die stärksten Decks aus deinen Karten und zeigt, was gerade in der Meta stark ist</span></div><span class="muted">›</span></button>
    <div class="row" style="gap:8px;margin-bottom:14px"><button class="btn grow" data-act="prebuilt">🛍️ Fertigdeck gekauft</button><button class="btn ghost" data-act="deck-new">+ Neu</button></div>
    ${list ? `<div class="row between" style="margin:4px 0 8px"><b>Meta-Ranking deiner Decks</b><button class="chip" data-act="rank-info">?</button></div>` + list : ''}${list ? '' : `<div class="empty"><div class="icon">🃏</div><b>Noch keine Decks</b><p>Hast du ein Starterdeck gekauft? Tipp auf <b>Fertigdeck gekauft</b> – alle 60 Karten landen sofort in deiner Sammlung.</p></div>`}
    <button class="btn ghost block" data-act="deck-import" style="margin-top:6px">Deckliste einfügen (Text)</button>
`;
}
A['deck-open'] = el => go({tab:'decks', deck: el.dataset.id, assist:null});
A['deck-back'] = () => { if(!goBack()){ S.ui.deck = null; render(); } };
A['deck-new'] = async () => {
  const name = await promptText('Neues Deck', '', 'z. B. Bernstein/Stahl Aggro'); if(!name) return;
  const d = {id:'d' + Date.now(), name, cards:{}, src:'manual', created: Date.now()};
  S.decks.unshift(d); persist(); go({deck: d.id});
};
function currentDeck(){ return S.decks.find(d => d.id === S.ui.deck); }
function renderDeck(){
  const d = currentDeck(); if(!d){ S.ui.deck = null; return renderDecks(); }
  const st = deckStats(d); const maxC = Math.max(1, ...st.curve);
  const cards = Object.entries(d.cards).map(([id, n]) => ({c: S.byId.get(+id) || S.byId.get(id), n})).filter(x => x.c)
    .sort((a, b) => (a.c.ct ?? 0) - (b.c.ct ?? 0) || cName(a.c).localeCompare(cName(b.c), 'de'));
  const groups = {}; for(const x of cards){ (groups[x.c.t] = groups[x.c.t] || []).push(x); }
  const warn = [];
  if(st.count && st.count < 60) warn.push(`Noch ${60 - st.count} Karten bis 60`);
  if(st.inks.length > 2) warn.push('Mehr als 2 Tintenfarben');
  for(const x of cards){ const max = x.c.max === undefined ? 4 : x.c.max; if(max != null && x.n > max) warn.push(`${cName(x.c)}: höchstens ${max}×`); }
  view.innerHTML = `
    <div class="row" style="margin-bottom:8px"><button class="round" style="background:var(--surface2)" data-act="deck-back">‹</button><h1 class="grow ell" style="margin:0">${esc(d.name)}</h1><button class="chip" data-act="deck-rename">✎</button></div>
    <div class="hero"><div class="row between"><div><div class="lbl">Deckwert</div><div class="big">${money(st.value)}</div></div><div class="deck-inks" style="flex-direction:row">${inkColDots(st.inks)}</div></div>
      <div class="stats"><div><b>${st.count}</b>Karten</div><div><b>${st.inkable}</b>tintenfähig</div><div><b style="color:${st.missing ? 'var(--bad)' : 'var(--good)'}">${st.missing}</b>fehlen</div></div>
      ${st.missing ? `<div class="tiny" style="color:#ffc9c9;margin-top:8px">Fehlende Karten kosten ca. ${money(st.missingValue)}</div>` : ''}</div>
    ${(() => { const r = window.ASSIST ? ASSIST.rateDeck(d) : null; if(!r) return ''; return `<div class="card row" style="margin-bottom:12px">${tierBadge(r)}<div class="grow"><b>Meta-Einschätzung: Stufe ${r.tier}</b>
      <div class="tiny muted">${r.arche ? `Entspricht <b>${esc(r.arche.name)}</b> (${esc(r.arche.inks.map(k => INKS[k].de).join(' & '))}) – ${r.arche.share}% der Turnierdecks, ${r.arche.wr ?? '–'}% Siege` : 'Kein bekannter Meta-Archetyp – eher ein eigenes Deck'}</div>
      <div class="tiny muted">Kartenstärke ${Math.round(r.quality * 100)}/100${r.illegal ? ` · <span style="color:var(--bad)">${r.illegal} Karten nicht Core-legal</span>` : ''} · Meta ${r.live ? 'live' : 'Stand'} ${fmtDate(r.metaDate)}</div></div></div>`; })()}
    ${warn.length ? `<div class="warn" style="margin-bottom:12px">${warn.map(esc).join('<br>')}</div>` : ''}
    <div class="card"><b class="small">Kostenkurve</b><div class="curve">${st.curve.map((n, i) => `<div><span>${n || ''}</span><i style="height:${Math.round(n / maxC * 56)}px"></i>${i === 8 ? '8+' : i}</div>`).join('')}</div></div>
    <div class="row" style="gap:8px;margin:12px 0"><button class="btn grow" data-act="deck-add">+ Karten</button><button class="btn ghost" data-act="deck-menu">⋯</button></div>
    ${Object.entries(groups).map(([t, xs]) => `<h3>${esc(TYPE_DE[t] || t)} <span class="muted">(${xs.reduce((s, x) => s + x.n, 0)})</span></h3>` + xs.map(x => {
      const have = ownedQty(x.c.id);
      return `<div class="deck-line"><span class="cost">${x.c.ct ?? '–'}</span><img src="${esc(cThumb(x.c))}" loading="lazy" data-act="card" data-id="${x.c.id}">
        <div class="grow" data-act="card" data-id="${x.c.id}"><div class="ell"><b>${esc(cName(x.c))}</b></div><div class="tiny muted ell">${esc(cVer(x.c))} ${have < x.n ? `<span class="miss">· ${x.n - have} fehlt</span>` : ''}</div></div>
        <div class="stepper"><button data-act="deck-step" data-id="${x.c.id}" data-d="-1">−</button><b>${x.n}</b><button data-act="deck-step" data-id="${x.c.id}" data-d="1">+</button></div></div>`; }).join('')).join('')
      || `<div class="empty">Noch keine Karten im Deck.</div>`}`;
}
A['rank-info'] = () => openSheet(`<h2>So entsteht das Ranking</h2><p class="muted small">Jedes Deck bekommt eine Punktzahl von 0–100 und eine Stufe (S, A, B, C, D):</p>
  <div class="list small"><div class="item">🃏 <div class="grow"><b>Kartenstärke (75 %)</b><br><span class="muted">Spielwerte, Fähigkeiten und wie gefragt die Karten auf Cardmarket sind</span></div></div>
  <div class="item">🏆 <div class="grow"><b>Meta (25 %)</b><br><span class="muted">Passt das Deck zu einem aktuellen Turnier-Archetyp? Dann zählen dessen Siegquote und Verbreitung (inkdecks.com)</span></div></div>
  <div class="item">⚠️ <div class="grow"><b>Abzüge</b><br><span class="muted">Weniger als 60 Karten, mehr als 2 Farben oder Karten, die in Core nicht mehr erlaubt sind</span></div></div></div>
  <p class="tiny muted">Das ist eine Einschätzung – echte Turnierergebnisse hängen auch vom Spielen ab 😉</p><div class="actions"><button class="btn" data-act="sheet-close">Alles klar</button></div>`);
A['deck-step'] = el => { const d = currentDeck(); const id = el.dataset.id; d.cards[id] = (d.cards[id] || 0) + +el.dataset.d; if(d.cards[id] <= 0) delete d.cards[id]; persist(); renderDeck(); };
A['deck-add'] = () => {
  const d = currentDeck(); const st = deckStats(d);
  openSearch('Karte zum Deck', c => {
    d.cards[c.id] = (d.cards[c.id] || 0) + 1; persist(); toast(`${cName(c)} · jetzt ${d.cards[c.id]}× im Deck`); renderDeck();
  }, st.inks.length >= 2 ? st.inks : null);
};
A['deck-rename'] = async () => { const d = currentDeck(); const n = await promptText('Deck umbenennen', d.name); if(n){ d.name = n; persist(); renderDeck(); } };
A['deck-menu'] = () => {
  openSheet(`<h2>Deck</h2><div class="list">
    <button class="item" style="width:100%" data-act="deck-copy">📋 Als Text kopieren</button>
    <button class="item" style="width:100%" data-act="deck-missing">🛒 Fehlende Karten anzeigen</button>
    <button class="item" style="width:100%" data-act="deck-tocoll">➕ Alle Deckkarten zur Sammlung hinzufügen</button>
    <button class="item" style="width:100%;color:var(--bad)" data-act="deck-delete">🗑️ Deck löschen</button></div>`);
};
function deckText(d){ return Object.entries(d.cards).map(([id, n]) => { const c = S.byId.get(+id) || S.byId.get(id); return c ? `${n} ${c.name.en}${c.ver.en ? ' - ' + c.ver.en : ''}` : null; }).filter(Boolean).join('\n'); }
A['deck-copy'] = () => { const t = deckText(currentDeck()); if(NATIVE) NATIVE.copyText(t); else navigator.clipboard && navigator.clipboard.writeText(t); closeSheet(); toast('Deckliste kopiert'); };
A['deck-missing'] = () => {
  const d = currentDeck(); const rows = [];
  for(const [id, n] of Object.entries(d.cards)){ const c = S.byId.get(+id) || S.byId.get(id); if(!c) continue; const miss = n - ownedQty(c.id); if(miss > 0) rows.push({c, miss}); }
  const tot = rows.reduce((s, r) => s + (priceEUR(r.c, false) || 0) * r.miss, 0);
  openSheet(`<h2>Fehlende Karten</h2><p class="muted small">Zusammen ca. <b class="gold">${money(tot)}</b> (Cardmarket).</p><div class="list">${rows.map(r => `<button class="item" style="width:100%;text-align:left" data-act="card" data-id="${r.c.id}"><b>${r.miss}×</b><div class="grow ell">${esc(cFull(r.c))}</div><span class="gold small">${money((priceEUR(r.c,false)||0) * r.miss)}</span></button>`).join('') || '<div class="empty">Dir fehlt nichts 🎉</div>'}</div>`);
};
A['deck-tocoll'] = async () => {
  const d = currentDeck(); closeSheet();
  const lang = await ask('Zur Sammlung hinzufügen', 'In welcher Sprache sind die Karten?', [{l:'Deutsch', v:'de'}, {l:'Englisch', v:'en'}, {l:'Abbrechen', v:null, c:'ghost'}]);
  if(!lang) return;
  let n = 0; for(const [id, k] of Object.entries(d.cards)){ addCard(+id || id, lang, false, k); n += k; }
  toast(`${n} Karten zur Sammlung hinzugefügt`); renderDeck();
};
A['deck-delete'] = async () => {
  closeSheet(); const d = currentDeck();
  const ok = await ask('Deck löschen?', `„${esc(d.name)}“ wird gelöscht. Die Karten bleiben in deiner Sammlung.`, [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Löschen', v:true, c:'danger'}]);
  if(ok){ S.decks = S.decks.filter(x => x.id !== d.id); S.ui.deck = null; persist(); render(); }
};
A['deck-import'] = () => {
  openSheet(`<h2>Deckliste einfügen</h2><p class="muted small">Eine Karte pro Zeile, z. B. <code>4 Mickey Mouse - Brave Little Tailor</code>. Funktioniert mit Listen aus Dreamborn, Inkdecks & Co. (Deutsch oder Englisch).</p>
    <input class="field" id="di-name" placeholder="Name des Decks"><div style="height:8px"></div><textarea class="field" id="di-text" placeholder="4 Elsa - Snow Queen&#10;3 Be Prepared&#10;…"></textarea>
    <label class="row small" style="margin-top:10px"><input type="checkbox" id="di-coll"> Karten auch zur Sammlung hinzufügen</label>
    <div class="actions"><button class="btn ghost" data-act="sheet-close">Abbrechen</button><button class="btn" data-act="deck-import-go">Importieren</button></div>`);
};
A['deck-import-go'] = async () => {
  const {ok, bad} = ENGINE.parseDecklist($('#di-text').value);
  if(!ok.length){ toast('Keine Karten erkannt'); return; }
  const name = $('#di-name').value.trim() || 'Importiertes Deck';
  const toColl = $('#di-coll').checked;
  const d = {id:'d' + Date.now(), name, cards:{}, src:'import', created: Date.now()};
  for(const x of ok){ d.cards[x.c.id] = (d.cards[x.c.id] || 0) + x.n; if(toColl) addCard(x.c.id, S.settings.defaultLang, false, x.n); }
  S.decks.unshift(d); persist(); closeSheet();
  if(bad.length) await ask('Nicht alles erkannt', `${bad.length} Zeile(n) konnte ich keiner Karte zuordnen:<br><br>${bad.map(esc).join('<br>')}`, [{l:'OK', v:true}]);
  go({tab:'decks', deck: d.id, assist:null});
};

/* ---------- Fertigdecks ---------- */
function prebuiltList(){
  const all = [...PREBUILT];
  for(const x of S.extraDecks) if(!all.some(p => p[0] === x[0])) all.push(x);
  return all;
}
function prebuiltName(p){
  const [code, set, col, name] = p;
  if(name){
    const n = name.replace(/\{(\w+)\}/g, (_, k) => setName(k));
    const inks = (col || '').split('-').filter(Boolean).map(k => (INKS[k] || {}).de || k);
    return n + (inks.length && /Deck [AB12]$/.test(n) ? ' – ' + inks.join(' & ') : '');
  }
  const inks = (col || '').split('-').map(k => (INKS[k] || {}).de || k).join('/');
  return `${setName(set)} – Starterdeck ${inks.replace('/', ' & ')}`;
}
A.prebuilt = () => {
  const list = prebuiltList().map((p, i) => [p, i]).sort((a, b) => setOrder(a[0][1]) === setOrder(b[0][1]) ? a[1] - b[1] : (setOrder(b[0][1]) < setOrder(a[0][1]) ? -1 : 1)).map(x => x[0]);
  openSheet(`<h2>Welches Deck hast du gekauft?</h2><p class="muted small">Alle Karten werden automatisch hinzugefügt – kein Scannen nötig.</p><div class="list">${list.map(p => {
    const inks = (p[2] || '').split('-').filter(Boolean);
    return `<button class="item" style="width:100%;text-align:left" data-act="prebuilt-pick" data-code="${esc(p[0])}"><div class="deck-inks">${inkColDots(inks) || '<span>🎁</span>'}</div><div class="grow"><b style="display:block">${esc(prebuiltName(p))}</b><span class="tiny muted">${esc(p[0])}</span></div><span class="muted">›</span></button>`; }).join('')}</div>`);
};
async function loadOneDeck(code){
  if(WEB) return getJSON(wd('decks/' + code + '.json'));
  for(const L of ['de', 'en']){
    try{ return await getJSON(LJ + L + '/decks/deckdata.' + code + '.json'); }catch(e){ /* nächste Sprache */ }
  }
  throw new Error('Deck nicht gefunden');
}
/* "Q3-1+Q3-2+Q3-3" = mehrere Decks aus einer Box zusammen */
async function loadDeckFile(code){
  const parts = code.split('+');
  if(parts.length === 1) return loadOneDeck(code);
  const all = await Promise.all(parts.map(loadOneDeck));
  return {cards: all.flatMap(j => j.cards || []), foilIds: all.flatMap(j => j.foilIds || []), name: ''};
}
A['prebuilt-pick'] = async el => {
  const code = el.dataset.code; const p = prebuiltList().find(x => x[0] === code);
  openSheet(`<div class="boot" style="min-height:200px"><div class="loader"></div>Lade Deckliste …</div>`);
  let j; try{ j = await loadDeckFile(code); }catch(e){ openSheet(`<h2>Hat nicht geklappt</h2><p class="muted">Die Deckliste konnte nicht geladen werden. Bist du online?</p><div class="actions"><button class="btn" data-act="sheet-close">OK</button></div>`); return; }
  const foilIds = new Set(j.foilIds || []);
  const items = (j.cards || []).map(x => ({c: S.byId.get(x.id), n: x.amount || 1, foil: !!x.isFoil || foilIds.has(x.id)})).filter(x => x.c);
  const total = items.reduce((s, x) => s + x.n, 0);
  const value = items.reduce((s, x) => s + (priceEUR(x.c, x.foil) || 0) * x.n, 0);
  const jc = (j.colors || []).filter(k => INKS[k]);
  const pp = p ? [p[0], p[1], jc.length === 2 ? jc.join('-') : p[2], p[3]] : [code, '', jc.join('-'), j.name];
  window.__pb = {code, items, name: prebuiltName(pp)};
  openSheet(`<h2>${esc(window.__pb.name)}</h2><p class="muted small">${total} Karten · Wert ca. <b class="gold">${money(value)}</b></p>
    <label class="lbl">Sprache der Karten</label><div class="seg" id="pb-lang"><button class="${S.settings.defaultLang==='de'?'on':''}" data-act="pb-lang" data-l="de">Deutsch</button><button class="${S.settings.defaultLang==='en'?'on':''}" data-act="pb-lang" data-l="en">Englisch</button></div>
    <label class="row small"><input type="checkbox" id="pb-deck" checked> Auch als Deck speichern</label>
    <div class="actions"><button class="btn ghost" data-act="sheet-close">Abbrechen</button><button class="btn" data-act="pb-add">Hinzufügen</button></div>
    <h3>Inhalt</h3><div>${items.map(x => `<div class="deck-line"><b style="width:26px">${x.n}×</b><img src="${esc(cThumb(x.c))}" loading="lazy"><div class="grow ell">${esc(cFull(x.c))}${x.foil ? ' <span class="tag">Foil</span>' : ''}</div><span class="gold small">${money(priceEUR(x.c, x.foil))}</span></div>`).join('')}</div>`);
  window.__pb.lang = S.settings.defaultLang;
};
A['pb-lang'] = el => { window.__pb.lang = el.dataset.l; $$('#pb-lang button').forEach(b => b.classList.toggle('on', b === el)); };
A['pb-add'] = () => {
  const pb = window.__pb; const asDeck = $('#pb-deck').checked;
  let n = 0; for(const x of pb.items){ addCard(x.c.id, pb.lang, x.foil, x.n); n += x.n; }
  if(asDeck){ const d = {id:'d' + Date.now(), name: pb.name, cards:{}, src:'prebuilt', code: pb.code, created: Date.now()}; for(const x of pb.items) d.cards[x.c.id] = (d.cards[x.c.id] || 0) + x.n; S.decks.unshift(d); }
  persist(); closeSheet(); toast(`${n} Karten zur Sammlung hinzugefügt 🎉`); render();
};
async function probeDecks(){
  const last = +(localStorage.getItem('fx-probe') || 0); if(Date.now() - last < 72 * HOUR) return;
  try{ localStorage.setItem('fx-probe', String(Date.now())); }catch(e){}
  if(WEB){
    try{ const ix = await getJSON(wd('decks/extra.json')); for(const x of ix) if(!prebuiltList().some(p => p[0] === x[0])) S.extraDecks.push(x); persist(); }catch(e){}
    return;
  }
  for(const code of PREBUILT_PROBE){
    if(prebuiltList().some(p => p[0] === code)) continue;
    try{
      const j = await getJSON(LJ + 'en/decks/deckdata.' + code + '.json');
      const set = code[0] === 'Q' ? code.split('-')[0] : code.slice(1).split('-')[0];
      S.extraDecks.push([code, set, (j.colors || []).join('-'), j.name || (code[0] === 'Q' ? '{' + set + '} – Deck ' + code.split('-')[1] : '')]); persist();
    }catch(e){}
  }
}

/* =========================================================
   Mehr: Einstellungen & Daten
   ========================================================= */
function renderMore(){
  const s = S.settings, st = collectionStats();
  const sel = (id, opts, cur) => `<select data-set="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">Mehr</h1></div>
    <div class="card"><h3 style="margin-top:0">Anzeige</h3>
      <label class="lbl">Währung</label>${sel('currency', CURRENCIES.map(c => [c, c + (c !== 'EUR' && S.rates[c] ? ' (1 € = ' + S.rates[c].toFixed(c === 'JPY' || c === 'HUF' ? 0 : 3) + ')' : '')]), s.currency)}
      <label class="lbl">Kartennamen & Bilder</label>${sel('dispLang', [['de','Deutsch'],['en','Englisch']], s.dispLang)}
      <label class="lbl">Preisbasis</label>${sel('priceBasis', [['trend','Trendpreis (empfohlen)'],['low','Ab-Preis (günstigstes Angebot)'],['avg30','Durchschnitt 30 Tage']], s.priceBasis)}</div>
    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">Scanner</h3>
      <label class="lbl">Sprache gescannter Karten</label>${sel('scanLang', [['auto','Automatisch erkennen'],['de','Immer Deutsch'],['en','Immer Englisch']], s.scanLang)}
      <label class="lbl">Wenn nicht erkennbar</label>${sel('defaultLang', [['de','Deutsch annehmen'],['en','Englisch annehmen']], s.defaultLang)}
      <label class="lbl">Erkennung</label>${sel('confirm', [['1','Schnell (1 Bild)'],['2','Sicher (2 Bilder, empfohlen)'],['3','Sehr sicher (3 Bilder)']], s.confirm)}
      <label class="lbl">Ausrichtung der Karte zur Kamera</label>${sel('rotation', [['auto','Automatisch'],['0','0°'],['90','90°'],['180','180°'],['270','270°']], s.rotation)}
      <label class="lbl">Rückmeldung</label>${sel('feedback', [['both','Ton + Vibration'],['sound','Nur Ton'],['vib','Nur Vibration'],['none','Aus']], s.sound && s.vibrate ? 'both' : s.sound ? 'sound' : s.vibrate ? 'vib' : 'none')}</div>
    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">Daten</h3>
      <div class="list small">
        <div class="item"><div class="grow">Kartendatenbank<div class="tiny muted">${S.cards.length} Karten · Stand ${fmtDate(S.cardsDate)}</div></div><button class="btn small ghost" data-act="upd-cards">Aktualisieren</button></div>
        <div class="item"><div class="grow">Cardmarket-Preise<div class="tiny muted">${Object.keys(S.prices).length} Produkte · Stand ${fmtDate(S.priceDate)}</div></div><button class="btn small ghost" data-act="upd-prices">Aktualisieren</button></div>
        <div class="item"><div class="grow">Wechselkurse (EZB)<div class="tiny muted">Stand ${fmtDate(S.ratesDate)}</div></div><button class="btn small ghost" data-act="upd-rates">Aktualisieren</button></div>
      </div></div>
    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">Sammlung (${st.total} Karten)</h3>
      <div class="list">
        <button class="item" style="width:100%" data-act="csv-export">📤 Als CSV exportieren</button>
        <button class="item" style="width:100%" data-act="csv-import">📥 CSV importieren (Lorcery, Dreamborn …)</button>
        <button class="item" style="width:100%" data-act="backup-now">💾 Backup jetzt speichern</button>
        <button class="item" style="width:100%" data-act="backup-import">♻️ Backup laden (wiederherstellen)</button>
        <button class="item" style="width:100%;color:var(--bad)" data-act="coll-clear">🗑️ Sammlung leeren</button>
      </div>
      ${WEB ? `<p class="tiny muted">Deine Sammlung liegt nur in diesem Browser auf diesem Gerät. Speichere ab und zu ein Backup („Backup jetzt speichern“ → in „Dateien“ sichern) – damit kannst du alles wiederherstellen.</p></div>` : `<label class="lbl">Automatisches Backup</label>${sel('autoBackup', [['on','An (empfohlen)'],['off','Aus']], s.autoBackup === 'off' ? 'off' : 'on')}
      <p class="tiny muted">Nach jeder Änderung speichert Foxycana automatisch ein Backup in <b>Download/Foxycana</b>: „foxycana-backup-aktuell.json“ plus eins pro Wochentag (7 Tage zurück). Die Dateien bleiben auch erhalten, wenn die App gelöscht wird. Letztes Backup: <b>${lastBackup() ? fmtDate(new Date(lastBackup()).toISOString()) : 'noch keins'}</b>.<br>Zum Wiederherstellen: „Backup laden“ und die Datei auswählen.</p></div>`}
    <p class="tiny muted" style="margin-top:16px">Foxycana ${NATIVE ? 'v' + esc(NATIVE.version()) : '(Browser)'} · Kartendaten: LorcanaJSON · Preise: Cardmarket-Preisguide (täglich aktualisiert, ${'<a href="#" data-act="open-url" data-url="https://www.cardmarket.com/de/Lorcana" style="color:var(--gold)">cardmarket.com</a>'}) · Kurse: Europäische Zentralbank. Inoffizielle Fan-App, nicht verbunden mit Disney oder Ravensburger.</p>`;
  $$('select[data-set]', view).forEach(el => el.onchange = () => {
    const k = el.dataset.set, v = el.value;
    if(k === 'feedback'){ S.settings.sound = v === 'both' || v === 'sound'; S.settings.vibrate = v === 'both' || v === 'vib'; }
    else S.settings[k] = k === 'confirm' ? +v : v;
    persist(); toast('Gespeichert');
    if(k === 'dispLang' || k === 'currency') renderMore();
  });
}
async function runUpdate(fn, label){
  toast(label + ' wird aktualisiert …', 8000);
  try{ await fn(); toast(label + ' aktuell ✓'); }catch(e){ toast('Fehler: ' + e.message, 4000); }
  render();
}
A['upd-cards'] = () => runUpdate(() => updateCards(), 'Kartendatenbank');
A['upd-prices'] = () => runUpdate(updatePrices, 'Preise');
A['upd-rates'] = () => runUpdate(updateRates, 'Wechselkurse');

function saveFile(name, mime, content){
  if(NATIVE){ const r = NATIVE.saveFile(name, mime, content); if(r.startsWith('ERR:')) toast('Fehler: ' + r.slice(4), 4000); else toast('Gespeichert in ' + r, 4000); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], {type:mime})); a.download = name; a.click();
}
function stamp(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function csvCell(v){ const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
A['csv-export'] = () => {
  const rows = [['Set Number','Card Number','Variant','Count','Language','Name','Version','Rarity','Price EUR']];
  for(const e of entries().sort((a, b) => cmpNum(a.c, b.c)))
    rows.push([e.c.s, (e.c.n ?? '') + (e.c.v || ''), e.foil ? 'foil' : 'normal', e.q, e.lang.toUpperCase(), e.c.name.en, e.c.ver.en, e.c.r, (priceEUR(e.c, e.foil) || 0).toFixed(2)]);
  saveFile('foxycana-sammlung-' + stamp() + '.csv', 'text/csv', rows.map(r => r.map(csvCell).join(',')).join('\n'));
};
function backupJSON(){ return JSON.stringify({app:'foxycana', v:1, date:new Date().toISOString(), coll:S.coll, decks:S.decks, settings:S.settings}); }
A['backup-export'] = () => saveFile('foxycana-backup-' + stamp() + '.json', 'application/json', backupJSON());

/* Automatisches Backup: nach jeder Änderung (gebündelt) und beim Verlassen der App.
   Datei "foxycana-backup-aktuell.json" + eine pro Wochentag (7 Tage zurück) in Download/Foxycana.
   Bleibt auch erhalten, wenn die App gelöscht wird. */
const WDAYS = ['So','Mo','Di','Mi','Do','Fr','Sa'];
let abTimer = null, abDirty = false;
function scheduleAutoBackup(){ abDirty = true; clearTimeout(abTimer); abTimer = setTimeout(autoBackup, 20000); }
window.scheduleAutoBackup = scheduleAutoBackup;
function lastBackup(){ try{ return +(localStorage.getItem('fx-lastbackup') || 0); }catch(e){ return 0; } }
function autoBackup(force){
  clearTimeout(abTimer);
  if(!abDirty && !force) return;
  if(!NATIVE || !NATIVE.saveFileReplace || S.settings.autoBackup === 'off') return;
  if(!Object.keys(S.coll).length && !S.decks.length) return; // niemals eine leere Sammlung sichern
  abDirty = false;
  const json = backupJSON();
  const r = NATIVE.saveFileReplace('foxycana-backup-aktuell.json', 'application/json', json);
  NATIVE.saveFileReplace('foxycana-backup-' + WDAYS[new Date().getDay()] + '.json', 'application/json', json);
  if(!String(r).startsWith('ERR:')){ try{ localStorage.setItem('fx-lastbackup', String(Date.now())); }catch(e){} }
  return r;
}
A['backup-now'] = () => { abDirty = true; const r = autoBackup(true); if(!NATIVE){ A['backup-export'](); return; } if(!r){ toast('Nichts zu sichern – Sammlung ist leer'); return; } toast(String(r).startsWith('ERR:') ? 'Fehler: ' + r.slice(4) : 'Backup gespeichert in ' + r, 3500); renderMore(); };
function pickFile(accept){
  return new Promise(res => {
    const f = $('#file-in'); f.value = ''; f.accept = accept || '';
    f.onchange = () => { const file = f.files && f.files[0]; if(!file) return res(null); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsText(file); };
    f.click();
  });
}
A['backup-import'] = async () => {
  const t = await pickFile('.json,application/json'); if(!t) return;
  let j; try{ j = JSON.parse(t); }catch(e){ toast('Keine gültige Backup-Datei'); return; }
  if(j.app !== 'foxycana' || !j.coll){ toast('Keine Foxycana-Backup-Datei'); return; }
  const ok = await ask('Backup laden?', 'Deine aktuelle Sammlung und Decks werden durch das Backup ersetzt.', [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Ersetzen', v:true}]);
  if(!ok) return;
  S.coll = j.coll; S.decks = j.decks || []; if(j.settings) Object.assign(S.settings, j.settings);
  await saveNow(); toast('Backup geladen ✓'); render();
};
A['coll-clear'] = async () => {
  const ok = await ask('Sammlung leeren?', 'Alle Karten werden aus deiner Sammlung entfernt. Decks bleiben erhalten. Tipp: vorher ein Backup speichern.', [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Leeren', v:true, c:'danger'}]);
  if(ok){ S.coll = {}; persist(); toast('Sammlung geleert'); render(); }
};
A['csv-import'] = async () => {
  const t = await pickFile('.csv,.txt,text/csv,text/plain'); if(!t) return;
  const rows = ENGINE.parseCSV(t); if(rows.length < 2){ toast('Datei ist leer'); return; }
  const H = rows[0].map(h => ENGINE.norm(h));
  const find = (...res) => { for(const re of res){ const i = H.findIndex(h => re.test(h)); if(i >= 0) return i; } return -1; };
  const iSet = find(/^SET( NUMBER| NR| NO| CODE| ID)?$/, /^SET (NUM|NR|CODE)/, /^EDITION$/);
  const iNum = find(/^CARD (NUMBER|NR|NO)$/, /^(NUMBER|NR|NO|NUMMER|COLLECTOR NUMBER)$/, /NUMBER/);
  const iFoilCount = find(/^FOIL (COUNT|QUANTITY|QTY|ANZAHL)$/, /^(COUNT|QUANTITY|QTY) FOIL$/);
  const iCount = find(/^(COUNT|QUANTITY|QTY|ANZAHL|AMOUNT|MENGE)$/, /^(NORMAL|REGULAR)( COUNT| QUANTITY| QTY)?$/, /COUNT|QUANTITY|QTY/);
  const iVar = find(/^(VARIANT|FINISH|PRINTING|FOIL|IS FOIL|AUSFUHRUNG)$/);
  const iLang = find(/^(LANGUAGE|LANG|SPRACHE)$/);
  const iName = find(/^(NAME|CARD NAME|CARD|KARTE|FULL NAME)$/);
  const iVer = find(/^(VERSION|SUBTITLE|TITLE)$/);
  const out = [], bad = [];
  for(const r of rows.slice(1)){
    let c = null;
    const setv = iSet >= 0 ? String(r[iSet] || '').trim().replace(/^0+(\d)/, '$1') : '';
    const numv = iNum >= 0 ? String(r[iNum] || '').trim() : '';
    if(setv && numv){
      const n = parseInt(numv, 10), v = (numv.match(/[a-e]$/i) || [''])[0].toLowerCase();
      const arr = S.cards.filter(x => x.s === setv && x.n === n);
      c = arr.find(x => (x.v || '') === v) || arr[0] || null;
    }
    if(!c && iName >= 0){
      const nm = String(r[iName] || '') + (iVer >= 0 && r[iVer] ? ' - ' + r[iVer] : '');
      const f = ENGINE.findByName(nm); if(f && f.length) c = ENGINE.preferPrinting(f);
    }
    if(!c){ bad.push(r.join(', ')); continue; }
    const lv = iLang >= 0 ? ENGINE.norm(r[iLang]) : '';
    const lang = /^(DE|GER|DEUTSCH)/.test(lv) ? 'de' : /^(EN|ENG)/.test(lv) ? 'en' : /^(FR|FRA)/.test(lv) ? 'fr' : /^(IT|ITA)/.test(lv) ? 'it' : S.settings.defaultLang;
    const cnt = iCount >= 0 ? parseInt(r[iCount], 10) : 1;
    const vv = iVar >= 0 ? ENGINE.norm(r[iVar]) : '';
    const isFoil = !!vv && !/NON|NORMAL|REGULAR|FALSE|NO|NEIN|^0$/.test(vv) && /FOIL|COLD|TRUE|YES|JA|^1$/.test(vv);
    if(iFoilCount >= 0){
      const fc = parseInt(r[iFoilCount], 10) || 0;
      if(cnt > 0) out.push({c, lang, foil:false, n:cnt});
      if(fc > 0) out.push({c, lang, foil:true, n:fc});
    } else if(!isNaN(cnt) && cnt > 0) out.push({c, lang, foil:isFoil, n:cnt});
  }
  if(!out.length){ toast('Keine Karten erkannt – Format unbekannt', 4000); return; }
  const total = out.reduce((s, x) => s + x.n, 0);
  const mode = await ask('CSV importieren', `${total} Karten erkannt${bad.length ? `, ${bad.length} Zeile(n) nicht zugeordnet` : ''}. Wie soll ich sie übernehmen?`,
    [{l:'Zur Sammlung hinzufügen', v:'add'}, {l:'Sammlung ersetzen', v:'replace', c:'ghost'}, {l:'Abbrechen', v:null, c:'ghost'}]);
  if(!mode) return;
  if(mode === 'replace') S.coll = {};
  for(const x of out) addCard(x.c.id, x.lang, x.foil, x.n);
  await saveNow(); toast(`${total} Karten importiert ✓`, 3000); render();
};

/* =========================================================
   Scanner (freihändig)
   ========================================================= */
const ROTS = [0, 90, 270, 180];
const SC = {on:false, paused:false, stream:null, busy:false, state:'search', last:null, lastN:0, lockSig:null, lastAdded:null, emptyRun:0, sawEmpty:true,
  rot:0, goodRot:null, fail:0, session:[], torch:false, timer:null};
const vid = $('#vid');

function scanStatus(t, cls){ $('#scan-status').textContent = t; const f = $('#frame'); f.classList.toggle('ok', cls === 'ok'); f.classList.toggle('read', cls === 'read'); }
function scanOptsUI(){
  const s = S.settings;
  $('#opt-lang').textContent = 'Sprache: ' + ({auto:'Auto', de:'Deutsch', en:'Englisch'})[s.scanLang];
  $('#opt-foil').textContent = s.foil ? '✦ Foil' : 'Normal';
  $('#opt-foil').classList.toggle('on', !!s.foil);
  $('#opt-rot').textContent = '↻ ' + (s.rotation === 'auto' ? 'Auto' + (SC.goodRot != null ? ' ' + SC.goodRot + '°' : '') : s.rotation + '°');
  $('#opt-pause').textContent = SC.paused ? '▶ Weiter' : '⏸ Pause';
  $('#opt-size').textContent = '▢ Rahmen ' + ({s:'klein', m:'mittel', l:'groß'})[s.frame || 'm'];
  $('#frame').className = 'frame size-' + (s.frame || 'm');
  $('#btn-torch').classList.toggle('on', SC.torch);
  const v = SC.session.reduce((sum, x) => sum + (priceEUR(x.c, x.foil) || 0), 0);
  $('#scan-sum').textContent = `${SC.session.length} ${SC.session.length === 1 ? 'Karte' : 'Karten'} · ${money(v)}`;
}
A['scan-open'] = async () => {
  if(!S.cards.length){ toast('Kartendaten fehlen noch'); return; }
  $('#scan').hidden = false; SC.on = true; SC.paused = false; SC.state = 'search'; SC.last = null; SC.sawEmpty = true; SC.lastAdded = null;
  SC.rot = S.settings.rotation === 'auto' ? (SC.goodRot ?? 0) : +S.settings.rotation;
  scanOptsUI(); renderLast();
  if(!NATIVE) scanStatus('Texterkennung wird geladen …');
  try{
    SC.stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}}});
    vid.srcObject = SC.stream; await vid.play().catch(() => {});
    try{ const tr = SC.stream.getVideoTracks()[0]; const caps = tr.getCapabilities ? tr.getCapabilities() : {};
      if(caps.focusMode && caps.focusMode.includes('continuous')) await tr.applyConstraints({advanced:[{focusMode:'continuous'}]}); }catch(e){}
    if(NATIVE) NATIVE.keepAwake(true);
    if(!NATIVE){ try{ await webOcrWorker(); }catch(e){ scanStatus('Texterkennung nicht verfügbar'); return; } }
    scanStatus('Lege eine Karte unter die Kamera'); scanLoop();
  }catch(e){
    scanStatus('Kamera nicht verfügbar');
    toast('Bitte erlaube den Kamerazugriff für Foxycana', 4000);
  }
};
function stopScanner(){
  SC.on = false; clearTimeout(SC.timer);
  if(SC.stream){ SC.stream.getTracks().forEach(t => t.stop()); SC.stream = null; }
  vid.srcObject = null; SC.torch = false;
  if(NATIVE) NATIVE.keepAwake(false);
}
A['scan-close'] = () => { stopScanner(); $('#scan').hidden = true; if(SC.session.length) toast(`${SC.session.length} Karten gescannt`); render(); };
A['scan-size'] = () => { const o = ['s','m','l']; S.settings.frame = o[(o.indexOf(S.settings.frame || 'm') + 1) % 3]; persist(); scanOptsUI(); SC.state = 'search'; SC.last = null; };
A['scan-pause'] = () => { SC.paused = !SC.paused; scanStatus(SC.paused ? 'Pausiert' : 'Lege eine Karte unter die Kamera'); scanOptsUI(); };
A['scan-foil'] = () => { S.settings.foil = !S.settings.foil; persist(); scanOptsUI(); };
A['scan-lang'] = () => { const o = ['auto','de','en']; S.settings.scanLang = o[(o.indexOf(S.settings.scanLang) + 1) % 3]; persist(); scanOptsUI(); };
A['scan-rot'] = () => { const o = ['auto','0','90','180','270']; S.settings.rotation = o[(o.indexOf(String(S.settings.rotation)) + 1) % o.length]; if(S.settings.rotation !== 'auto') SC.rot = +S.settings.rotation; persist(); scanOptsUI(); };
A['scan-torch'] = async () => {
  try{ const tr = SC.stream && SC.stream.getVideoTracks()[0]; if(!tr) return; SC.torch = !SC.torch; await tr.applyConstraints({advanced:[{torch:SC.torch}]}); }
  catch(e){ SC.torch = false; toast('Licht wird hier nicht unterstützt'); }
  scanOptsUI();
};

const OCRP = new Map(); let ocrSeq = 0;
window.__ocrDone = (id, json) => { const f = OCRP.get(id); if(!f) return; OCRP.delete(id); try{ f(JSON.parse(json)); }catch(e){ f({error:String(e)}); } };
function runOcr(dataUrl, rot){
  return new Promise(res => { const id = 'o' + (++ocrSeq); OCRP.set(id, res); NATIVE.ocr(id, dataUrl, rot);
    setTimeout(() => { if(OCRP.has(id)){ OCRP.delete(id); res({error:'timeout'}); } }, 9000); });
}
/* Texterkennung im Browser (iPhone): Tesseract.js, wird beim ersten Scan geladen */
let TESS = null;
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Script')); document.head.appendChild(s); }); }
async function webOcrWorker(){
  if(TESS) return TESS;
  if(!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  TESS = await Tesseract.createWorker(['eng', 'deu']);
  return TESS;
}
async function webOcr(canvas, rot){
  const w = await webOcrWorker();
  let src = canvas;
  if(rot){
    const t = document.createElement('canvas'), sw = rot % 180 ? canvas.height : canvas.width, sh = rot % 180 ? canvas.width : canvas.height;
    t.width = sw; t.height = sh; const x = t.getContext('2d');
    x.translate(sw / 2, sh / 2); x.rotate(rot * Math.PI / 180); x.drawImage(canvas, -canvas.width / 2, -canvas.height / 2); src = t;
  }
  try{
    const {data} = await w.recognize(src);
    let lines = (data.lines || []).map(l => ({t: String(l.text || '').trim()}));
    if(!lines.length && data.text) lines = data.text.split('\n').map(t => ({t: t.trim()}));
    return {lines: lines.filter(l => l.t)};
  }catch(e){ return {error: String(e)}; }
}
const sigCv = $('#cv-sig'), sigCtx = sigCv.getContext('2d', {willReadFrequently:true});
/* Bereich des Rahmens auf dem Bildschirm → Ausschnitt im Kamerabild (Video ist "cover" skaliert) */
function guideCrop(){
  const vw = vid.videoWidth, vh = vid.videoHeight;
  const vr = vid.getBoundingClientRect(), fr = $('#frame').getBoundingClientRect();
  const s = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vr.width - vw * s) / 2, offY = (vr.height - vh * s) / 2;
  const m = 0.05; // kleiner Rand, damit die Sammlernummer am Kartenrand nicht abgeschnitten wird
  let x = (fr.left - vr.left - offX - fr.width * m) / s, y = (fr.top - vr.top - offY - fr.height * m) / s;
  let w = fr.width * (1 + 2 * m) / s, h = fr.height * (1 + 2 * m) / s;
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
  if(!(w > 20 && h > 20)) return {x:0, y:0, w:vw, h:vh};
  return {x, y, w, h};
}
function frameSig(r){
  sigCtx.drawImage(vid, r.x, r.y, r.w, r.h, 0, 0, 24, 24);
  const d = sigCtx.getImageData(0, 0, 24, 24).data; const g = new Uint8Array(576);
  for(let i = 0; i < 576; i++) g[i] = (d[i*4] * 3 + d[i*4+1] * 6 + d[i*4+2]) / 10;
  return g;
}
function sigDiff(a, b){ if(!a || !b) return 255; let s = 0; for(let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; }

function scanLoop(){
  if(!SC.on) return;
  clearTimeout(SC.timer);
  SC.timer = setTimeout(async () => {
    if(!SC.on) return;
    if(!SC.paused && !SC.busy && vid.videoWidth){ SC.busy = true; try{ await scanTick(); }catch(e){ console.warn(e); } SC.busy = false; }
    scanLoop();
  }, SC.state === 'lock' ? 160 : 90);
}
async function scanTick(){
  const crop = guideCrop();
  const sig = frameSig(crop);
  if(SC.state === 'lock'){
    if(sigDiff(sig, SC.lockSig) < 16) return;       // Karte liegt noch – nichts tun
    SC.state = 'search'; SC.last = null; SC.lastN = 0;
    scanStatus('Nächste Karte …');
  }
  // Nur den Bereich im Rahmen auswerten – Nachbarkarten (z. B. im Binder) werden ignoriert
  const cv = $('#cv');
  const sc = NATIVE ? Math.min(2, Math.max(1, 1400 / Math.max(crop.w, crop.h))) : Math.min(1.5, 1000 / Math.max(crop.w, crop.h));
  cv.width = Math.round(crop.w * sc); cv.height = Math.round(crop.h * sc);
  const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
  cx.drawImage(vid, crop.x, crop.y, crop.w, crop.h, 0, 0, cv.width, cv.height);
  const res = NATIVE ? await runOcr(cv.toDataURL('image/jpeg', 0.86), SC.rot) : await webOcr(cv, SC.rot);
  if(!SC.on || SC.paused) return;
  if(res.error){ scanStatus('Texterkennung: ' + res.error); return; }
  const nLines = (res.lines || []).length;
  const r = ENGINE.identify(res);

  if(!r || r.empty){
    SC.last = null; SC.lastN = 0;
    if(r && r.empty){ SC.emptyRun++; if(SC.emptyRun >= 2) SC.sawEmpty = true; } else SC.emptyRun = 0;
    // Ausrichtung automatisch durchprobieren, solange nichts erkannt wird
    if(S.settings.rotation === 'auto'){
      if(nLines >= 2 || SC.goodRot == null) SC.fail++;
      if(SC.fail >= (SC.goodRot == null ? 2 : 6)){ SC.fail = 0; SC.rot = ROTS[(ROTS.indexOf(SC.rot) + 1) % ROTS.length]; scanOptsUI(); }
    }
    scanStatus(nLines >= 2 ? 'Lese Karte …' : 'Lege eine Karte unter die Kamera', nLines >= 2 ? 'read' : '');
    return;
  }
  SC.emptyRun = 0; SC.fail = 0;
  if(S.settings.rotation === 'auto' && SC.goodRot !== SC.rot){ SC.goodRot = SC.rot; scanOptsUI(); }

  const need = Math.max(1, +S.settings.confirm || 2);
  if(SC.last && SC.last.c.id === r.c.id && SC.last.lang === r.lang) SC.lastN++; else { SC.last = r; SC.lastN = 1; }
  if(r.strong || SC.lastN >= need){
    // Dieselbe Karte liegt noch (Hand nur kurz im Bild)? Dann nicht doppelt zählen.
    if(SC.lastAdded && SC.lastAdded.c.id === r.c.id && !SC.sawEmpty){ SC.state = 'lock'; SC.lockSig = sig; scanStatus('✓ ' + cName(r.c) + ' – nächste Karte', 'ok'); return; }
    confirmScan(r, sig);
  } else scanStatus('Erkenne: ' + cName(r.c, r.lang), 'read');
}
function confirmScan(r, sig){
  const foil = !!S.settings.foil;
  addCard(r.c.id, r.lang, foil, 1);
  const item = {sid: 'x' + Date.now() + Math.random(), c: r.c, lang: r.lang, foil, ambiguous: r.ambiguous, t: Date.now()};
  SC.session.unshift(item); SC.lastAdded = item; SC.sawEmpty = false;
  SC.state = 'lock'; SC.lockSig = sig; SC.last = null; SC.lastN = 0;
  if(NATIVE){ if(S.settings.sound) NATIVE.beep(); if(S.settings.vibrate) NATIVE.vibrate(60); }
  const fl = $('#flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
  scanStatus('✓ ' + cName(r.c, r.lang) + ' – nächste Karte', 'ok');
  renderLast(); scanOptsUI();
}
function renderLast(){
  const x = SC.session[0];
  $('#scan-last').innerHTML = x ? `<div class="last-card" data-sid="${x.sid}">
    <img src="${esc(cThumb(x.c, x.lang))}" onerror="this.style.visibility='hidden'"><div class="grow"><b class="ell">${esc(cName(x.c, x.lang))}</b>
    <div class="tiny muted ell">${esc(cVer(x.c, x.lang))} · ${esc(setName(x.c.s))} #${x.c.n ?? ''}${esc(x.c.v)}</div>
    <div class="tiny"><span class="gold">${money(priceEUR(x.c, x.foil))}</span> · ${x.lang.toUpperCase()}${x.foil ? ' · ✦ Foil' : ''}${x.ambiguous ? ' · <span style="color:var(--gold2)">Druck prüfen</span>' : ''}</div></div>
    <button class="round" style="width:38px;height:38px" data-act="scan-edit" data-sid="${x.sid}">✎</button>
    <button class="round" style="width:38px;height:38px" data-act="scan-undo" data-sid="${x.sid}">↶</button></div>` : '';
}
function sessionItem(sid){ return SC.session.find(x => x.sid === sid); }
A['scan-undo'] = el => {
  const x = sessionItem(el.dataset.sid); if(!x) return;
  addCard(x.c.id, x.lang, x.foil, -1); SC.session = SC.session.filter(y => y !== x);
  if(SC.lastAdded === x) SC.lastAdded = null;
  renderLast(); scanOptsUI(); if(sheetOpen()) A['scan-list'](); toast('Entfernt: ' + cName(x.c));
};
function changeItem(x, patch){
  addCard(x.c.id, x.lang, x.foil, -1); Object.assign(x, patch); addCard(x.c.id, x.lang, x.foil, 1);
  renderLast(); scanOptsUI();
}
A['scan-edit'] = el => {
  const x = sessionItem(el.dataset.sid); if(!x) return;
  const prints = ENGINE.printings(x.c);
  openSheet(`<h2>${esc(cName(x.c, x.lang))}</h2><div class="muted small">${esc(cVer(x.c, x.lang))}</div>
    <label class="lbl">Sprache</label><div class="seg">${['de','en'].map(L => `<button class="${x.lang===L?'on':''}" data-act="se-set" data-sid="${x.sid}" data-k="lang" data-v="${L}">${L === 'de' ? 'Deutsch' : 'Englisch'}</button>`).join('')}</div>
    <label class="lbl">Ausführung</label><div class="seg"><button class="${!x.foil?'on':''}" data-act="se-set" data-sid="${x.sid}" data-k="foil" data-v="0">Normal</button><button class="${x.foil?'on':''}" data-act="se-set" data-sid="${x.sid}" data-k="foil" data-v="1">✦ Foil</button></div>
    ${prints.length > 1 ? `<label class="lbl">Druck / Set</label><div class="list">${prints.map(p => `<button class="item" style="width:100%;text-align:left" data-act="se-set" data-sid="${x.sid}" data-k="c" data-v="${p.id}"><img src="${esc(cThumb(p))}" style="width:34px;height:47px;border-radius:4px;object-fit:cover"><div class="grow">${esc(setName(p.s))} #${p.n ?? '–'}${esc(p.v)}<div class="tiny muted">${esc(RAR_DE[p.r] || p.r)}</div></div>${p.id === x.c.id ? '✓' : ''}</button>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn danger" data-act="scan-undo" data-sid="${x.sid}">Entfernen</button><button class="btn" data-act="sheet-close">Fertig</button></div>`);
};
A['se-set'] = el => {
  const x = sessionItem(el.dataset.sid); if(!x) return;
  const k = el.dataset.k, v = el.dataset.v;
  changeItem(x, k === 'lang' ? {lang:v} : k === 'foil' ? {foil: v === '1'} : {c: S.byId.get(+v) || x.c, ambiguous:false});
  A['scan-edit']({dataset:{sid:x.sid}});
};
A['scan-list'] = () => {
  const v = SC.session.reduce((s, x) => s + (priceEUR(x.c, x.foil) || 0), 0);
  openSheet(`<h2>Diese Scan-Runde</h2><p class="muted small">${SC.session.length} Karten · ${money(v)}</p><div class="list">${SC.session.map(x => `<div class="item">
      <img src="${esc(cThumb(x.c, x.lang))}" style="width:38px;height:53px;border-radius:5px;object-fit:cover">
      <div class="grow"><b class="ell" style="display:block">${esc(cName(x.c, x.lang))}</b><div class="tiny muted ell">${esc(cVer(x.c, x.lang))} · ${x.lang.toUpperCase()}${x.foil ? ' · Foil' : ''}${x.ambiguous ? ' · <span class="gold">Druck prüfen</span>' : ''}</div></div>
      <span class="gold small">${money(priceEUR(x.c, x.foil))}</span><button class="chip" data-act="scan-edit" data-sid="${x.sid}">✎</button></div>`).join('') || '<div class="empty">Noch nichts gescannt.</div>'}</div>`);
};
A['scan-manual'] = () => openSearch('Karte manuell hinzufügen', c => {
  const lang = S.settings.scanLang === 'auto' ? S.settings.defaultLang : S.settings.scanLang;
  addCard(c.id, lang, !!S.settings.foil, 1);
  const item = {sid:'x' + Date.now(), c, lang, foil: !!S.settings.foil, ambiguous:false, t:Date.now()};
  SC.session.unshift(item); closeSheet(); renderLast(); scanOptsUI(); toast('Hinzugefügt: ' + cName(c));
});

/* =========================================================
   Globale Ereignisse & Start
   ========================================================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  const f = A[el.dataset.act]; if(!f) return;
  e.preventDefault(); f(el, e);
});
window.__androidBack = () => {
  if(sheetOpen()){ closeSheet(); return true; }
  if(!$('#scan').hidden){ A['scan-close'](); return true; }
  if(goBack()) return true;
  if(S.ui.tab !== 'collection' || S.ui.deck || S.ui.assist){ Object.assign(S.ui, {tab:'collection', deck:null, assist:null}); render(); return true; }
  return false;
};
window.__appPause = () => { saveNow(); try{ autoBackup(); }catch(e){} if(SC.on){ SC.paused = true; scanOptsUI(); scanStatus('Pausiert'); } };
document.addEventListener('error', e => { const t = e.target; if(t && t.tagName === 'IMG') t.style.visibility = 'hidden'; }, true);
document.addEventListener('visibilitychange', () => { if(document.hidden) saveNow(); else if(S.cards.length && Date.now() - lastRefresh > 3 * HOUR) backgroundRefresh(); });

function bootScreen(msg, err){
  view.innerHTML = `<div class="boot"><div class="logo" style="margin-bottom:20px">${LOGO}<h1 style="margin:0">Foxycana</h1></div>
    ${err ? `<div class="warn" style="max-width:360px">${esc(err)}</div><button class="btn" style="margin-top:16px" data-act="retry-boot">Nochmal versuchen</button>`
      : `<div class="loader"></div><b>${esc(msg)}</b><p class="muted small" style="max-width:320px">Beim ersten Start lädt Foxycana alle Lorcana-Karten auf Deutsch und Englisch (ca. 20–30 MB). Danach geht es schnell.</p>`}</div>`;
}
A['retry-boot'] = () => firstRun();
async function firstRun(){
  try{ await updateCards(m => bootScreen(m)); }
  catch(e){ bootScreen('', 'Die Kartendaten konnten nicht geladen werden (' + e.message + '). Bitte prüfe deine Internetverbindung.'); return; }
  bootScreen('Lade Cardmarket-Preise …');
  try{ await updatePrices(); }catch(e){ console.warn(e); }
  try{ await updateRates(); }catch(e){ console.warn(e); }
  render(); lastRefresh = Date.now(); if(window.ASSIST) ASSIST.loadMeta(true).catch(() => {}); probeDecks();
}
/* Beim Start (und nach längerer Pause) alles aktualisieren: Karten, Preise, Kurse, Meta */
let refreshing = false, lastRefresh = 0;
function setSync(t){ S.syncMsg = t; const el = $('#sync'); if(el) el.textContent = t; }
function softRender(){ const a = document.activeElement; if(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return; if(sheetOpen()) { refreshBehindSheet(); return; } render(); }
async function backgroundRefresh(){
  if(refreshing) return; refreshing = true; lastRefresh = Date.now();
  let errs = 0; setSync('⟳ Aktualisiere Daten …');
  try{
    const md = await getJSON(WEB ? wd('metadata.json') : LJ + 'en/metadata.json');
    if(!S.cardsDate || (md.generatedOn && md.generatedOn !== S.cardsDate) || S.cardsV !== 2){ setSync('⟳ Neue Kartendaten werden geladen …'); await updateCards(); }
  }catch(e){ errs++; console.warn(e); }
  try{ setSync('⟳ Aktualisiere Preise …'); await updatePrices(); }catch(e){ errs++; console.warn(e); }
  try{ await updateRates(); }catch(e){ errs++; console.warn(e); }
  try{ if(window.ASSIST) await ASSIST.loadMeta(true); }catch(e){ errs++; console.warn(e); }
  probeDecks();
  refreshing = false;
  setSync(errs ? 'Offline – zeige gespeicherte Daten' : '✓ Alles aktuell');
  softRender();
}
async function boot(){
  try{ await DB.open(); }catch(e){ console.warn('IndexedDB', e); }
  if(WEB && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await loadUser();
  const cd = await DB.get('cards'); if(cd && cd.cards && cd.cards.length) applyCards(cd);
  const pr = await DB.get('prices'); if(pr){ S.prices = pr.m || {}; S.cmFb = pr.fb || {}; S.priceDate = pr.date; S.priceFetched = pr.fetched || 0; }
  const fx = await DB.get('rates'); if(fx){ S.rates = fx.rates || {EUR:1}; S.ratesDate = fx.date; S.ratesFetched = fx.fetched || 0; }
  if(!S.cards.length){ bootScreen('Starte …'); await firstRun(); }
  else { render(); backgroundRefresh(); }
}
boot();
