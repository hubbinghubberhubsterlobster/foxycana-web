// Testlauf für den Deckbuilder mit echten Kartendaten (läuft in GitHub Actions).
// node tools/deck-test.mjs site site/data
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [, , WWW = 'site', DATA = 'site/data'] = process.argv;
const noop = () => {};
const ctx = {window: {}, console, Intl, Date, Math, JSON, Map, Set, URL, setTimeout, clearTimeout, localStorage: null, indexedDB: null, location: {href: 'https://x/'},
  document: {querySelector: () => null, querySelectorAll: () => [], addEventListener: noop}};
ctx.globalThis = ctx;
vm.createContext(ctx);
const files = ['data.js', 'engine.js', 'synergy.js', 'assistant.js'];
let code = 'var A = {}; var view = {}; var go = ()=>{}; var toast = ()=>{}; var backBtn = ()=>"";\n';
for(const f of files) code += fs.readFileSync(path.join(WWW, f), 'utf8') + '\n';
code += 'globalThis.__x = {S, ASSIST, SYN, applyCards, gkey, cName, cVer, kwDe, subDe};';
vm.runInContext(code, ctx);
const X = ctx.__x, S = X.S;
const cd = JSON.parse(fs.readFileSync(path.join(DATA, 'cards.json'), 'utf8'));
X.applyCards(cd);
const pr = JSON.parse(fs.readFileSync(path.join(DATA, 'prices.json'), 'utf8'));
S.prices = pr.m; S.cmFb = pr.fb || {};
console.log('Karten:', S.cards.length);

// Tag-Statistik
const wantsCount = {}, hasCount = {};
for(const c of S.cards){ const t = X.SYN.tagsOf(c); for(const k of t.wants.keys()){ const kk = k.startsWith('name:') ? 'name:*' : k; wantsCount[kk] = (wantsCount[kk] || 0) + 1; } }
console.log('WANTS:', Object.entries(wantsCount).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => k + '=' + v).join(', '));
// Stichproben
for(const c of S.cards.filter(c => c.txt && c.txt.en).sort(() => 0.5 - Math.random()).slice(0, 25)){
  const t = X.SYN.tagsOf(c);
  console.log('·', c.name.en, '-', c.ver.en, '|', c.txt.en.replace(/\s+/g, ' ').slice(0, 140), '\n   HAS', [...t.has].filter(x => !x.startsWith('name:')).join(','), ' WANTS', [...t.wants.keys()].join(','));
}

function show(label, qty){
  console.log('\n==================== ' + label + ' ====================');
  const t0 = Date.now();
  const recs = X.ASSIST.recsFor(qty, false);
  console.log('Zeit:', Date.now() - t0, 'ms, Decks:', recs.length);
  for(const r of recs.slice(0, 4)){
    console.log(`\n### ${r.pair.join('/')} · ${r.style} · Thema ${r.theme || '-'} · ${r.rt.tier} ${r.rt.score} · Synergie ${Math.round(r.rt.synergy * 100)}% · Qualität ${Math.round(r.rt.quality * 100)}`);
    console.log('Pakete:', r.rt.packages.slice(0, 6).map(p => `${p.tag} has${p.has}/wants${p.wants}`).join(' | '));
    console.log('Waisen:', r.rt.orphans.map(o => `${o.g.rep.name.en} braucht ${o.tag} (${o.sup})`).join(' | ') || '-');
    for(const x of [...r.lines].sort((a, b) => (a.g.rep.ct || 0) - (b.g.rep.ct || 0)))
      console.log(`  ${x.n}x [${x.g.rep.ct}] ${x.g.rep.name.en} - ${x.g.rep.ver.en} {${[...x.g.has].filter(t => !t.startsWith('name:')).join(',')}} <${[...x.g.wants.keys()].join(',')}> p${Math.round(x.g.power * 100)}`);
  }
}
// Sammlung A: zwei Starterdecks + zufällige 300 Karten
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const qa = new Map();
for(const f of ['S1-1', 'S5-2']){ try{ const j = JSON.parse(fs.readFileSync(path.join(DATA, 'decks', f + '.json'))); for(const x of j.cards) qa.set(x.id, (qa.get(x.id) || 0) + x.amount); }catch(e){} }
const base = S.cards.filter(c => /^\d+$/.test(c.s) && !['Enchanted','Iconic','Epic','Special'].includes(c.r));
for(let i = 0; i < 300; i++){ const c = base[Math.floor(rnd() * base.length)]; qa.set(c.id, (qa.get(c.id) || 0) + 1); }
show('Sammlung: 2 Starterdecks + 300 Zufallskarten', qa);
// Sammlung B: alles 4x (zeigt, was das Programm im Idealfall baut)
const qb = new Map(); for(const c of base) qb.set(c.id, 4);
show('Alle Karten 4x', qb);
