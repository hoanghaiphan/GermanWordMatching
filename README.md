# Deutsch Vokabeln · German Vocab Practice

A bilingual German (CEFR) vocabulary matching game, upgraded to match the Chinese Word Matching feature set.

## Modes

- **Reading practice** — Pick CEFR level → choose a passage from the graded **collection**, load **today’s reading** (open web + daily cache, collection fallback), or **paste** your own text. Extract words and play.
- **Ready-made sets** — Practice A1–C2 word groups (~20 words each).
- **My saved library** — Save readings and word sets locally; **Share reading + words** uploads both to Supabase for all users. Edit English meanings on the post-game review list.
- **Add your own words** — Add missing vocabulary (and optional image URLs) stored in this browser.

## Features

- CEFR vocabulary (A1–C2) — thousands of unique words
- **Pictures** for matching when available:
  1. **Shared library** (Supabase) — multi-user edits, survives deploys
  2. Built-in map in `images.js` (optional Wikimedia URLs shipped with the site)
  3. Live multi-source photo search when still missing (session / browser cache)
  4. Text fallback (German + English) when no picture
- **Edit pictures (shared)** — On any word list, click **Image** to:
  - Search **Wikimedia**, **Openverse** (no keys), plus optional **Unsplash / Pexels / Pixabay**
  - Compare thumbnails, pick the best, then **Save** to the shared library
  - Force “no image”, or clear the shared entry
- **Edit English meanings** after a game (saved locally; shared when a shared image row exists)
- Correct answers reveal **articles** (`der` / `die` / `das`) for nouns
- High score, TTS pronunciation (German), keyboard (1–6, S)

## Shared image library (multi-user database)

Image links edited by players are stored in **Supabase Postgres**, not in the site deploy. Updating the site does **not** wipe the library.

### One-time setup

1. Create a free project at [supabase.com](https://supabase.com)
2. SQL Editor → run `supabase/schema.sql` (includes word images, shared readings, and shared word sets)
3. Copy `config.example.js` → `config.js` and set:
   - `supabaseUrl` (Project Settings → API)
   - `supabaseAnonKey` (anon public key)
   - (Optional) photo API keys under `IMAGE_SEARCH_CONFIG` — see below
4. Redeploy / refresh the site

If you already ran an older schema, run the new sections in `schema.sql` for `german_shared_readings` and `german_shared_word_sets`.

Until `config.js` is filled in, the game still works with `images.js` + Wikimedia/Openverse; **Save** will explain that the shared library is not configured.

### Optional photo sources (Unsplash / Pexels / Pixabay)

| Source | Key needed? | Notes |
|--------|-------------|--------|
| **Wikimedia Commons** | No | Default for built-in map + live fill |
| **Openverse** | No | Creative Commons / public-domain aggregator |

Optional free APIs (paste keys into `config.js` → `IMAGE_SEARCH_CONFIG`):

| Source | Get a free key |
|--------|----------------|
| **Unsplash** | [unsplash.com/developers](https://unsplash.com/developers) → Access Key |
| **Pexels** | [pexels.com/api](https://www.pexels.com/api/) |
| **Pixabay** | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |

Keys in the browser are visible to users (normal for client-side demos). Prefer free-tier keys and domain restrictions if the provider supports them.

### How multi-user edits work

| Action | Effect |
|--------|--------|
| Save URL / Search / No image | Upsert row in `german_word_images` |
| Use default | Deletes shared row → built-in map / live search again |
| Share reading + words | Upsert into `german_shared_readings` + `german_shared_word_sets` |
| Many users | Last write wins per German word / content id; everyone reads the same tables |

LocalStorage only caches the shared map for faster loads — **source of truth is Supabase**.

## How to run

### Windows
1. Double-click `start-game.bat` (or `node server.js 8080`)
2. Open http://localhost:8080

### Python
```powershell
cd "C:\Users\hoang\Projects\GermanWordMatching"
python -m http.server 8080
```

Prefer HTTP over opening `index.html` directly (encoding + large JS files).

## Project files

| File | Role |
|------|------|
| `index.html` | UI + image edit modal |
| `config.js` / `config.example.js` | Supabase + optional Unsplash/Pexels/Pixabay keys |
| `image-library.js` | Shared image library client (read/write Supabase) |
| `shared-content.js` | Shared readings + word sets client |
| `supabase/schema.sql` | Database tables + RLS policies |
| `main.js` | Boot |
| `picture-game.js` | Game, extract, user words, image UI, readings |
| `vocabulary.js` | CEFR word list (`word`, `article`, `meaning`, `level`) |
| `readings.js` | Graded A1–C2 reading collection |
| `images.js` | Built-in word → image URL map (defaults) |
| `styles.css` | Styling |
| `server.js` + `start-game.bat` | Local static server |

## Vocabulary schema

Each entry in `vocabulary.js`:

```js
{ word: 'Haus', article: 'das', meaning: 'house', level: 1 }
```

- `article`: `der` / `die` / `das` / `''` (empty for non-nouns)
- `level`: 1–6 for A1–C2

## Hosting (Netlify / GitHub Pages / etc.)

Upload static files including `config.js` (with your anon key).  
The **image / content database stays in Supabase** across every deploy.

## Controls

**Matching game**

- Tap the card where German matches the English meaning (or the correct picture pairing)
- **1–6** select slot · **S** speak

Viel Erfolg beim Deutschlernen!
