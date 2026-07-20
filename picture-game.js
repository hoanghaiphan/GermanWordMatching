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

// CEFR level labels: 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2
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

/** Rebuild pictureVocabulary = built-in + user words (user wins on same word, case-insensitive). */
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
  const entry = normalizeNewWord(input);
  if (!entry.word) return { ok: false, reason: 'Please enter a German word.' };
  if (!/[a-zäöüß]/i.test(entry.word)) {
    return { ok: false, reason: 'German field should include letters (a–z, äöüß).' };
  }
  if (!entry.meaning) return { ok: false, reason: 'Please enter an English meaning.' };

  const existing = findWordInLibrary(entry.word);
  if (existing) {
    const label = levelLabel(existing.level);
    return {
      ok: false,
      reason: existing.userAdded
        ? `“${entry.word}” is already in your added words.`
        : `“${existing.word}” is already in the library (${label}).`,
      existing,
    };
  }

  const userWords = loadUserVocabulary();
  userWords.push({
    word: entry.word,
    article: entry.article,
    meaning: entry.meaning,
    level: entry.level,
  });
  saveUserVocabulary(userWords);
  rebuildVocabularyWithUserWords();
  return { ok: true, word: entry };
}

function removeUserWord(word) {
  const key = (word || '').trim().toLowerCase();
  if (!key) return false;
  const next = loadUserVocabulary().filter((w) => String(w.word).toLowerCase() !== key);
  saveUserVocabulary(next);
  rebuildVocabularyWithUserWords();
  return true;
}

// Sample lessons for integration: Reading first, then practice words from it
const LESSONS = [
  {
    id: "a1-daily",
    level: "1",
    title: "A1 - Daily Life",
    text: "Hallo, ich bin Student. Ich mag Hunde und Katzen. Heute ist das Wetter gut. Ich gehe zur Schule und lerne Deutsch.",
    description: "Simple daily conversation and activities."
  },
  {
    id: "a1-food",
    level: "1",
    title: "A1 - Food",
    text: "Ich esse gerne Äpfel und Brot. Mama und Papa trinken Tee. Ich möchte Milch trinken.",
    description: "Food and family preferences."
  },
  {
    id: "a2-family",
    level: "2",
    title: "A2 - My Family",
    text: "Meine Familie hat einen Vater, eine Mutter und mich. Wir wohnen in Berlin. Mein Vater ist Lehrer. Er liest gerne Bücher.",
    description: "Family and home description."
  }
];

function getLessonWords(lesson, vocab) {
  const lower = (lesson.text || '').toLowerCase();
  const words = [];
  const seen = new Set();
  for (const w of vocab) {
    const key = (w.word || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    // Match whole word (with word boundaries) in German text
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) {
      seen.add(key);
      words.push(w);
    }
  }
  return words;
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

  // Also build multi-word phrase lookup (e.g. "Guten Tag")
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
      // Multi-word phrase: simple substring match
      if (lowerText.includes(key)) {
        seen.add(key);
        matched.push(entry);
      }
    } else if (tokenSet.has(key)) {
      seen.add(key);
      matched.push(entry);
    }
  }

  // Sort by level then word for nicer display
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

function getLocalImage(word) {
  // Local images disabled — game is text-only (German word + English meaning).
  return null;
}

/** Always text-only: German word + English meaning (no pictures). */
function getWordImage(word) {
  const meaning = (word.meaning || '').replace(/;/g, '; ').trim();
  return {
    url: null,
    label: word.word,
    picturable: false,
    showMeaning: true,
    meaning: meaning
  };
}

/** True when the "Use your own reading" flow is active (not ready-made sets). */
function isCustomReadingMode() {
  const customFlow = document.getElementById('custom-flow');
  return !!(customFlow && customFlow.style.display !== 'none');
}

/**
 * Client-side automatic image resolver.
 * Tries to find a good semantic photo from Wikimedia Commons (then Unsplash source fallback).
 * Only online photos. Results cached. If none found for a word, map entry is null → show meaning in game.
 */
async function resolveOnlineImage(word, force = false) {
  const cacheKey = 'german-game-image-cache-v2';
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  } catch {}

  const key = `${word.word}|${word.article}`;
  if (!force && cache[key] !== undefined) {
    return cache[key];
  }

  // Try wikimedia first - prioritize semantic english meaning for better relevant pictures
  const queries = [];
  if (word.meaning) {
    const english = word.meaning.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the','and','for','with','from','to','a','an','of'].includes(w))
      .slice(0, 5)
      .join(' ');
    if (english) {
      queries.push(english + ' photo illustration');
      queries.push(`${word.word} ${english}`);
    }
  }
  queries.push(word.word);
  queries.push(word.word + ' german object photo');

  let foundUrl = null;
  for (const q of queries) {
    if (foundUrl) break;
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: '6',
      gsrlimit: '8',
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '450',
      format: 'json',
      origin: '*',
    });

    try {
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (educational German learning game)' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data.query?.pages || {};
      for (const page of Object.values(pages)) {
        const thumb = page.thumbnail?.source;
        if (thumb) {
          foundUrl = thumb;
          break;
        }
      }
    } catch (e) { /* ignore */ }
    await new Promise(r => setTimeout(r, 100));
  }

  if (!foundUrl) {
    // Online photo fallback via unsplash source (keywords from meaning/hanzi)
    const keywords = (word.meaning || word.word).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).slice(0,4).join(',');
    foundUrl = `https://source.unsplash.com/400x300/?${keywords || 'german,object,real,photo'}`;
  }

  cache[key] = foundUrl;
  localStorage.setItem(cacheKey, JSON.stringify(cache));
  return foundUrl;
}

function isPicturable(word) {
  // Not used. Decision is purely based on currentImageMap (online only) + getWordImage.
  // If no online photo, show English meaning instead.
  return false;
}

function getImageSrc(image) {
  return image.url || '';
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
  // Support both old select and new checkboxes in the current UI
  const select = document.getElementById('picture-level-select');
  if (select) {
    const val = select.value;
    if (val === 'all') return [];
    return [Number(val)];
  }
  // New checkbox UI
  const cbs = document.querySelectorAll('.custom-reading .level-filters input[type="checkbox"]:checked, .level-filters input[type="checkbox"]:checked');
  if (cbs.length) {
    return Array.from(cbs).map(cb => Number(cb.value));
  }
  return []; // all levels
}

function isTextOnlyMode() {
  // Always text-only — online picture search was removed.
  return true;
}

/** Filter a word list by checkboxes in the word list (if visible) or unselectedWords. */
function filterWordsBySelection(words) {
  if (!words || !words.length) return [];
  const listEl = document.getElementById('extracted-words-list');
  if (listEl && !listEl.hidden) {
    const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
      const selectedWords = new Set(Array.from(checked).map(cb => cb.dataset.word));
      return words.filter(w => selectedWords.has(w.word));
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
    // Keep labels simple (no embedded hanzi) to avoid font rendering quirks in <select> for B2 groups
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
      const selectedWords = new Set(Array.from(checked).map(cb => cb.dataset.word));
      words = words.filter(w => selectedWords.has(w.word));
    }
  }
  const sets = splitIntoSets(words);
  setSelect.innerHTML = '';

  const count = words.length;
  sets.forEach((set, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    // Keep labels simple (no embedded hanzi) to avoid font rendering quirks in <select> for B2 groups
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

  // Ready-made sets mode: filter by current level checkboxes + chosen set/group
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
    <!-- Article/gender is hidden until revealed in the learning feedback overlay -->
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
}

async function improveImagesWithOnline(words) {
  const grid = document.getElementById('picture-grid');
  if (!grid) return;

  for (const word of words) {
    const onlineUrl = await resolveOnlineImage(word);
    if (!onlineUrl || !gameActive) continue;

    // Upgrade image with the online searched one (overrides local if search succeeded)
    const cards = grid.querySelectorAll(`.picture-card[data-word="${word.word}"]`);
    cards.forEach(card => {
      const img = card.querySelector('.picture-img');
      if (!img) return;
      img.src = onlineUrl;
      img.style.opacity = '0.65';
      setTimeout(() => { if (img && img.parentElement) img.style.opacity = '1'; }, 280);
    });
  }
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
    // Special list preview for text-only: hanzi + pinyin + english meaning
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
      // Picture + hanzi + meaning (user request: preview should show meaning as well)
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

  // Don't auto-show word lists on load. Custom shows after extract; sets mode after Preview.

  // Level change listener (for checkboxes or old select)
  const levelCheckboxes = document.querySelectorAll('.level-filters input[type="checkbox"], #picture-level-select');
  levelCheckboxes.forEach(el => {
    el.addEventListener('change', () => {
      // Custom reading: only level filters for next extract — never inject default sets
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

  // Helper to show a selectable words list (checkboxes) before playing
  function showBasicWordsList(words) {
    const listEl = document.getElementById('extracted-words-list');
    if (!listEl || !words || !words.length) return;

    const isCustom = !!(customWords && customWords.length > 0);
    const itemsHtml = words.map(w => {
      const meaning = (w.meaning || '').replace(/;/g, '; ').trim();
      const article = w.article ? ` (${w.article})` : '';
      const levelInfo = w.level ? ` [${levelLabel(w.level)}]` : '';
      const isChecked = !unselectedWords.has(w.word);
      return `<li>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} data-word="${w.word}" style="margin:0;">
          <span class="de-word">${w.word}</span>
          <span class="de-article">${article}</span>
          <span class="meaning">— ${meaning}${levelInfo}</span>
        </label>
      </li>`;
    }).join('');

    const title = isCustom
      ? 'Extracted words (uncheck to exclude from games)'
      : 'Words in this set (uncheck to exclude from games)';
    listEl.innerHTML = `<strong>${title} (${words.length}):</strong><ul>${itemsHtml}</ul>`;
    listEl.hidden = false;

    const cbs = listEl.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const hanzi = cb.dataset.word;
        if (cb.checked) {
          unselectedWords.delete(hanzi);
        } else {
          unselectedWords.add(hanzi);
        }
        // Re-render from the same full list to keep checkboxes stable
        if (isCustom && customWords && customWords.length) {
          renderExtractedList(customWords);
        } else {
          const group = getCurrentGroupWordsUnfiltered();
          if (group && group.length) showBasicWordsList(group);
        }
      });
    });
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

  function showMenu() {
    if (menuView) menuView.style.display = '';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
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
      const article = w.article ? ` (${w.article})` : '';
      const wordEsc = (w.word || '').replace(/"/g, '&quot;');
      return `<li>
        <div class="user-word-meta">
          <span class="de-word">${w.word}</span>
          <span class="de-article">${article}</span>
          <span class="meaning">— ${meaning} <em>(${levelLabel(w.level)} · yours)</em></span>
        </div>
        <button type="button" class="remove-user-word" data-word="${wordEsc}">Remove</button>
      </li>`;
    }).join('')}</ul>`;

    listEl.querySelectorAll('.remove-user-word').forEach((btn) => {
      btn.addEventListener('click', () => {
        const word = btn.dataset.word;
        if (!word) return;
        if (!confirm(`Remove “${word}” from your library?`)) return;
        removeUserWord(word);
        renderUserWordsList();
        updatePictureSetOptions();
        setAddWordStatus(`Removed “${word}”.`);
      });
    });
  }

  function showAddWords() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
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

  function showCustom() {
    if (menuView) menuView.style.display = 'none';
    if (setsFlow) setsFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
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

    // Ensure only custom levels are active
    document.querySelectorAll('#sets-flow .level-filters input[type="checkbox"], .sets-cefr-filters input').forEach(c => c.checked = false);

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
  }

  function showSets() {
    if (menuView) menuView.style.display = 'none';
    if (customFlow) customFlow.style.display = 'none';
    if (addWordsFlow) addWordsFlow.style.display = 'none';
    if (setsFlow) setsFlow.style.display = '';
    if (practicePanel) practicePanel.style.display = '';

    // For sets mode, hide the pure custom paste area but keep levels if possible
    const reading = document.getElementById('reading-input');
    if (reading) reading.style.display = 'none';  // hide paste + custom levels (sets has its own in HTML)
    const listSection = document.getElementById('words-list-section');
    if (listSection) listSection.hidden = false;
    const hint = document.querySelector('.picture-highscore-hint');
    if (hint) hint.style.display = '';

    // Ensure only sets levels are active (uncheck custom ones)
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

  const startAddWordsBtn = document.getElementById('start-add-words-btn');
  if (startAddWordsBtn) startAddWordsBtn.addEventListener('click', showAddWords);

  const backCustom = document.getElementById('back-from-custom');
  if (backCustom) backCustom.addEventListener('click', showMenu);

  const backSets = document.getElementById('back-from-sets');
  if (backSets) backSets.addEventListener('click', showMenu);

  const backAddWords = document.getElementById('back-from-add-words');
  if (backAddWords) backAddWords.addEventListener('click', showMenu);

  // ---- Add-your-own-words form ----
  const addWordForm = document.getElementById('add-word-form');
  const addWordCheckBtn = document.getElementById('add-word-check');

  function readAddWordForm() {
    return {
      word: (document.getElementById('add-word')?.value || '').trim(),
      article: (document.getElementById('add-article')?.value || '').trim(),
      meaning: (document.getElementById('add-meaning')?.value || '').trim(),
      level: Number(document.getElementById('add-level')?.value || 3),
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
      const src = existing.userAdded
        ? 'your added words'
        : `the built-in library (${levelLabel(existing.level)})`;
      const art = existing.article ? ` (${existing.article})` : '';
      setAddWordStatus(
        `Already in ${src}: <strong>${existing.word}</strong>${art} — ${existing.meaning || ''}`
      );
    });
  }

  if (addWordForm) {
    addWordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readAddWordForm();
      const result = addUserWord(data);
      if (!result.ok) {
        setAddWordStatus(result.reason || 'Could not add word.', true);
        return;
      }
      const art = result.word.article ? ` (${result.word.article})` : '';
      setAddWordStatus(
        `✅ Added <strong>${result.word.word}</strong>${art} — ${result.word.meaning} [${levelLabel(result.word.level)}]`
      );
      const wordEl = document.getElementById('add-word');
      const articleEl = document.getElementById('add-article');
      const meaningEl = document.getElementById('add-meaning');
      if (wordEl) wordEl.value = '';
      if (articleEl) articleEl.value = '';
      if (meaningEl) meaningEl.value = '';
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
      const article = w.article ? ` (${w.article})` : '';
      const levelInfo = w.level ? ` [${levelLabel(w.level)}]` : '';
      const isChecked = !unselectedWords.has(w.word);
      let imgHtml = '';
      const imgInfo = getWordImage(w);
      if (imgInfo.url && !imgInfo.showMeaning) {
        imgHtml = `<img src="${imgInfo.url}" style="width:48px;height:36px;object-fit:cover;vertical-align:middle;margin-right:6px;border-radius:3px;">`;
      }
      return `<li>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" ${isChecked ? 'checked' : ''} data-word="${w.word}" style="margin:0;">
          ${imgHtml}<span class="de-word">${w.word}</span>
          <span class="de-article">${article}</span>
          <span class="meaning">— ${meaning}${levelInfo}</span>
        </label>
      </li>`;
    }).join('');
    listEl.innerHTML = `<strong>Extracted words (${words.length}) — uncheck to exclude from games:</strong><ul>${items}</ul>`;
    listEl.hidden = false;

    // Attach listeners to update active selection (affects games)
    const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const hanzi = cb.dataset.word;
        if (cb.checked) {
          unselectedWords.delete(hanzi);
        } else {
          unselectedWords.add(hanzi);
        }
        updatePictureSetOptions();
        if (customWords && customWords.length) {
          renderExtractedList(customWords);
        }
      });
    });
  }

  // (old updateActive removed; checkbox listeners now directly update using getActiveExtractedWords and re-render full list)

  if (extractBtn) {
    extractBtn.addEventListener('click', () => {
      const textarea = document.getElementById('custom-reading-text');
      const text = textarea ? textarea.value.trim() : '';
      if (!text) {
        if (infoEl) infoEl.textContent = 'Please paste some German text first.';
        return;
      }

      const selectedLevels = getSelectedLevels();
      customWords = extractWordsFromCustomText(text, pictureVocabulary, selectedLevels);
      unselectedWords = new Set(); // reset selection, all selected by default
      currentImageMap = {};   // previous search results no longer apply to new text

      const levelDesc = selectedLevels.length === 0 
        ? 'all levels' 
        : selectedLevels.sort().map(levelLabel).join(', ');

      if (infoEl) {
        if (customWords.length === 0) {
          infoEl.innerHTML = `No matching words found in the text for ${levelDesc}.`;
        } else {
          infoEl.innerHTML = `✅ Extracted <strong>${customWords.length}</strong> words for ${levelDesc}.`;
        }
      }

      // Show the list
      renderExtractedList(customWords);

      // Clear lesson selection
      const lessonSel = document.getElementById('lesson-select');
      if (lessonSel) lessonSel.value = '';
      const readingDiv = document.getElementById('lesson-reading');
      if (readingDiv) readingDiv.hidden = true;

      // Refresh game sets + hide the set picker (we use full list in extract mode)
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
      updatePictureSetOptions();
      updateSetPickerForMode();  // show picker again (back to sets-like behavior)
      updateCustomClearButton();
    });
  }

  const startBtn = document.getElementById('start-picture-game');
  if (startBtn) {
    startBtn.addEventListener('click', startGame);
  }

  // Level quick buttons
  const allBtn = document.getElementById('select-all-levels');
  const noneBtn = document.getElementById('clear-levels');
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

  // Initial UI state
  updateCustomClearButton();
  const initList = document.getElementById('extracted-words-list');
  if (initList) initList.hidden = true;
}

function populateLessons() {
  const sel = document.getElementById('lesson-select');
  if (!sel) return;
  // Clear previous (except placeholder)
  while (sel.options.length > 1) sel.remove(1);
  LESSONS.forEach(lesson => {
    const opt = document.createElement('option');
    opt.value = lesson.id;
    opt.textContent = `${lesson.title} (${levelLabel(Number(lesson.level))})`;
    sel.appendChild(opt);
  });
}
