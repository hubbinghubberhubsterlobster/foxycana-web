'use strict';
/* =========================================================
   Foxycana – Daten: Kartenkatalog, Preise, Kurse, Speicher
   ========================================================= */
const NATIVE = window.Native || null;
const LJ = 'https://lorcanajson.org/files/current/';
const CM_GAME = 19; // Cardmarket-Spiel-ID für Disney Lorcana
const CM_PG = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_' + CM_GAME + '.json';
const CM_PL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_' + CM_GAME + '.json';
const FX_URL = 'https://api.frankfurter.app/latest?from=EUR';
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const CURRENCIES = ['EUR','USD','GBP','CHF','PLN','CZK','DKK','SEK','NOK','HUF','JPY','CAD','AUD'];
const HOUR = 3600e3;
// Web-Version (iPhone): ohne Android-Hülle. Daten kommen vorbereitet aus /data (täglich per GitHub aktualisiert).
const WEB = !NATIVE;
const WD = 'data/';
function wd(f){ return WD + f + '?t=' + Math.floor(Date.now() / 60000); }

const INKS = {
  Amber:{de:'Bernstein',c:'#F4B223'}, Amethyst:{de:'Amethyst',c:'#8E5BB5'}, Emerald:{de:'Smaragd',c:'#2E9E52'},
  Ruby:{de:'Rubin',c:'#D7263D'}, Sapphire:{de:'Saphir',c:'#1C8FD6'}, Steel:{de:'Stahl',c:'#9AA5B1'}
};
const RARITIES = ['Common','Uncommon','Rare','Super Rare','Legendary','Epic','Enchanted','Iconic','Special'];
const RAR_DE = {Common:'Gewöhnlich',Uncommon:'Ungewöhnlich',Rare:'Selten','Super Rare':'Superselten',Legendary:'Legendär',Epic:'Episch',Enchanted:'Verzaubert',Iconic:'Ikonisch',Special:'Promo'};
const SPECIAL_RAR = new Set(['Enchanted','Special','Epic','Iconic']);
const TYPE_DE = {Character:'Charakter',Action:'Aktion',Item:'Gegenstand',Location:'Ort'};

// Fertigdecks aus LorcanaJSON: [Code, Set, Farben, Name]
const PREBUILT = [
  ['S1-1','1','Amber-Amethyst'],['S1-2','1','Emerald-Ruby'],['S1-3','1','Sapphire-Steel'],
  ['S2-1','2','Amber-Sapphire'],['S2-2','2','Amethyst-Steel'],
  ['S3-1','3','Amber-Emerald'],['S3-2','3','Ruby-Sapphire'],
  ['S4-1','4','Amber-Amethyst'],['S4-2','4','Sapphire-Steel'],
  ['S5-1','5','Amethyst-Ruby'],['S5-2','5','Emerald-Steel'],
  ['S6-1','6','Amber-Ruby'],['S6-2','6','Emerald-Sapphire'],
  ['S7-1','7','Amethyst-Steel'],['S7-2','7','Ruby-Sapphire'],
  ['S8-1','8','Amber-Amethyst'],['S8-2','8','Ruby-Steel'],
  ['S9-1','9','Amber-Sapphire'],['S9-2','9','Emerald-Ruby'],
  ['S10-1','10','Amber-Emerald'],['S10-2','10','Sapphire-Steel'],
  ['S12-1','12','Amber-Emerald'],['S12-2','12','Amethyst-Ruby'],
  ['S14-1','14','Amethyst-Steel'],['S14-2','14','Emerald-Sapphire'],
  ['G1-1','G1','Amber-Amethyst','Der Einstieg – Deck 1'],['G1-2','G1','Ruby-Sapphire','Der Einstieg – Deck 2'],
  // Illumineer's Quest: Komplettpaket = alle Decks aus der Box (Bossdeck + Deck A + Deck B)
  ['Q1-1+Q1-2+Q1-3','Q1','','{Q1} – Komplette Box (3 Decks)'],['Q1-2','Q1','Amber-Ruby','{Q1} – Deck A'],
  ['Q1-3','Q1','Amethyst-Steel','{Q1} – Deck B'],['Q1-1','Q1','','{Q1} – Ursulas Deck (Bossdeck)'],
  ['Q2-1+Q2-2+Q2-3','Q2','','{Q2} – Komplette Box (3 Decks)'],['Q2-2','Q2','Amber-Steel','{Q2} – Deck A'],
  ['Q2-3','Q2','Amethyst-Sapphire','{Q2} – Deck B'],['Q2-1','Q2','','{Q2} – Dschafars Deck (Bossdeck)'],
  ['Q3-1+Q3-2+Q3-3','Q3','','{Q3} – Komplette Box (3 Decks)'],['Q3-2','Q3','Ruby-Steel','{Q3} – Deck A'],
  ['Q3-3','Q3','Amethyst-Sapphire','{Q3} – Deck B'],['Q3-1','Q3','','{Q3} – Bossdeck (Ranken)']
];
// Mögliche neuere Starterdecks – werden im Hintergrund gesucht
const PREBUILT_PROBE = ['Q4-1','Q4-2','Q4-3','Q5-1','Q5-2','Q5-3','S11-1','S11-2','S13-1','S13-2','S15-1','S15-2','S16-1','S16-2','S17-1','S17-2','S18-1','S18-2'];

const S = {
  cards: [], byId: new Map(), sets: {}, cardsDate: null, cardsFetched: 0,
  prices: {}, cmFb: {}, priceDate: null, priceFetched: 0,
  rates: {EUR:1}, ratesDate: null, ratesFetched: 0,
  coll: {},      // "id|lang|foil" -> {q, t}
  decks: [],
  extraDecks: [],
  settings: {
    currency:'EUR', dispLang:'de', priceBasis:'trend',
    scanLang:'auto', defaultLang:'de', confirm:2, sound:true, vibrate:true, rotation:'auto', foil:false, frame:'m'
  },
  ui: { assist:null, tab:'collection', mode:'owned', q:'', inks:[], set:'', rarity:'', type:'', lang:'', foil:'', sort:'value', limit:240, deck:null }
};

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function netUrl(u){ return NATIVE ? '/net?u=' + encodeURIComponent(u) : u; }
async function getText(u){
  const r = await fetch(netUrl(u), {cache:'no-store'});
  if(!r.ok){ let h = u; try{ h = new URL(u, location.href).host; }catch(e){} throw new Error('HTTP ' + r.status + ' bei ' + h); }
  return r.text();
}
async function getJSON(u){ return JSON.parse(await getText(u)); }

/* ---------- IndexedDB (Schlüssel/Wert) ---------- */
const DB = {
  db: null,
  open(){
    return new Promise((res, rej) => {
      try{
        const r = indexedDB.open('foxycana', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      }catch(e){ rej(e); }
    });
  },
  get(k){
    return new Promise((res) => {
      if(!this.db) return res(null);
      try{ const q = this.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }
      catch(e){ res(null); }
    });
  },
  set(k, v){
    return new Promise((res, rej) => {
      if(!this.db) return res();
      try{ const t = this.db.transaction('kv','readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }
      catch(e){ rej(e); }
    });
  }
};

let saveTimer = null;
function persist(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); if(window.scheduleAutoBackup) window.scheduleAutoBackup(); }
async function saveNow(){
  clearTimeout(saveTimer);
  const data = {coll:S.coll, decks:S.decks, settings:S.settings, extraDecks:S.extraDecks};
  try{ localStorage.setItem('fx-user', JSON.stringify(data)); }catch(e){}
  try{ await DB.set('user', data); }catch(e){}
}
async function loadUser(){
  let u = await DB.get('user');
  if(!u){ try{ u = JSON.parse(localStorage.getItem('fx-user') || 'null'); }catch(e){ u = null; } }
  if(u){
    S.coll = u.coll || {}; S.decks = u.decks || []; S.extraDecks = u.extraDecks || [];
    Object.assign(S.settings, u.settings || {});
  }
}

/* ---------- Kartenkatalog (LorcanaJSON, Deutsch + Englisch) ---------- */
function toNum(n){
  if(n == null) return null;
  if(typeof n === 'number') return n;
  const m = String(n).match(/\d+/); return m ? +m[0] : null;
}
function compactCard(c, d){
  const im = c.images || {}, dim = (d && d.images) || {};
  return {
    id: c.id, s: String(c.setCode ?? ''), n: toNum(c.number), v: c.variant || '', fid: c.fullIdentifier || '',
    name: {en: c.name || '', de: (d && d.name) || c.name || ''},
    ver:  {en: c.version || '', de: (d && d.version) || c.version || ''},
    col: c.color || '', ct: c.cost ?? null, ink: !!c.inkwell, t: c.type || '', r: c.rarity || '',
    st: c.strength ?? null, wp: c.willpower ?? null, lo: c.lore ?? null,
    sub: c.subtypes || [], kw: c.keywordAbilities || [],
    subDe: (d && d.subtypes) || [], kwDe: (d && d.keywordAbilities) || [],
    txt: {en: c.fullText || '', de: (d && d.fullText) || ''},
    img: {en: im.full || '', de: dim.full || ''},
    th:  {en: im.thumbnail || im.full || '', de: dim.thumbnail || dim.full || ''},
    cm: (c.externalLinks && c.externalLinks.cardmarketId) || null,
    cmu: (c.externalLinks && c.externalLinks.cardmarketUrl) || '',
    ft: c.foilTypes || [], max: c.maxCopiesInDeck
  };
}
function applyCards(cd){
  S.cards = cd.cards || []; S.sets = cd.sets || {}; S.cardsDate = cd.date; S.cardsFetched = cd.fetched || 0; S.cardsV = cd.v || 1;
  S.byId = new Map(S.cards.map(c => [c.id, c]));
  if(window.ENGINE) ENGINE.reset();
  TERMS = null;
  if(window.ASSIST) ASSIST.reset();
}
async function updateCards(progress=()=>{}){
  if(WEB){
    progress('Lade Kartendaten …');
    const cd = await getJSON(wd('cards.json')); cd.fetched = Date.now();
    await DB.set('cards', cd); applyCards(cd); return cd;
  }
  progress('Lade englische Kartendaten …');
  const en = await getJSON(LJ + 'en/allCards.json');
  let de = null;
  try{ progress('Lade deutsche Kartendaten …'); de = await getJSON(LJ + 'de/allCards.json'); }
  catch(e){ console.warn('Deutsche Daten nicht verfügbar', e); }
  progress('Bereite Karten vor …');
  const deMap = new Map(); if(de && de.cards) for(const c of de.cards) deMap.set(c.id, c);
  const cards = (en.cards || []).map(c => compactCard(c, deMap.get(c.id)));
  const sets = {};
  for(const [code, s] of Object.entries(en.sets || {})){
    const sd = (de && de.sets && de.sets[code]) || {};
    sets[code] = {code, name:{en:s.name || code, de:sd.name || s.name || code}, release: s.releaseDate || s.prereleaseDate || '',
      base: (s.cardCounts && s.cardCounts.base) || null, type: s.type || 'expansion', num: s.number, formats: s.allowedInFormats || null};
  }
  const cd = {v: 3, cards, sets, date: (en.metadata && en.metadata.generatedOn) || new Date().toISOString(), fetched: Date.now(), hasDe: !!de};
  await DB.set('cards', cd);
  applyCards(cd);
  return cd;
}

/* ---------- Cardmarket-Preisguide (täglich, EUR) ---------- */
function pg(p, ...keys){ for(const k of keys){ const v = p[k]; if(v != null && v !== '' && !isNaN(v)) return +v; } return null; }
async function updatePrices(){
  if(WEB){
    const pr = await getJSON(wd('prices.json')); pr.fetched = Date.now();
    await DB.set('prices', pr);
    S.prices = pr.m || {}; S.cmFb = pr.fb || {}; S.priceDate = pr.date; S.priceFetched = pr.fetched; if(window.ASSIST) ASSIST.reset();
    return pr;
  }
  const j = await getJSON(CM_PG);
  const m = {};
  for(const p of (j.priceGuides || j.priceguides || [])){
    m[p.idProduct] = {
      t: pg(p,'trend'), l: pg(p,'low'), a: pg(p,'avg'), a7: pg(p,'avg7'), a30: pg(p,'avg30'),
      tf: pg(p,'trend-foil','trendFoil','foilTrend'), lf: pg(p,'low-foil','lowFoil','foilLow'),
      af: pg(p,'avg-foil','avgFoil'), a30f: pg(p,'avg30-foil','avg30Foil')
    };
  }
  // Fallback für Karten ohne Cardmarket-ID: Zuordnung über den Produktnamen
  const fb = {};
  try{
    const pl = await getJSON(CM_PL);
    const byName = new Map();
    for(const p of (pl.products || [])){ const k = ENGINE.norm(p.name); if(!byName.has(k)) byName.set(k, []); byName.get(k).push(p.idProduct); }
    for(const c of S.cards){
      if(c.cm && m[c.cm]) continue;
      const k = ENGINE.norm(c.name.en + (c.ver.en ? ' ' + c.ver.en : ''));
      const ids = byName.get(k);
      if(ids && ids.length === 1) fb[c.id] = ids[0];
    }
  }catch(e){ console.warn('Produktliste nicht geladen', e); }
  const pr = {m, fb, date: j.createdAt || new Date().toISOString(), fetched: Date.now()};
  await DB.set('prices', pr);
  S.prices = m; S.cmFb = fb; if(window.ASSIST) ASSIST.reset(); S.priceDate = pr.date; S.priceFetched = pr.fetched;
  return pr;
}

/* ---------- Wechselkurse (EZB) ---------- */
async function updateRates(){
  let rates = null, date = null;
  try{
    const j = await getJSON(WEB ? wd('rates.json') : FX_URL);
    rates = Object.assign({EUR:1}, j.rates || {}); date = j.date;
  }catch(e){
    const x = await getText(ECB_URL);
    rates = {EUR:1};
    for(const m of x.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]] = +m[2];
    const d = x.match(/time=['"](\d{4}-\d\d-\d\d)['"]/); date = d ? d[1] : null;
  }
  const fx = {rates, date, fetched: Date.now()};
  await DB.set('rates', fx);
  S.rates = rates; S.ratesDate = date; S.ratesFetched = fx.fetched;
  return fx;
}

/* ---------- Preise & Formatierung ---------- */
function cmId(c){ return c.cm && S.prices[c.cm] ? c.cm : (S.cmFb[c.id] || c.cm); }
function priceRec(c){ const id = cmId(c); return id ? S.prices[id] || null : null; }
function foilOnly(c){ return c.ft && c.ft.length && !c.ft.includes('None'); }
function priceEUR(c, foil){
  const p = priceRec(c); if(!p) return null;
  const b = S.settings.priceBasis;
  const normal = b === 'low' ? p.l : b === 'avg30' ? (p.a30 ?? p.t) : (p.t ?? p.a);
  const foilv  = b === 'low' ? p.lf : b === 'avg30' ? (p.a30f ?? p.tf) : (p.tf ?? p.af);
  if(foil || foilOnly(c)) return foilv || normal || null;
  return normal || null;
}
function money(eur, opts={}){
  if(eur == null || isNaN(eur)) return '–';
  let cur = S.settings.currency, r = cur === 'EUR' ? 1 : S.rates[cur];
  if(!r){ cur = 'EUR'; r = 1; }
  const noDec = cur === 'JPY' || cur === 'HUF';
  try{
    return new Intl.NumberFormat('de-DE', {style:'currency', currency:cur, maximumFractionDigits: noDec ? 0 : 2, minimumFractionDigits: noDec ? 0 : 2}).format(eur * r);
  }catch(e){ return (eur * r).toFixed(2) + ' ' + cur; }
}
function fmtDate(d){
  if(!d) return 'nie';
  const x = new Date(d); if(isNaN(x)) return String(d);
  return x.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'numeric'}) + (String(d).length > 10 ? ', ' + x.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'}) : '');
}

/* ---------- Karten-Anzeige ---------- */
function dl(){ return S.settings.dispLang; }
function cName(c, L=dl()){ return c.name[L] || c.name.en; }
function cVer(c, L=dl()){ return c.ver[L] || c.ver.en; }
function cFull(c, L=dl()){ const v = cVer(c, L); return cName(c, L) + (v ? ' – ' + v : ''); }
function cImg(c, L=dl()){ return c.img[L] || c.img.en; }
function cThumb(c, L=dl()){ return c.th[L] || c.th.en || c.img[L] || c.img.en; }
function setName(code, L=dl()){ const s = S.sets[code]; return s ? (s.name[L] || s.name.en) : 'Set ' + code; }
function inkList(c){ return (c.col || '').split('-').filter(Boolean); }
function inkDots(c){ return inkList(c).map(k => `<i class="dot" style="background:${(INKS[k]||{}).c||'#888'}"></i>`).join(' '); }
function cNumLabel(c){ return (c.n != null ? '#' + c.n + (c.v || '') : '') + ' · ' + setName(c.s); }

/* ---------- Sammlung ---------- */
function ckey(id, lang, foil){ return id + '|' + lang + '|' + (foil ? 1 : 0); }
function addCard(id, lang, foil, n=1){
  const k = ckey(id, lang, foil);
  const e = S.coll[k] || {q:0, t:Date.now()};
  e.q += n; if(n > 0) e.t = Date.now();
  if(e.q <= 0) delete S.coll[k]; else S.coll[k] = e;
  persist();
  return e.q > 0 ? e.q : 0;
}
function qtyOf(id, lang, foil){ const e = S.coll[ckey(id, lang, foil)]; return e ? e.q : 0; }
function entries(){
  const out = [];
  for(const [k, e] of Object.entries(S.coll)){
    const [id, lang, f] = k.split('|');
    const c = S.byId.get(+id) || S.byId.get(id);
    if(c) out.push({c, lang, foil: f === '1', q: e.q, t: e.t || 0});
  }
  return out;
}
function ownedById(){
  const m = new Map();
  for(const e of entries()){
    let a = m.get(e.c.id);
    if(!a){ a = {c:e.c, q:0, qf:0, langs:{}, value:0, t:0}; m.set(e.c.id, a); }
    a.q += e.q; if(e.foil) a.qf += e.q;
    a.langs[e.lang] = (a.langs[e.lang] || 0) + e.q;
    const p = priceEUR(e.c, e.foil); if(p) a.value += p * e.q;
    if(e.t > a.t) a.t = e.t;
  }
  return m;
}
function ownedQty(id){ let q = 0; for(const L of ['de','en','fr','it']) for(const f of [0,1]) q += qtyOf(id, L, f); return q; }
function collectionStats(){
  let total = 0, value = 0; const uniq = new Set();
  for(const e of entries()){ total += e.q; uniq.add(e.c.id); const p = priceEUR(e.c, e.foil); if(p) value += p * e.q; }
  return {total, unique: uniq.size, value};
}

/* ---------- Meta-Seite von inkdecks.com auslesen (auch vom Daten-Skript genutzt) ---------- */
function parseMetaHtml(html, format){
  const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ');
  const ink = '(Amber|Amethyst|Emerald|Ruby|Sapphire|Steel)';
  const re = new RegExp("([A-Z][A-Za-z'.&\\- ]{2,40}?)\\s+" + ink + "\\s*[/&\\- ]\\s*" + ink + "\\s+(\\d{1,2})\\s*%\\s+(\\d{1,3}|--)\\s*%?", 'g');
  const list = []; const seen = new Set(); let m;
  while((m = re.exec(txt))){
    const name = m[1].trim().replace(/^(Tier\s*\w+\s*)/i, ''); const key = name + m[2] + m[3];
    if(seen.has(key) || /meta|share|archetype/i.test(name)) continue; seen.add(key);
    list.push({name, inks:[m[2], m[3]], share:+m[4], wr: m[5] === '--' ? null : +m[5]});
  }
  const dm = txt.match(/Last update:\s*([A-Za-z]+ \d{1,2}, \d{4})/);
  if(list.length < 4) return null;
  return {date: dm ? new Date(dm[1]).toISOString() : new Date().toISOString(), source:'inkdecks.com', format, list: list.slice(0, 20), fetched: Date.now(), live:true};
}

/* ---------- Kartengruppe: gleicher Name + Version = gleiche Karte (alle Drucke/Sprachen) ---------- */
function gkey(c){ return ENGINE.norm(c.name.en + ' ' + (c.ver.en || '')); }

/* ---------- Deutsche Begriffe für Schlüsselwörter und Klassifizierungen (aus den Kartendaten) ---------- */
const KW_DE_FALLBACK = {Bodyguard:'Leibwächter', Challenger:'Herausforderer', Evasive:'Ausweichen', Reckless:'Rücksichtslos', Resist:'Widerstand',
  Rush:'Ansturm', Shift:'Gestaltwandel', Singer:'Sänger', Support:'Unterstützung', Ward:'Schutz', Vanish:'Verschwinden', Boost:'Verstärken', 'Sing Together':'Gemeinsam singen'};
let TERMS = null;
function kwBase(k){ return String(k || '').replace(/[+\-]?\d+.*$/, '').replace(/\s+$/, '').trim(); }
function terms(){
  if(TERMS) return TERMS;
  const kw = {}, sub = {};
  for(const c of S.cards){
    (c.kw || []).forEach((k, i) => { const b = kwBase(k), d = c.kwDe && c.kwDe[i] ? kwBase(c.kwDe[i]) : null; if(b && !kw[b] && d && d !== b) kw[b] = d; });
    (c.sub || []).forEach((k, i) => { if(!sub[k] && c.subDe && c.subDe[i]) sub[k] = c.subDe[i]; });
  }
  for(const [k, v] of Object.entries(KW_DE_FALLBACK)) if(!kw[k]) kw[k] = v;
  TERMS = {kw, sub};
  return TERMS;
}
function kwDe(k){ return terms().kw[kwBase(k)] || kwBase(k); }
function subDe(k){ return terms().sub[k] || k; }
