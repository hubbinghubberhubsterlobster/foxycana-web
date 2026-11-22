// Bereitet die Daten für die Web-Version vor (läuft täglich in GitHub Actions).
// Aufruf: node tools/build-data.mjs <www-Ordner> <Ausgabe-Ordner für data/>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [, , WWW = 'site', OUT = 'site/data'] = process.argv;
fs.mkdirSync(path.join(OUT, 'decks'), {recursive: true});

// data.js + engine.js der App laden, damit dieselbe Logik genutzt wird
const ctx = {window: {}, console, Intl, Date, Math, JSON, Map, Set, URL, setTimeout, clearTimeout, localStorage: null, indexedDB: null, location: {href: 'https://x/'}};
ctx.globalThis = ctx;
vm.createContext(ctx);
const code = fs.readFileSync(path.join(WWW, 'data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(WWW, 'engine.js'), 'utf8')
  + '\nglobalThis.__x = {compactCard, pg, parseMetaHtml, PREBUILT, PREBUILT_PROBE, LJ, CM_PG, CM_PL, ENGINE};';
vm.runInContext(code, ctx);
const X = ctx.__x;

async function get(url, type = 'json'){
  const r = await fetch(url, {headers: {'User-Agent': 'Foxycana-Data/1.0 (+github)'}});
  if(!r.ok) throw new Error(r.status + ' ' + url);
  return type === 'json' ? r.json() : r.text();
}
const write = (f, o) => { fs.writeFileSync(path.join(OUT, f), JSON.stringify(o)); console.log('✓', f); };

// 1) Karten (Englisch + Deutsch)
const en = await get(X.LJ + 'en/allCards.json');
let de = null; try { de = await get(X.LJ + 'de/allCards.json'); } catch(e){ console.warn('de fehlt', e.message); }
const deMap = new Map(); if(de) for(const c of de.cards) deMap.set(c.id, c);
const cards = en.cards.map(c => X.compactCard(c, deMap.get(c.id)));
const sets = {};
for(const [k, s] of Object.entries(en.sets || {})){
  const sd = (de && de.sets && de.sets[k]) || {};
  sets[k] = {code: k, name: {en: s.name || k, de: sd.name || s.name || k}, release: s.releaseDate || s.prereleaseDate || '',
    base: (s.cardCounts && s.cardCounts.base) || null, type: s.type || 'expansion', num: s.number, formats: s.allowedInFormats || null};
}
const date = (en.metadata && en.metadata.generatedOn) || new Date().toISOString();
write('cards.json', {v: 2, cards, sets, date, hasDe: !!de});
write('metadata.json', {generatedOn: date});

// 2) Cardmarket-Preise
try {
  const j = await get(X.CM_PG);
  const m = {};
  for(const p of (j.priceGuides || [])) m[p.idProduct] = {t: X.pg(p,'trend'), l: X.pg(p,'low'), a: X.pg(p,'avg'), a7: X.pg(p,'avg7'), a30: X.pg(p,'avg30'),
    tf: X.pg(p,'trend-foil','trendFoil','foilTrend'), lf: X.pg(p,'low-foil','lowFoil','foilLow'), af: X.pg(p,'avg-foil','avgFoil'), a30f: X.pg(p,'avg30-foil','avg30Foil')};
  const fb = {};
  try {
    const pl = await get(X.CM_PL); const byName = new Map();
    for(const p of (pl.products || [])){ const k = X.ENGINE.norm(p.name); if(!byName.has(k)) byName.set(k, []); byName.get(k).push(p.idProduct); }
    for(const c of cards){ if(c.cm && m[c.cm]) continue; const ids = byName.get(X.ENGINE.norm(c.name.en + (c.ver.en ? ' ' + c.ver.en : ''))); if(ids && ids.length === 1) fb[c.id] = ids[0]; }
  } catch(e){ console.warn('Produktliste', e.message); }
  write('prices.json', {m, fb, date: j.createdAt || new Date().toISOString()});
} catch(e){ console.warn('Preise', e.message); }

// 3) Wechselkurse
try { const j = await get('https://api.frankfurter.app/latest?from=EUR'); write('rates.json', {rates: Object.assign({EUR: 1}, j.rates), date: j.date}); }
catch(e){
  try { const x = await get('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', 'text'); const rates = {EUR: 1};
    for(const m of x.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) rates[m[1]] = +m[2];
    const d = x.match(/time=['"](\d{4}-\d\d-\d\d)['"]/); write('rates.json', {rates, date: d ? d[1] : null}); }
  catch(e2){ console.warn('Kurse', e2.message); }
}

// 4) Meta (inkdecks.com)
for(const [fmt, url] of [['core', 'https://inkdecks.com/lorcana-metagame'], ['infinity', 'https://inkdecks.com/lorcana-metagame/infinity']]){
  try { const r = X.parseMetaHtml(await get(url, 'text'), fmt); if(r) write('meta-' + fmt + '.json', r); else console.warn('Meta leer', fmt); }
  catch(e){ console.warn('Meta', fmt, e.message); }
}

// 5) Fertigdecks
async function deck(c){ for(const L of ['de', 'en']){ try { return await get(X.LJ + L + '/decks/deckdata.' + c + '.json'); } catch(e){} } return null; }
const codes = new Set(); for(const p of X.PREBUILT) p[0].split('+').forEach(c => codes.add(c));
for(const c of codes){ const j = await deck(c); if(j) write('decks/' + c + '.json', {cards: j.cards, foilIds: j.foilIds || [], colors: j.colors || [], name: j.name || ''}); }
for(const p of X.PREBUILT) if(p[0].includes('+')){
  const parts = p[0].split('+').map(c => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'decks', c + '.json'))); } catch(e){ return null; } }).filter(Boolean);
  if(parts.length) write('decks/' + p[0] + '.json', {cards: parts.flatMap(j => j.cards), foilIds: parts.flatMap(j => j.foilIds), colors: [], name: ''});
}
const extra = [];
for(const c of X.PREBUILT_PROBE){
  const j = await deck(c); if(!j) continue;
  write('decks/' + c + '.json', {cards: j.cards, foilIds: j.foilIds || [], colors: j.colors || [], name: j.name || ''});
  const set = c[0] === 'Q' ? c.split('-')[0] : c.slice(1).split('-')[0];
  extra.push([c, set, (j.colors || []).join('-'), j.name || (c[0] === 'Q' ? '{' + set + '} – Deck ' + c.split('-')[1] : '')]);
}
write('decks/extra.json', extra);
console.log('Fertig:', cards.length, 'Karten');
