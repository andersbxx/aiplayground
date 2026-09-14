// ————— config.js —————
// Hanterar API-nyckel och modellval i localStorage.

/** Sparar nyckel + modell i localStorage. */
export function initSettings(apiKey, modelId) {
  if (apiKey) localStorage.setItem('AI_KEY', apiKey);
  if (modelId) localStorage.setItem('AI_MODEL', modelId);
  return { key: localStorage.getItem('AI_KEY'), model: localStorage.getItem('AI_MODEL') };
}

/** Hämtar sparade inställningar. */
export function loadSettings() {
  return {
    key: localStorage.getItem('AI_KEY'),
    model: localStorage.getItem('AI_MODEL')
  };
}

/** Rensar sparade inställningar. */
export function clearSettings() {
  localStorage.removeItem('AI_KEY');
  localStorage.removeItem('AI_MODEL');
}