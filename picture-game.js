const SLOT_COUNT = 6;
const SET_SIZE = 20;
const SLOT_MAX_AGE_MS = 8000;
const POINTS_PER_CORRECT = 10;
const TICK_MS = 250;

let pictureVocabulary = [];
let baseVocabulary = []; // built-in CEFR list (without user words)
let currentSetWords = [];
let slots = [];
let score = 0;
let gameActive = false;
let tickTimer = null;
let slotIdCounter = 0;
let gridClickBound = false;
let highScore = 0;
let practicedWords = [];  // for post-game review / learning
let customWords = [];     // words extracted from user-pasted reading
let currentImageMap = {}; // word -> url (from online search) or null (meaning only, no picture)
let unselectedWords = new Set(); // for user to unselect words from the extracted set

const LEVEL_LABELS = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' };
function levelLabel(level) {
  return LEVEL_LABELS[level] || String(level);
}

const USER_VOCAB_KEY = 'german-user-vocabulary-v1';

/** Load user-added words from localStorage. */
function loadUserVocabulary() {
  try {
    const raw = localStorage.getItem(USER_VOCAB_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((w) => w && typeof w.word === 'string' && w.word.trim())
      .map((w) => ({
        word: String(w.word).trim(),
        article: String(w.article || '').trim(),
        meaning: String(w.meaning || '').trim(),
        level: Math.min(6, Math.max(1, Number(w.level) || 3)),
        userAdded: true,
      }));
  } catch {
    return [];
  }
}

function saveUserVocabulary(list) {
  try {
    const clean = (list || []).map((w) => ({
      word: w.word,
      article: w.article || '',
      meaning: w.meaning || '',
      level: w.level || 3,
    }));
    localStorage.setItem(USER_VOCAB_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('Could not save user vocabulary', e);
  }
}

/** Rebuild pictureVocabulary = built-in + user words (user wins on same word). */
function rebuildVocabularyWithUserWords() {
  const userWords = loadUserVocabulary();
  const byKey = new Map();
  for (const w of baseVocabulary) {
    if (w && w.word) byKey.set(String(w.word).toLowerCase(), { ...w, userAdded: false });
  }
  for (const w of userWords) {
    byKey.set(String(w.word).toLowerCase(), { ...w, userAdded: true });
  }
  pictureVocabulary = Array.from(byKey.values());
  return userWords;
}

function findWordInLibrary(word) {
  const key = (word || '').trim().toLowerCase();
  if (!key) return null;
  return pictureVocabulary.find((w) => String(w.word || '').toLowerCase() === key) || null;
}

function normalizeNewWord({ word, article, meaning, level }) {
  let art = String(article || '').trim().toLowerCase();
  if (art && !['der', 'die', 'das'].includes(art)) art = '';
  return {
    word: String(word || '').trim(),
    article: art,
    meaning: String(meaning || '').trim(),
    level: Math.min(6, Math.max(1, Number(level) || 3)),
    userAdded: true,
  };
}

/**
 * Add a user word if not already in the library.
 * @returns {{ ok: boolean, reason?: string, word?: object, existing?: object }}
 */
function addUserWord(input) {
  const word = normalizeNewWord(input);
  if (!word.word) return { ok: false, reason: 'Please enter a German word.' };
  if (!/[a-zäöüß]/i.test(word.word)) {
    return { ok: false, reason: 'German field should include letters (a–z, äöüß).' };
  }
  if (!word.meaning) return { ok: false, reason: 'Please enter an English meaning.' };

  const existing = findWordInLibrary(word.word);
  if (existing) {
    return {
      ok: false,
      reason: existing.userAdded
        ? `“${word.word}” is already in your added words.`
        : `“${word.word}” is already in the library (${levelLabel(existing.level)}).`,
      existing,
    };
  }

  const userWords = loadUserVocabulary();
  userWords.push({
    word: word.word,
    article: word.article,
    meaning: word.meaning,
    level: word.level,
  });
  saveUserVocabulary(userWords);
  rebuildVocabularyWithUserWords();
  return { ok: true, word };
}

function removeUserWord(word) {
  const key = (word || '').trim().toLowerCase();
  if (!key) return false;
  const next = loadUserVocabulary().filter((w) => String(w.word).toLowerCase() !== key);
  saveUserVocabulary(next);
  rebuildVocabularyWithUserWords();
  return true;
}

/** Prefer global READING_COLLECTION from readings.js; keep tiny fallback. */
function getReadingCollection() {
  if (typeof READING_COLLECTION !== 'undefined' && Array.isArray(READING_COLLECTION)) {
    return READING_COLLECTION;
  }
  return [];
}

const SAVED_WORD_SETS_KEY = 'german-saved-word-sets-v1';
const DAILY_READING_CACHE_KEY = 'german-daily-reading-cache-v1';

function loadSavedWordSets() {
  try {
    const raw = localStorage.getItem(SAVED_WORD_SETS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveSavedWordSets(list) {
  try {
    localStorage.setItem(SAVED_WORD_SETS_KEY, JSON.stringify(list || []));
  } catch {}
}

/**
 * @param {{ name: string, words: Array, source?: string, readingTitle?: string }} opts
 */
function addSavedWordSet(opts) {
  const name = (opts.name || '').trim();
  const words = Array.isArray(opts.words) ? opts.words : [];
  if (!name) throw new Error('Please enter a name for this set.');
  if (!words.length) throw new Error('No words to save. Extract words first.');

  const cleanWords = words.map((w) => ({
    word: w.word,
    article: w.article || '',
    meaning: w.meaning || '',
    level: w.level || 0,
  })).filter((w) => w.word);

  if (!cleanWords.length) throw new Error('No valid words to save.');

  const list = loadSavedWordSets();
  const entry = {
    id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: new Date().toISOString(),
    source: opts.source || '',
    readingTitle: opts.readingTitle || '',
    words: cleanWords,
  };
  list.unshift(entry);
  // Cap at 40 sets
  saveSavedWordSets(list.slice(0, 40));
  return entry;
}

function removeSavedWordSet(id) {
  const next = loadSavedWordSets().filter((s) => s.id !== id);
  saveSavedWordSets(next);
  return next;
}

function getLessonWords(lesson, vocab) {
  if (!lesson || !lesson.text) return [];
  return extractWordsFromCustomText(lesson.text, vocab, []);
}

/** Calendar date key YYYY-MM-DD (local). */
function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Score German text for CEFR suitability: fraction of matched tokens at or below level.
 * Higher is better for graded daily readings.
 */
function scoreTextForLevel(text, vocab, maxLevel) {
  const words = extractWordsFromCustomText(text, vocab, []);
  if (!words.length) return { score: 0, matched: 0, atOrBelow: 0 };
  const atOrBelow = words.filter((w) => Number(w.level) <= maxLevel).length;
  const score = atOrBelow / words.length;
  return { score, matched: words.length, atOrBelow };
}

/**
 * Fetch a short German Wikipedia summary (open API). May fail CORS / rate limits.
 */
async function fetchDeWikipediaSummary() {
  const res = await fetch('https://de.wikipedia.org/api/rest_v1/page/random/summary', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data = await res.json();
  const title = data.title || 'Wikipedia';
  const extract = (data.extract || '').trim();
  if (!extract || extract.length < 40) throw new Error('Empty extract');
  // Keep first ~2 paragraphs / reasonable length for practice
  let text = extract;
  if (text.length > 420) {
    text = text.slice(0, 420);
    const cut = Math.max(text.lastIndexOf('。'), text.lastIndexOf('！'), text.lastIndexOf('？'));
    if (cut > 120) text = text.slice(0, cut + 1);
  }
  return {
    title: `Wikipedia · ${title}`,
    description: 'Random German Wikipedia summary (open web)',
    text,
    source: 'wikipedia',
    pageUrl: data.content_urls?.desktop?.page || data.content_urls?.mobile?.page || '',
  };
}

/**
 * Today's reading for an CEFR level:
 * 1) localStorage cache for today+level
 * 2) try a few Wikipedia random summaries; keep best score
 * 3) fallback: seeded graded collection
 */
async function loadDailyReadingForLevel(level, vocab) {
  const cefr = Number(level) || 1;
  const day = localDateKey();
  const cacheKey = `${day}|${cefr}`;

  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(DAILY_READING_CACHE_KEY) || '{}');
  } catch {
    cache = {};
  }
  // Drop other days
  for (const k of Object.keys(cache)) {
    if (!k.startsWith(day)) delete cache[k];
  }

  if (cache[cacheKey] && cache[cacheKey].text) {
    return { ...cache[cacheKey], fromCache: true };
  }

  let best = null;
  let bestScore = -1;
  const attempts = cefr <= 2 ? 2 : 4; // lower rarely matches Wikipedia; fewer tries

  for (let i = 0; i < attempts; i++) {
    try {
      const item = await fetchDeWikipediaSummary();
      const { score, matched, atOrBelow } = scoreTextForLevel(item.text, vocab, cefr);
      // Prefer more known words and better coverage of ≤ level
      const rank = matched >= 6 ? score * 10 + Math.min(matched, 30) * 0.01 : score;
      if (rank > bestScore) {
        bestScore = rank;
        best = {
          ...item,
          level: cefr,
          id: `daily-wiki-${day}-cefr${cefr}`,
          levelScore: score,
          matched,
          atOrBelow,
        };
      }
      // Good enough match for this level
      if (matched >= 8 && score >= (cefr <= 3 ? 0.55 : 0.4)) break;
    } catch {
      // ignore single attempt
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  // Only use Wikipedia if it has usable vocab for this level
  if (best && best.matched >= 5 && best.levelScore >= 0.25) {
    const result = {
      id: best.id,
      level: cefr,
      title: best.title,
      description: `${best.description} · ~${Math.round(best.levelScore * 100)}% words ≤ ${levelLabel(cefr)}`,
      text: best.text,
      source: 'wikipedia',
      pageUrl: best.pageUrl || '',
      day,
    };
    cache[cacheKey] = result;
    try {
      localStorage.setItem(DAILY_READING_CACHE_KEY, JSON.stringify(cache));
    } catch {}
    return { ...result, fromCache: false };
  }

  // Fallback: graded collection seeded by date
  let seeded = null;
  if (typeof getSeededDailyReading === 'function') {
    seeded = getSeededDailyReading(cefr);
  } else {
    const list = getReadingCollection().filter((r) => Number(r.level) === cefr);
    if (list.length) {
      const seed = day.split('-').reduce((a, b) => a + Number(b), 0) + cefr * 17;
      seeded = { ...list[seed % list.length], source: 'collection-daily' };
    }
  }

  if (!seeded) {
    throw new Error('No daily reading available for this level.');
  }

  const result = {
    id: seeded.id || `daily-col-${day}-cefr${cefr}`,
    level: cefr,
    title: seeded.title || `Heutige Lektüre ${levelLabel(cefr)}`,
    description: (seeded.description || 'Graded collection') + ' · collection (web text too hard / unavailable)',
    text: seeded.text,
    source: 'collection-daily',
    day,
  };
  cache[cacheKey] = result;
  try {
    localStorage.setItem(DAILY_READING_CACHE_KEY, JSON.stringify(cache));
  } catch {}
  return { ...result, fromCache: false };
}

function extractWordsFromCustomText(text, vocab, levels = []) {
  if (!text || !vocab || !vocab.length) return [];

  // Filter vocab by selected CEFR levels (empty = all)
  let filteredVocab = vocab;
  if (levels.length > 0) {
    filteredVocab = vocab.filter(w => levels.includes(w.level));
  }

  // Tokenize German text into words (letters including umlauts/ß)
  const tokens = text.toLowerCase().match(/[a-zäöüß]+/gi) || [];
  const tokenSet = new Set(tokens.map(t => t.toLowerCase()));
  const lowerText = text.toLowerCase();

  const matched = [];
  const seen = new Set();

  // Sort vocab by word length descending so multi-word phrases match first
  const sorted = [...filteredVocab].sort((a, b) => (b.word || '').length - (a.word || '').length);

  for (const entry of sorted) {
    const w = (entry.word || '').trim();
    if (!w || seen.has(w.toLowerCase())) continue;
    const key = w.toLowerCase();

    if (key.includes(' ')) {
      if (lowerText.includes(key)) {
        seen.add(key);
        matched.push(entry);
      }
    } else if (tokenSet.has(key)) {
      seen.add(key);
      matched.push(entry);
    }
  }

  matched.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.word.localeCompare(b.word, 'de');
  });

  return matched;
}

function loadHighScore() {
  try {
    const saved = localStorage.getItem('german-picture-highscore');
    highScore = saved ? parseInt(saved, 10) : 0;
  } catch {
    highScore = 0;
  }
}

function saveHighScore(newScore) {
  if (newScore > highScore) {
    highScore = newScore;
    try {
      localStorage.setItem('german-picture-highscore', String(highScore));
    } catch {}
  }
}

function speak(text, lang = 'de-DE') {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    // silent fail
  }
}

function wordKey(word) {
  return `${word.word}|${word.article}`;
}

const ONLINE_IMAGE_CACHE_KEY = 'german-game-image-cache-v4';

function sharedLibrary() {
  return typeof SharedImageLibrary !== 'undefined' ? SharedImageLibrary : null;
}

function getImageSearchConfig() {
  const cfg = (typeof window !== 'undefined' && window.IMAGE_SEARCH_CONFIG) || {};
  return {
    unsplashAccessKey: (cfg.unsplashAccessKey || '').trim(),
    pexelsApiKey: (cfg.pexelsApiKey || '').trim(),
    pixabayApiKey: (cfg.pixabayApiKey || '').trim(),
  };
}

/** English search terms from a vocab entry (for photo APIs). */
function buildImageSearchQueries(word) {
  const queries = [];
  if (word && word.meaning) {
    const english = String(word.meaning).toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'to', 'a', 'an', 'of', 'sth', 'sb', 'coll', 'bound', 'form'].includes(w))
      .slice(0, 6)
      .join(' ');
    if (english) {
      queries.push(english);
      const firstSense = english.split(/\s+/).slice(0, 3).join(' ');
      if (firstSense && firstSense !== english) queries.push(firstSense);
    }
  }
  if (word && word.word) queries.push(word.word);
  return [...new Set(queries.filter(Boolean))];
}

function defaultSearchQuery(word) {
  const qs = buildImageSearchQueries(word);
  return qs[0] || (word && word.word) || '';
}

/**
 * @typedef {{ url: string, thumb: string, source: string, credit?: string, pageUrl?: string }} ImageCandidate
 */

async function searchWikimediaImages(query, limit = 6) {
  if (!query) return [];
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(Math.min(limit, 12)),
    prop: 'pageimages|info',
    piprop: 'thumbnail',
    pithumbsize: '450',
    inprop: 'url',
    format: 'json',
    origin: '*',
  });
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'GermanWordMatching/1.0 (educational language game)' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data.query?.pages || {};
    /** @type {ImageCandidate[]} */
    const out = [];
    for (const page of Object.values(pages)) {
      const thumb = page.thumbnail?.source;
      if (!thumb) continue;
      out.push({
        url: thumb,
        thumb,
        source: 'wikimedia',
        credit: 'Wikimedia Commons',
        pageUrl: page.fullurl || page.canonicalurl || '',
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Openverse — free CC/public-domain image search, no API key. */
async function searchOpenverseImages(query, limit = 6) {
  if (!query) return [];
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(limit, 12)),
    // Prefer licenses that allow reuse (public domain / attribution)
    license: 'cc0,pdm,by,by-sa',
  });
  try {
    const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.slice(0, limit).map((item) => {
      // Prefer direct media URL (thumbnail is often an API proxy path)
      const media = item.url || item.thumbnail;
      return {
        url: media,
        thumb: media,
        source: 'openverse',
        credit: [item.creator, item.license].filter(Boolean).join(' · ') || 'Openverse',
        pageUrl: item.foreign_landing_url || item.detail_url || '',
      };
    }).filter((c) => c.url);
  } catch {
    return [];
  }
}

async function searchUnsplashImages(query, limit = 6) {
  const key = getImageSearchConfig().unsplashAccessKey;
  if (!key || !query) return [];
  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(limit, 12)),
    orientation: 'squarish',
  });
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.slice(0, limit).map((item) => {
      const urls = item.urls || {};
      const url = urls.regular || urls.small || urls.thumb;
      const thumb = urls.small || urls.thumb || urls.regular;
      const name = item.user?.name || 'Unsplash';
      return {
        url,
        thumb,
        source: 'unsplash',
        credit: `Photo by ${name} on Unsplash`,
        pageUrl: item.links?.html || item.user?.links?.html || '',
      };
    }).filter((c) => c.url);
  } catch {
    return [];
  }
}

async function searchPexelsImages(query, limit = 6) {
  const key = getImageSearchConfig().pexelsApiKey;
  if (!key || !query) return [];
  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(limit, 12)),
  });
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    return photos.slice(0, limit).map((item) => {
      const src = item.src || {};
      const url = src.large || src.medium || src.original;
      const thumb = src.medium || src.small || src.tiny || url;
      return {
        url,
        thumb,
        source: 'pexels',
        credit: item.photographer ? `Photo by ${item.photographer} on Pexels` : 'Pexels',
        pageUrl: item.url || item.photographer_url || '',
      };
    }).filter((c) => c.url);
  } catch {
    return [];
  }
}

async function searchPixabayImages(query, limit = 6) {
  const key = getImageSearchConfig().pixabayApiKey;
  if (!key || !query) return [];
  const params = new URLSearchParams({
    key,
    q: query,
    image_type: 'photo',
    safesearch: 'true',
    per_page: String(Math.min(Math.max(limit, 3), 20)),
  });
  try {
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const hits = Array.isArray(data.hits) ? data.hits : [];
    return hits.slice(0, limit).map((item) => ({
      url: item.largeImageURL || item.webformatURL,
      thumb: item.previewURL || item.webformatURL,
      source: 'pixabay',
      credit: item.user ? `Photo by ${item.user} on Pixabay` : 'Pixabay',
      pageUrl: item.pageURL || '',
    })).filter((c) => c.url);
  } catch {
    return [];
  }
}

const IMAGE_SOURCE_LABELS = {
  wikimedia: 'Wikimedia',
  openverse: 'Openverse',
  unsplash: 'Unsplash',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
};

function availableImageSources() {
  const cfg = getImageSearchConfig();
  return {
    wikimedia: true,
    openverse: true,
    unsplash: !!cfg.unsplashAccessKey,
    pexels: !!cfg.pexelsApiKey,
    pixabay: !!cfg.pixabayApiKey,
  };
}

/**
 * Search one or more legal photo sources.
 * @param {string} query
 * @param {{ sources?: string[], limitPerSource?: number }} [opts]
 * @returns {Promise<ImageCandidate[]>}
 */
async function searchImageSources(query, opts = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const limitPerSource = opts.limitPerSource || 6;
  const avail = availableImageSources();
  let sources = opts.sources && opts.sources.length ? opts.sources.slice() : ['wikimedia', 'openverse', 'unsplash', 'pexels', 'pixabay'];
  if (sources.includes('all')) {
    sources = ['wikimedia', 'openverse', 'unsplash', 'pexels', 'pixabay'];
  }
  sources = sources.filter((s) => avail[s]);

  const tasks = sources.map(async (source) => {
    if (source === 'wikimedia') return searchWikimediaImages(q, limitPerSource);
    if (source === 'openverse') return searchOpenverseImages(q, limitPerSource);
    if (source === 'unsplash') return searchUnsplashImages(q, limitPerSource);
    if (source === 'pexels') return searchPexelsImages(q, limitPerSource);
    if (source === 'pixabay') return searchPixabayImages(q, limitPerSource);
    return [];
  });

  const batches = await Promise.all(tasks);
  /** @type {ImageCandidate[]} */
  const merged = [];
  const seen = new Set();
  for (const batch of batches) {
    for (const item of batch) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Live multi-source photo search for a word (cached in localStorage).
 * Used during gameplay to fill missing pictures (first hit wins).
 * Returns URL string or null.
 */
async function resolveOnlineImage(word, force = false) {
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(ONLINE_IMAGE_CACHE_KEY) || '{}');
  } catch {}

  const key = `${word.word}|${word.article || ''}`;
  if (!force && cache[key] !== undefined) {
    return cache[key];
  }

  const queries = buildImageSearchQueries(word);
  let foundUrl = null;

  // Prefer free no-key sources first for auto-fill, then keyed APIs if configured
  const autoSources = ['wikimedia', 'openverse', 'unsplash', 'pexels', 'pixabay'];
  for (const q of queries) {
    if (foundUrl) break;
    for (const source of autoSources) {
      if (!availableImageSources()[source]) continue;
      const hits = await searchImageSources(q, { sources: [source], limitPerSource: 1 });
      if (hits[0]?.url) {
        foundUrl = hits[0].url;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  cache[key] = foundUrl || null;
  try {
    localStorage.setItem(ONLINE_IMAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
  return foundUrl || null;
}

function sharedLibraryEnabled() {
  const lib = sharedLibrary();
  return !!(lib && lib.enabled);
}

/**
 * Set shared (community) image for a word.
 * url: https URL string, null for "no image", undefined to delete shared entry (use built-in default).
 * Writes to Supabase when configured — survives deploys; visible to all users.
 */
async function setImageOverride(word, url, meta = {}) {
  const key = (word || '').trim();
  if (!key) throw new Error('Missing German word.');
  const lib = sharedLibrary();

  if (!lib || !lib.enabled) {
    throw new Error(
      'Shared image library is not configured. Add Supabase URL + anon key in config.js (see config.example.js and supabase/schema.sql).'
    );
  }

  if (url === undefined) {
    await lib.remove(key);
    return;
  }
  await lib.set(key, url, meta);
}

let _wordImageByWord = null;
function getBuiltInImageIndex() {
  if (_wordImageByWord) return _wordImageByWord;
  _wordImageByWord = new Map();
  if (typeof WORD_IMAGES === 'undefined' || !WORD_IMAGES) return _wordImageByWord;
  for (const [k, entry] of Object.entries(WORD_IMAGES)) {
    const url = typeof entry === 'string' ? entry : (entry && entry.url);
    if (!url) continue;
    const wKey = k.includes('|') ? k.split('|')[0] : k;
    if (!_wordImageByWord.has(wKey)) _wordImageByWord.set(wKey, url);
    // Prefer exact word|article later via direct lookup
  }
  return _wordImageByWord;
}

function getBuiltInImageUrl(word) {
  if (typeof WORD_IMAGES === 'undefined' || !WORD_IMAGES || !word) return null;
  const fullKey = `${word.word}|${word.article || ''}`;
  const entry = WORD_IMAGES[fullKey];
  if (entry) {
    if (typeof entry === 'string') return entry || null;
    if (entry.url) return entry.url;
  }
  return getBuiltInImageIndex().get(word.word) || null;
}

/**
 * Picture lookup priority:
 * 1) shared library (Supabase, multi-user, survives deploys)
 * 2) built-in WORD_IMAGES (images.js shipped with the site)
 * 3) session / live resolve map (currentImageMap)
 * 4) text fallback (English meaning)
 */
function getWordImage(word) {
  const meaning = (word.meaning || '').replace(/;/g, '; ').trim();
  const wordStr = word.word || '';
  const lib = sharedLibrary();

  let url = null;
  let source = 'none';

  if (lib && lib.has(wordStr)) {
    const entry = lib.get(wordStr);
    url = entry ? entry.url : null; // may be null = force text
    source = 'shared';
  } else {
    url = getBuiltInImageUrl(word);
    if (url) source = 'builtin';
    else if (wordStr && currentImageMap[wordStr]) {
      url = currentImageMap[wordStr];
      source = 'online';
    } else if (wordStr && currentImageMap[wordStr] === null) {
      url = null;
      source = 'online-miss';
    }
  }

  const hasUrl = !!(url && String(url).trim());
  return {
    url: hasUrl ? url : null,
    label: wordStr,
    picturable: hasUrl,
    showMeaning: !hasUrl,
    meaning,
    source,
  };
}

/** True when the "Use your own reading" flow is active (not ready-made sets). */
function isCustomReadingMode() {
  const customFlow = document.getElementById('custom-flow');
  return !!(customFlow && customFlow.style.display !== 'none');
}

function getImageSrc(image) {
  return image.url || '';
}

function getSelectedImageSource() {
  const active = document.querySelector('#image-source-chips .image-source-chip.is-active');
  return (active && active.dataset.source) || 'all';
}

function updateImageSourceChipAvailability() {
  const avail = availableImageSources();
  const chips = document.querySelectorAll('#image-source-chips .image-source-chip');
  chips.forEach((chip) => {
    const src = chip.dataset.source;
    if (src === 'all') {
      chip.disabled = false;
      chip.title = 'Search all configured sources';
      return;
    }
    const ok = !!avail[src];
    chip.disabled = !ok;
    chip.title = ok
      ? `Search ${IMAGE_SOURCE_LABELS[src] || src}`
      : `${IMAGE_SOURCE_LABELS[src] || src}: add API key in config.js`;
    if (!ok) chip.classList.remove('is-active');
  });
  const active = document.querySelector('#image-source-chips .image-source-chip.is-active');
  if (!active || active.disabled) {
    document.querySelector('#image-source-chips .image-source-chip[data-source="all"]')?.classList.add('is-active');
  }
  const hint = document.getElementById('image-search-hint');
  if (hint) {
    const cfg = getImageSearchConfig();
    const missing = [];
    if (!cfg.unsplashAccessKey) missing.push('Unsplash');
    if (!cfg.pexelsApiKey) missing.push('Pexels');
    if (!cfg.pixabayApiKey) missing.push('Pixabay');
    if (missing.length) {
      hint.textContent = `Wikimedia & Openverse work with no key. Optional: add ${missing.join(' / ')} keys in config.js for more photos.`;
    } else {
      hint.textContent = 'All sources enabled. Click a thumbnail to try it, then Save.';
    }
  }
}

function renderImageSearchResults(candidates, { onSelect } = {}) {
  const resultsEl = document.getElementById('image-edit-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';
  if (!candidates || !candidates.length) {
    resultsEl.hidden = true;
    return;
  }
  resultsEl.hidden = false;
  candidates.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'image-result-card';
    btn.dataset.index = String(index);
    const label = IMAGE_SOURCE_LABELS[item.source] || item.source;
    btn.title = `${label}${item.credit ? ' — ' + item.credit : ''}`;
    btn.innerHTML = `
      <img src="${item.thumb || item.url}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <span class="image-result-source">${label}</span>
    `;
    btn.addEventListener('click', () => {
      resultsEl.querySelectorAll('.image-result-card').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      if (typeof onSelect === 'function') onSelect(item);
    });
    resultsEl.appendChild(btn);
  });
}

/** Open modal to change picture for a word (writes to shared library). onDone() after change. */
function openImageEditModal(word, onDone) {
  const modal = document.getElementById('image-edit-modal');
  if (!modal || !word) return;

  const wordEl = document.getElementById('image-edit-word');
  const metaEl = document.getElementById('image-edit-meta');
  const previewEl = document.getElementById('image-edit-preview');
  const urlInput = document.getElementById('image-edit-url');
  const queryInput = document.getElementById('image-edit-query');
  const statusEl = document.getElementById('image-edit-status');
  const sharedHint = document.getElementById('image-edit-shared-hint');
  const resultsEl = document.getElementById('image-edit-results');
  const attributionEl = document.getElementById('image-edit-attribution');

  const imgInfo = getWordImage(word);
  const lib = sharedLibrary();
  const inShared = !!(lib && lib.has(word.word));

  if (wordEl) wordEl.textContent = word.word || '';
  if (metaEl) {
    const meaning = (word.meaning || '').replace(/;/g, '; ').trim();
    const srcNote = inShared
      ? ' · shared library'
      : imgInfo.source === 'builtin'
        ? ' · built-in map'
        : imgInfo.url
          ? ' · online'
          : '';
    metaEl.textContent = `${word.article || '—'} · ${meaning || 'no meaning'}${srcNote}`;
  }
  if (urlInput) {
    urlInput.value = (imgInfo.url && imgInfo.source === 'shared') ? imgInfo.url : (imgInfo.url || '');
  }
  if (queryInput) {
    queryInput.value = defaultSearchQuery(word);
  }
  if (statusEl) statusEl.textContent = '';
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.hidden = true;
  }
  if (attributionEl) {
    attributionEl.hidden = true;
    attributionEl.textContent = '';
  }
  if (sharedHint) {
    sharedHint.textContent = sharedLibraryEnabled()
      ? 'Edits are saved to the shared library for everyone and keep working after site updates.'
      : 'Shared library is not configured — set config.js (Supabase) so all users can share image edits.';
    sharedHint.classList.toggle('image-edit-shared-hint--warn', !sharedLibraryEnabled());
  }
  updateImageSourceChipAvailability();

  function showPreview(url) {
    if (!previewEl) return;
    if (url) {
      previewEl.innerHTML = `<img src="${url}" alt="preview" onerror="this.parentElement.innerHTML='<span class=\\'image-edit-broken\\'>Could not load image</span>'">`;
    } else {
      previewEl.innerHTML = '<span class="image-edit-broken">No picture — English meaning will show in game</span>';
    }
  }

  function showAttribution(candidate) {
    if (!attributionEl) return;
    if (!candidate) {
      attributionEl.hidden = true;
      attributionEl.textContent = '';
      return;
    }
    const parts = [];
    if (candidate.credit) parts.push(candidate.credit);
    else if (candidate.source) parts.push(IMAGE_SOURCE_LABELS[candidate.source] || candidate.source);
    attributionEl.textContent = parts.join(' · ');
    attributionEl.hidden = !parts.length;
  }

  function selectCandidate(item) {
    const urlIn = document.getElementById('image-edit-url');
    const st = document.getElementById('image-edit-status');
    if (urlIn) urlIn.value = item.url || '';
    showPreview(item.url);
    showAttribution(item);
    modal._selectedCandidate = item;
    if (st) {
      const label = IMAGE_SOURCE_LABELS[item.source] || item.source;
      st.textContent = `Selected from ${label}. Click Save to share with everyone.`;
    }
  }

  // Re-bound each open so one-time listeners always use current helpers
  modal._showPreview = showPreview;
  modal._showAttribution = showAttribution;
  modal._selectCandidate = selectCandidate;

  showPreview(imgInfo.url);
  modal._selectedCandidate = null;

  modal.hidden = false;
  modal.dataset.word = word.word || '';
  modal._editWord = word;
  modal._onDone = onDone;

  if (!modal.dataset.bound) {
    modal.dataset.bound = '1';

    const close = () => {
      modal.hidden = true;
      modal._editWord = null;
      modal._onDone = null;
      modal._selectedCandidate = null;
    };

    async function runAction(fn) {
      const st = document.getElementById('image-edit-status');
      const buttons = modal.querySelectorAll('.image-edit-actions button, #image-edit-search');
      buttons.forEach((b) => { b.disabled = true; });
      try {
        await fn(st);
      } catch (err) {
        if (st) st.textContent = err.message || String(err);
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    }

    document.getElementById('image-edit-close')?.addEventListener('click', close);
    document.getElementById('image-edit-cancel')?.addEventListener('click', close);
    modal.querySelector('.image-edit-backdrop')?.addEventListener('click', close);

    document.getElementById('image-source-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.image-source-chip');
      if (!chip || chip.disabled) return;
      document.querySelectorAll('#image-source-chips .image-source-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
    });

    document.getElementById('image-edit-url-clear')?.addEventListener('click', () => {
      const urlIn = document.getElementById('image-edit-url');
      const st = document.getElementById('image-edit-status');
      if (urlIn) {
        urlIn.value = '';
        urlIn.focus();
      }
      if (typeof modal._showPreview === 'function') modal._showPreview(null);
      if (typeof modal._showAttribution === 'function') modal._showAttribution(null);
      modal._selectedCandidate = null;
      if (st) st.textContent = 'URL field cleared (not saved yet).';
    });

    document.getElementById('image-edit-url')?.addEventListener('input', () => {
      const url = (document.getElementById('image-edit-url')?.value || '').trim();
      if (typeof modal._showPreview === 'function') modal._showPreview(url || null);
      if (typeof modal._showAttribution === 'function') modal._showAttribution(null);
      modal._selectedCandidate = null;
    });

    document.getElementById('image-edit-save')?.addEventListener('click', () => {
      runAction(async (st) => {
        const w = modal._editWord;
        const url = (document.getElementById('image-edit-url')?.value || '').trim();
        if (!w) return;
        if (!url) {
          if (st) st.textContent = 'Paste an https:// image URL, or pick a search result, or use “No image”.';
          return;
        }
        const cand = modal._selectedCandidate;
        await setImageOverride(w.word, url, {
          article: w.article,
          meaning: w.meaning,
          source: cand?.source || undefined,
          credit: cand?.credit || undefined,
        });
        if (w.word) currentImageMap[w.word] = url;
        if (st) st.textContent = 'Saved to shared library for all users.';
        if (typeof modal._showPreview === 'function') modal._showPreview(url);
        if (typeof modal._onDone === 'function') modal._onDone();
        setTimeout(close, 500);
      });
    });

    document.getElementById('image-edit-none')?.addEventListener('click', () => {
      runAction(async (st) => {
        const w = modal._editWord;
        if (!w) return;
        await setImageOverride(w.word, null, { article: w.article, meaning: w.meaning });
        if (st) st.textContent = 'Shared: this word uses text only (no picture) for everyone.';
        if (typeof modal._showPreview === 'function') modal._showPreview(null);
        if (typeof modal._showAttribution === 'function') modal._showAttribution(null);
        if (typeof modal._onDone === 'function') modal._onDone();
        setTimeout(close, 500);
      });
    });

    document.getElementById('image-edit-reset')?.addEventListener('click', () => {
      runAction(async (st) => {
        const w = modal._editWord;
        if (!w) return;
        await setImageOverride(w.word, undefined);
        if (w.word) delete currentImageMap[w.word];
        if (st) st.textContent = 'Removed from shared library — using built-in / online default.';
        const next = getWordImage(w);
        if (typeof modal._showPreview === 'function') modal._showPreview(next.url);
        const urlIn = document.getElementById('image-edit-url');
        if (urlIn) urlIn.value = next.url || '';
        if (typeof modal._showAttribution === 'function') modal._showAttribution(null);
        if (typeof modal._onDone === 'function') modal._onDone();
      });
    });

    const runSearch = () => {
      runAction(async (st) => {
        const w = modal._editWord;
        if (!w) return;
        const q = (document.getElementById('image-edit-query')?.value || '').trim() || defaultSearchQuery(w);
        const source = getSelectedImageSource();
        const sources = source === 'all' ? ['all'] : [source];
        const avail = availableImageSources();
        if (source !== 'all' && !avail[source]) {
          if (st) st.textContent = `${IMAGE_SOURCE_LABELS[source] || source} needs an API key in config.js.`;
          return;
        }
        if (st) st.textContent = `Searching ${source === 'all' ? 'all sources' : (IMAGE_SOURCE_LABELS[source] || source)}…`;
        const candidates = await searchImageSources(q, {
          sources,
          limitPerSource: source === 'all' ? 4 : 10,
        });
        if (!candidates.length) {
          renderImageSearchResults([]);
          if (st) {
            st.textContent = source === 'all'
              ? 'No photos found. Try a shorter English query, or add Unsplash/Pexels/Pixabay keys.'
              : `No photos from ${IMAGE_SOURCE_LABELS[source] || source}. Try another source or query.`;
          }
          return;
        }
        renderImageSearchResults(candidates, {
          onSelect: (item) => {
            if (typeof modal._selectCandidate === 'function') modal._selectCandidate(item);
          },
        });
        if (st) st.textContent = `Found ${candidates.length} photo(s). Click one to preview, then Save.`;
      });
    };

    document.getElementById('image-edit-search')?.addEventListener('click', runSearch);
    document.getElementById('image-edit-query')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });
  }
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function countCorrect(slotsList) {
  return slotsList.filter((s) => s.isCorrect).length;
}

function wordsMatch(a, b) {
  return a.word === b.word && a.article === b.article;
}

function getPictureWordsInUse(excludeIndex = -1) {
  return slots
    .filter((_, i) => i !== excludeIndex)
    .map((s) => s.pictureWord);
}

function getUsedImageUrls(excludeIndex = -1) {
  return new Set(
    slots
      .filter((_, i) => i !== excludeIndex)
      .map((s) => getWordImage(s.pictureWord).url)
      .filter(Boolean)
  );
}

function pickNewPictureWord(excludeIndex = -1) {
  const inUseWords = new Set(getPictureWordsInUse(excludeIndex).map(wordKey));
  const usedImages = getUsedImageUrls(excludeIndex);

  let available = currentSetWords.filter((w) => !inUseWords.has(wordKey(w)));

  // Strongly prefer words with different images
  const imageDifferent = available.filter((w) => {
    const imgUrl = getWordImage(w).url;
    return imgUrl && !usedImages.has(imgUrl);
  });

  if (imageDifferent.length) available = imageDifferent;

  if (!available.length) {
    available = currentSetWords.filter((w) => !inUseWords.has(wordKey(w)));
  }
  if (!available.length) return currentSetWords[Math.floor(Math.random() * currentSetWords.length)];
  return available[Math.floor(Math.random() * available.length)];
}

function pickLabelForPicture(pictureWord, shouldMatch, usedLabels = []) {
  if (shouldMatch) return pictureWord;
  const used = new Set(usedLabels.map(wordKey));
  const candidates = currentSetWords.filter(
    (w) => !wordsMatch(w, pictureWord) && !used.has(wordKey(w))
  );
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  const fallback = currentSetWords.filter((w) => !wordsMatch(w, pictureWord));
  return fallback[Math.floor(Math.random() * fallback.length)] || pictureWord;
}

function buildLabelAssignment(pictureWords, targetCorrect) {
  let best = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const labels = shuffle([...pictureWords]);
    const matches = pictureWords.filter((w, i) => wordsMatch(w, labels[i])).length;
    if (matches === targetCorrect) return labels;
    if (!best || Math.abs(matches - targetCorrect) < Math.abs(best.matches - targetCorrect)) {
      best = { labels, matches };
    }
  }

  const labels = [...pictureWords];
  const correctIndices = new Set();
  while (correctIndices.size < targetCorrect) {
    correctIndices.add(Math.floor(Math.random() * SLOT_COUNT));
  }

  const wrongIndices = [...Array(SLOT_COUNT).keys()].filter((i) => !correctIndices.has(i));
  for (const i of wrongIndices) {
    const options = labels.filter((w) => !wordsMatch(w, pictureWords[i]));
    if (options.length) labels[i] = options[Math.floor(Math.random() * options.length)];
  }
  return labels;
}

function createSlotsFromWords(pictureWords, targetCorrect) {
  const labelWords = buildLabelAssignment(pictureWords, targetCorrect);
  const now = Date.now();
  return pictureWords.map((pictureWord, i) => ({
    id: ++slotIdCounter,
    pictureWord,
    labelWord: labelWords[i],
    isCorrect: wordsMatch(pictureWord, labelWords[i]),
    createdAt: now,
  }));
}

function createFullBoard() {
  const targetCorrect = Math.random() < 0.5 ? 1 : 2;
  const pictureWords = shuffle(currentSetWords).slice(0, SLOT_COUNT);
  slots = createSlotsFromWords(pictureWords, targetCorrect);
}

function rebalanceCorrectCount() {
  let correct = countCorrect(slots);
  while (correct > 2) {
    const idx = slots.findIndex((s) => s.isCorrect);
    if (idx === -1) break;
    const usedLabels = slots.filter((_, i) => i !== idx).map((s) => s.labelWord);
    slots[idx].labelWord = pickLabelForPicture(slots[idx].pictureWord, false, usedLabels);
    slots[idx].isCorrect = false;
    correct--;
  }
  while (correct < 1) {
    const idx = slots.findIndex((s) => !s.isCorrect);
    if (idx === -1) break;
    slots[idx].labelWord = slots[idx].pictureWord;
    slots[idx].isCorrect = true;
    correct++;
  }
}

function replaceSlot(index) {
  const newPicture = pickNewPictureWord(index);
  const usedLabels = slots.filter((_, i) => i !== index).map((s) => s.labelWord);
  const othersCorrect = countCorrect(slots.filter((_, i) => i !== index));
  const targetTotal = pickRandomInt(1, 2);
  const shouldMatch = othersCorrect < targetTotal;

  const labelWord = pickLabelForPicture(newPicture, shouldMatch, usedLabels);
  slots[index] = {
    id: ++slotIdCounter,
    pictureWord: newPicture,
    labelWord,
    isCorrect: wordsMatch(newPicture, labelWord),
    createdAt: Date.now(),
  };
  rebalanceCorrectCount();
}

function replaceOldestSlot() {
  if (!gameActive || !slots.length) return;
  let oldestIndex = 0;
  for (let i = 1; i < slots.length; i++) {
    if (slots[i].createdAt < slots[oldestIndex].createdAt) oldestIndex = i;
  }
  replaceSlot(oldestIndex);
  updateBoard(true);
}

function splitIntoSets(words) {
  const sets = [];
  for (let i = 0; i < words.length; i += SET_SIZE) {
    sets.push(words.slice(i, i + SET_SIZE));
  }
  return sets;
}

// Small concurrency limiter for image searches (keeps server happy but faster UX)
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = [];
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function getSelectedLevels() {
  // Prefer sets-mode checkboxes when that flow is visible
  const setsFlow = document.getElementById('sets-flow');
  if (setsFlow && setsFlow.style.display !== 'none') {
    const setsCbs = document.querySelectorAll('.sets-cefr-filters input[type="checkbox"]:checked, .sets-hsk input[type="checkbox"]:checked');
    if (setsCbs.length) return Array.from(setsCbs).map((cb) => Number(cb.value));
    return [];
  }
  // Custom / reading extract filters
  const customCbs = document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]:checked');
  if (customCbs.length) {
    return Array.from(customCbs).map((cb) => Number(cb.value));
  }
  // Fallback: any visible level filters
  const cbs = document.querySelectorAll('.level-filters input[type="checkbox"]:checked');
  if (cbs.length) {
    return Array.from(cbs).map((cb) => Number(cb.value));
  }
  return []; // all levels
}

function isTextOnlyMode() {
  // Text-only only when neither built-in nor overrides provide any images at all.
  // Per-word fallback still uses meaning when a single word has no picture.
  return false;
}

/** Filter a word list by checkboxes in the word list (if visible) or unselectedWords. */
function filterWordsBySelection(words) {
  if (!words || !words.length) return [];
  const listEl = document.getElementById('extracted-words-list');
  if (listEl && !listEl.hidden) {
    const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
      const selectedHanzi = new Set(Array.from(checked).map(cb => cb.dataset.word));
      return words.filter(w => selectedHanzi.has(w.word));
    }
  }
  return words.filter(w => !unselectedWords.has(w.word));
}

/** Active words from custom extract mode (respects uncheck in the word list). */
function getActiveExtractedWords() {
  if (!customWords || customWords.length === 0) return [];
  return filterWordsBySelection(customWords);
}

/** Hide the selectable word list (used in sets mode until Preview is pressed). */
function hideWordSelectionList() {
  const listEl = document.getElementById('extracted-words-list');
  if (listEl) {
    listEl.hidden = true;
    listEl.innerHTML = '';
  }
}

function updateSetPickerForMode() {
  // Hide the group/set picker in custom reading mode entirely (no default sets).
  // In extract/custom we always play ALL active extracted words (see getSelectedSetWords).
  const picker = document.querySelector('.level-picker') || document.getElementById('set-picker');
  if (!picker) return;
  const inCustom = isCustomReadingMode() || !!(customWords && customWords.length > 0);
  picker.style.display = inCustom ? 'none' : '';
}

function filterWordsByLevel() {
  const selectedLevels = getSelectedLevels();
  let words = [...pictureVocabulary];
  if (selectedLevels.length > 0) {
    words = words.filter((w) => selectedLevels.includes(w.level));
  }
  return words;
}

function updatePictureSetOptions() {
  const setSelect = document.getElementById('set-select');
  if (!setSelect) return;

  // In custom reading mode: no default CEFR sets — only extracted words (if any).
  if (isCustomReadingMode()) {
    let words = [];
    if (customWords && customWords.length > 0) {
      words = getActiveExtractedWords();
      if (words.length === 0) words = customWords;
    }
    setSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = '0';
    option.textContent = words.length
      ? `${words.length} extracted words (all)`
      : 'Extract words from your reading first';
    setSelect.appendChild(option);
    updateSetPickerForMode(); // always hide picker in custom mode
    const startHighEl = document.getElementById('start-high-score');
    if (startHighEl) startHighEl.textContent = String(highScore || 0);
    return;
  }

  let words = filterWordsByLevel();

  // Custom pasted reading takes highest priority (respect unselected)
  if (customWords && customWords.length > 0) {
    words = getActiveExtractedWords();
    if (words.length === 0) words = customWords;
  }

  const sets = splitIntoSets(words);
  setSelect.innerHTML = '';

  sets.forEach((set, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    // Keep labels simple (no embedded word) to avoid font rendering quirks in <select> for C2 groups
    option.textContent = `Group ${index + 1} — ${set.length} words`;
    setSelect.appendChild(option);
  });

  if (!sets.length) {
    const option = document.createElement('option');
    option.value = '0';
    option.textContent = 'No words available';
    setSelect.appendChild(option);
  }

  // Always show set picker in ready-made sets mode (even with one group — needed for Preview)
  const picker = document.querySelector('.level-picker') || document.getElementById('set-picker');
  if (picker) {
    picker.style.display = '';
  }

  // Show high score on start screen
  const startHighEl = document.getElementById('start-high-score');
  if (startHighEl) startHighEl.textContent = String(highScore || 0);
}

function updatePictureSetOptionsForCustom() {
  // Specialized refresh when user pastes custom text
  const setSelect = document.getElementById('set-select');
  if (!setSelect) return;

  let words = (customWords && customWords.length > 0) ? customWords : [];
  // respect unselected
  const listEl = document.getElementById('extracted-words-list');
  if (listEl && words.length) {
    const checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length > 0) {
      const selectedHanzi = new Set(Array.from(checked).map(cb => cb.dataset.word));
      words = words.filter(w => selectedHanzi.has(w.word));
    }
  }
  const sets = splitIntoSets(words);
  setSelect.innerHTML = '';

  const count = words.length;
  sets.forEach((set, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    // Keep labels simple (no embedded word) to avoid font rendering quirks in <select> for C2 groups
    option.textContent = `Group ${index + 1} — ${set.length} words`;
    setSelect.appendChild(option);
  });

  if (!sets.length) {
    const option = document.createElement('option');
    option.value = '0';
    option.textContent = count > 0 ? 'No sets (too few words)' : 'No words extracted';
    setSelect.appendChild(option);
  }

  const picker = document.querySelector('.level-picker');
  if (picker) {
    // always force hide in custom reading mode
    const inCustom = isCustomReadingMode() || !!(customWords && customWords.length > 0);
    picker.style.display = inCustom ? 'none' : ((sets.length > 1) ? '' : 'none');
  }
}

function getSelectedSetWords() {
  // Custom reading flow: only extracted words — never fall back to default CEFR sets.
  if (isCustomReadingMode() || (customWords && customWords.length > 0)) {
    if (customWords && customWords.length > 0) {
      let active = getActiveExtractedWords();
      if (active.length === 0) active = customWords; // fallback if all unselected
      return active;
    }
    return [];
  }

  // Ready-made sets mode: filter by current checkboxes + chosen set/group
  let words = filterWordsByLevel();
  const setSel = document.getElementById('set-select');
  const setIndex = setSel ? Number(setSel.value) || 0 : 0;
  const sets = splitIntoSets(words);
  let setWords = sets[setIndex] || words;

  // If user previewed the list and unchecked some words, respect that selection
  const listEl = document.getElementById('extracted-words-list');
  if (listEl && !listEl.hidden && listEl.querySelectorAll('input[type="checkbox"]').length > 0) {
    return filterWordsBySelection(setWords);
  }
  return setWords;
}

/** Full current set/group without selection filtering (for preview). */
function getCurrentGroupWordsUnfiltered() {
  if (isCustomReadingMode() || (customWords && customWords.length > 0)) {
    return customWords && customWords.length ? [...customWords] : [];
  }
  let words = filterWordsByLevel();
  const setSel = document.getElementById('set-select');
  const setIndex = setSel ? Number(setSel.value) || 0 : 0;
  const sets = splitIntoSets(words);
  return sets[setIndex] || words;
}

function buildCardHtml(slot, index, now) {
  const image = getWordImage(slot.pictureWord);
  const age = now - slot.createdAt;
  const agePercent = Math.min(100, (age / SLOT_MAX_AGE_MS) * 100);
  const deWord = slot.labelWord.word;
  const article = slot.labelWord.article || '';

  let contentHtml;

  if (image.showMeaning) {
    // No picture available (from online search or otherwise) → show English meaning
    const meaning = image.meaning || (slot.pictureWord.meaning || '').replace(/;/g, '; ').trim();
    contentHtml = `
      <div class="picture-no-pic">
        <div class="preview-word">${deWord}</div>
        <div class="preview-meaning">${meaning}</div>
      </div>
    `;
  } else {
    const src = getImageSrc(image);
    const imgHtml = src 
      ? `<img class="picture-img" src="${src}" alt="${slot.pictureWord.word}" loading="eager" draggable="false" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'picture-fallback\\'>${deWord}</div>'">`
      : `<div class="picture-fallback">${deWord}</div>`;
    contentHtml = `
      <div class="picture-img-wrap">
        ${imgHtml}
      </div>
      <p class="picture-word">${deWord}</p>
    `;
  }

  return `
    <div class="picture-timer" style="width: ${agePercent}%"></div>
    ${contentHtml}
    <!-- Article is hidden until revealed in the learning feedback overlay -->
  `;
}

function updateBoard(forceRebuild = false) {
  const grid = document.getElementById('picture-grid');
  const now = Date.now();

  if (forceRebuild || grid.children.length !== slots.length) {
    grid.innerHTML = '';
    slots.forEach((slot, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'picture-card';
      card.dataset.index = String(index);
      card.dataset.slotId = String(slot.id);
      card.dataset.word = slot.pictureWord.word;   // helps online resolver target the right card
      card.innerHTML = buildCardHtml(slot, index, now);
      grid.appendChild(card);
    });
  } else {
    slots.forEach((slot, index) => {
      const card = grid.children[index];
      if (!card) return;

      if (card.dataset.slotId !== String(slot.id)) {
        card.dataset.slotId = String(slot.id);
        card.innerHTML = buildCardHtml(slot, index, now);
        card.classList.remove('picture-card--correct', 'picture-card--wrong');
      } else {
        const timer = card.querySelector('.picture-timer');
        const age = now - slot.createdAt;
        const agePercent = Math.min(100, (age / SLOT_MAX_AGE_MS) * 100);
        if (timer) timer.style.width = `${agePercent}%`;
      }
    });
  }

  document.getElementById('picture-score').textContent = String(score);
  document.getElementById('picture-hint-count').textContent = String(countCorrect(slots));
}

function handleSlotClick(index) {
  if (!gameActive) return;

  const slot = slots[index];
  if (!slot) return;

  if (slot.isCorrect) {
    score += POINTS_PER_CORRECT;

    // Track for post-game review
    if (!practicedWords.some(w => wordsMatch(w, slot.pictureWord))) {
      practicedWords.push(slot.pictureWord);
    }

    const spokenWord = slot.pictureWord.word;
    speak(spokenWord);

    // Show meaning briefly to help learning (image + word → meaning association)
    showMeaningTemporarily(index, slot.pictureWord);

    // Delay the replace slightly so player can read the meaning
    setTimeout(() => {
      if (gameActive) {
        replaceSlot(index);
        updateBoard(true);
      }
    }, 650);

    flashCorrect(index);
  } else {
    // On wrong: briefly reveal what the correct label should have been
    showWrongFeedback(index, slot);
    setTimeout(() => {
      if (gameActive) endGame();
    }, 450);
    flashWrong(index);
  }
}

function showMeaningTemporarily(index, word) {
  const card = document.querySelector(`.picture-card[data-index="${index}"]`);
  if (!card) return;

  const originalHTML = card.innerHTML;
  const meaning = word.meaning ? word.meaning.replace(/;/g, '; ').trim() : '';

  card.classList.add('picture-card--correct');
  card.innerHTML = `
    <div class="picture-timer" style="width: 100%"></div>
    <div class="picture-img-wrap">
      <div class="picture-meaning-reveal">
        <div class="reveal-word">${word.word}</div>
        <div class="reveal-article">${word.article || ''}</div>
        <div class="reveal-meaning">${meaning}</div>
      </div>
    </div>
  `;

  // Restore original look after delay (will be replaced anyway)
  setTimeout(() => {
    if (card && gameActive) {
      card.classList.remove('picture-card--correct');
    }
  }, 700);
}

function showWrongFeedback(index, slot) {
  const card = document.querySelector(`.picture-card[data-index="${index}"]`);
  if (!card) return;

  const correctWord = slot.pictureWord;
  const meaning = correctWord.meaning ? correctWord.meaning.replace(/;/g, '; ').trim() : '';

  card.innerHTML = `
    <div class="picture-timer" style="width: 100%"></div>
    <div class="picture-img-wrap">
      <div class="picture-meaning-reveal wrong">
        <div class="reveal-word">${correctWord.word}</div>
        <div class="reveal-article">${correctWord.article || ''}</div>
        <div class="reveal-meaning">✓ ${meaning}</div>
      </div>
    </div>
  `;
}

function flashCorrect(index) {
  const card = document.querySelector(`.picture-card[data-index="${index}"]`);
  if (card) {
    card.classList.add('picture-card--correct');
    setTimeout(() => card.classList.remove('picture-card--correct'), 350);
  }
}

function flashWrong(index) {
  const card = document.querySelector(`.picture-card[data-index="${index}"]`);
  if (card) card.classList.add('picture-card--wrong');
}

function startGame() {
  const isCustomMode = isCustomReadingMode() || !!(customWords && customWords.length > 0);
  currentSetWords = getSelectedSetWords();
  if (currentSetWords.length < SLOT_COUNT) {
    let msg;
    if (isCustomMode && (!customWords || !customWords.length)) {
      msg = 'Extract words from your reading first, then start the matching game.';
    } else if (isCustomMode) {
      msg = `Your reading only has ${currentSetWords.length} selected word(s). You need at least ${SLOT_COUNT} to play.`;
    } else {
      msg = `This set only has ${currentSetWords.length} words. Pick another set or CEFR level.`;
    }
    alert(msg);
    return;
  }

  score = 0;
  practicedWords = [];
  gameActive = true;
  slotIdCounter = 0;
  createFullBoard();

  // Keep the reading text box visible in custom mode so the user can paste new text anytime.
  // Only hide the word list in ready-made sets mode to free screen space while playing.
  const input = document.getElementById('reading-input');
  if (input) {
    input.hidden = false;
    input.style.display = '';
  }
  const listSection = document.getElementById('words-list-section');
  if (listSection) {
    // Keep word list available in custom mode (user may re-extract); hide in sets mode
    listSection.hidden = !isCustomMode;
  }
  const preview = document.getElementById('picture-preview');
  if (preview) preview.hidden = true;
  document.getElementById('picture-game-screen').hidden = false;
  document.getElementById('picture-gameover').hidden = true;

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(gameTick, TICK_MS);
  updateBoard(true);

  // Fill missing pictures via live multi-source search (skip shared / built-in)
  improveImagesWithOnline(currentSetWords);
}

async function improveImagesWithOnline(words) {
  if (!words || !words.length) return;
  const lib = sharedLibrary();
  const missing = words.filter((w) => {
    if (!w || !w.word) return false;
    // Shared entry (including forced null) wins — do not re-search
    if (lib && lib.has(w.word)) return false;
    if (getBuiltInImageUrl(w)) return false;
    return true;
  });
  if (!missing.length) return;

  // Limit live searches for large sets
  const batch = missing.slice(0, 40);
  let foundAny = false;
  for (const word of batch) {
    if (!gameActive) break;
    const onlineUrl = await resolveOnlineImage(word, false);
    currentImageMap[word.word] = onlineUrl || null;
    if (onlineUrl) foundAny = true;
  }
  if (foundAny && gameActive) updateBoard(true);
}

/** Render a nice preview of pictures + words (used after online search)
 *  Uses currentImageMap (populated only by online search).
 *  If no photo for a word, shows English meaning instead.
 *  In text-only mode: render a clean list of German word + English meaning (no pictures, no grid).
 *  Always shows ALL words (no artificial slice limit).
 */
async function renderPicturePreview(words) {
  const previewContainer = document.getElementById('picture-preview');
  const grid = document.getElementById('preview-grid');
  if (!previewContainer || !grid) return;

  grid.innerHTML = '';
  const textOnly = isTextOnlyMode();

  if (textOnly) {
    // Special list preview for text-only: German word + article + English meaning
    grid.style.display = 'block';
    const listWrap = document.createElement('div');
    listWrap.className = 'text-only-preview-list';
    words.forEach(word => {
      const meaning = (word.meaning || '').replace(/;/g, '; ').trim();
      const item = document.createElement('div');
      item.className = 'text-preview-item';
      item.innerHTML = `
        <span class="preview-word">${word.word}</span>
        <span class="preview-article">(${word.article || ''})</span>
        <span class="preview-meaning">${meaning}</span>
      `;
      listWrap.appendChild(item);
    });
    grid.appendChild(listWrap);
    previewContainer.hidden = false;
    return;
  }

  // Normal preview (pictures or meaning cards) - show ALL words
  grid.style.display = '';
  const previewWords = words; // no slice: show every word that will be played
  const usedUrls = new Set();  // ensure one picture URL is only connected to ONE word in the list

  for (const word of previewWords) {
    // Ensure map entry for this word (from prior search or fresh)
    if (!(word.word in currentImageMap)) {
      // For large lists, avoid slow serial resolves here. Search button does concurrent + full.
      if (previewWords.length <= 15) {
        const url = await resolveOnlineImage(word, true);
        currentImageMap[word.word] = url || null;
      } else {
        currentImageMap[word.word] = null;
      }
    }

    let imageInfo = getWordImage(word);
    const meaning = (word.meaning || '').replace(/;/g, '; ').trim();

    const card = document.createElement('div');
    card.className = 'preview-card';

    let useImage = false;
    let src = null;

    if (!imageInfo.showMeaning) {
      src = getImageSrc(imageInfo);
      if (src && !usedUrls.has(src)) {
        usedUrls.add(src);
        useImage = true;
      }
    }

    if (useImage && src) {
      // Picture + word + meaning (user request: preview should show meaning as well)
      card.innerHTML = `
        <img src="${src}" alt="${word.word}" loading="lazy">
        <div class="preview-word">${word.word}</div>
        <div class="preview-article">(${word.article || ''})</div>
        <div class="preview-meaning">${meaning}</div>
      `;
    } else {
      // No unique picture for this word (or conflict, or none found) → English meaning only
      card.innerHTML = `
        <div class="preview-no-pic">
          <div class="preview-word">${word.word}</div>
          <div class="preview-article">(${word.article || ''})</div>
          <div class="preview-meaning">${meaning}</div>
        </div>
      `;
    }
    grid.appendChild(card);
  }

  previewContainer.hidden = false;
}

function gameTick() {
  if (!gameActive) return;
  const now = Date.now();
  const oldest = Math.min(...slots.map((s) => s.createdAt));
  if (now - oldest >= SLOT_MAX_AGE_MS) {
    replaceOldestSlot();
  } else {
    updateBoard(false);
  }
}

function endGame() {
  gameActive = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  saveHighScore(score);
  document.getElementById('final-score').textContent = String(score);

  const highScoreEl = document.getElementById('high-score');
  if (highScoreEl) {
    highScoreEl.textContent = String(highScore);
  }

  // Show practiced words + meanings for review (great for learning)
  const reviewEl = document.getElementById('practiced-review');
  const listEl = document.getElementById('practiced-list');
  if (reviewEl && listEl) {
    listEl.innerHTML = '';
    if (practicedWords.length > 0) {
      practicedWords.slice(0, 8).forEach(w => {
        const li = document.createElement('li');
        const shortMeaning = (w.meaning || '').replace(/;/g, '; ').trim();
        li.innerHTML = `
          <span class="de-word">${w.word}</span>
          <span class="de-article">${w.article || ''}</span>
          <span class="meaning">— ${shortMeaning}</span>
        `;
        listEl.appendChild(li);
      });
      reviewEl.hidden = false;
    } else {
      reviewEl.hidden = true;
    }
  }

  document.getElementById('picture-gameover').hidden = false;
}

function restartGame() {
  const reviewEl = document.getElementById('practiced-review');
  if (reviewEl) reviewEl.hidden = true;
  document.getElementById('picture-gameover').hidden = true;
  startGame();
}

function backToMenu() {
  gameActive = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  // Refresh high score on start screen
  const startHighEl = document.getElementById('start-high-score');
  if (startHighEl) startHighEl.textContent = String(highScore || 0);

  const reviewEl = document.getElementById('practiced-review');
  if (reviewEl) reviewEl.hidden = true;

  // Show input and list again (reading box stays available in custom mode)
  const input = document.getElementById('reading-input');
  if (input) {
    input.hidden = false;
    input.style.display = '';
  }
  const listSection = document.getElementById('words-list-section');
  if (listSection) listSection.hidden = false;
  document.getElementById('picture-game-screen').hidden = true;
  document.getElementById('picture-gameover').hidden = true;

  // Keep the preview list visible on back so the user can still study the searched pictures/meanings
  // (it will be hidden again if they change level or do a new search)
  // The game cards will continue to match whatever is in currentImageMap.
}

function bindGridClicks() {
  if (gridClickBound) return;
  const grid = document.getElementById('picture-grid');
  let lastTap = 0;

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.picture-card');
    if (!card || !gameActive) return;
    const now = Date.now();
    if (now - lastTap < 280) return; // debounce for touch sensitivity
    lastTap = now;
    e.preventDefault();
    handleSlotClick(Number(card.dataset.index));
  });

  // Rely on click only (works great on touch). Removed separate touchend to avoid double / overly sensitive triggers.
  gridClickBound = true;
}

function bindKeyboardControls() {
  document.addEventListener('keydown', (e) => {
    // mode-picture was removed; game uses mode-reading-games. Only need gameActive.
    if (!gameActive) return;
    const gameScreen = document.getElementById('picture-game-screen');
    if (gameScreen && gameScreen.hidden) return;
    if (e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const index = parseInt(e.key, 10) - 1;
      if (index >= 0 && index < SLOT_COUNT) {
        handleSlotClick(index);
      }
    }
    if (e.key.toLowerCase() === 's') {
      // Quick speak current corrects hint
      const corrects = slots.filter(s => s.isCorrect);
      if (corrects.length) speak(corrects[0].pictureWord.word);
    }
  });
}

function initPictureGame(vocabulary) {
  baseVocabulary = Array.isArray(vocabulary) ? vocabulary.slice() : [];
  rebuildVocabularyWithUserWords();
  loadHighScore();
  bindGridClicks();
  bindKeyboardControls();
  populateLessons();
  updatePictureSetOptions();

  // Load shared image library (Supabase) — does not block first paint; refreshes lists when done
  const lib = sharedLibrary();
  if (lib && lib.enabled) {
    lib.loadAll().then(() => {
      updatePictureSetOptions();
      const listEl = document.getElementById('extracted-words-list');
      if (listEl && !listEl.hidden && customWords && customWords.length) {
        // re-render if custom list already open
        const btn = document.getElementById('extract-custom-btn');
        if (btn && typeof listEl._refreshShared === 'function') listEl._refreshShared();
      }
      if (gameActive) updateBoard(true);
      const status = document.getElementById('shared-library-status');
      if (status) status.textContent = lib.statusLabel();
    });
  }

  // Don't auto-show word lists on load. Custom shows after extract; sets mode after Preview.

  // Level change listener (for checkboxes or old select)
  const levelCheckboxes = document.querySelectorAll('.level-filters input[type="checkbox"], #picture-level-select');
  levelCheckboxes.forEach(el => {
    el.addEventListener('change', () => {
      // Custom reading: only CEFR filters for next extract — never inject default sets
      if (isCustomReadingMode() || el.closest('.custom-reading')) {
        updatePictureSetOptions();
        updateSetPickerForMode();
        return;
      }

      customWords = [];
      unselectedWords = new Set();
      currentImageMap = {};
      const info = document.getElementById('custom-extract-info');
      if (info) info.textContent = '';
      hideWordSelectionList();
      updatePictureSetOptions();
      updateSetPickerForMode();
      updateCustomClearButton();
      // Sets mode: wait for Preview — do not auto-list words
    });
  });

  // Lesson support removed or simplified in current UI; rely on custom text + level checkboxes.

  // startGame is wired separately to avoid duplicate
  document.getElementById('play-again-btn').addEventListener('click', restartGame);
  document.getElementById('back-menu-btn').addEventListener('click', backToMenu);

  function wordListImageControls(w) {
    const img = getWordImage(w);
    const wordAttr = String(w.word || '').replace(/"/g, '&quot;');
    const thumb = img.url
      ? `<img class="word-list-thumb" src="${img.url}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="word-list-thumb word-list-thumb--empty" title="No picture">—</span>`;
    const badge = img.source === 'shared'
      ? (img.url ? 'shared' : 'hidden')
      : (img.url ? '' : 'none');
    const badgeHtml = badge
      ? `<span class="img-badge img-badge--${badge}">${badge === 'hidden' ? 'no img' : badge}</span>`
      : '';
    return `${thumb}${badgeHtml}<button type="button" class="img-edit-btn" data-word="${wordAttr}" title="Edit shared picture">Image</button>`;
  }

  function bindWordListImageEditors(listEl, words, onRefresh) {
    listEl.querySelectorAll('.img-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wordStr = btn.dataset.word;
        const word = (words || []).find((w) => w.word === wordStr)
          || pictureVocabulary.find((w) => w.word === wordStr)
          || { word: wordStr, article: '', meaning: '' };
        openImageEditModal(word, onRefresh);
      });
    });
  }

  // Helper to show a selectable words list (checkboxes) before playing
  function showBasicWordsList(words) {
    const listEl = document.getElementById('extracted-words-list');
    if (!listEl || !words || !words.length) return;

    const isCustom = !!(customWords && customWords.length > 0);
    const itemsHtml = words.map(w => {
      const meaning = (w.meaning || '').replace(/;/g, '; ').trim();
      const levelInfo = w.level ? ` [${levelLabel(w.level)}]` : '';
      const isChecked = !unselectedWords.has(w.word);
      return `<li class="word-list-item">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1; min-width:0;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} data-word="${w.word}" style="margin:0;">
          <span class="de-word">${w.word}</span>
          <span class="de-article">(${w.article || ''})</span>
          <span class="meaning">— ${meaning}${levelInfo}</span>
        </label>
        <div class="word-list-img-actions">${wordListImageControls(w)}</div>
      </li>`;
    }).join('');

    const title = isCustom
      ? 'Extracted words (uncheck to exclude from games)'
      : 'Words in this set (uncheck to exclude from games)';
    listEl.innerHTML = `<strong>${title} (${words.length}):</strong>
      <p class="word-list-img-hint">Use <em>Image</em> if a picture is wrong or missing.</p>
      <ul>${itemsHtml}</ul>`;
    listEl.hidden = false;

    const refresh = () => {
      if (isCustom && customWords && customWords.length) renderExtractedList(customWords);
      else {
        const group = getCurrentGroupWordsUnfiltered();
        if (group && group.length) showBasicWordsList(group);
      }
      if (gameActive) updateBoard(true);
    };

    const cbs = listEl.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const wordStr = cb.dataset.word;
        if (cb.checked) {
          unselectedWords.delete(wordStr);
        } else {
          unselectedWords.add(wordStr);
        }
        refresh();
      });
    });
    bindWordListImageEditors(listEl, words, refresh);
  }


























  // When set/group changes in ready-made sets: hide list until user presses Preview again
  const setSel = document.getElementById('set-select');
  if (setSel) {
    setSel.addEventListener('change', () => {
      if (isCustomReadingMode() || (customWords && customWords.length > 0)) {
        if (customWords && customWords.length) renderExtractedList(customWords);
        return;
      }
      unselectedWords = new Set();
      hideWordSelectionList();
    });
  }

  // Preview button: show selectable word list for the chosen group (sets mode)
  const previewSetBtn = document.getElementById('preview-set-btn');
  if (previewSetBtn) {
    previewSetBtn.addEventListener('click', () => {
      if (isCustomReadingMode()) return;
      unselectedWords = new Set();
      const group = getCurrentGroupWordsUnfiltered();
      if (!group || !group.length) {
        alert('No words available for this group. Pick another CEFR level or set.');
        hideWordSelectionList();
        return;
      }
      showBasicWordsList(group);
    });
  }

  /* ===================== VIEW / MENU LOGIC ===================== */
  const menuView = document.getElementById('menu-view');
  const customFlow = document.getElementById('custom-flow');
  const practicePanel = document.getElementById('practice-panel');
  const setsFlow = document.getElementById('sets-flow');
  const addWordsFlow = document.getElementById('add-words-flow');
  const savedSetsFlow = document.getElementById('saved-sets-flow');

  function showMenu() {
    if (menuView) menuView.style.display = '';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (practicePanel) practicePanel.style.display = 'none';
    // hide game if open
    const gameScreen = document.getElementById('picture-game-screen');
    const gameOver = document.getElementById('picture-gameover');
    if (gameScreen) gameScreen.hidden = true;
    if (gameOver) gameOver.hidden = true;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = 'none';
  }

  function setAddWordStatus(msg, isError = false) {
    const el = document.getElementById('add-word-status');
    if (!el) return;
    el.innerHTML = msg || '';
    el.style.color = isError ? 'var(--accent)' : '';
  }

  function renderUserWordsList() {
    const listEl = document.getElementById('user-words-list');
    const countEl = document.getElementById('user-words-count');
    const userWords = loadUserVocabulary();
    if (countEl) {
      countEl.textContent = `${userWords.length} saved in this browser`;
    }
    if (!listEl) return;
    if (!userWords.length) {
      listEl.innerHTML = '<p class="user-words-empty">No custom words yet. Add one above — it will be used in reading extract and practice sets.</p>';
      return;
    }
    const sorted = [...userWords].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.word.localeCompare(b.word, 'de');
    });
    listEl.innerHTML = `<ul>${sorted.map((w) => {
      const meaning = (w.meaning || '').replace(/</g, '&lt;');
      const articleStr = (w.article || '').replace(/</g, '&lt;');
      const wordStr = (w.word || '').replace(/"/g, '&quot;');
      return `<li>
        <div class="user-word-meta">
          <span class="de-word">${w.word}</span>
          <span class="de-article">(${articleStr})</span>
          <span class="meaning">— ${meaning} <em>(${levelLabel(w.level)} · yours)</em></span>
        </div>
        <button type="button" class="remove-user-word" data-word="${wordStr}">Remove</button>
      </li>`;
    }).join('')}</ul>`;

    listEl.querySelectorAll('.remove-user-word').forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = btn.dataset.word;
        if (!h) return;
        if (!confirm(`Remove “${h}” from your library?`)) return;
        removeUserWord(h);
        renderUserWordsList();
        updatePictureSetOptions();
        setAddWordStatus(`Removed “${h}”.`);
      });
    });
  }

  function showAddWords() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (practicePanel) practicePanel.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = '';
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = 'none';
    const gameScreen = document.getElementById('picture-game-screen');
    const gameOver = document.getElementById('picture-gameover');
    if (gameScreen) gameScreen.hidden = true;
    if (gameOver) gameOver.hidden = true;
    setAddWordStatus('');
    renderUserWordsList();
    const wordInput = document.getElementById('add-word');
    if (wordInput) wordInput.focus();
  }

  function updateSaveSetButton() {
    const btn = document.getElementById('save-word-set-btn');
    if (!btn) return;
    btn.style.display = (customWords && customWords.length > 0) ? 'inline-block' : 'none';
  }

  function renderSavedSetsList() {
    const listEl = document.getElementById('saved-sets-list');
    const emptyEl = document.getElementById('saved-sets-empty');
    if (!listEl) return;
    const sets = loadSavedWordSets();
    if (!sets.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = sets.map((s) => {
      const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
      const n = (s.words || []).length;
      const src = s.readingTitle ? ` · from “${String(s.readingTitle).replace(/</g, '&lt;')}”` : '';
      return `<div class="saved-set-card" data-id="${s.id}">
        <div class="saved-set-info">
          <strong class="saved-set-name">${String(s.name || 'Untitled').replace(/</g, '&lt;')}</strong>
          <span class="saved-set-meta">${n} words${date ? ' · ' + date : ''}${src}</span>
        </div>
        <div class="saved-set-actions">
          <button type="button" class="btn btn-learned saved-set-load" data-id="${s.id}">Practice</button>
          <button type="button" class="btn btn-secondary saved-set-delete" data-id="${s.id}">Delete</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.saved-set-load').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const set = loadSavedWordSets().find((x) => x.id === id);
        if (!set || !set.words?.length) return;
        loadSavedSetIntoPractice(set);
      });
    });
    listEl.querySelectorAll('.saved-set-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const set = loadSavedWordSets().find((x) => x.id === id);
        if (!set) return;
        if (!confirm(`Delete saved set “${set.name}”?`)) return;
        removeSavedWordSet(id);
        renderSavedSetsList();
      });
    });
  }

  function loadSavedSetIntoPractice(set) {
    // Enter reading/custom mode with these words ready to play
    if (menuView) menuView.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (customFlow) customFlow.style.display = '';
    if (practicePanel) practicePanel.style.display = '';

    customWords = (set.words || []).map((w) => ({
      word: w.word,
      article: w.article || '',
      meaning: w.meaning || '',
      level: w.level || 0,
      userAdded: true,
    }));
    unselectedWords = new Set();
    currentImageMap = {};

    const infoEl = document.getElementById('custom-extract-info');
    if (infoEl) {
      infoEl.innerHTML = `Loaded saved set <strong>${String(set.name).replace(/</g, '&lt;')}</strong> (${customWords.length} words).`;
    }
    applyReadingToUi({
      title: set.name,
      description: 'Saved word set — practice these words',
      text: customWords.map((w) => w.word).join(', '),
      level: 0,
    });

    renderExtractedList(customWords);
    updatePictureSetOptionsForCustom();
    updateSetPickerForMode();
    updateCustomClearButton();
    updateSaveSetButton();

    const listSection = document.getElementById('words-list-section');
    if (listSection) listSection.hidden = false;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = '';
  }

  function showSavedSets() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (practicePanel) practicePanel.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = '';
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = 'none';
    const gameScreen = document.getElementById('picture-game-screen');
    const gameOver = document.getElementById('picture-gameover');
    if (gameScreen) gameScreen.hidden = true;
    if (gameOver) gameOver.hidden = true;
    renderSavedSetsList();
  }

  function showCustom() {
    if (menuView) menuView.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (customFlow) customFlow.style.display = '';
    if (practicePanel) practicePanel.style.display = '';
    // Make sure paste area is always visible for custom (also after a previous game)
    const reading = document.getElementById('reading-input');
    if (reading) {
      reading.style.display = '';
      reading.hidden = false;
    }
    const listSection = document.getElementById('words-list-section');
    if (listSection) listSection.hidden = false;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = '';

    // Ensure only custom cefr are active
    document.querySelectorAll('#sets-flow .level-filters input[type="checkbox"], .sets-cefr-filters input').forEach(c => c.checked = false);

    // Refresh collection for selected CEFR
    const levelSel = document.getElementById('reading-cefr-level');
    populateLessons(levelSel ? levelSel.value : 3);
    setReadingSourceTab(document.querySelector('.reading-source-tab.is-active')?.dataset.source || 'collection');

    // Never show ready-made set picker / default word groups in custom reading mode
    updateSetPickerForMode();
    updatePictureSetOptions();

    // Only show extracted words if user already extracted; never inject default CEFR sets
    const listEl = document.getElementById('extracted-words-list');
    if (customWords && customWords.length > 0) {
      renderExtractedList(customWords);
    } else if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    updateSaveSetButton();
  }

  function showSets() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = '';
    if (practicePanel) practicePanel.style.display = '';

    // For sets mode, hide the pure custom paste area but keep levels if possible
    const reading = document.getElementById('reading-input');
    if (reading) reading.style.display = 'none';  // hide paste + custom cefr (sets has its own in HTML)
    const listSection = document.getElementById('words-list-section');
    if (listSection) listSection.hidden = false;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = '';

    // Ensure only sets cefr are active (uncheck custom ones)
    document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]').forEach(c => c.checked = false);

    // Clear any previous custom state so levels + sets work
    customWords = [];
    unselectedWords = new Set();
    currentImageMap = {};

    // Refresh sets from current levels; do NOT auto-show word list — wait for Preview
    updatePictureSetOptions();
    updateSetPickerForMode();  // ensure picker visible in sets mode
    hideWordSelectionList();

    // Wire the duplicated sets start button if present
    const setsStart = document.getElementById('sets-start-picture-game');
    if (setsStart) {
      setsStart.onclick = () => {
        const mainStart = document.getElementById('start-picture-game');
        if (mainStart) mainStart.click();
      };
    }
  }

  // Attach sets-cefr-filters listeners once — changing levels rebuilds groups; hide list until Preview
  document.querySelectorAll('.sets-cefr-filters input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      customWords = [];
      unselectedWords = new Set();
      updatePictureSetOptions();
      hideWordSelectionList();
    });
  });
  const sAllOnce = document.getElementById('sets-select-all');
  const sNoneOnce = document.getElementById('sets-clear');
  if (sAllOnce) sAllOnce.onclick = () => {
    document.querySelectorAll('.sets-cefr-filters input').forEach(c => c.checked = true);
    unselectedWords = new Set();
    updatePictureSetOptions();
    hideWordSelectionList();
  };
  if (sNoneOnce) sNoneOnce.onclick = () => {
    document.querySelectorAll('.sets-cefr-filters input').forEach(c => c.checked = false);
    unselectedWords = new Set();
    updatePictureSetOptions();
    hideWordSelectionList();
  };

  // Menu button handlers
  const startCustomBtn = document.getElementById('start-custom-btn');
  if (startCustomBtn) startCustomBtn.addEventListener('click', showCustom);

  const startSetsBtn = document.getElementById('start-sets-btn');
  if (startSetsBtn) startSetsBtn.addEventListener('click', showSets);

  const startSavedSetsBtn = document.getElementById('start-saved-sets-btn');
  if (startSavedSetsBtn) startSavedSetsBtn.addEventListener('click', showSavedSets);

  const startAddWordsBtn = document.getElementById('start-add-words-btn');
  if (startAddWordsBtn) startAddWordsBtn.addEventListener('click', showAddWords);

  const backCustom = document.getElementById('back-from-custom');
  if (backCustom) backCustom.addEventListener('click', showMenu);

  const backSets = document.getElementById('back-from-sets');
  if (backSets) backSets.addEventListener('click', showMenu);

  const backSavedSets = document.getElementById('back-from-saved-sets');
  if (backSavedSets) backSavedSets.addEventListener('click', showMenu);

  const backAddWords = document.getElementById('back-from-add-words');
  if (backAddWords) backAddWords.addEventListener('click', showMenu);

  // ---- Add-your-own-words form ----
  const addWordForm = document.getElementById('add-word-form');
  const addWordCheckBtn = document.getElementById('add-word-check');
  const addImageUrlClear = document.getElementById('add-image-url-clear');
  if (addImageUrlClear) {
    addImageUrlClear.addEventListener('click', () => {
      const imgEl = document.getElementById('add-image-url');
      if (imgEl) {
        imgEl.value = '';
        imgEl.focus();
      }
    });
  }

  function readAddWordForm() {
    return {
      word: (document.getElementById('add-word')?.value || '').trim(),
      article: (document.getElementById('add-article')?.value || '').trim(),
      meaning: (document.getElementById('add-meaning')?.value || '').trim(),
      level: Number(document.getElementById('add-level')?.value || 3),
      imageUrl: (document.getElementById('add-image-url')?.value || '').trim(),
    };
  }

  if (addWordCheckBtn) {
    addWordCheckBtn.addEventListener('click', () => {
      const { word } = readAddWordForm();
      if (!word) {
        setAddWordStatus('Enter a German word to check.', true);
        return;
      }
      const existing = findWordInLibrary(word);
      if (!existing) {
        setAddWordStatus(`“${word}” is <strong>not</strong> in the library — you can add it.`);
        return;
      }
      const src = existing.userAdded ? 'your added words' : `the built-in library (${levelLabel(existing.level)})`;
      setAddWordStatus(
        `Already in ${src}: <strong>${existing.word}</strong> (${existing.article || '—'}) — ${existing.meaning || ''}`
      );
    });
  }

  if (addWordForm) {
    addWordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = readAddWordForm();
      const result = addUserWord(data);
      if (!result.ok) {
        setAddWordStatus(result.reason || 'Could not add word.', true);
        return;
      }
      let imgNote = '';
      if (data.imageUrl) {
        try {
          await setImageOverride(result.word.word, data.imageUrl, {
            article: result.word.article,
            meaning: result.word.meaning,
          });
          imgNote = ' · image saved to shared library';
        } catch (err) {
          imgNote = ` · word saved, but image not saved (${err.message})`;
        }
      }
      setAddWordStatus(
        `✅ Added <strong>${result.word.word}</strong> (${result.word.article}) — ${result.word.meaning}${imgNote}`
      );
      const wordEl = document.getElementById('add-word');
      const articleEl = document.getElementById('add-article');
      const meaningEl = document.getElementById('add-meaning');
      const imgEl = document.getElementById('add-image-url');
      if (wordEl) wordEl.value = '';
      if (articleEl) articleEl.value = '';
      if (meaningEl) meaningEl.value = '';
      if (imgEl) imgEl.value = '';
      if (wordEl) wordEl.focus();
      renderUserWordsList();
      updatePictureSetOptions();
    });
  }

  // Make the game "back to menu" button go to menu
  const backMenuBtn = document.getElementById('back-menu-btn');
  if (backMenuBtn) {
    const originalClick = backMenuBtn.onclick;
    backMenuBtn.addEventListener('click', () => {
      // after the existing backToMenu logic, show menu
      setTimeout(showMenu, 50);
    });
  }

  // Start on the menu (clear any auto list)
  if (menuView) {
    const listEl = document.getElementById('extracted-words-list');
    if (listEl) listEl.hidden = true;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = 'none';
    // Show menu by default
    showMenu();
  }

  // When entering game from either flow, make sure hint is visible again if desired
  const origStartGame = startGame;
  // (we don't override fully to avoid breaking, the hint is minor)




  // Custom reading paste support for lesson mode
  const extractBtn = document.getElementById('extract-custom-btn');
  const clearCustomBtn = document.getElementById('clear-custom-btn');
  const infoEl = document.getElementById('custom-extract-info');
  const listEl = document.getElementById('extracted-words-list');

  // Also clear any previous search results when user starts a fresh custom extraction
  if (extractBtn) {
    // The listener below will also clear currentImageMap when new extraction happens
  }

  function getSelectedLevels() {
    const cbs = document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]:checked');
    return Array.from(cbs).map(cb => Number(cb.value));
  }

  // getActiveExtractedWords is defined at module scope (used by startGame / set options)

  function updateCustomClearButton() {
    if (clearCustomBtn) {
      clearCustomBtn.style.display = (customWords && customWords.length > 0) ? 'inline-block' : 'none';
    }
    updateSaveSetButton();
  }

  function renderExtractedList(words) {
    if (!listEl) return;
    if (!words || words.length === 0) {
      listEl.hidden = true;
      listEl.innerHTML = '';
      return;
    }
    const items = words.map(w => {
      const meaning = (w.meaning || '').replace(/;/g, '; ').trim();
      const levelInfo = w.level ? ` [${levelLabel(w.level)}]` : '';
      const isChecked = !unselectedWords.has(w.word);
      return `<li class="word-list-item">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1; min-width:0;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} data-word="${w.word}" style="margin:0;">
          <span class="de-word">${w.word}</span>
          <span class="de-article">(${w.article || ''})</span>
          <span class="meaning">— ${meaning}${levelInfo}</span>
        </label>
        <div class="word-list-img-actions">${wordListImageControls(w)}</div>
      </li>`;
    }).join('');
    listEl.innerHTML = `<strong>Extracted words (${words.length}) — uncheck to exclude from games:</strong>
      <p class="word-list-img-hint">Use <em>Image</em> if a picture is wrong or missing.</p>
      <ul>${items}</ul>`;
    listEl.hidden = false;

    const refresh = () => {
      updatePictureSetOptions();
      if (customWords && customWords.length) renderExtractedList(customWords);
      if (gameActive) updateBoard(true);
    };

    const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const wordStr = cb.dataset.word;
        if (cb.checked) {
          unselectedWords.delete(wordStr);
        } else {
          unselectedWords.add(wordStr);
        }
        refresh();
      });
    });
    bindWordListImageEditors(listEl, words, refresh);
  }

  // (old updateActive removed; checkbox listeners now directly update using getActiveExtractedWords and re-render full list)

  if (extractBtn) {
    extractBtn.addEventListener('click', () => {
      // Sync paste box with active editor if user edited the loaded reading
      const activeTa = document.getElementById('active-reading-text');
      const pasteTa = document.getElementById('custom-reading-text');
      if (activeTa && activeTa.value.trim() && pasteTa) {
        pasteTa.value = activeTa.value;
      }

      const text = getActiveReadingText();
      if (!text) {
        if (infoEl) infoEl.textContent = 'Load a reading or paste German text first.';
        return;
      }

      const selectedLevels = getSelectedLevels();
      customWords = extractWordsFromCustomText(text, pictureVocabulary, selectedLevels);
      unselectedWords = new Set();
      currentImageMap = {};

      const levelDesc = selectedLevels.length === 0
        ? 'all levels'
        : selectedLevels.sort((a, b) => a - b).map(levelLabel).join(', ');

      if (infoEl) {
        if (customWords.length === 0) {
          infoEl.innerHTML = `No matching words found in the text for ${levelDesc}. Try more CEFR levels or another reading.`;
        } else {
          infoEl.innerHTML = `✅ Extracted <strong>${customWords.length}</strong> words for ${levelDesc}. You can save this set or start the game.`;
        }
      }

      renderExtractedList(customWords);
      updatePictureSetOptionsForCustom();
      updateSetPickerForMode();
      updateCustomClearButton();
    });
  }

  if (clearCustomBtn) {
    clearCustomBtn.addEventListener('click', () => {
      customWords = [];
      unselectedWords = new Set();
      currentImageMap = {};
      if (infoEl) infoEl.textContent = '';
      if (listEl) {
        listEl.hidden = true;
        listEl.innerHTML = '';
      }
      const preview = document.getElementById('picture-preview');
      if (preview) preview.hidden = true;
      const lessonBox = document.getElementById('lesson-reading');
      if (lessonBox) lessonBox.hidden = true;
      const activeTa = document.getElementById('active-reading-text');
      if (activeTa) {
        activeTa.value = '';
        activeTa.hidden = true;
      }
      const pasteTa = document.getElementById('custom-reading-text');
      if (pasteTa) pasteTa.value = '';
      const dailySt = document.getElementById('daily-reading-status');
      if (dailySt) dailySt.textContent = '';
      updatePictureSetOptions();
      updateSetPickerForMode();
      updateCustomClearButton();
    });
  }

  // Save current extracted words as a named set
  const saveSetBtn = document.getElementById('save-word-set-btn');
  if (saveSetBtn) {
    saveSetBtn.addEventListener('click', () => {
      const words = getActiveExtractedWords().length
        ? getActiveExtractedWords()
        : (customWords || []);
      if (!words.length) {
        if (infoEl) infoEl.textContent = 'Extract words first, then save a set.';
        return;
      }
      const titleEl = document.getElementById('lesson-reading-title');
      const defaultName = (titleEl && titleEl.textContent && titleEl.textContent !== 'Reading')
        ? `${titleEl.textContent} · words`
        : `Practice set ${new Date().toLocaleDateString()}`;
      const name = window.prompt('Name for this word set:', defaultName);
      if (name === null) return;
      try {
        const entry = addSavedWordSet({
          name: name.trim() || defaultName,
          words,
          source: 'reading',
          readingTitle: titleEl?.textContent || '',
        });
        if (infoEl) {
          infoEl.innerHTML = `💾 Saved <strong>${entry.words.length}</strong> words as “${String(entry.name).replace(/</g, '&lt;')}”. Open <em>My saved word sets</em> from the menu anytime.`;
        }
      } catch (err) {
        if (infoEl) infoEl.textContent = err.message || String(err);
      }
    });
  }

  // ---- Reading source tabs + collection / daily ----
  document.querySelectorAll('.reading-source-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setReadingSourceTab(tab.dataset.source || 'collection');
    });
  });

  const readingLevelSel = document.getElementById('reading-cefr-level');
  if (readingLevelSel) {
    readingLevelSel.addEventListener('change', () => {
      populateLessons(readingLevelSel.value);
      setExtractLevelsUpTo(Number(readingLevelSel.value) || 3);
      const dailySt = document.getElementById('daily-reading-status');
      if (dailySt) dailySt.textContent = '';
    });
  }

  const loadCollectionBtn = document.getElementById('load-collection-reading');
  if (loadCollectionBtn) {
    loadCollectionBtn.addEventListener('click', () => {
      const sel = document.getElementById('lesson-select');
      const id = sel ? sel.value : '';
      if (!id) {
        if (infoEl) infoEl.textContent = 'Choose a reading from the list first.';
        return;
      }
      const reading = typeof getReadingById === 'function'
        ? getReadingById(id)
        : getReadingCollection().find((r) => r.id === id);
      if (!reading) {
        if (infoEl) infoEl.textContent = 'Reading not found.';
        return;
      }
      applyReadingToUi(reading);
      customWords = [];
      unselectedWords = new Set();
      if (listEl) {
        listEl.hidden = true;
        listEl.innerHTML = '';
      }
      if (infoEl) {
        infoEl.innerHTML = `Loaded <strong>${reading.title}</strong> (${levelLabel(reading.level)}). Click <em>Extract words</em> to practice.`;
      }
      updateCustomClearButton();
    });
  }

  const loadDailyBtn = document.getElementById('load-daily-reading');
  if (loadDailyBtn) {
    loadDailyBtn.addEventListener('click', async () => {
      const level = Number(document.getElementById('reading-cefr-level')?.value) || 3;
      const statusEl = document.getElementById('daily-reading-status');
      loadDailyBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Loading today’s reading…';
      if (infoEl) infoEl.textContent = '';
      try {
        const reading = await loadDailyReadingForLevel(level, pictureVocabulary);
        applyReadingToUi(reading);
        customWords = [];
        unselectedWords = new Set();
        if (listEl) {
          listEl.hidden = true;
          listEl.innerHTML = '';
        }
        const srcNote = reading.source === 'wikipedia'
          ? 'from the open web (German Wikipedia)'
          : 'from the graded collection (web text unavailable or too hard for this level)';
        const cacheNote = reading.fromCache ? ' · cached for today' : '';
        if (statusEl) {
          statusEl.innerHTML = `✅ ${srcNote}${cacheNote}. Same text all day for ${levelLabel(level)}.`;
        }
        if (infoEl) {
          infoEl.innerHTML = `Loaded <strong>${String(reading.title).replace(/</g, '&lt;')}</strong>. Click <em>Extract words</em> to practice.`;
        }
        updateCustomClearButton();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Could not load daily reading.';
      } finally {
        loadDailyBtn.disabled = false;
      }
    });
  }

  // Keep active editor in sync when user types in paste tab
  const pasteTaSync = document.getElementById('custom-reading-text');
  if (pasteTaSync) {
    pasteTaSync.addEventListener('input', () => {
      const activeTa = document.getElementById('active-reading-text');
      const box = document.getElementById('lesson-reading');
      if (activeTa) {
        activeTa.value = pasteTaSync.value;
        activeTa.hidden = !pasteTaSync.value.trim();
      }
      if (box && pasteTaSync.value.trim()) {
        box.hidden = false;
        const titleEl = document.getElementById('lesson-reading-title');
        const descEl = document.getElementById('lesson-reading-desc');
        const bodyEl = document.getElementById('lesson-reading-body');
        if (titleEl) titleEl.textContent = 'Your text';
        if (descEl) descEl.textContent = 'Pasted reading';
        if (bodyEl) bodyEl.textContent = pasteTaSync.value;
      }
    });
  }

  const activeTaSync = document.getElementById('active-reading-text');
  if (activeTaSync) {
    activeTaSync.addEventListener('input', () => {
      const pasteTa = document.getElementById('custom-reading-text');
      const bodyEl = document.getElementById('lesson-reading-body');
      if (pasteTa) pasteTa.value = activeTaSync.value;
      if (bodyEl) bodyEl.textContent = activeTaSync.value;
    });
  }

  const startBtn = document.getElementById('start-picture-game');
  if (startBtn) {
    startBtn.addEventListener('click', startGame);
  }

  // Level quick buttons
  const allBtn = document.getElementById('select-all-levels');
  const noneBtn = document.getElementById('clear-levels');
  const upToBtn = document.getElementById('levels-up-to-reading');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
  }
  if (noneBtn) {
    noneBtn.addEventListener('click', () => {
      document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
  }
  if (upToBtn) {
    upToBtn.addEventListener('click', () => {
      const lv = Number(document.getElementById('reading-cefr-level')?.value) || 3;
      setExtractLevelsUpTo(lv);
    });
  }

  // Initial UI state
  populateLessons(document.getElementById('reading-cefr-level')?.value || 3);
  setReadingSourceTab('collection');
  updateCustomClearButton();
  const initList = document.getElementById('extracted-words-list');
  if (initList) initList.hidden = true;
}

function populateLessons(level) {
  const sel = document.getElementById('lesson-select');
  if (!sel) return;
  const cefr = Number(level) || Number(document.getElementById('reading-cefr-level')?.value) || 3;
  while (sel.options.length > 1) sel.remove(1);

  const list = typeof getReadingsForLevel === 'function'
    ? getReadingsForLevel(cefr)
    : getReadingCollection().filter((r) => Number(r.level) === cefr);

  list.forEach((lesson) => {
    const opt = document.createElement('option');
    opt.value = lesson.id;
    opt.textContent = lesson.title + (lesson.description ? ` — ${lesson.description}` : '');
    sel.appendChild(opt);
  });

  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No readings for this level yet';
    opt.disabled = true;
    sel.appendChild(opt);
  }
}

/** Put reading text into the shared editor and show the lesson box. */
function applyReadingToUi(reading) {
  const box = document.getElementById('lesson-reading');
  const titleEl = document.getElementById('lesson-reading-title');
  const descEl = document.getElementById('lesson-reading-desc');
  const bodyEl = document.getElementById('lesson-reading-body');
  const activeTa = document.getElementById('active-reading-text');
  const pasteTa = document.getElementById('custom-reading-text');

  if (!reading || !reading.text) return;

  if (titleEl) titleEl.textContent = reading.title || 'Reading';
  if (descEl) {
    descEl.textContent = reading.description || (reading.level ? `${levelLabel(reading.level)}` : '');
  }
  if (bodyEl) bodyEl.textContent = reading.text;
  if (activeTa) {
    activeTa.value = reading.text;
    activeTa.hidden = false;
  }
  if (pasteTa) pasteTa.value = reading.text;
  if (box) box.hidden = false;

  // Keep extract level checkboxes aligned with reading level (1..N)
  const maxLv = Number(reading.level) || Number(document.getElementById('reading-cefr-level')?.value) || 3;
  setExtractLevelsUpTo(maxLv);
}

function setExtractLevelsUpTo(maxLevel) {
  const max = Number(maxLevel) || 3;
  document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]').forEach((cb) => {
    cb.checked = Number(cb.value) <= max;
  });
}

function getActiveReadingText() {
  const activeTa = document.getElementById('active-reading-text');
  if (activeTa && activeTa.value.trim()) return activeTa.value.trim();
  const pasteTa = document.getElementById('custom-reading-text');
  return pasteTa ? pasteTa.value.trim() : '';
}

function setReadingSourceTab(source) {
  const tabs = document.querySelectorAll('.reading-source-tab');
  tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.source === source));
  const panels = {
    collection: document.getElementById('reading-source-collection'),
    daily: document.getElementById('reading-source-daily'),
    paste: document.getElementById('reading-source-paste'),
  };
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.hidden = key !== source;
  });
}
