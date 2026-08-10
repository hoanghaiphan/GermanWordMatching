# AGENTS.md — GermanWordMatching

Project rules for agents. Parent `Projects/AGENTS.md` still applies; this file wins on conflict.

## Product outcome

Static **CEFR German vocab matching** site: readings → extract words → fix pictures/meanings → play. Shared images/content via Supabase when configured. Feature parity target: **ChineseWordMatching**.

## Non-goals (unless asked)

- Rebuilding entire `vocabulary.js` bulk data without a dedicated task
- Flashcards revival

## Stack constraints

- Vanilla HTML / CSS / JS, no bundler
- Serve via `node server.js` or `start-game.bat` (not `file://`)
- Keep secrets out of git: `config.example.js` / local `config.js`
- German word schema: `{ word, article, meaning, level }` (not hanzi/pinyin)

## Quality bar (parity with Chinese)

1. Boot shell until vocab/init succeeds  
2. CEFR + Preview first-class; fix pictures before play  
3. Unknown words appear in extract with **Add** / **Image**  
4. Today’s reading: each click **forceNew**  
5. **Vaporwave** theme toggle (`gwm-theme-vaporwave` in localStorage)  
6. Toasts over alerts when `showAppToast` exists  
7. **Extract level filters must work** — HTML uses `.level-filters` / `.hsk-levels`; empty selection ≠ all levels  
8. Vocabulary is **study-first**: `tier: "core"` for sets, `tier: "extra"` for broad extract; rebuild with `node rebuild-vocabulary.js`

## Validate

```powershell
cd GermanWordMatching
node --check picture-game.js
node --check main.js
node server.js 8080
```

Smoke: boot → menu → sets Preview → readings New reading ×2 → extract + Add → Play → theme toggle.
