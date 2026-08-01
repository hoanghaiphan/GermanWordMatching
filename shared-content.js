/**
 * Shared readings + word sets (Supabase REST).
 * Uses the same project URL / anon key as IMAGE_LIBRARY_CONFIG.
 */
(function (global) {
  const READINGS_CACHE_KEY = 'german-shared-readings-cache-v1';
  const SETS_CACHE_KEY = 'german-shared-word-sets-cache-v1';

  function newId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const SharedContentLibrary = {
    enabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    readingsTable: 'german_shared_readings',
    wordSetsTable: 'german_shared_word_sets',
    /** @type {Array} */
    readings: [],
    /** @type {Array} */
    wordSets: [],
    ready: false,

    init() {
      const cfg = global.IMAGE_LIBRARY_CONFIG || {};
      this.supabaseUrl = String(cfg.supabaseUrl || '').replace(/\/$/, '');
      this.supabaseAnonKey = String(cfg.supabaseAnonKey || '');
      this.readingsTable = String(cfg.readingsTable || 'german_shared_readings');
      this.wordSetsTable = String(cfg.wordSetsTable || 'german_shared_word_sets');
      this.enabled = !!(
        this.supabaseUrl &&
        this.supabaseAnonKey &&
        !this.supabaseUrl.includes('YOUR_PROJECT')
      );

      try {
        const r = localStorage.getItem(READINGS_CACHE_KEY);
        if (r) {
          const parsed = JSON.parse(r);
          if (Array.isArray(parsed)) this.readings = parsed;
        }
        const s = localStorage.getItem(SETS_CACHE_KEY);
        if (s) {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) this.wordSets = parsed;
        }
      } catch { /* ignore */ }

      return this.enabled;
    },

    _headers(extra) {
      return Object.assign(
        {
          apikey: this.supabaseAnonKey,
          Authorization: `Bearer ${this.supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        extra || {}
      );
    },

    _rest(table) {
      return `${this.supabaseUrl}/rest/v1/${encodeURIComponent(table)}`;
    },

    _requireEnabled() {
      if (!this.enabled) {
        throw new Error(
          'Shared library is not configured. Add Supabase URL + anon key in config.js, then run supabase/schema.sql.'
        );
      }
    },

    _persistCaches() {
      try {
        localStorage.setItem(READINGS_CACHE_KEY, JSON.stringify(this.readings));
        localStorage.setItem(SETS_CACHE_KEY, JSON.stringify(this.wordSets));
      } catch { /* quota */ }
    },

    async loadAll() {
      if (!this.enabled) {
        this.ready = true;
        return { readings: this.readings, wordSets: this.wordSets };
      }
      try {
        const [rRes, sRes] = await Promise.all([
          fetch(
            `${this._rest(this.readingsTable)}?select=*&order=updated_at.desc&limit=200`,
            { headers: this._headers() }
          ),
          fetch(
            `${this._rest(this.wordSetsTable)}?select=*&order=updated_at.desc&limit=200`,
            { headers: this._headers() }
          ),
        ]);
        if (rRes.ok) {
          const rows = await rRes.json();
          if (Array.isArray(rows)) this.readings = rows;
        }
        if (sRes.ok) {
          const rows = await sRes.json();
          if (Array.isArray(rows)) {
            this.wordSets = rows.map((row) => ({
              ...row,
              words: typeof row.words === 'string' ? JSON.parse(row.words) : (row.words || []),
            }));
          }
        }
        this._persistCaches();
      } catch (err) {
        console.warn('[SharedContentLibrary]', err.message || err);
      }
      this.ready = true;
      return { readings: this.readings, wordSets: this.wordSets };
    },

    /**
     * @param {{ id?: string, title: string, description?: string, text: string, level?: number, source?: string, created_by?: string }} reading
     */
    async saveReading(reading) {
      this._requireEnabled();
      const title = String(reading.title || '').trim();
      const text = String(reading.text || '').trim();
      if (!title) throw new Error('Reading needs a title.');
      if (!text) throw new Error('Reading needs text.');

      const body = {
        id: reading.id || newId('rd'),
        title,
        description: String(reading.description || '').trim(),
        text,
        level: Number(reading.level) || 0,
        source: String(reading.source || 'user').trim(),
        created_by: reading.created_by || 'anon',
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(`${this._rest(this.readingsTable)}?on_conflict=id`, {
        method: 'POST',
        headers: this._headers({
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Save reading failed (${res.status}): ${t.slice(0, 180)}`);
      }
      const rows = await res.json().catch(() => []);
      const saved = Array.isArray(rows) && rows[0] ? rows[0] : body;
      this.readings = [saved, ...this.readings.filter((r) => r.id !== saved.id)].slice(0, 200);
      this._persistCaches();
      return saved;
    },

    /**
     * @param {{ id?: string, name: string, words: Array, reading_id?: string, reading_title?: string, level?: number, created_by?: string }} set
     */
    async saveWordSet(set) {
      this._requireEnabled();
      const name = String(set.name || '').trim();
      const words = Array.isArray(set.words) ? set.words : [];
      if (!name) throw new Error('Word set needs a name.');
      if (!words.length) throw new Error('Word set has no words.');

      const cleanWords = words
        .map((w) => ({
          word: String(w.word || '').trim(),
          article: String(w.article || '').trim(),
          meaning: String(w.meaning || '').trim(),
          level: Number(w.level) || 0,
        }))
        .filter((w) => w.word);

      if (!cleanWords.length) throw new Error('Word set has no valid words.');

      const body = {
        id: set.id || newId('ws'),
        name,
        reading_id: set.reading_id || '',
        reading_title: set.reading_title || '',
        words: cleanWords,
        level: Number(set.level) || 0,
        created_by: set.created_by || 'anon',
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(`${this._rest(this.wordSetsTable)}?on_conflict=id`, {
        method: 'POST',
        headers: this._headers({
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Save word set failed (${res.status}): ${t.slice(0, 180)}`);
      }
      const rows = await res.json().catch(() => []);
      let saved = Array.isArray(rows) && rows[0] ? rows[0] : body;
      if (typeof saved.words === 'string') {
        try { saved = { ...saved, words: JSON.parse(saved.words) }; } catch { /* keep */ }
      }
      this.wordSets = [saved, ...this.wordSets.filter((s) => s.id !== saved.id)].slice(0, 200);
      this._persistCaches();
      return saved;
    },

    /**
     * Save reading + word set together to the shared library.
     * @returns {{ reading: object, wordSet: object }}
     */
    async saveReadingAndWordSet(reading, set) {
      const savedReading = await this.saveReading(reading);
      const savedSet = await this.saveWordSet({
        ...set,
        reading_id: savedReading.id,
        reading_title: savedReading.title,
        level: set.level != null ? set.level : savedReading.level,
      });
      return { reading: savedReading, wordSet: savedSet };
    },

    async removeReading(id) {
      this._requireEnabled();
      const key = String(id || '').trim();
      if (!key) return;
      this.readings = this.readings.filter((r) => r.id !== key);
      this._persistCaches();
      const res = await fetch(
        `${this._rest(this.readingsTable)}?id=eq.${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: this._headers({ Prefer: 'return=minimal' }) }
      );
      if (!res.ok && res.status !== 404) {
        const t = await res.text().catch(() => '');
        throw new Error(`Delete reading failed (${res.status}): ${t.slice(0, 160)}`);
      }
    },

    async removeWordSet(id) {
      this._requireEnabled();
      const key = String(id || '').trim();
      if (!key) return;
      this.wordSets = this.wordSets.filter((s) => s.id !== key);
      this._persistCaches();
      const res = await fetch(
        `${this._rest(this.wordSetsTable)}?id=eq.${encodeURIComponent(key)}`,
        { method: 'DELETE', headers: this._headers({ Prefer: 'return=minimal' }) }
      );
      if (!res.ok && res.status !== 404) {
        const t = await res.text().catch(() => '');
        throw new Error(`Delete word set failed (${res.status}): ${t.slice(0, 160)}`);
      }
    },

    statusLabel() {
      if (!this.enabled) return 'Shared content off';
      return `Shared: ${this.readings.length} reading(s), ${this.wordSets.length} word set(s)`;
    },
  };

  SharedContentLibrary.init();
  global.SharedContentLibrary = SharedContentLibrary;
})(typeof window !== 'undefined' ? window : globalThis);
