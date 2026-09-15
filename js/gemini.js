// ————— gemini.js —————
// Wrapper för Gemini REST API med JSON-svar.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS_CACHE_KEY = 'AI_MODELS_CACHE';
const MODELS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

/**
 * Hämtar giltiga modeller för en API-nyckel direkt från Gemini API:n.
 * Resultatet cachas i localStorage i 24 h (uppdateras via "Uppdatera"-knappen).
 * @returns {Promise<string[]>} Modellnamn som stödjer generateContent.
 */
export async function listModels(apiKey, force) {
  if (!apiKey) return [];

  // Försök cache (inte om force=true)
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) || 'null');
      if (cached && cached.ts && Date.now() - cached.ts < MODELS_CACHE_TTL) {
        return cached.models;
      }
    } catch (_) {}
  }
  const url = `${API_BASE}?key=${apiKey}&pageSize=1000`;
  let data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000); // 10 s timeout
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('fetch failed: ' + res.status);
    data = await res.json();
  } catch (_) {
    // Nätverksfel eller timeout → fallback till cache även om den är gammal
    try {
      const cached = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) || 'null');
      if (cached && cached.models) return cached.models;
    } catch (__) {}
    throw new Error('kunde inte hämta modelllista (nätverk eller timeout)');
  }

  const models = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
    .map((m) => m.name.replace('models/', ''))
    .sort();

  if (models.length) {
    try {
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ ts: Date.now(), models }));
    } catch (_) {}
  }
  return models;
}

/** System-prompt: talar om för modellen att alltid returnera komplett HTML i JSON. */
export const SYSTEM_PROMPT = [
  'Du är en hjälpsam AI som bygger kompletta, self-contained HTML-sidor för en demo-visare.',
  'Du svarar ALLTID med ren JSON enligt schemat: { "html": "<hel komplett HTML-sida>" }.',
  'HTML:n ska vara helt självständig med allt CSS och JS inlinat i samma fil.',
  'Returnera ALLTID hela den uppdaterade sidan — aldrig diffar, aldrig fragment, aldrig text utanför JSON.',
  'iframe som visar din kod körs med sandbox (allow-scripts, ingen same-origin).',
  'Därför: INTE använda localStorage/sessionStorage/cookies i <script> (kastar SecurityError).',
  'Om du behåller tillstånd, håll det i minnet eller i variabler inom din sida.',
  'Anpassa alltid efter användarens senaste feedback och ändringar i historiken.'
].join('\n');

/** System-prompt för planeringsläge: utforska idén, bygg inget. */
export const PLAN_PROMPT = [
  'Du är en AI-planerare som hjälper en "vibe-coding"-utvecklare att tänka klart innan bygge.',
  'Du BYGGER INTE kod nu — ingen HTML, ingen JSON, inga demos.',
  'Ditt jobb: utforska och förtydliga idén, ställ klargörande frågor, föreslå struktur, funktioner och upplägg.',
  'Svara på svenska i korta, läsbara stycken med punktlistor när det passar.',
  'Avsluta gärna med en sammanfattning av vad du tänker bygga och fråga om du ska sätta igång.',
  'Användaren växlar till byggläge när idén är tillräckligt tydlig.'
].join('\n');

/** Modeller som används som reserv när den valda är överbelastad (503) eller kvot-slu t (429). */
const FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest'
];

/**
 * Skickar hela konversationen till Gemini och returnerar en komplett HTML-demo.
 * Försöker vald modell först; vid 503/429 provar FALLBACKS automatiskt.
 * @param {Array<{role: 'user'|'model', content: string}>} history
 * @param {string} userMessage
 * @param {string} apiKey
 * @param {string} modelId
 * @returns {Promise<{html: string, model: string}>}
 */
export async function callGemini(history, userMessage, apiKey, modelId) {
  return generateWithFallback(history, userMessage, apiKey, modelId, SYSTEM_PROMPT, 'application/json');
}

/**
 * Planeringsläge: samma historik/stabilitet, men svarar med vanlig text (ingen kod).
 * @returns {Promise<{text: string, model: string}>}
 */
export async function callGeminiText(history, userMessage, apiKey, modelId) {
  return generateWithFallback(history, userMessage, apiKey, modelId, PLAN_PROMPT, 'text/plain');
}

async function generateWithFallback(history, userMessage, apiKey, modelId, systemPrompt, mime) {
  const chain = [modelId, ...FALLBACKS.filter((m) => m !== modelId)];
  let lastError = null;

  for (const current of chain) {
    try {
      const content = await generateOnce(history, userMessage, apiKey, current, systemPrompt, mime);
      return { ...content, model: current };
    } catch (e) {
      lastError = e;
      // Bara retrya överbelastning/kvotfel; övriga fel är dödliga direkt
      if (e.status !== 503 && e.status !== 429) throw e;
    }
  }
  throw lastError || new Error('Inga modeller svarade.');
}

async function generateOnce(history, userMessage, apiKey, modelId, systemPrompt, mime) {
  const url = `${API_BASE}/${modelId}:generateContent?key=${apiKey}`;

  const contents = [
    ...history.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      responseMimeType: mime,
      temperature: 0.7
    }
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Nätverksfel: kunde inte nå Gemini. Kontrollera internetanslutningen.');
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch (_) {}
    const status = response.status;
    if (status === 400) throw new Error(`400 Bad Request — kontrollera att modell-ID är giltigt: ${modelId}\n${detail.slice(0, 300)}`);
    if (status === 403) throw new Error(`403 Forbidden — API-nyckeln saknas eller är ogiltig.`);
    if (status === 429 || status === 503) {
      const e = new Error(`${status === 429 ? '429 Too Many Requests' : '503 överbelastad'} — modellen "${modelId}" just nu.`);
      e.status = status;
      throw e;
    }
    throw new Error(`Gemini API-fel (${status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const candidate = data && data.candidates && data.candidates[0];
  const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
  const text = part && part.text;
  if (!text) {
    throw new Error('Inget innehåll i Gemini-svaret. Försök igen.');
  }

  // Planläge: svara med rå text, inte JSON
  if (mime === 'text/plain') return { text };

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.html === 'string' && parsed.html.trim().length > 0) {
      return { html: parsed.html };
    }
  } catch (_) {}

  throw new Error('Gemini returnerade inte giltig JSON. Testa en annan modell.');
}