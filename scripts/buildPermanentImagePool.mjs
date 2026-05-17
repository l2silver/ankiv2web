#!/usr/bin/env node
/**
 * Build permanent-deck Unsplash image pool with balanced themes.
 *
 * Set UNSPLASH_ACCESS_KEY in ankiv2/web/.env (Access Key from unsplash.com/oauth/applications).
 *
 *   node scripts/buildPermanentImagePool.mjs
 *
 * Fetches up to MAX_PER_QUERY unique ids per search term (all terms run; no early stop
 * after "exercising" + "hiking" only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, '..');
const OUT = path.join(WEB_ROOT, 'src/lib/permanentDeck/imagePoolIds.json');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(WEB_ROOT, '.env'));
loadDotEnv(path.join(WEB_ROOT, '.env.local'));

const QUERIES = [
  'people exercising',
  'people hiking',
  'people cooking',
  'people dancing',
  'people working',
  'people running',
  'people swimming',
  'people cycling',
  'people yoga',
  'people skateboarding',
  'people playing sports',
  'people reading',
  'people walking',
  'people gardening',
  'people painting',
  'people music',
  'people climbing',
  'people surfing',
  'people camping',
  'people coffee shop',
  'team meeting',
  'friends outdoors',
  'people picnic',
  'people beach',
  'people concert',
  'people studying',
  'people volunteering',
  'people building',
  'people farming',
  'people kayaking',
  'people skiing',
  'people basketball',
  'people soccer',
  'people tennis',
  'people boxing',
  'people meditation',
  'people travel',
  'people laughing',
  'people celebrating',
  'people shopping',
  'people pottery',
  'people woodworking',
  'people fishing',
  'people photography',
  'people driving',
  'people eating restaurant',
  'people playground',
  'people museum',
  'people library',
];

/** Max new ids to collect per query so the pool is theme-balanced. */
const MAX_PER_QUERY = 20;
const PER_PAGE = 30;
const MAX_PAGES_PER_QUERY = 2;
const DELAY_MS = 1500;
const SCRAPED_FALLBACK = path.join(WEB_ROOT, 'scripts/scraped-unsplash-ids.txt');

function photoIdFromUrl(url) {
  const m = /photo-(\d+-[a-f0-9]+)/i.exec(url ?? '');
  return m ? m[1] : null;
}

async function searchPage(query, page, key) {
  const q = encodeURIComponent(query);
  const url = `https://api.unsplash.com/search/photos?query=${q}&page=${page}&per_page=${PER_PAGE}&content_filter=high`;
  let res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  });
  if (res.status === 403 || res.status === 429) {
    const err = new Error(`Rate limited (${res.status})`);
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Unsplash ${res.status} for "${query}" page ${page}: ${await res.text()}`);
  }
  const data = await res.json();
  const ids = [];
  for (const r of data.results ?? []) {
    const id = photoIdFromUrl(r.urls?.regular ?? r.urls?.full ?? '');
    if (id) ids.push(id);
  }
  return { ids, totalPages: data.total_pages ?? 1 };
}

async function collectForQuery(query, globalSeen, key) {
  const added = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= MAX_PAGES_PER_QUERY && added.length < MAX_PER_QUERY) {
    const { ids, totalPages: tp } = await searchPage(query, page, key);
    totalPages = tp;
    for (const id of ids) {
      if (added.length >= MAX_PER_QUERY) break;
      if (globalSeen.has(id)) continue;
      globalSeen.add(id);
      added.push(id);
    }
    page += 1;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return added.length;
}

async function main() {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    console.error('Set UNSPLASH_ACCESS_KEY to build the pool (see script header).');
    process.exit(1);
  }

  const globalSeen = new Set();
  if (fs.existsSync(SCRAPED_FALLBACK)) {
    for (const line of fs.readFileSync(SCRAPED_FALLBACK, 'utf8').split('\n')) {
      const id = line.trim();
      if (id) globalSeen.add(id);
    }
    console.log(`Seeded ${globalSeen.size} id(s) from ${SCRAPED_FALLBACK}`);
  }

  for (const query of QUERIES) {
    try {
      const n = await collectForQuery(query, globalSeen, key);
      console.log(`"${query}" +${n} (total ${globalSeen.size})`);
    } catch (e) {
      if (e?.rateLimited) {
        console.warn(`Rate limit hit — stopping API fetch (${globalSeen.size} ids so far).`);
        break;
      }
      console.warn(`Skipped "${query}": ${e instanceof Error ? e.message : e}`);
    }
  }

  const arr = [...globalSeen].sort();
  fs.writeFileSync(OUT, JSON.stringify(arr, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${arr.length} balanced ids to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
