'use strict';
/* =========================================================
   Foxycana – Bundle-Events
   Ein gekauftes Produkt (Illumineer's Trove, Booster-Display …) wird als eigenes Event geführt:
   Packs öffnen, Karten in das Bundle scannen, Decks NUR aus diesen Karten bauen.
   Später kann man das Bundle in die Sammlung übernehmen – die Bundle-Übersicht bleibt.
   ========================================================= */
const KIND_DE = {trove:'Trove', display:'Displays', booster:'Booster', gift:'Geschenksets', other:'Sonstiges'};
const KIND_NAME = {trove:'Illumineer’s Trove', display:'Booster-Display', booster:'Booster', gift:'Geschenkset'};

/* Produktliste: aus den Sets abgeleitet (neueste zuerst) */
function productList(){
  const soon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  return Object.values(S.sets).filter(s => /^\d+$/.test(s.code) && (!s.release || s.release <= soon))
    .sort((a, b) => setOrder(b.code) < setOrder(a.code) ? -1 : 1)
    .flatMap(s => ['trove', 'display', 'booster', 'gift'].map(kind => ({set:s.code, kind, name: KIND_NAME[kind] + ' – ' + setName(s.code), rel:s.release})));
}

/* ---------- Übersicht ---------- */
function renderBundles(){
  const list = [...S.bundles].sort((a, b) => (b.created || 0) - (a.created || 0));
  view.innerHTML = `<div class="row">${backBtn()}<h1 class="grow">Bundle-Events</h1></div>
    <p class="muted small" style="margin-top:-4px">Trove oder Display gekauft? Leg es hier an, öffne alle Packs und scanne die Karten direkt ins Bundle. Die Karten bleiben getrennt von deiner Sammlung – so baust du Decks <b>nur aus diesem Bundle</b>, z. B. für einen Sealed-Abend.</p>
    <button class="btn block" data-act="bundle-new" style="margin-bottom:14px">🎁 Bundle hinzufügen</button>
    ${list.map(b => { const st = bundleStats(b), decks = S.decks.filter(d => d.pool === b.id).length; return `<button class="deck-item" data-act="bundle-open" data-id="${b.id}">
      <div style="font-size:28px">🎁</div>
      <div class="grow"><b class="ell" style="display:block">${esc(b.name)}</b>
        <div class="tiny muted">${st.total} Karten · ${decks} ${decks === 1 ? 'Deck' : 'Decks'} · ${fmtDate(new Date(b.created).toISOString()).split(',')[0]}</div>
        ${b.merged ? '<div class="tiny" style="color:var(--good)">✓ in Sammlung übernommen</div>' : '<div class="tiny muted">nur im Bundle</div>'}</div>
      <div class="gold small">${money(st.value)}</div></button>`; }).join('')
      || `<div class="empty"><div class="icon">🎁</div><b>Noch keine Bundles</b><p>Tipp auf „Bundle hinzufügen“ und wähle das Produkt aus, das du gekauft hast.</p></div>`}`;
}
A['bundle-open'] = el => go({tab:'bundles', bundle: el.dataset.id, deck:null, assist:null});

/* ---------- Produkt wählen ---------- */
let BP = {q:'', kind:'trove'};
A['bundle-new'] = () => {
  openSheet(`<h2>Welches Produkt hast du gekauft?</h2>
    <div class="chips" id="bp-kind" style="flex-wrap:wrap;margin-bottom:10px">${Object.entries(KIND_DE).filter(([k]) => k !== 'other').map(([k, l]) => `<button class="chip" data-act="bp-kind" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="search">${ICON_SEARCH}<input id="bp-q" placeholder="Set suchen, z. B. Himmelsflut" value="${esc(BP.q)}"></div>
    <div id="bp-list" class="list"></div>
    <button class="btn ghost block" style="margin-top:10px" data-act="bp-custom">✎ Eigenes Produkt / eigener Name</button>`);
  const q = $('#bp-q'); let t = null; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { BP.q = q.value; bpList(); }, 200); };
  bpList();
};
function bpList(){
  $$('#bp-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === BP.kind));
  const q = ENGINE.norm(BP.q);
  const items = productList().filter(p => p.kind === BP.kind && (!q || ENGINE.norm(p.name + ' ' + p.set + ' ' + setName(p.set, 'en')).includes(q)));
  window.__bp = items;
  $('#bp-list').innerHTML = items.map((p, i) => `<button class="item" style="width:100%;text-align:left" data-act="bp-pick" data-i="${i}">
    <div style="font-size:22px">🎁</div><div class="grow"><b style="display:block">${esc(p.name)}</b><span class="tiny muted">Set ${esc(p.set)}${p.rel ? ' · ' + fmtDate(p.rel) : ''}</span></div><span class="muted">›</span></button>`).join('')
    || '<div class="empty">Nichts gefunden.</div>';
}
A['bp-kind'] = el => { BP.kind = el.dataset.k; bpList(); };
async function createBundle(prod, defName){
  const name = await promptText('Name für dieses Bundle-Event', defName); if(!name) return;
  const b = {id:'b' + Date.now() + Math.floor(Math.random() * 1000), name, prod, created: Date.now(), cards:{}, merged:0};
  S.bundles.unshift(b); persist();
  go({tab:'bundles', bundle:b.id, deck:null, assist:null});
  toast('Bundle angelegt – jetzt Packs öffnen und scannen 🎉', 3000);
}
A['bp-pick'] = el => { const p = (window.__bp || [])[+el.dataset.i]; if(!p) return; closeSheet(); createBundle({set:p.set, kind:p.kind, name:p.name}, p.name); };
A['bp-custom'] = () => { closeSheet(); createBundle({set:'', kind:'other', name:''}, 'Mein Bundle'); };

/* ---------- Detail ---------- */
let BF = 'all';
function currentBundle(){ return bundleById(S.ui.bundle); }
function renderBundle(){
  const b = currentBundle(); if(!b){ S.ui.bundle = null; return renderBundles(); }
  syncAlloc();
  const st = bundleStats(b);
  const decks = S.decks.filter(d => d.pool === b.id);
  let items = bundleEntries(b);
  const RARE = new Set(['Rare', 'Super Rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic', 'Special']);
  if(BF === 'rare') items = items.filter(e => RARE.has(e.c.r));
  if(BF === 'foil') items = items.filter(e => e.foil);
  items.sort((x, y) => (priceEUR(y.c, y.foil) || 0) - (priceEUR(x.c, x.foil) || 0) || cName(x.c).localeCompare(cName(y.c), 'de'));
  const rareN = bundleEntries(b).filter(e => RARE.has(e.c.r)).reduce((s, e) => s + e.q, 0);
  view.innerHTML = `<div class="row" style="margin-bottom:8px">${backBtn()}<h1 class="grow ell" style="margin:0">${esc(b.name)}</h1><button class="chip" data-act="bundle-menu">⋯</button></div>
    <div class="hero"><div class="row between"><div><div class="lbl">${b.prod && b.prod.set ? esc(setName(b.prod.set)) + ' · ' : ''}Wert der Karten</div><div class="big">${money(st.value)}</div></div><span style="font-size:30px">🎁</span></div>
      <div class="stats"><div><b>${st.total}</b>Karten</div><div><b>${rareN}</b>Selten+</div><div><b>${decks.length}</b>Decks</div></div>
      ${st.top ? `<div class="tiny" style="color:#d8d4f2;margin-top:8px">Bester Zug: <b>${esc(cName(st.top.c, st.top.lang))}</b>${st.top.foil ? ' (Foil)' : ''} · ${money(st.topV)}</div>` : ''}</div>
    <div class="row" style="gap:8px;margin:12px 0"><button class="btn grow" data-act="bundle-scan">📷 Karten scannen</button><button class="btn ghost" data-act="bundle-manual">+ Manuell</button></div>
    <button class="btn ghost block" style="margin:-4px 0 12px" data-act="bundle-import">📥 Datei importieren (Lorcery, Dreamborn, CSV, Textliste)</button>
    <button class="deck-item assist-cta" data-act="bundle-assist" ${st.total ? '' : 'disabled style="opacity:.5"'}><span style="font-size:26px">✨</span><div class="grow"><b style="display:block">Decks aus diesem Bundle bauen</b><span class="tiny muted">Nur mit den Karten aus dem Bundle – z. B. 40 Karten für den Sealed-Abend</span></div><span class="muted">›</span></button>
    ${b.merged ? `<div class="card small" style="margin-bottom:12px;color:var(--good)">✓ Am ${fmtDate(new Date(b.merged).toISOString()).split(',')[0]} in die Sammlung übernommen. Neue Scans in dieses Bundle landen automatisch auch in der Sammlung.</div>`
      : st.total ? `<div class="card row" style="margin-bottom:12px"><div class="grow small">Die Karten sind <b>nur im Bundle</b> und noch nicht in deiner Sammlung.</div><button class="btn small" data-act="bundle-merge">➕ In Sammlung</button></div>` : ''}
    ${decks.length ? `<h3>Decks aus dem Bundle</h3>` + decks.map(d => { const s = deckStats(d), r = window.ASSIST ? ASSIST.rateDeck(d) : null; return `<button class="deck-item" data-act="deck-open" data-id="${d.id}">${tierBadge(r)}<div class="deck-inks">${inkColDots(s.inks)}</div>
      <div class="grow"><b class="ell" style="display:block">${esc(d.name)}</b><div class="tiny muted">${s.count} Karten</div>${s.missing ? `<div class="miss">${s.missing} fehlen im Bundle</div>` : '<div class="tiny" style="color:var(--good)">✓ komplett aus dem Bundle</div>'}</div></button>`; }).join('') : ''}
    <div class="row between" style="margin:14px 0 8px"><h3 style="margin:0">Karten im Bundle</h3>
      <div class="chips"><button class="chip ${BF==='all'?'on':''}" data-act="bf" data-f="all">Alle</button><button class="chip ${BF==='rare'?'on':''}" data-act="bf" data-f="rare">Selten+</button><button class="chip ${BF==='foil'?'on':''}" data-act="bf" data-f="foil">Foil</button></div></div>
    ${items.map(e => `<div class="deck-line"><img src="${esc(cThumb(e.c, e.lang))}" loading="lazy" data-act="card" data-id="${e.c.id}">
      <div class="grow"><div class="ell" data-act="card" data-id="${e.c.id}"><b>${esc(cName(e.c, e.lang))}</b>${e.foil ? ' <span class="tag">✦ Foil</span>' : ''}</div>
      <div class="tiny muted ell">${inkDots(e.c)} ${esc(RAR_DE[e.c.r] || e.c.r)} · #${e.c.n ?? ''}${esc(e.c.v)} · ${e.lang.toUpperCase()} · <span class="gold">${money(priceEUR(e.c, e.foil))}</span></div></div>
      <div class="stepper"><button data-act="bundle-step" data-k="${esc(e.k)}" data-d="-1">−</button><b>${e.q}</b><button data-act="bundle-step" data-k="${esc(e.k)}" data-d="1">+</button></div></div>`).join('')
      || `<div class="empty">${st.total ? 'Keine Karten für diesen Filter.' : 'Noch keine Karten. Öffne die Packs und tippe auf <b>Karten scannen</b> – jede erkannte Karte landet direkt in diesem Bundle.'}</div>`}`;
}
A.bf = el => { BF = el.dataset.f; renderBundle(); };
A['bundle-step'] = el => {
  const b = currentBundle(); if(!b) return;
  const [id, lang, f] = el.dataset.k.split('|');
  bundleAdd(b, +id || id, lang, f === '1', +el.dataset.d);
  renderBundle();
};
A['bundle-scan'] = () => { const b = currentBundle(); if(b) startScan(b.id); };
A['bundle-manual'] = () => {
  const b = currentBundle(); if(!b) return;
  openSearch('Karte ins Bundle', c => {
    // gleiche Karte aus dem Set des Bundles bevorzugen
    if(b.prod && b.prod.set && c.s !== b.prod.set){ const alt = ENGINE.printings(c).find(x => x.s === b.prod.set); if(alt) c = alt; }
    const lang = S.settings.scanLang === 'auto' ? S.settings.defaultLang : S.settings.scanLang;
    bundleAdd(b, c.id, lang, false, 1); toast(`${cName(c)} → ${b.name}`); closeSheet(); renderBundle();
  });
};
A['bundle-import'] = async () => {
  const b = currentBundle(); if(!b) return; closeSheet();
  const t = await pickFile('.csv,.txt,text/csv,text/plain'); if(!t) return;
  const {out, bad} = parseCardFile(t);
  if(!out.length){ await ask('Nichts erkannt', 'In der Datei habe ich keine Karten gefunden. Exportiere in Lorcery die Sammlung bzw. Liste als <b>CSV</b> und wähle die Datei hier aus.', [{l:'OK', v:true}]); return; }
  const total = out.reduce((s, x) => s + x.n, 0);
  const has = bundleStats(b).total;
  const mode = await ask('In dieses Bundle importieren?', `${total} Karten erkannt${bad.length ? `, <span style="color:var(--bad)">${bad.length} Zeile(n) nicht zugeordnet</span>` : ''}.${has ? ` Im Bundle sind schon ${has} Karten.` : ''}${b.merged ? ' Weil das Bundle schon übernommen ist, landen die Karten auch in der Sammlung.' : ' Deine Sammlung bleibt unverändert.'}`,
    has ? [{l:'Hinzufügen', v:'add'}, {l:'Bundle-Inhalt ersetzen', v:'replace', c:'ghost'}, {l:'Abbrechen', v:null, c:'ghost'}] : [{l:'Importieren', v:'add'}, {l:'Abbrechen', v:null, c:'ghost'}]);
  if(!mode) return;
  if(mode === 'replace') for(const e of bundleEntries(b)) bundleAdd(b, e.c.id, e.lang, e.foil, -e.q);
  for(const x of out) bundleAdd(b, x.c.id, x.lang, x.foil, x.n);
  await saveNow(); renderBundle();
  if(bad.length) await ask(`${total} Karten importiert`, `Diese Zeilen konnte ich keiner Karte zuordnen:<br><br><span class="tiny">${bad.slice(0, 40).map(esc).join('<br>')}${bad.length > 40 ? '<br>…' : ''}</span>`, [{l:'OK', v:true}]);
  else toast(`${total} Karten ins Bundle importiert ✓`, 3000);
};
A['bundle-merge'] = async () => {
  const b = currentBundle(); if(!b) return;
  const st = bundleStats(b);
  const ok = await ask('In die Sammlung übernehmen?', `Alle ${st.total} Karten aus „${esc(b.name)}“ kommen zusätzlich in deine Sammlung. Das Bundle-Event mit seinen Decks bleibt erhalten.`, [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Übernehmen', v:true}]);
  if(!ok) return;
  for(const e of bundleEntries(b)) addCard(e.c.id, e.lang, e.foil, e.q);
  b.merged = Date.now(); persist(); renderBundle(); toast(`${st.total} Karten zur Sammlung hinzugefügt ✓`);
};
A['bundle-assist'] = () => {
  const b = currentBundle(); if(!b || !bundleStats(b).total) return;
  ASSIST.forPool(b.id);
  go({tab:'bundles', bundle:b.id, deck:null, assist:'wizard'});
};
A['bundle-menu'] = () => openSheet(`<h2>Bundle</h2><div class="list">
  <button class="item" style="width:100%" data-act="bundle-rename">✎ Umbenennen</button>
  <button class="item" style="width:100%" data-act="bundle-import">📥 Datei importieren (Lorcery, Dreamborn …)</button>
  <button class="item" style="width:100%" data-act="bundle-csv">📤 Kartenliste als CSV</button>
  <button class="item" style="width:100%;color:var(--bad)" data-act="bundle-delete">🗑️ Bundle-Event löschen</button></div>`);
A['bundle-rename'] = async () => { const b = currentBundle(); closeSheet(); const n = await promptText('Umbenennen', b.name); if(n){ b.name = n; persist(); renderBundle(); } };
A['bundle-csv'] = () => {
  const b = currentBundle(); closeSheet();
  const rows = [['Set Number','Card Number','Variant','Count','Language','Name','Version','Rarity','Price EUR']];
  for(const e of bundleEntries(b)) rows.push([e.c.s, (e.c.n ?? '') + (e.c.v || ''), e.foil ? 'foil' : 'normal', e.q, e.lang.toUpperCase(), e.c.name.en, e.c.ver.en, e.c.r, (priceEUR(e.c, e.foil) || 0).toFixed(2)]);
  saveFile('foxycana-bundle-' + stamp() + '.csv', 'text/csv', rows.map(r => r.map(csvCell).join(',')).join('\n'));
};
A['bundle-delete'] = async () => {
  const b = currentBundle(); closeSheet();
  const decks = S.decks.filter(d => d.pool === b.id);
  const ok = await ask('Bundle-Event löschen?', `„${esc(b.name)}“${decks.length ? ` und seine ${decks.length} Deck(s)` : ''} werden gelöscht.${b.merged ? ' Die Karten bleiben in deiner Sammlung.' : ' Die Karten waren noch nicht in der Sammlung und sind danach weg.'}`, [{l:'Abbrechen', v:false, c:'ghost'}, {l:'Löschen', v:true, c:'danger'}]);
  if(!ok) return;
  S.decks = S.decks.filter(d => d.pool !== b.id); S.bundles = S.bundles.filter(x => x !== b);
  S.ui.bundle = null; NAV.length = 0; persist(); render();
};
