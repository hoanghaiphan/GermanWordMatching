# Deutsch Vokabeln · German Word Matching

A bilingual German vocabulary learning game, adapted from the Chinese Word Matching project.

## Modes

- **Use your own reading** — Paste a German passage, filter by CEFR level, extract matching vocabulary, then play.
- **Ready-made sets** — Pick A1–C2 levels and play with pre-grouped word sets (~20 words each).

## Features

- CEFR vocabulary (A1–C2) — ~3,800 unique words (daily, work, media, academic)
- Matching game: German word ↔ English meaning
- Correct answers reveal **articles** (`der` / `die` / `das`) for nouns
- Browser text-to-speech (German)
- High score saved in localStorage
- Keyboard friendly (1–6 keys + **S** to hear a correct word)

## How to Run

### Windows (recommended)

1. Double-click `start-game.bat`
2. Browser opens at http://localhost:8080

Requires [Node.js](https://nodejs.org/) (LTS).

### Python alternative

```powershell
cd "C:\Users\hoang\Projects\GermanWordMatching"
python -m http.server 8080
```

Then open http://localhost:8080

### Direct file open

Double-click `index.html` works for small files, but serving over HTTP is more reliable.

## Controls

**Matching game**

- Click / tap the card where German matches English
- **1–6** — select slot
- **S** — speak a correct word (German TTS)

## Project files

| File | Role |
|------|------|
| `index.html` | Main UI |
| `main.js` | Bootstraps the game |
| `picture-game.js` | Matching game + extract/sets logic |
| `vocabulary.js` | CEFR word list (`word`, `article`, `meaning`, `level`) |
| `styles.css` | Styling |
| `server.js` + `start-game.bat` | Local static server |

## Vocabulary schema

```js
{ word: "Haus", article: "das", meaning: "house", level: 1 }
// level: 1=A1, 2=A2, 3=B1, 4=B2, 5=C1, 6=C2
// article: "der" | "die" | "das" | "" (verbs, adjectives, etc.)
```

## Roadmap ideas

- Expand vocabulary toward fuller A1–C2 coverage
- Spaced repetition / flashcards mode
- Custom word import
- Dark mode
- More game modes (typing, article-only drill)

Viel Erfolg beim Deutschlernen!
