# AGENTS.md - AI Playground (AiPlayground)

Handledning för AI-assistenter och utvecklare som arbetar med detta repo.

## Projektöversikt

Webb-app (ingen backend) för att testa AI-driven prototyping via Gemini Flash. Allt körs klient-side i webbläsaren. Målgruppsplattform: Chromebook med Chrome + iPhone Safari.

## Kommandon

```bash
# Starta lokal dev-server (i Crostini Linux-container)
python3 -m http.server 8000

# Öppna i Chromebooks Chrome:
# http://penguin.linux.test:8000
# Eller via port-forwarding: http://<chromebook-IP>:8000
```

## Projektstruktur

- **Vanilla JS** — inga ramverk, inga dependencies, inga build-steg
- `index.html` laddar `main.js` som ES-modul; modulerna importerar varandra
- CSS använder dark glassmorphism-tema med `#070a10`-bakgrund, safe-area (`dvh`, `env(safe-area-inset-*)`)
- Alla filer är PWA-kompatibla: `manifest.json`, `sw.js`, `icons/`
- Gemini API-nyckel + modellnamn sparas i localStorage (raderas efter ~7 dagar på iOS p.g.a. ITP)
- **Modellistan hämtas dynamiskt** via `listModels(apiKey)` direkt från Gemini API:n och cachas i 24 h (uppdateras via ↻-knappen)
- **Automatisk fallback:** `callGemini` provar vald modell först; vid 503/429 (överbelastning) testas `FALLBACKS` direkt (`gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-lite`, `gemini-flash-lite-latest`) och användaren informeras via chatten vilken modell som svarade. Default = `gemini-2.5-flash` (stabilt alias som inte 503:ar som `gemini-flash-latest` gör).
- **Sessions:** varje chatt sparas automatiskt (prompts + demo-HTML) i localStorage `AI_SESSIONS` (aktiv = `AI_ACTIVE_SESSION`). "Mina chattar" (☰) öppnar/sparar/raderar; varje tur commitas via `commitSession()`. `clearChat()` återskapar emptyState (som är barn av `#chatContainer` och annars försvinner vid rensning).
- **Export:** varje session kan laddas ner som Markdown (`exportSession`) med prompts + demos som ```html-block, för att mata vidare i en annan AI. Demo-korten har också nedladdning av enstaka `.html` (data-act="dl", blob + a.download).
- **Desktop ≥ 900 px:** `.workspace` (row) med `.chat-col` (chatt, ~38vw) + `.preview-pane` (höger, stor demo-vy). Demo-korten i chatten komprimeras till titelrad (`nth-child` i CSS). Klick på ett demo-kort pinnar det till preview (`syncPreview`/`showPreview`, `state.latestDemo`). Kodvyn är en read-only toggle (`pvCodeBtn` → `togglePreviewCode`, textContent, aldrig innerHTML). Mobil = exakt samma single-column UX (preview `display:none`).
- **Två arbetslägen** (`.mode-row` pill-knappar ovanför input): **Bygga** (default) = nuvarande flöde → komplett HTML-demo. **Planera** = `callGeminiText` (system-prompt `PLAN_PROMPT`, `responseMimeType: text/plain`) svarar med text, ingen demo. Modell-meddelanden i historiken märks `kind:'text'` för plan-svar (resten tolkas som demo). Vid `switchActive`/export skiljs de åt (plan-svar = bubbla/blockquote). `state.mode` + `setMode()` persisteras i `localStorage` `AI_MODE`. Plan-bubblan har en "Bygg det här"-chip som växlar till byggläge. Båda lägena delar samma fallback-kedja (503/429) i `generateWithFallback`.

## UI-arkitektur

- **Single-view:** toppbar (logo, NY-session, inställningar) + modell-chip + chattråd + botten-input
- **Demo-kort injiceras rakt i chatten** (`main.js addDemoCard`): faux webbläsarchrome med trafikljus + trådåtgärder (ladda om/kopiera HTML/öppna i ny flik/radera)
- Settings är ett **slide-up-sheet** (`.modal > .sheet`), inte en separat vy
- Tomt-läge med förslags-chips; typing-indikator via animerade prickar; toasts för bekräftelser
- `buildFrameDirect(html)` skapar sandboxad iframe (`sandbox="allow-scripts allow-modals"`, `srcdoc`)
- `copyText()` faller tillbaka på execCommand för icke-secure-context (HTTP)

## Konventioner

- System-prompt: "ALLTID returnera en komplett, self-contained HTML-sida i json-fältet 'html'. Inga diffar, inga partials."
- Gemini returnerar JSON med `responseMimeType: 'application/json'`: `{ "html": "..." }` där html är en komplett sida med inline CSS/JS
- Konversationshistorik skickas med varje anrop för att feedback ska fungera utan omförklaring
- Koden i sandboxad iframe får INTE räkna med appens localStorage (omöjligt via sandbox)

## Verifiering

1. `python3 -m http.server 8000` i Crostini
2. Öppna `http://penguin.linux.test:8000` i Chromebooks Chrome
3. Skriv prompt → Gemini svarar → iframes rendreras
4. "byt till dark mode" → ny sida renderas