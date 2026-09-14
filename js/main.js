// ————— main.js —————
// Orkestrering: settings-sheet → chat → Gemini → demo-kort i chatten.

import { initSettings, loadSettings } from './config.js';
import { callGemini, listModels } from './gemini.js';

// State
const state = {
  settings: null,        // { key, model }
  history: [],           // [{ role, content }]
  busy: false,
  demoCount: 0
};

const $ = (id) => document.getElementById(id);
const els = {
  modelChip: $('modelChip'),
  modelChipText: $('modelChipText'),
  chatContainer: $('chatContainer'),
  emptyState: $('emptyState'),
  promptInput: $('promptInput'),
  sendBtn: $('sendBtn'),
  inputHint: $('inputHint'),
  toast: $('toast'),
  settingsSheet: $('settingsSheet'),
  apiKey: $('apiKey'),
  eyeBtn: $('eyeBtn'),
  modelSelect: $('modelSelect'),
  refreshModels: $('refreshModels'),
  modelHint: $('modelHint'),
  customModelGroup: $('customModelGroup'),
  customModel: $('customModel'),
  startBtn: $('startBtn'),
  newBtn: $('newBtn'),
  gearBtn: $('gearBtn'),
  closeSheet: $('closeSheet')
};

// ————— Toast —————
let toastTimer = null;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

// ————— Skapa meddelanden —————
function addMessage(role, text, isError) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isError ? ' error' : '');
  bubble.textContent = text;
  wrap.appendChild(bubble);
  els.chatContainer.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function scrollBottom() {
  const c = els.chatContainer;
  // Bara auto-scroll om användaren redan är nära botten (inte ryck ned från historiken)
  const nearBottom = c.scrollHeight - (c.scrollTop + c.clientHeight) < 140;
  requestAnimationFrame(() => {
    if (nearBottom) c.scrollTop = c.scrollHeight;
  });
}

function typingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const t = document.createElement('span');
  t.className = 'typing';
  for (let i = 0; i < 3; i++) t.appendChild(document.createElement('i'));
  bubble.appendChild(t);
  wrap.appendChild(bubble);
  els.chatContainer.appendChild(wrap);
  scrollBottom();
  return () => wrap.remove();
}

// ————— Demo-kort —————
function addDemoCard(html, aim) {
  state.demoCount++;
  const meta = aim && aim.length > 90 ? aim.slice(0, 90) + '…' : (aim || '');

  const card = document.createElement('article');
  card.className = 'demo';
  card.innerHTML = `
    <div class="demo-toolbar">
      <span class="demo-dots"><i></i><i></i><i></i></span>
      <span class="demo-title">Demo ${state.demoCount} — ${escHtml(meta)}</span>
      <span class="demo-actions">
        <button class="icon-btn" data-act="reload" title="Ladda om" aria-label="Ladda om">⟳</button>
        <button class="icon-btn" data-act="copy" title="Kopiera HTML" aria-label="Kopiera HTML">
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
        <button class="icon-btn" data-act="pop" title="Öppna i ny flik" aria-label="Öppna i ny flik">
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
        </button>
        <button class="icon-btn" data-act="del" title="Ta bort" aria-label="Ta bort">
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </span>
    </div>
    <div class="demo-frame"></div>
    <div class="demo-meta">
      <span class="tag">live</span>
      <span class="demo-aim">${html.length.toLocaleString('sv-SE')} tecken · ${escHtml(meta)}</span>
    </div>`;

  card.querySelector('.demo-frame').appendChild(buildFrameDirect(html));

  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleDemoAction(btn.dataset.act, card, html));
  });

  els.chatContainer.appendChild(card);
  scrollBottom();
  return card;
}

function handleDemoAction(act, card, html) {
  if (act === 'reload') {
    const frame = card.querySelector('.demo-frame');
    const old = frame.querySelector('iframe');
    const fresh = buildFrameDirect(html);
    frame.replaceChild(fresh, old);
    toast('Demo omladdad');
  } else if (act === 'copy') {
    copyText(html);
  } else if (act === 'pop') {
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else toast('Popup-blockerare — tillåt popups för den här sidan');
  } else if (act === 'del') {
    card.remove();
    state.history = state.history.splice(0, state.history.length - 2);
    toast('Demo borttagen');
  }
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildFrameDirect(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts allow-modals');
  frame.setAttribute('title', 'AI-genererad demo');
  frame.setAttribute('srcdoc', html);
  return frame;
}

function copyText(text) {
  const done = () => toast('HTML kopierad');
  const fail = () => {
    // Fallback för icke-secure-context (HTTP)
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('HTML kopierad'); }
    catch (_) { toast('Kunde inte kopiera på HTTP'); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, fail);
  } else fail();
}

// ————— Busy-state —————
function setBusy(on) {
  state.busy = on;
  els.sendBtn.disabled = on;
  els.sendBtn.classList.toggle('busy', on);
  els.promptInput.disabled = on;
}

// ————— Huvudflöde —————
function openChat() {
  els.emptyState.classList.toggle('show', state.history.length === 0);
  els.inputHint.textContent = state.settings
    ? 'Modell · ' + state.settings.model
    : 'Anslut en API-nyckel i inställningarna för att börja';
  scrollBottom();
}

async function sendPrompt(text) {
  if (!text || state.busy) return;
  if (!state.settings || !state.settings.key) {
    toast('Ange API-nyckel i inställningarna först');
    openSheet();
    return;
  }

  els.promptInput.value = '';
  els.emptyState.classList.remove('show');
  addMessage('user', text);
  const removeDots = typingIndicator();
  setBusy(true);

  try {
    const { html, model } = await callGemini(state.history, text, state.settings.key, state.settings.model);
    state.history.push({ role: 'user', content: text });
    state.history.push({ role: 'model', content: html });
    if (state.history.length > 40) state.history = state.history.slice(-40);

    removeDots();
    if (model !== state.settings.model) {
      addMessage('ai', `ℹ️ "${state.settings.model}" var överbelastad — svarade med "${model}" istället.`);
    }
    addDemoCard(html, text);
  } catch (err) {
    removeDots();
    addMessage('ai', err.message, true);
  } finally {
    setBusy(false);
    els.promptInput.focus();
  }
}

// ————— Dynamic model list —————
async function populateModels(force) {
  const key = els.apiKey.value.trim();
  if (!key) { els.modelHint.textContent = ''; return; }
  try {
    els.modelHint.className = 'hint';
    els.modelHint.textContent = 'Hämtar modelllista…';
    const models = await listModels(key, force);
    const savedModel = els.modelSelect.value === 'custom' ? els.customModel.value.trim() : null;

    els.modelSelect.innerHTML = '';
    if (!models.length) {
      els.modelSelect.innerHTML = '<option value="">Inga modeller hittades</option>';
      els.modelHint.textContent = '';
      return;
    }
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      els.modelSelect.appendChild(opt);
    });
    const cust = document.createElement('option');
    cust.value = 'custom'; cust.textContent = 'Eget modell-ID…';
    els.modelSelect.appendChild(cust);

    if (savedModel) {
      const found = models.indexOf(savedModel) !== -1;
      if (found) els.modelSelect.value = savedModel;
      else { els.modelSelect.value = 'custom'; els.customModel.value = savedModel; }
    } else {
      // Stabil default som finns garanterat och svarar när aliassen är överbelastade
      els.modelSelect.value = models.indexOf('gemini-2.5-flash') !== -1 ? 'gemini-2.5-flash' : models[0];
    }
    syncCustomField();
    els.modelHint.textContent = `${models.length} modeller tillgängliga`;
  } catch (e) {
    els.modelHint.className = 'hint error';
    els.modelHint.textContent = `Fel: ${e.message}`;
  }
}

function syncCustomField() {
  const isCustom = els.modelSelect.value === 'custom';
  els.customModelGroup.classList.toggle('hidden', !isCustom);
  els.customModel.disabled = !isCustom;
}

// Populera modelllistan om den är tom men nyckel finns (t.ex. precis inklistrad)
async function ensureModelsLoaded() {
  const key = els.apiKey.value.trim();
  if (!key || key.length <= 10) return false;
  const hasRealOptions = Array.from(els.modelSelect.options).filter(o => o.value && o.value !== 'custom').length > 0;
  if (!hasRealOptions) {
    await populateModels(false);
  }
  return hasRealOptions || els.modelSelect.options.length > 1;
}

function updateModelChip() {
  const m = state.settings && state.settings.model;
  els.modelChipText.textContent = m || 'Ingen modell';
  els.modelChip.classList.toggle('ready', !!m);
}

// ————— Settings sheet —————
function openSheet() {
  els.settingsSheet.classList.add('open');
  els.settingsSheet.setAttribute('aria-hidden', 'false');
  // Om nyckel finns men listan aldrig fylldes (t.ex. sparad sedan tidigare), fyll på direkt
  ensureModelsLoaded();
}
function closeSheet() { els.settingsSheet.classList.remove('open'); els.settingsSheet.setAttribute('aria-hidden', 'true'); }

function fillSettings() {
  const s = loadSettings();
  if (s.key) {
    els.apiKey.value = s.key;
    populateModels(false);
  }
}

async function saveSession() {
  const key = els.apiKey.value.trim();
  if (!key) {
    toast('Fyll i din API-nyckel');
    els.apiKey.focus();
    return;
  }

  // Se till att modelllistan finns innan vi läser av valet (snabb timeout)
  els.startBtn.disabled = true;
  els.startBtn.textContent = 'Hämtar modeller…';
  try {
    await ensureModelsLoaded();
  } catch (_) {}
  els.startBtn.disabled = false;
  els.startBtn.textContent = 'Spara & börja bygga';

  const model = els.modelSelect.value === 'custom'
    ? (els.customModel.value.trim() || 'gemini-2.5-flash')
    : (els.modelSelect.value || els.customModel.value.trim() || 'gemini-2.5-flash');

  state.settings = initSettings(key, model);
  updateModelChip();
  closeSheet();
  openChat();
  toast('Redo att bygga ✨');
  els.promptInput.focus();
}

function newSession() {
  state.history = [];
  state.demoCount = 0;
  els.chatContainer.innerHTML = '';
  openChat();
  toast('Ny session');
  els.promptInput.focus();
}

// ————— Event wiring —————
els.sendBtn.addEventListener('click', () => sendPrompt(els.promptInput.value.trim()));
els.promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) sendPrompt(els.promptInput.value.trim());
});
els.newBtn.addEventListener('click', newSession);
els.gearBtn.addEventListener('click', openSheet);
els.modelChip.addEventListener('click', openSheet);
els.closeSheet.addEventListener('click', closeSheet);
document.querySelectorAll('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSheet));
els.startBtn.addEventListener('click', saveSession);
els.eyeBtn.addEventListener('click', () => {
  const isPass = els.apiKey.type === 'password';
  els.apiKey.type = isPass ? 'text' : 'password';
});
els.refreshModels.addEventListener('click', () => populateModels(true));
els.modelSelect.addEventListener('change', syncCustomField);
els.apiKey.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) saveSession();
});
els.apiKey.addEventListener('blur', () => {
  const key = els.apiKey.value.trim();
  if (key && key.length > 10) populateModels(false);
});
document.querySelectorAll('#suggestChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => sendPrompt(chip.dataset.prompt));
});

// ————— Init —————
fillSettings();
updateModelChip();
openChat();
// Första körning: inga sparade inställningar → öppna inställningarna direkt
if (!loadSettings().key) {
  openSheet();
}