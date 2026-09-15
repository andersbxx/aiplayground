# AiPlayground

A client-side AI playground for building and iterating on working web demos with Gemini — no backend, no build step, runs entirely in the browser.

Describe what you want → Gemini produces a complete, self-contained HTML page → it runs instantly in a sandboxed iframe. Iterate with natural-language feedback ("switch to dark mode", "make the cards smaller") until it's right. Every session is saved automatically.

**Live:** https://andersbxx.github.io/aiplayground/

## Features

- **Two work modes:** *Bygga* (Build) produces a full HTML demo; *Planera* (Plan) discusses the idea as text first, with a "Bygg det här" shortcut into Build mode.
- **Automatic model fallback:** on 503/429 overload, `callGemini` retries across a list of flash models and tells you which one answered.
- **Sessions:** "Mina chattar" stores every chat with all demo iterations in `localStorage`.
- **Desktop view:** two panels (≥ 900 px) — chat + a large live preview pane with a read-only code view; clicking a demo card pins it.
- **Export as Markdown / import:** download a session as `.md`, and re-import it any time via a file picker or drag & drop (desktop).
- **Installable PWA:** offline-cached with a service worker; works from the iPhone home screen.

## Getting started

```bash
cd AiPlayground
python3 -m http.server 8000
# Crostini:            http://penguin.linux.test:8000
# Local browser:       http://localhost:8000
```

1. Open settings (gear icon) and paste your Gemini API key.
2. Type a prompt — Build mode (\*Bygga\*) is the default.
3. Refine: type "byt till mörkt tema" → a new version renders below.

> The API key and model live only in `localStorage` on your device — never commit or share your key.

## Architecture

- **Vanilla JavaScript** (ES modules) — no frameworks, no libraries, no build step.
- `index.html` loads `js/main.js` (orchestration, chat, sessions) which imports `gemini.js` (API + fallback chain) and `config.js` (key/model settings). `js/preview.js` handles the desktop preview pane.
- Demos are complete HTML documents rendered in a sandboxed iframe (`sandbox="allow-scripts allow-modals"`, `srcdoc`).
- **`localStorage`:** sessions (`AI_SESSIONS`, active `AI_ACTIVE_SESSION`), settings (`AI_KEY`/`AI_MODEL`), work mode (`AI_MODE`).
- Dark glassmorphism theme, safe-area aware (`dvh`, `env(safe-area-inset-*)`).

## Markdown export/import format

Each exported session is a Markdown file with a title header and `##`-sections; importing parses the exact same format:

````markdown
# My session title

*Sparad från AiPlayground · …*

## Prompt 1 — Du
your original prompt

## AI-svar (planering)            <- plan-mode replies (blockquoted)
> the plan text

## Demo 1 — AI-genererad (komplett HTML)
```html
<complete, self-contained html>
```
````

Every section is optional; unrecognized sections are skipped on import. The round trip (export → import → restore) is verified by headless tests. See `ANVÄNDARGUIDE.md` for usage.

## Development

```bash
# Local dev server
python3 -m http.server 8000

# Syntax check all JS (requires python3 + esprima)
pip install --user --break-system-packages esprima
python3 -c "import esprima,glob; [esprima.parseModule(open(f).read()) for f in glob.glob('js/*.js')]; print('OK')"
```

Whenever **app assets change**, bump `CACHE_NAME` in `sw.js` (currently `aiplayground-v12`) so the service worker ships the new files.

See `AGENTS.md` for conventions and `ANVÄNDARGUIDE.md` (Swedish) for end-user instructions.