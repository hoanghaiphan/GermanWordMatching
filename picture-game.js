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
const MEANING_OVERRIDES_KEY = 'german-meaning-overrides-v1';
const SAVED_READINGS_KEY = 'german-saved-readings-v1';

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

/** Local meaning overrides for any word (including built-in CEFR). */
function loadMeaningOverrides() {
  try {
    const raw = localStorage.getItem(MEANING_OVERRIDES_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveMeaningOverrides(map) {
  try {
    localStorage.setItem(MEANING_OVERRIDES_KEY, JSON.stringify(map || {}));
  } catch (e) {
    console.warn('Could not save meaning overrides', e);
  }
}

/**
 * Update English meaning for a word (local always; shared if configured + row exists).
 * Works for CEFR built-ins and user words.
 * @returns {{ ok: boolean, word?: object, shared?: string, reason?: string }}
 */
async function updateWordMeaning(wordKey, newMeaning, opts = {}) {
  const key = (wordKey || '').trim();
  const meaning = String(newMeaning || '').trim();
  if (!key) return { ok: false, reason: 'Missing German word.' };
  if (!meaning) return { ok: false, reason: 'Meaning cannot be empty.' };

  const existing = findWordInLibrary(key);
  const article = opts.article != null
    ? String(opts.article || '').trim()
    : ((existing && existing.article) || '');
  const level = opts.level || (existing && existing.level) || 3;
  // Preserve original casing from library when possible
  const word = (existing && existing.word) || key;

  // 1) Local override (always) — keyed case-insensitively via lower form + store display word
  const overrides = loadMeaningOverrides();
  const overrideKey = word.toLowerCase();
  overrides[overrideKey] = {
    word,
    meaning,
    article,
    level,
    updatedAt: new Date().toISOString(),
  };
  saveMeaningOverrides(overrides);

  // Also keep user-vocab in sync if this was a user-added word
  const userWords = loadUserVocabulary();
  const ui = userWords.findIndex((w) => String(w.word).toLowerCase() === overrideKey);
  if (ui >= 0) {
    userWords[ui] = {
      ...userWords[ui],
      meaning,
      article: article || userWords[ui].article,
    };
    saveUserVocabulary(userWords);
  }

  rebuildVocabularyWithUserWords();

  // Patch in-memory game lists
  const patchList = (list) => {
    if (!Array.isArray(list)) return;
    for (const w of list) {
      if (w && String(w.word || '').toLowerCase() === overrideKey) w.meaning = meaning;
    }
  };
  patchList(customWords);
  patchList(practicedWords);
  patchList(currentSetWords);

  // 2) Shared library meaning (optional)
  let shared = 'skipped';
  const lib = sharedLibrary();
  if (lib && lib.enabled && typeof lib.setMeaning === 'function') {
    try {
      await lib.setMeaning(word, meaning, { article });
      shared = 'saved';
    } catch (err) {
      if (err && err.code === 'NO_SHARED_IMAGE_ROW') {
        shared = 'local-only';
      } else {
        shared = err.message || 'error';
      }
    }
  } else {
    shared = 'not-configured';
  }

  const out = findWordInLibrary(word) || { word, article, meaning, level };
  return { ok: true, word: out, shared };
}

/** Rebuild pictureVocabulary = built-in + user words + meaning overrides. */
function rebuildVocabularyWithUserWords() {
  const userWords = loadUserVocabulary();
  const overrides = loadMeaningOverrides();
  const byKey = new Map();
  for (const w of baseVocabulary) {
    if (w && w.word) byKey.set(String(w.word).toLowerCase(), { ...w, userAdded: false });
  }
  // Shared library meanings (if already loaded)
  const lib = typeof SharedImageLibrary !== 'undefined' ? SharedImageLibrary : null;
  if (lib && lib.cache) {
    for (const [wKey, entry] of Object.entries(lib.cache)) {
      if (!entry || !entry.meaning) continue;
      const lk = String(wKey).toLowerCase();
      const cur = byKey.get(lk);
      if (cur) {
        byKey.set(lk, {
          ...cur,
          meaning: entry.meaning,
          article: entry.article || cur.article,
        });
      }
    }
  }
  for (const w of userWords) {
    byKey.set(String(w.word).toLowerCase(), { ...w, userAdded: true });
  }
  // Local meaning overrides win
  for (const [lk, o] of Object.entries(overrides)) {
    if (!o || !o.meaning) continue;
    const cur = byKey.get(lk);
    if (cur) {
      byKey.set(lk, {
        ...cur,
        meaning: o.meaning,
        article: o.article != null && o.article !== '' ? o.article : cur.article,
        meaningOverride: true,
      });
    } else {
      byKey.set(lk, {
        word: o.word || lk,
        article: o.article || '',
        meaning: o.meaning,
        level: o.level || 3,
        userAdded: true,
        meaningOverride: true,
      });
    }
  }
  pictureVocabulary = Array.from(byKey.values());
  return userWords;
}

// ---- Local saved readings ----
function loadSavedReadings() {
  try {
    const raw = localStorage.getItem(SAVED_READINGS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveSavedReadings(list) {
  try {
    localStorage.setItem(SAVED_READINGS_KEY, JSON.stringify(list || []));
  } catch (e) {
    console.warn('Could not save readings', e);
  }
}

/**
 * Save a reading to this browser.
 * @param {{ title: string, text: string, description?: string, level?: number, source?: string }} reading
 */
function addSavedReading(reading) {
  const title = String(reading.title || '').trim();
  const text = String(reading.text || '').trim();
  if (!title) throw new Error('Please enter a title for this reading.');
  if (!text) throw new Error('No reading text to save.');

  const list = loadSavedReadings();
  const entry = {
    id: `local-rd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    description: String(reading.description || '').trim(),
    text,
    level: Number(reading.level) || 0,
    source: reading.source || 'user',
    createdAt: new Date().toISOString(),
    shared: false,
  };
  list.unshift(entry);
  saveSavedReadings(list.slice(0, 50));
  return entry;
}

function removeSavedReading(id) {
  const next = loadSavedReadings().filter((r) => r.id !== id);
  saveSavedReadings(next);
  return next;
}

function sharedContentLibrary() {
  return typeof SharedContentLibrary !== 'undefined' ? SharedContentLibrary : null;
}

function sharedContentEnabled() {
  const lib = sharedContentLibrary();
  return !!(lib && lib.enabled);
}

/** Snapshot of the current reading UI for save/share. */
function getCurrentReadingSnapshot() {
  const text = getActiveReadingText();
  const titleEl = document.getElementById('lesson-reading-title');
  const descEl = document.getElementById('lesson-reading-desc');
  const levelSel = document.getElementById('reading-cefr-level');
  const title = (titleEl && titleEl.textContent && titleEl.textContent !== 'Reading')
    ? titleEl.textContent.trim()
    : '';
  return {
    title,
    description: (descEl && descEl.textContent) || '',
    text,
    level: Number(levelSel && levelSel.value) || 0,
    source: 'user',
  };
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
const DAILY_READING_CACHE_KEY = 'german-daily-reading-cache-v3';
/** Soft cap for practice text; longer extracts are truncated at a sentence with a notice. */
const DAILY_READING_MAX_CHARS = 2000;

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
 * Score German text for CEFR suitability (known words only).
 */
function scoreTextForLevel(text, vocab, maxLevel) {
  const words = extractWordsFromCustomText(text, vocab, [], { includeUnknown: false });
  if (!words.length) return { score: 0, matched: 0, atOrBelow: 0 };
  const atOrBelow = words.filter((w) => Number(w.level) <= maxLevel).length;
  const score = atOrBelow / words.length;
  return { score, matched: words.length, atOrBelow };
}

function scoreReadingQuality(text, vocab, maxLevel) {
  const h = scoreTextForLevel(text, vocab, maxLevel);
  const t = String(text || '').trim();
  let rank = h.score * 55 + Math.min(h.matched, 36) * 0.9 + Math.min(h.atOrBelow, 28) * 0.35;
  const len = t.length;
  if (len >= 120 && len <= 1600) rank += 18;
  else if (len >= 80 && len <= 2000) rank += 12;
  else if (len < 45) rank -= 25;
  else if (len > 2200) rank -= 6;
  const sentences = (t.match(/[.!?…]/g) || []).length;
  rank += Math.min(sentences, 10) * 2.2;
  if (/(Freund|Familie|Schule|Stadt|Essen|reisen|heute|morgen|sagen|fragen|möchten|Haus)/i.test(t)) rank += 10;
  if (/(Fest|Musik|Sport|Tier|Wald|Meer|Buch|Film)/i.test(t)) rank += 6;
  return { rank, ...h };
}

/**
 * Normalize reading text for practice.
 * Keeps full text when possible; only soft-caps very long extracts at a sentence boundary.
 * @returns {{ text: string, truncated: boolean, fullLength: number, maxLen: number }}
 */
function normalizeReadingText(extract, maxLen = DAILY_READING_MAX_CHARS) {
  const full = String(extract || '').trim().replace(/\r\n/g, '\n');
  const fullLength = full.length;
  if (!fullLength) {
    return { text: '', truncated: false, fullLength: 0, maxLen };
  }
  if (fullLength <= maxLen) {
    return { text: full, truncated: false, fullLength, maxLen };
  }
  let window = full.slice(0, maxLen);
  const cutMarks = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '…', '\n\n'];
  let cut = -1;
  for (const m of cutMarks) {
    const i = window.lastIndexOf(m);
    if (i > cut) cut = i + (m.endsWith(' ') || m.endsWith('\n') ? m.length - 1 : m.length);
  }
  // also bare . ! ?
  for (const m of ['.', '!', '?']) {
    const i = window.lastIndexOf(m);
    if (i > cut) cut = i;
  }
  const minKeep = Math.min(400, Math.floor(maxLen * 0.35));
  let text;
  if (cut >= minKeep) {
    text = full.slice(0, cut + 1).trim();
  } else {
    text = window.trim();
  }
  if (!/[.!?…\u2026]$/.test(text)) text += '…';
  return { text, truncated: true, fullLength, maxLen };
}

function trimReadingText(extract, maxLen = DAILY_READING_MAX_CHARS) {
  return normalizeReadingText(extract, maxLen).text;
}

/**
 * Fetch longer plain-text extract via MediaWiki API (fuller than REST summary).
 */
async function fetchWikiPlainExtract(lang, title, maxChars = DAILY_READING_MAX_CHARS) {
  const host = lang === 'de' ? 'de.wikipedia.org'
    : lang === 'de-news' ? 'de.wikinews.org'
      : lang === 'zh-news' ? 'zh.wikinews.org'
        : 'zh.wikipedia.org';
  const url = `https://${host}/w/api.php?` + new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'plain',
    redirects: '1',
    titles: title,
    exchars: String(Math.min(Math.max(maxChars, 800), 2500)),
  });
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Wiki extract ${res.status}`);
  const data = await res.json();
  const pages = data && data.query && data.query.pages;
  if (!pages) throw new Error('No extract pages');
  const page = Object.values(pages)[0];
  if (!page || page.missing != null) throw new Error('Page missing');
  const extract = String(page.extract || '').trim();
  if (extract.length < 36) throw new Error('Extract too short');
  return extract;
}

async function expandWikiReading(item, lang) {
  if (!item || !item.rawTitle) return item;
  try {
    const fullExtract = await fetchWikiPlainExtract(lang, item.rawTitle, DAILY_READING_MAX_CHARS);
    if (fullExtract.length > (item.text || '').length + 40) {
      const norm = normalizeReadingText(fullExtract, DAILY_READING_MAX_CHARS);
      return {
        ...item,
        text: norm.text,
        truncated: norm.truncated,
        fullLength: norm.fullLength,
        expanded: true,
      };
    }
  } catch { /* keep summary */ }
  return item;
}

function parseDeWikiSummary(data, sourceLabel, sourceKey) {
  const title = data.title || sourceLabel;
  const extract = (data.extract || '').trim();
  if (!extract || extract.length < 36) throw new Error('Empty extract');
  if (/steht für|Begriffsklärung/i.test(extract) && extract.length < 120) throw new Error('Disambiguation');
  const norm = normalizeReadingText(extract, DAILY_READING_MAX_CHARS);
  if (norm.text.length < 36) throw new Error('Too short');
  return {
    title: `${sourceLabel} · ${title}`,
    description: data.description || sourceLabel,
    text: norm.text,
    truncated: norm.truncated,
    fullLength: norm.fullLength,
    source: sourceKey,
    pageUrl: data.content_urls?.desktop?.page || data.content_urls?.mobile?.page || '',
    rawTitle: title,
  };
}

function readingLengthNote(reading) {
  if (!reading) return '';
  const n = (reading.text || '').length;
  if (reading.truncated && reading.fullLength) {
    return `Long article — showing first ~${n} characters of ${reading.fullLength} (edit the box or paste more if you want the rest).`;
  }
  if (n >= 900) return `Full reading loaded (${n} characters).`;
  if (n > 0) return `Reading length: ${n} characters.`;
  return '';
}

const DAILY_INTERESTING_TITLES_DE = [
  'Oktoberfest', 'Weihnachten', 'Ostern', 'Karneval', 'Silvester',
  'Berlin', 'München', 'Hamburg', 'Köln', 'Wien', 'Zürich', 'Alpen',
  'Bratwurst', 'Brezel', 'Schnitzel', 'Kaffee', 'Brot', 'Käse',
  'Fußball', 'Radfahren', 'Wandern', 'Schule', 'Bibliothek',
  'Brandenburgertor', 'Neuschwanstein', 'Rhein', 'Donau', 'Schwarzwald',
  'Beethoven', 'Goethe', 'Grimm', 'Märchen', 'Bruder', 'Familie',
  'Zug', 'Fahrrad', 'Park', 'Museum', 'Kino', 'Musik',
];

function seededDailyTitlePicksDe(day, level, count, refreshOffset = 0) {
  const seed = String(day).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    + level * 31 + Number(refreshOffset || 0) * 97;
  const picks = [];
  const n = DAILY_INTERESTING_TITLES_DE.length;
  for (let i = 0; i < count * 2 && picks.length < count; i++) {
    const title = DAILY_INTERESTING_TITLES_DE[Math.abs((seed * (i + 3) * 17 + i * 97) % n)];
    if (!picks.includes(title)) picks.push(title);
  }
  return picks;
}

async function fetchDeWikiSummaryByTitle(title) {
  const url = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Wikipedia title ${res.status}`);
  return parseDeWikiSummary(await res.json(), 'Thema', 'wikipedia-topic');
}

async function fetchDeWikipediaSummary() {
  const res = await fetch('https://de.wikipedia.org/api/rest_v1/page/random/summary', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return parseDeWikiSummary(await res.json(), 'Wikipedia', 'wikipedia');
}

async function fetchDeWikinewsSummary() {
  const res = await fetch('https://de.wikinews.org/api/rest_v1/page/random/summary', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikinews ${res.status}`);
  return parseDeWikiSummary(await res.json(), 'Nachrichten', 'wikinews');
}

/**
 * Today's reading — forceNew always generates another text when requested.
 */
async function loadDailyReadingForLevel(level, vocab, opts = {}) {
  const forceNew = !!opts.forceNew;
  const cefr = Number(level) || 1;
  const day = localDateKey();
  const cacheKey = `${day}|${cefr}`;

  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(DAILY_READING_CACHE_KEY) || '{}');
  } catch {
    cache = {};
  }
  for (const k of Object.keys(cache)) {
    if (!k.startsWith(day)) delete cache[k];
  }

  const prev = cache[cacheKey] && cache[cacheKey].text ? cache[cacheKey] : null;
  if (!forceNew && prev) return { ...prev, fromCache: true };

  const refreshCount = forceNew
    ? Number(prev && prev.refreshCount || 0) + 1
    : Number(prev && prev.refreshCount || 0);
  const prevText = (prev && prev.text) || '';
  const seenTitles = new Set(
    Array.isArray(prev && prev.seenTitles) ? prev.seenTitles : []
  );

  const candidates = [];
  const tryPush = async (fetcher) => {
    try {
      const item = await fetcher();
      const q = scoreReadingQuality(item.text, vocab, cefr);
      let quality = q.rank;
      if (prevText && item.text === prevText) quality -= 80;
      if (item.rawTitle && seenTitles.has(item.rawTitle)) quality -= 25;
      candidates.push({
        ...item,
        level: cefr,
        levelScore: q.score,
        matched: q.matched,
        atOrBelow: q.atOrBelow,
        quality,
      });
    } catch { /* ignore */ }
  };

  const titles = seededDailyTitlePicksDe(day, cefr, cefr <= 2 ? 4 : 6, refreshCount);
  for (const title of titles) {
    await tryPush(() => fetchDeWikiSummaryByTitle(title));
    await new Promise((r) => setTimeout(r, 50));
  }
  const newsTries = forceNew ? 3 : (cefr <= 2 ? 1 : 2);
  for (let i = 0; i < newsTries; i++) {
    await tryPush(() => fetchDeWikinewsSummary());
    await new Promise((r) => setTimeout(r, 70));
  }
  const randomTries = forceNew ? 3 : (cefr <= 2 ? 1 : 2);
  for (let i = 0; i < randomTries; i++) {
    await tryPush(() => fetchDeWikipediaSummary());
    await new Promise((r) => setTimeout(r, 70));
  }

  candidates.sort((a, b) => (b.quality || 0) - (a.quality || 0));
  let best = null;
  if (forceNew && prevText) {
    best = candidates.find((c) => c.text !== prevText && c.matched >= 4 && c.levelScore >= 0.22)
      || candidates.find((c) => c.text !== prevText && c.matched >= 3)
      || candidates.find((c) => c.text !== prevText)
      || null;
  }
  if (!best) {
    best = candidates.find((c) => c.matched >= 4 && c.levelScore >= 0.22)
      || candidates.find((c) => c.matched >= 3)
      || candidates[0]
      || null;
  }

  if (best) {
    const expandLang = best.source === 'wikinews' ? 'de-news' : 'de';
    best = await expandWikiReading(best, expandLang);
    if (best.expanded) {
      const q2 = scoreReadingQuality(best.text, vocab, cefr);
      best.levelScore = q2.score;
      best.matched = q2.matched;
      best.atOrBelow = q2.atOrBelow;
    }
    const nextSeen = [...seenTitles];
    if (best.rawTitle && !nextSeen.includes(best.rawTitle)) {
      nextSeen.push(best.rawTitle);
      if (nextSeen.length > 24) nextSeen.splice(0, nextSeen.length - 24);
    }
    const result = {
      id: `daily-${best.source || 'web'}-${day}-cefr${cefr}-r${refreshCount}`,
      level: cefr,
      title: best.title,
      description: `${best.description || 'web'} · ~${Math.round((best.levelScore || 0) * 100)}% ≤ ${levelLabel(cefr)}`,
      text: best.text,
      truncated: !!best.truncated,
      fullLength: best.fullLength || (best.text || '').length,
      source: best.source || 'web',
      pageUrl: best.pageUrl || '',
      day,
      refreshCount,
      rawTitle: best.rawTitle || '',
      seenTitles: nextSeen,
    };
    cache[cacheKey] = result;
    try { localStorage.setItem(DAILY_READING_CACHE_KEY, JSON.stringify(cache)); } catch {}
    return { ...result, fromCache: false, isNew: forceNew || !prev };
  }

  const list = getReadingCollection().filter((r) => Number(r.level) === cefr);
  let seeded = null;
  if (list.length) {
    const seed = day.split('-').reduce((a, b) => a + Number(b), 0) + cefr * 17 + refreshCount * 3;
    let pick = list[Math.abs(seed) % list.length];
    if (forceNew && prevText && list.length > 1) {
      const start = Math.abs(seed) % list.length;
      for (let i = 0; i < list.length; i++) {
        const cand = list[(start + i) % list.length];
        if (cand.text !== prevText) { pick = cand; break; }
      }
    }
    seeded = { ...pick, source: 'collection-daily' };
  } else if (typeof getSeededDailyReading === 'function') {
    seeded = getSeededDailyReading(cefr);
  }
  if (!seeded) throw new Error('No daily reading available for this level.');

  const result = {
    id: (seeded.id || `daily-col-${day}-cefr${cefr}`) + `-r${refreshCount}`,
    level: cefr,
    title: seeded.title || `Heutige Lektüre ${levelLabel(cefr)}`,
    description: (seeded.description || 'Graded story') + ' · collection (web unavailable)',
    text: seeded.text,
    source: 'collection-daily',
    day,
    refreshCount,
    seenTitles: [...seenTitles],
  };
  cache[cacheKey] = result;
  try { localStorage.setItem(DAILY_READING_CACHE_KEY, JSON.stringify(cache)); } catch {}
  return { ...result, fromCache: false, isNew: true };
}

/**
 * Extract known CEFR/user words + unknown tokens (not in library) for preview/Add.
 */
function extractWordsFromCustomText(text, vocab, levels = [], opts = {}) {
  if (!text || !vocab || !vocab.length) return [];
  const includeUnknown = opts.includeUnknown !== false;

  const fullMap = new Map();
  for (const w of vocab) {
    if (w && w.word) {
      const k = String(w.word).toLowerCase();
      if (!fullMap.has(k)) fullMap.set(k, w);
    }
  }

  // Empty levels[] means "no level selected" → no known library hits (not "all levels").
  const levelSet = new Set((levels || []).map(Number).filter((n) => n >= 1 && n <= 6));
  const tokens = text.match(/[a-zäöüßA-ZÄÖÜ]+/g) || [];
  const lowerText = text.toLowerCase();
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));

  const matched = [];
  const unknown = [];
  const seen = new Set();

  // Multi-word phrases first against full library
  const sorted = [...fullMap.values()].sort((a, b) => (b.word || '').length - (a.word || '').length);
  for (const entry of sorted) {
    const w = (entry.word || '').trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    let hit = false;
    if (key.includes(' ')) hit = lowerText.includes(key);
    else hit = tokenSet.has(key);
    if (!hit) continue;
    seen.add(key);
    const lv = Number(entry.level) || 0;
    // Only include if level is checked, or user-added (always available for practice)
    const levelOk = levelSet.size > 0 && levelSet.has(lv);
    if (levelOk || entry.userAdded) {
      matched.push({ ...entry, unknown: false, notInLibrary: false });
    }
  }

  if (includeUnknown) {
    for (const tok of tokens) {
      const key = tok.toLowerCase();
      if (seen.has(key)) continue;
      if (key.length < 2) continue; // skip tiny fragments
      // In library at another CEFR level → not "unknown"; skip (user can enable that level)
      if (fullMap.has(key)) continue;
      seen.add(key);
      unknown.push({
        word: tok,
        article: '',
        meaning: '',
        level: 0,
        unknown: true,
        notInLibrary: true,
      });
    }
  }

  matched.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return String(a.word).localeCompare(String(b.word), 'de');
  });
  unknown.sort((a, b) => String(a.word).localeCompare(String(b.word), 'de'));
  return matched.concat(unknown);
}

function isIncompleteLibraryWord(w) {
  if (!w) return true;
  if (w.unknown || w.notInLibrary) return true;
  if (!(w.meaning || '').trim()) return true;
  return false;
}

function patchCustomWordEntry(wordKey, fields) {
  if (!Array.isArray(customWords) || !customWords.length) return;
  const key = String(wordKey || '').trim().toLowerCase();
  customWords = customWords.map((w) => (
    w && String(w.word || '').toLowerCase() === key
      ? { ...w, ...fields, unknown: false, notInLibrary: false }
      : w
  ));
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

/**
 * Persist English meaning (+ optional article) from the image modal.
 */
async function saveMeaningFromModal(word, meaningInputValue, articleInputValue) {
  const newMeaning = String(meaningInputValue || '').trim();
  if (!word || !word.word) return { ok: false, reason: 'Missing word.' };
  if (!newMeaning) return { ok: false, reason: 'Meaning cannot be empty.' };
  let art = String(articleInputValue != null ? articleInputValue : (word.article || '')).trim().toLowerCase();
  if (art && !['der', 'die', 'das'].includes(art)) art = '';
  const level = word.level || 3;
  const wasIncomplete = isIncompleteLibraryWord(word) || !findWordInLibrary(word.word);

  if (wasIncomplete && !findWordInLibrary(word.word)) {
    const added = addUserWord({
      word: word.word,
      article: art,
      meaning: newMeaning,
      level,
    });
    if (!added.ok && !added.existing) {
      return { ok: false, reason: added.reason || 'Could not add word.' };
    }
    word.article = art;
    word.meaning = newMeaning;
    word.level = level;
    word.unknown = false;
    word.notInLibrary = false;
    word.userAdded = true;
    patchCustomWordEntry(word.word, {
      article: art,
      meaning: newMeaning,
      level,
      userAdded: true,
    });
    return { ok: true, shared: 'local-library', word };
  }

  if (newMeaning === String(word.meaning || '').trim()) {
    return { ok: true, shared: 'unchanged', word };
  }
  const result = await updateWordMeaning(word.word, newMeaning, { article: art, level });
  if (result.ok) {
    word.meaning = newMeaning;
    if (art) word.article = art;
    word.unknown = false;
    word.notInLibrary = false;
    patchCustomWordEntry(word.word, {
      article: word.article,
      meaning: word.meaning,
      unknown: false,
      notInLibrary: false,
    });
  }
  return result;
}

/** Open modal to change picture + meaning for a word. onDone() after change. */
function openImageEditModal(word, onDone) {
  const modal = document.getElementById('image-edit-modal');
  if (!modal || !word) return;

  const wordEl = document.getElementById('image-edit-word');
  const metaEl = document.getElementById('image-edit-meta');
  const previewEl = document.getElementById('image-edit-preview');
  const urlInput = document.getElementById('image-edit-url');
  const meaningInput = document.getElementById('image-edit-meaning');
  const articleInput = document.getElementById('image-edit-article');
  const queryInput = document.getElementById('image-edit-query');
  const statusEl = document.getElementById('image-edit-status');
  const sharedHint = document.getElementById('image-edit-shared-hint');
  const resultsEl = document.getElementById('image-edit-results');
  const attributionEl = document.getElementById('image-edit-attribution');

  const imgInfo = getWordImage(word);
  const lib = sharedLibrary();
  const inShared = !!(lib && lib.has(word.word));
  const meaning = (word.meaning || '').replace(/;/g, '; ').trim();
  const incomplete = isIncompleteLibraryWord(word);

  if (wordEl) wordEl.textContent = word.word || '';
  if (metaEl) {
    const srcNote = incomplete
      ? ' · not in library — add meaning'
      : inShared
        ? ' · shared library'
        : imgInfo.source === 'builtin'
          ? ' · built-in map'
          : imgInfo.url
            ? ' · online'
            : '';
    metaEl.textContent = `${word.article || '—'}${srcNote}`;
  }
  if (meaningInput) meaningInput.value = meaning;
  if (articleInput) articleInput.value = word.article || '';
  if (urlInput) {
    urlInput.value = (imgInfo.url && imgInfo.source === 'shared') ? imgInfo.url : (imgInfo.url || '');
  }
  if (queryInput) {
    queryInput.value = meaning
      ? String(meaning).split(/[;/,]/)[0].trim().slice(0, 80)
      : defaultSearchQuery(word);
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
      ? 'Save updates picture (shared) and meaning (local; shared when possible).'
      : 'Meaning saves locally. Configure Supabase in config.js to share pictures.';
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
        const meaningVal = document.getElementById('image-edit-meaning')?.value || '';
        const articleVal = document.getElementById('image-edit-article')?.value || '';
        if (!w) return;

        const meaningResult = await saveMeaningFromModal(w, meaningVal, articleVal);
        if (!meaningResult.ok) {
          if (st) st.textContent = meaningResult.reason || 'Could not save meaning.';
          return;
        }

        let imageNote = '';
        if (url) {
          const cand = modal._selectedCandidate;
          try {
            await setImageOverride(w.word, url, {
              article: w.article,
              meaning: w.meaning,
              source: cand?.source || undefined,
              credit: cand?.credit || undefined,
            });
            if (w.word) currentImageMap[w.word] = url;
            imageNote = 'Picture saved to shared library.';
            if (typeof modal._showPreview === 'function') modal._showPreview(url);
          } catch (err) {
            imageNote = `Meaning saved; picture not saved (${err.message || err}).`;
          }
        } else {
          imageNote = 'Meaning saved. Add a photo URL or Search, or use “No image”.';
        }
        if (st) st.textContent = imageNote;
        if (typeof modal._onDone === 'function') modal._onDone();
        if (url && imageNote.indexOf('not saved') === -1) setTimeout(close, 550);
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

/**
 * Read checked CEFR levels from the active UI.
 * Returns [] when none checked (caller should not treat as "all levels").
 */
function getSelectedLevels() {
  // Prefer sets-mode checkboxes when that flow is visible
  const setsFlow = document.getElementById('sets-flow');
  if (setsFlow && setsFlow.style.display !== 'none') {
    const setsCbs = document.querySelectorAll(
      '#sets-flow input.sets-level:checked, .sets-cefr-filters input[type="checkbox"]:checked, .sets-hsk input[type="checkbox"]:checked'
    );
    return Array.from(setsCbs).map((cb) => Number(cb.value)).filter((n) => n >= 1 && n <= 6);
  }
  // Reading extract filters — support both class names used in HTML
  const customCbs = document.querySelectorAll(
    '.custom-reading .level-filters input[type="checkbox"]:checked, .custom-reading .hsk-levels input[type="checkbox"]:checked'
  );
  if (customCbs.length) {
    return Array.from(customCbs).map((cb) => Number(cb.value)).filter((n) => n >= 1 && n <= 6);
  }
  // Fallback: any CEFR filter checkbox (never word-list item checkboxes)
  const cbs = document.querySelectorAll(
    '.level-filters input[type="checkbox"]:checked, .hsk-levels input[type="checkbox"]:checked'
  );
  return Array.from(cbs)
    .filter((cb) => !cb.closest('#extracted-words-list') && !cb.closest('#user-words-list'))
    .map((cb) => Number(cb.value))
    .filter((n) => n >= 1 && n <= 6);
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

/** Active playable words (respects uncheck; skips incomplete/unknown). */
function getActiveExtractedWords() {
  if (!customWords || customWords.length === 0) return [];
  return filterWordsBySelection(customWords).filter((w) => !isIncompleteLibraryWord(w));
}

/** Hide the selectable word list (used in sets mode until Preview is pressed). */
function hideWordSelectionList() {
  const listEl = document.getElementById('extracted-words-list');
  if (listEl) {
    listEl.hidden = true;
    listEl.innerHTML = '';
  }
  const playBar = document.getElementById('play-bar');
  if (playBar) {
    playBar.classList.remove('play-bar--ready');
    const practicePanel = document.getElementById('practice-panel');
    const panelOpen = practicePanel && practicePanel.style.display !== 'none';
    playBar.hidden = !panelOpen;
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
  } else if (!isCustomReadingMode()) {
    // Sets mode with no level checked → empty set list
    return [];
  }
  // Ready-made practice sets: prefer curated "core" study words
  if (!isCustomReadingMode()) {
    const core = words.filter((w) => w.tier === 'core' || w.study === true);
    if (core.length >= SET_SIZE) return core;
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
    if (typeof showAppToast === 'function') showAppToast(msg, 4200);
    else alert(msg);
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
  const __pb = document.getElementById('play-bar'); if (__pb) __pb.hidden = true;
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

  // Show practiced words + meanings for review (edit meaning supported)
  renderPracticedReview();

  document.getElementById('picture-gameover').hidden = false;
}

/** Post-game review list with inline meaning edit. */
function renderPracticedReview() {
  const reviewEl = document.getElementById('practiced-review');
  const listEl = document.getElementById('practiced-list');
  if (!reviewEl || !listEl) return;

  listEl.innerHTML = '';
  if (!practicedWords.length) {
    reviewEl.hidden = true;
    return;
  }

  practicedWords.forEach((w, index) => {
    const li = document.createElement('li');
    li.className = 'practiced-item';
    li.dataset.word = w.word || '';
    li.dataset.index = String(index);
    const shortMeaning = (w.meaning || '').replace(/;/g, '; ').trim();
    li.innerHTML = `
      <div class="practiced-item-main">
        <span class="de-word">${w.word || ''}</span>
        <span class="de-article">${w.article || ''}</span>
        <span class="meaning practiced-meaning-text">— ${shortMeaning}</span>
      </div>
      <button type="button" class="btn btn-secondary practiced-edit-btn" data-index="${index}">Edit meaning</button>
      <div class="practiced-edit-row" hidden>
        <input type="text" class="practiced-meaning-input" value="${shortMeaning.replace(/"/g, '&quot;')}" maxlength="200" aria-label="English meaning for ${w.word || ''}">
        <button type="button" class="btn btn-primary practiced-save-meaning" data-index="${index}">Save</button>
        <button type="button" class="btn btn-secondary practiced-cancel-meaning" data-index="${index}">Cancel</button>
      </div>
      <p class="practiced-edit-status" aria-live="polite"></p>
    `;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.practiced-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.practiced-item');
      if (!li) return;
      const row = li.querySelector('.practiced-edit-row');
      const input = li.querySelector('.practiced-meaning-input');
      if (row) row.hidden = false;
      btn.hidden = true;
      if (input) {
        input.focus();
        input.select();
      }
    });
  });

  listEl.querySelectorAll('.practiced-cancel-meaning').forEach((btn) => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.practiced-item');
      if (!li) return;
      const idx = Number(li.dataset.index);
      const w = practicedWords[idx];
      const row = li.querySelector('.practiced-edit-row');
      const editBtn = li.querySelector('.practiced-edit-btn');
      const input = li.querySelector('.practiced-meaning-input');
      const status = li.querySelector('.practiced-edit-status');
      if (row) row.hidden = true;
      if (editBtn) editBtn.hidden = false;
      if (input && w) input.value = (w.meaning || '').replace(/;/g, '; ').trim();
      if (status) status.textContent = '';
    });
  });

  listEl.querySelectorAll('.practiced-save-meaning').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const li = btn.closest('.practiced-item');
      if (!li) return;
      const idx = Number(li.dataset.index);
      const w = practicedWords[idx];
      const input = li.querySelector('.practiced-meaning-input');
      const status = li.querySelector('.practiced-edit-status');
      const meaningText = li.querySelector('.practiced-meaning-text');
      const row = li.querySelector('.practiced-edit-row');
      const editBtn = li.querySelector('.practiced-edit-btn');
      if (!w || !input) return;

      const newMeaning = input.value.trim();
      if (!newMeaning) {
        if (status) status.textContent = 'Meaning cannot be empty.';
        return;
      }

      btn.disabled = true;
      if (status) status.textContent = 'Saving…';
      try {
        const result = await updateWordMeaning(w.word, newMeaning, {
          article: w.article,
          level: w.level,
        });
        if (!result.ok) {
          if (status) status.textContent = result.reason || 'Save failed.';
          return;
        }
        w.meaning = newMeaning;
        if (meaningText) meaningText.textContent = `— ${newMeaning}`;
        if (row) row.hidden = true;
        if (editBtn) editBtn.hidden = false;

        let note = 'Saved locally';
        if (result.shared === 'saved') note += ' and to shared library';
        else if (result.shared === 'local-only') note += ' (shared image row not present for this word)';
        else if (result.shared === 'not-configured') note += ' (shared library not configured)';
        else if (result.shared && result.shared !== 'skipped') note += ` · shared: ${result.shared}`;
        if (status) status.textContent = note + '.';
      } catch (err) {
        if (status) status.textContent = err.message || String(err);
      } finally {
        btn.disabled = false;
      }
    });
  });

  reviewEl.hidden = false;
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
      rebuildVocabularyWithUserWords();
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

  // Prefetch shared readings / word sets in the background
  const contentLib = sharedContentLibrary();
  if (contentLib && contentLib.enabled) {
    contentLib.loadAll().catch(() => {});
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
    const incomplete = isIncompleteLibraryWord(w);
    const thumb = img.url
      ? `<img class="word-list-thumb" src="${img.url}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="word-list-thumb word-list-thumb--empty" title="No picture">—</span>`;
    const badge = incomplete
      ? 'new'
      : img.source === 'shared'
        ? (img.url ? 'shared' : 'hidden')
        : (img.url ? '' : 'none');
    const badgeHtml = badge
      ? `<span class="img-badge img-badge--${badge}">${badge === 'hidden' ? 'no img' : badge === 'new' ? 'not in library' : badge}</span>`
      : '';
    const addBtn = incomplete
      ? `<button type="button" class="add-unknown-btn" data-word="${wordAttr}" title="Add article & meaning to library">Add</button>`
      : '';
    return `${thumb}${badgeHtml}${addBtn}<button type="button" class="img-edit-btn" data-word="${wordAttr}" title="Edit picture & meaning">Image</button>`;
  }

  function addUnknownWordFromList(wordStr, onRefresh) {
    const key = (wordStr || '').trim();
    if (!key) return;
    const existing = findWordInLibrary(key);
    if (existing && !isIncompleteLibraryWord(existing)) {
      if (typeof onRefresh === 'function') onRefresh();
      return;
    }
    const article = window.prompt(`Article for “${key}” (der/die/das or empty):`, existing?.article || '');
    if (article === null) return;
    const meaning = window.prompt(`English meaning for “${key}”:`, existing?.meaning || '');
    if (meaning === null) return;
    if (!String(meaning).trim()) {
      if (typeof showAppToast === 'function') showAppToast('Meaning is required.');
      else alert('Meaning is required.');
      return;
    }
    const level = Number(document.getElementById('reading-cefr-level')?.value) || 3;
    let art = String(article || '').trim().toLowerCase();
    if (art && !['der', 'die', 'das'].includes(art)) art = '';
    const result = addUserWord({
      word: key,
      article: art,
      meaning: String(meaning).trim(),
      level,
    });
    if (!result.ok) {
      if (result.existing) {
        updateWordMeaning(key, String(meaning).trim(), { article: art || result.existing.article, level: result.existing.level || level })
          .then(() => {
            patchCustomWordEntry(key, {
              article: art || result.existing.article,
              meaning: String(meaning).trim(),
              level: result.existing.level || level,
              unknown: false,
              notInLibrary: false,
            });
            if (typeof onRefresh === 'function') onRefresh();
          });
        return;
      }
      if (typeof showAppToast === 'function') showAppToast(result.reason || 'Could not add word.');
      else alert(result.reason || 'Could not add word.');
      return;
    }
    patchCustomWordEntry(key, { ...result.word, unknown: false, notInLibrary: false, userAdded: true });
    if (typeof onRefresh === 'function') onRefresh();
  }

  function bindWordListImageEditors(listEl, words, onRefresh) {
    listEl.querySelectorAll('.img-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wordStr = btn.dataset.word;
        const word = (words || []).find((w) => w.word === wordStr)
          || pictureVocabulary.find((w) => w.word === wordStr)
          || { word: wordStr, article: '', meaning: '', unknown: true, notInLibrary: true };
        openImageEditModal(word, onRefresh);
      });
    });
    listEl.querySelectorAll('.add-unknown-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addUnknownWordFromList(btn.dataset.word, onRefresh);
      });
    });
  }

  function formatWordListRow(w) {
    const incomplete = isIncompleteLibraryWord(w);
    const meaning = incomplete
      ? '<em class="meaning-missing">not in library — tap Add</em>'
      : (w.meaning || '').replace(/;/g, '; ').trim();
    const levelInfo = !incomplete && w.level ? ` [${levelLabel(w.level)}]` : '';
    const isChecked = !unselectedWords.has(w.word);
    const rowClass = incomplete ? 'word-list-item word-list-item--unknown' : 'word-list-item';
    return `<li class="${rowClass}">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; flex:1; min-width:0;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-word="${w.word}" style="margin:0;">
        <span class="de-word">${w.word}</span>
        <span class="de-article">(${w.article || (incomplete ? '?' : '')})</span>
        <span class="meaning">— ${meaning}${levelInfo}</span>
      </label>
      <div class="word-list-img-actions">${wordListImageControls(w)}</div>
    </li>`;
  }

  // Helper to show a selectable words list (checkboxes) before playing
  function showBasicWordsList(words) {
    const listEl = document.getElementById('extracted-words-list');
    if (!listEl || !words || !words.length) return;

    const isCustom = !!(customWords && customWords.length > 0);
    const unknownCount = words.filter(isIncompleteLibraryWord).length;
    const itemsHtml = words.map((w) => formatWordListRow(w)).join('');

    const title = isCustom
      ? 'Extracted words (uncheck to exclude from games)'
      : 'Words in this set (uncheck to exclude from games)';
    const unknownHint = unknownCount
      ? ` <strong>${unknownCount}</strong> not in library — use <em>Add</em>.`
      : '';
    listEl.innerHTML = `<strong>${title} (${words.length}):</strong>
      <p class="word-list-img-hint">Fix pictures/meanings with <em>Image</em>.${unknownHint}</p>
      <ul>${itemsHtml}</ul>`;
    listEl.hidden = false;

    const refresh = () => {
      if (isCustom && customWords && customWords.length) renderExtractedList(customWords);
      else {
        const group = getCurrentGroupWordsUnfiltered();
        if (group && group.length) showBasicWordsList(group);
      }
      if (gameActive) updateBoard(true);
      updatePlayBarVisibility();
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
    updatePlayBarVisibility();
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
    updatePlayBarVisibility();
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
    updatePlayBarVisibility();
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
    const hasText = !!getActiveReadingText();
    const hasWords = !!(customWords && customWords.length > 0);
    const saveLocalBtn = document.getElementById('save-local-btn');
    const shareBtn = document.getElementById('share-reading-words-btn');
    if (saveLocalBtn) saveLocalBtn.style.display = (hasText || hasWords) ? 'inline-block' : 'none';
    if (shareBtn) shareBtn.style.display = (hasText && hasWords) ? 'inline-block' : 'none';
    updatePlayBarVisibility();
  }

  function updatePlayBarVisibility() {
    const playBar = document.getElementById('play-bar');
    const practicePanel = document.getElementById('practice-panel');
    if (!playBar) return;
    const panelOpen = practicePanel && practicePanel.style.display !== 'none';
    const gameScreen = document.getElementById('picture-game-screen');
    const inGame = gameScreen && !gameScreen.hidden;
    const listEl = document.getElementById('extracted-words-list');
    const hasList = !!(listEl && !listEl.hidden && listEl.querySelector('li'));
    const wordsReady = hasList || (getActiveExtractedWords().length > 0);
    const show = !!(panelOpen && wordsReady && !inGame);
    playBar.classList.toggle('play-bar--ready', show);
    playBar.hidden = !show;
  }

  function setSavedLibTab(tab) {
    document.querySelectorAll('.saved-lib-tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.tab === tab);
    });
    const panels = {
      'local-readings': document.getElementById('saved-tab-local-readings'),
      'local-sets': document.getElementById('saved-tab-local-sets'),
      shared: document.getElementById('saved-tab-shared'),
    };
    Object.entries(panels).forEach(([key, el]) => {
      if (el) el.hidden = key !== tab;
    });
  }

  function renderSavedReadingsList() {
    const listEl = document.getElementById('saved-readings-list');
    const emptyEl = document.getElementById('saved-readings-empty');
    if (!listEl) return;
    const readings = loadSavedReadings();
    if (!readings.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = readings.map((r) => {
      const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
      const level = r.level ? levelLabel(r.level) : '';
      const preview = String(r.text || '').slice(0, 48).replace(/</g, '&lt;');
      return `<div class="saved-set-card" data-id="${r.id}">
        <div class="saved-set-info">
          <strong class="saved-set-name">${String(r.title || 'Untitled').replace(/</g, '&lt;')}</strong>
          <span class="saved-set-meta">${[level, date].filter(Boolean).join(' · ')} · ${preview}${(r.text || '').length > 48 ? '…' : ''}</span>
        </div>
        <div class="saved-set-actions">
          <button type="button" class="btn btn-learned saved-reading-load" data-id="${r.id}">Open</button>
          <button type="button" class="btn btn-secondary saved-reading-delete" data-id="${r.id}">Delete</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.saved-reading-load').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const reading = loadSavedReadings().find((x) => x.id === id);
        if (!reading) return;
        loadSavedReadingIntoPractice(reading);
      });
    });
    listEl.querySelectorAll('.saved-reading-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const reading = loadSavedReadings().find((x) => x.id === id);
        if (!reading) return;
        if (!confirm(`Delete saved reading “${reading.title}”?`)) return;
        removeSavedReading(id);
        renderSavedReadingsList();
      });
    });
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

  function renderSharedContentLists() {
    const statusEl = document.getElementById('shared-content-status');
    const rList = document.getElementById('shared-readings-list');
    const sList = document.getElementById('shared-word-sets-list');
    const lib = sharedContentLibrary();

    if (!lib || !lib.enabled) {
      if (statusEl) {
        statusEl.textContent = 'Shared library is not configured. Add Supabase keys in config.js and run the latest supabase/schema.sql.';
      }
      if (rList) rList.innerHTML = '';
      if (sList) sList.innerHTML = '';
      return;
    }

    if (statusEl) statusEl.textContent = lib.statusLabel();

    const readings = lib.readings || [];
    if (rList) {
      if (!readings.length) {
        rList.innerHTML = '<p class="extract-info">No shared readings yet. Use <strong>Share reading + words</strong> from Reading practice.</p>';
      } else {
        rList.innerHTML = readings.map((r) => {
          const level = r.level ? levelLabel(r.level) : '';
          const date = r.updated_at || r.created_at
            ? new Date(r.updated_at || r.created_at).toLocaleDateString()
            : '';
          return `<div class="saved-set-card" data-id="${r.id}">
            <div class="saved-set-info">
              <strong class="saved-set-name">${String(r.title || 'Untitled').replace(/</g, '&lt;')}</strong>
              <span class="saved-set-meta">${[level, date, 'shared'].filter(Boolean).join(' · ')}</span>
            </div>
            <div class="saved-set-actions">
              <button type="button" class="btn btn-learned shared-reading-load" data-id="${r.id}">Open</button>
            </div>
          </div>`;
        }).join('');
        rList.querySelectorAll('.shared-reading-load').forEach((btn) => {
          btn.addEventListener('click', () => {
            const reading = (lib.readings || []).find((x) => x.id === btn.dataset.id);
            if (reading) loadSavedReadingIntoPractice(reading);
          });
        });
      }
    }

    const sets = lib.wordSets || [];
    if (sList) {
      if (!sets.length) {
        sList.innerHTML = '<p class="extract-info">No shared word sets yet.</p>';
      } else {
        sList.innerHTML = sets.map((s) => {
          const n = Array.isArray(s.words) ? s.words.length : 0;
          const date = s.updated_at || s.created_at
            ? new Date(s.updated_at || s.created_at).toLocaleDateString()
            : '';
          return `<div class="saved-set-card" data-id="${s.id}">
            <div class="saved-set-info">
              <strong class="saved-set-name">${String(s.name || 'Untitled').replace(/</g, '&lt;')}</strong>
              <span class="saved-set-meta">${n} words${date ? ' · ' + date : ''} · shared</span>
            </div>
            <div class="saved-set-actions">
              <button type="button" class="btn btn-learned shared-set-load" data-id="${s.id}">Practice</button>
            </div>
          </div>`;
        }).join('');
        sList.querySelectorAll('.shared-set-load').forEach((btn) => {
          btn.addEventListener('click', () => {
            const set = (lib.wordSets || []).find((x) => x.id === btn.dataset.id);
            if (set && set.words?.length) loadSavedSetIntoPractice(set);
          });
        });
      }
    }
  }

  function loadSavedReadingIntoPractice(reading) {
    if (menuView) menuView.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = 'none';
    if (customFlow) customFlow.style.display = '';
    if (practicePanel) practicePanel.style.display = '';

    applyReadingToUi({
      title: reading.title,
      description: reading.description || (reading.level ? levelLabel(reading.level) : 'Saved reading'),
      text: reading.text,
      level: reading.level || 0,
    });
    if (reading.level) {
      const levelSel = document.getElementById('reading-cefr-level');
      if (levelSel) levelSel.value = String(reading.level);
      populateLessons(reading.level);
    }

    customWords = [];
    unselectedWords = new Set();
    currentImageMap = {};
    const listEl = document.getElementById('extracted-words-list');
    if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    const infoEl = document.getElementById('custom-extract-info');
    if (infoEl) {
      infoEl.innerHTML = `Opened reading <strong>${String(reading.title || '').replace(/</g, '&lt;')}</strong>. Click <em>Extract words</em> to practice.`;
    }
    updateCustomClearButton();
    updateSaveSetButton();
    const listSection = document.getElementById('words-list-section');
    if (listSection) listSection.hidden = false;
    updatePlayBarVisibility();
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
    updatePlayBarVisibility();
  }

  function showSavedSets() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (practicePanel) practicePanel.style.display = 'none';
    if (savedSetsFlow) savedSetsFlow.style.display = '';
    updatePlayBarVisibility();
    const gameScreen = document.getElementById('picture-game-screen');
    const gameOver = document.getElementById('picture-gameover');
    if (gameScreen) gameScreen.hidden = true;
    if (gameOver) gameOver.hidden = true;
    setSavedLibTab('local-readings');
    renderSavedReadingsList();
    renderSavedSetsList();
    renderSharedContentLists();
    const lib = sharedContentLibrary();
    if (lib && lib.enabled) {
      lib.loadAll().then(() => renderSharedContentLists()).catch(() => {});
    }
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
    updatePlayBarVisibility();

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
    updatePlayBarVisibility();

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
    updatePlayBarVisibility();
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
    // Nested override used by extract button — must match reading extract checkboxes
    const cbs = document.querySelectorAll(
      '.custom-reading .level-filters input[type="checkbox"]:checked, .custom-reading .hsk-levels input[type="checkbox"]:checked'
    );
    return Array.from(cbs).map((cb) => Number(cb.value)).filter((n) => n >= 1 && n <= 6);
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
      updatePlayBarVisibility();
      return;
    }
    const unknownCount = words.filter(isIncompleteLibraryWord).length;
    const playable = words.filter((w) => !isIncompleteLibraryWord(w)).length;
    const items = words.map((w) => formatWordListRow(w)).join('');
    const unknownHint = unknownCount
      ? ` · <strong>${unknownCount}</strong> not in library (Add before they can be played)`
      : '';
    listEl.innerHTML = `<strong>Extracted words (${words.length}; ${playable} playable)${unknownHint}</strong>
      <p class="word-list-img-hint">Use <em>Add</em> for new words, <em>Image</em> to fix pictures &amp; meanings.</p>
      <ul>${items}</ul>`;
    listEl.hidden = false;
    updatePlayBarVisibility();

    const refresh = () => {
      updatePictureSetOptions();
      if (customWords && customWords.length) renderExtractedList(customWords);
      if (gameActive) updateBoard(true);
      updatePlayBarVisibility();
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
      if (!selectedLevels.length) {
        if (infoEl) {
          infoEl.innerHTML = 'Select at least one CEFR level above, then extract again.';
        }
        customWords = [];
        renderExtractedList([]);
        updateCustomClearButton();
        return;
      }
      customWords = extractWordsFromCustomText(text, pictureVocabulary, selectedLevels, {
        includeUnknown: true,
      });
      unselectedWords = new Set();
      currentImageMap = {};

      const levelDesc = selectedLevels.sort((a, b) => a - b).map(levelLabel).join(', ');
      const unknownN = customWords.filter(isIncompleteLibraryWord).length;
      const knownN = customWords.length - unknownN;

      if (infoEl) {
        if (customWords.length === 0) {
          infoEl.innerHTML = `No words at <strong>${levelDesc}</strong> in this text. Try more levels or another reading.`;
        } else if (unknownN > 0) {
          infoEl.innerHTML = `✅ <strong>${knownN}</strong> at ${levelDesc} + <strong>${unknownN}</strong> not in library. Tap <em>Add</em> on new words, then play.`;
        } else {
          infoEl.innerHTML = `✅ Extracted <strong>${customWords.length}</strong> words at ${levelDesc}. Fix pictures if needed, then play.`;
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

  // ---- Smart local Save + share ----
  function promptReadingTitle(defaultTitle) {
    const name = window.prompt('Title for this reading:', defaultTitle || 'My reading');
    if (name === null) return null;
    return name.trim() || defaultTitle || 'My reading';
  }

  const saveLocalBtn = document.getElementById('save-local-btn');
  if (saveLocalBtn) {
    saveLocalBtn.addEventListener('click', () => {
      const snap = getCurrentReadingSnapshot();
      const words = getActiveExtractedWords().length
        ? getActiveExtractedWords()
        : (customWords || []).filter((w) => !isIncompleteLibraryWord(w));
      const hasText = !!(snap.text && snap.text.trim());
      const hasWords = !!(words && words.length);
      if (!hasText && !hasWords) {
        if (infoEl) infoEl.textContent = 'Load a reading or extract words first.';
        return;
      }
      try {
        if (hasText && hasWords) {
          const title = promptReadingTitle(snap.title || `Reading ${new Date().toLocaleDateString()}`);
          if (title === null) return;
          const reading = addSavedReading({ ...snap, title });
          const set = addSavedWordSet({
            name: `${title} · words`,
            words,
            source: 'reading',
            readingTitle: title,
          });
          if (infoEl) {
            infoEl.innerHTML = `✅ Saved reading “${String(reading.title).replace(/</g, '&lt;')}” and ${set.words.length} words locally.`;
          }
        } else if (hasText) {
          const title = promptReadingTitle(snap.title || `Reading ${new Date().toLocaleDateString()}`);
          if (title === null) return;
          const entry = addSavedReading({ ...snap, title });
          if (infoEl) {
            infoEl.innerHTML = `📖 Saved reading “${String(entry.title).replace(/</g, '&lt;')}” locally.`;
          }
        } else {
          const titleEl = document.getElementById('lesson-reading-title');
          const defaultName = (titleEl && titleEl.textContent && titleEl.textContent !== 'Reading')
            ? `${titleEl.textContent} · words`
            : `Practice set ${new Date().toLocaleDateString()}`;
          const name = window.prompt('Name for this word set:', defaultName);
          if (name === null) return;
          const entry = addSavedWordSet({
            name: name.trim() || defaultName,
            words,
            source: 'reading',
            readingTitle: titleEl?.textContent || '',
          });
          if (infoEl) {
            infoEl.innerHTML = `💾 Saved <strong>${entry.words.length}</strong> words as “${String(entry.name).replace(/</g, '&lt;')}”.`;
          }
        }
        updateSaveSetButton();
      } catch (err) {
        if (infoEl) infoEl.textContent = err.message || String(err);
      }
    });
  }

  const shareBothBtn = document.getElementById('share-reading-words-btn');
  if (shareBothBtn) {
    shareBothBtn.addEventListener('click', async () => {
      const snap = getCurrentReadingSnapshot();
      const words = getActiveExtractedWords().length
        ? getActiveExtractedWords()
        : (customWords || []);
      if (!snap.text) {
        if (infoEl) infoEl.textContent = 'Load or paste a reading first.';
        return;
      }
      if (!words.length) {
        if (infoEl) infoEl.textContent = 'Extract words first, then share.';
        return;
      }
      if (!sharedContentEnabled()) {
        if (infoEl) {
          infoEl.textContent = 'Shared library is not configured. Add Supabase keys in config.js and run supabase/schema.sql (including the new readings/word-sets tables).';
        }
        return;
      }
      const title = promptReadingTitle(snap.title || `Reading ${new Date().toLocaleDateString()}`);
      if (title === null) return;

      shareBothBtn.disabled = true;
      if (infoEl) infoEl.textContent = 'Sharing reading + word set to shared library…';
      try {
        // Also keep local copies
        try {
          addSavedReading({ ...snap, title });
          addSavedWordSet({
            name: `${title} · words`,
            words,
            source: 'shared',
            readingTitle: title,
          });
        } catch { /* local optional */ }

        const lib = sharedContentLibrary();
        const result = await lib.saveReadingAndWordSet(
          {
            title,
            description: snap.description,
            text: snap.text,
            level: snap.level,
            source: snap.source || 'user',
          },
          {
            name: `${title} · words`,
            words,
            reading_title: title,
            level: snap.level,
          }
        );
        if (infoEl) {
          infoEl.innerHTML = `🌐 Shared “${String(result.reading.title).replace(/</g, '&lt;')}” and <strong>${(result.wordSet.words || words).length}</strong> words to the shared library for everyone.`;
        }
      } catch (err) {
        if (infoEl) infoEl.textContent = err.message || String(err);
      } finally {
        shareBothBtn.disabled = false;
      }
    });
  }

  // Saved library tabs
  document.querySelectorAll('.saved-lib-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setSavedLibTab(tab.dataset.tab || 'local-readings');
    });
  });
  const refreshSharedBtn = document.getElementById('refresh-shared-content');
  if (refreshSharedBtn) {
    refreshSharedBtn.addEventListener('click', async () => {
      const lib = sharedContentLibrary();
      const statusEl = document.getElementById('shared-content-status');
      if (!lib || !lib.enabled) {
        if (statusEl) statusEl.textContent = 'Shared library is not configured.';
        return;
      }
      if (statusEl) statusEl.textContent = 'Refreshing…';
      try {
        await lib.loadAll();
        renderSharedContentLists();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || String(err);
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
      const label = loadDailyBtn.textContent;
      loadDailyBtn.textContent = 'Loading…';
      if (statusEl) statusEl.textContent = 'Finding a new reading…';
      if (infoEl) infoEl.textContent = '';
      try {
        const reading = await loadDailyReadingForLevel(level, pictureVocabulary, { forceNew: true });
        applyReadingToUi(reading);
        customWords = [];
        unselectedWords = new Set();
        if (listEl) {
          listEl.hidden = true;
          listEl.innerHTML = '';
        }
        const srcNote =
          reading.source === 'wikipedia-topic' ? 'topic story'
            : reading.source === 'wikinews' ? 'news'
              : reading.source === 'wikipedia' ? 'encyclopedia'
                : 'collection story';
        const n = Number(reading.refreshCount || 1);
        const lenNote = readingLengthNote(reading);
        if (statusEl) {
          statusEl.innerHTML = `✅ New ${srcNote} for ${levelLabel(level)}${n > 1 ? ` · #${n} today` : ''}. Click again for another.`
            + (lenNote ? `<br><span class="reading-length-note">${lenNote}</span>` : '');
        }
        if (infoEl) {
          infoEl.innerHTML = `Loaded <strong>${String(reading.title).replace(/</g, '&lt;')}</strong> (${(reading.text || '').length} chars). Extract words — or click <em>New reading</em> again.`
            + (reading.truncated
              ? `<br><span class="reading-length-note">⚠ ${lenNote}</span>`
              : '');
        }
        updateCustomClearButton();
        updateSaveSetButton();
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Could not load daily reading.';
      } finally {
        loadDailyBtn.disabled = false;
        loadDailyBtn.textContent = label || 'New reading';
      }
    });
  }

  // Paste tab: single clean surface
  const pasteTaSync = document.getElementById('custom-reading-text');
  if (pasteTaSync) {
    pasteTaSync.addEventListener('input', () => {
      const activeTa = document.getElementById('active-reading-text');
      const box = document.getElementById('lesson-reading');
      if (activeTa) {
        activeTa.value = pasteTaSync.value;
        activeTa.hidden = true;
      }
      if (box) box.hidden = true;
      updateSaveSetButton();
    });
  }

  const activeTaSync = document.getElementById('active-reading-text');
  if (activeTaSync) {
    activeTaSync.addEventListener('input', () => {
      const pasteTa = document.getElementById('custom-reading-text');
      if (pasteTa) pasteTa.value = activeTaSync.value;
      updateSaveSetButton();
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
      document.querySelectorAll(
        '.custom-reading .level-filters input[type="checkbox"], .custom-reading .hsk-levels input[type="checkbox"]'
      ).forEach((cb) => { cb.checked = true; });
    });
  }
  if (noneBtn) {
    noneBtn.addEventListener('click', () => {
      document.querySelectorAll(
        '.custom-reading .level-filters input[type="checkbox"], .custom-reading .hsk-levels input[type="checkbox"]'
      ).forEach((cb) => { cb.checked = false; });
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
  const activeTa = document.getElementById('active-reading-text');
  const pasteTa = document.getElementById('custom-reading-text');

  if (!reading || !reading.text) return;

  if (titleEl) titleEl.textContent = reading.title || 'Reading';
  if (descEl) {
    const base = reading.description || (reading.level ? `${levelLabel(reading.level)}` : '');
    const lenNote = readingLengthNote(reading);
    descEl.textContent = lenNote ? `${base} · ${lenNote}` : base;
    descEl.classList.toggle('reading-desc-truncated', !!reading.truncated);
  }
  if (activeTa) {
    activeTa.value = reading.text;
    activeTa.hidden = false;
    const lines = Math.min(16, Math.max(6, Math.ceil((reading.text || '').length / 55)));
    activeTa.rows = lines;
  }
  if (pasteTa) pasteTa.value = reading.text;
  if (box) box.hidden = false;

  // Keep extract level checkboxes aligned with reading level (1..N)
  const maxLv = Number(reading.level) || Number(document.getElementById('reading-cefr-level')?.value) || 3;
  setExtractLevelsUpTo(maxLv);
}

function setExtractLevelsUpTo(maxLevel) {
  const max = Number(maxLevel) || 3;
  document.querySelectorAll(
    '.custom-reading .level-filters input[type="checkbox"], .custom-reading .hsk-levels input[type="checkbox"]'
  ).forEach((cb) => {
    cb.checked = Number(cb.value) <= max;
  });
}

function getActiveReadingText() {
  const pasteTab = document.getElementById('reading-tab-paste');
  const pasteActive = pasteTab && pasteTab.classList.contains('is-active');
  const pasteTa = document.getElementById('custom-reading-text');
  const activeTa = document.getElementById('active-reading-text');
  if (pasteActive && pasteTa && pasteTa.value.trim()) return pasteTa.value.trim();
  if (activeTa && activeTa.value.trim()) return activeTa.value.trim();
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
  const box = document.getElementById('lesson-reading');
  if (source === 'paste') {
    if (box) box.hidden = true;
    const pasteTa = document.getElementById('custom-reading-text');
    if (pasteTa) pasteTa.focus();
  }
}

