/* Validates the puzzle bank embedded in index.html.
 *
 * Usage:
 *   cd tools && npm install && node validate-puzzles.mjs
 *
 * Checks:
 * 1. Structure — exactly 3 clues per puzzle, valid sides, unique answers,
 *    40 puzzles per difficulty tier.
 * 2. Sanity — each intended answer+clue combo exists in the dictionary as a
 *    single word (note only: two-word phrases like "birthday cake" won't).
 * 3. Collisions — any OTHER word that forms a dictionary word with ALL THREE
 *    clues of a puzzle. Only a same-length alternate is a genuine second
 *    answer (the player sees the answer's length as tile count); those fail
 *    the build. Other-length alternates are printed as notes.
 */
import wordListPath from 'word-list';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/var PUZZLES = (\[[\s\S]*?\n\]);/);
if (!m) { console.error('FAIL: could not find PUZZLES array in index.html'); process.exit(1); }
const PUZZLES = new Function('return ' + m[1])();

const dict = new Set(fs.readFileSync(wordListPath, 'utf8').split('\n'));

let failures = 0;
const fail = msg => { failures++; console.log('FAIL:', msg); };

/* --- structure --- */
const tiers = { easy: 0, medium: 0, hard: 0 };
const answers = new Set();
for (const p of PUZZLES) {
  if (!/^[A-Z]{2,10}$/.test(p.a)) fail(`${p.a}: bad answer format`);
  if (!(p.d in tiers)) fail(`${p.a}: bad tier ${p.d}`);
  else tiers[p.d]++;
  if (answers.has(p.a)) fail(`${p.a}: duplicate answer`);
  answers.add(p.a);
  if (p.c.length !== 3) fail(`${p.a}: needs exactly 3 clues`);
  const clueWords = new Set();
  for (const [w, side] of p.c) {
    if (!/^[A-Z]{2,12}$/.test(w)) fail(`${p.a}: bad clue "${w}"`);
    if (side !== 'before' && side !== 'after') fail(`${p.a}: bad side "${side}"`);
    if (w === p.a) fail(`${p.a}: clue equals answer`);
    if (clueWords.has(w)) fail(`${p.a}: duplicate clue word ${w}`);
    clueWords.add(w);
  }
}
console.log('tiers:', tiers, '| total:', PUZZLES.length);
for (const [t, n] of Object.entries(tiers))
  if (n !== 40) fail(`tier ${t} has ${n} puzzles, expected 40`);

/* --- intended combos exist as single dictionary words (note only) --- */
const combo = (answer, clue, side) =>
  (side === 'before' ? clue + answer : answer + clue).toLowerCase();
let phraseCount = 0;
for (const p of PUZZLES)
  for (const [w, side] of p.c)
    if (!dict.has(combo(p.a, w, side))) phraseCount++;
console.log(`${phraseCount} combos are two-word phrases (not single dict words) — verify new ones by eye`);

/* --- collision scan --- */
const words = [...dict].filter(w => w.length >= 2 && w.length <= 12);
function candidatesFor(clue, side) {
  const c = clue.toLowerCase();
  const out = new Set();
  for (const w of words) {
    if (side === 'before') {
      if (w.length > c.length && w.startsWith(c)) out.add(w.slice(c.length));
    } else {
      if (w.length > c.length && w.endsWith(c)) out.add(w.slice(0, w.length - c.length));
    }
  }
  return out;
}

/* Suffixes that technically appear in the dictionary ("ers", "like") but are
   grammatical endings, not connector words a player would answer.
   "SILK + LIKE = silklike" is derivation, not a compound. */
const SUFFIXES = new Set(['ed','er','ers','es','ing','s','re','un','like','less','ness','ish','able','ful','est','ly']);

const cache = new Map();
function cands(clue, side) {
  const k = clue + '|' + side;
  if (!cache.has(k)) cache.set(k, candidatesFor(clue, side));
  return cache.get(k);
}

let collisions = 0;
for (const p of PUZZLES) {
  const sets = p.c.map(([w, side]) => cands(w, side));
  const answerLc = p.a.toLowerCase();
  const hits = [...sets[0]].filter(x =>
    x !== answerLc && x.length >= 2 && sets[1].has(x) && sets[2].has(x) &&
    dict.has(x) && !SUFFIXES.has(x) && x !== answerLc + 's' && x + 's' !== answerLc);
  /* The player sees the answer's length as tile count, so only a
     same-length alternate is a genuine second answer. */
  const sameLen = hits.filter(x => x.length === answerLc.length);
  if (sameLen.length) {
    collisions++;
    fail(`COLLISION ${p.a} (${p.d}): same-length alternate [${sameLen.join(', ')}] — clues ${p.c.map(c => c[0]).join('/')}`);
  } else if (hits.length) {
    console.log(`  note ${p.a}: other-length alternates [${hits.join(', ')}] — harmless, tile count differs`);
  }
}
console.log(collisions ? `${collisions} puzzles with same-length second answers` : 'no same-length dictionary collisions');
process.exit(failures ? 1 : 0);
