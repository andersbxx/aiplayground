// ————— main.js —————
// Orkestrering: settings-sheet → chat → Gemini → demo-kort i chatten.

import { initSettings, loadSettings } from './config.js';
import { callGemini, callGeminiText, listModels } from './gemini.js';

// Sessions-lagring (sparar varje chatt med alla demo-iterationer)
const SESSIONS_KEY = 'AI_SESSIONS';
const ACTIVE_KEY = 'AI_ACTIVE_SESSION';
const MODE_KEY = 'AI_MODE';

// State
const state = {
  settings: null,        // { key, model }
  history: [],           // [{ role, content, kind? }]
  busy: false,
  demoCount: 0,
  sessions: [],          // [{ id, title, ts, updated, history }]
  activeId: null,
  latestDemo: null,      // { html, aim } för preview-panelen (desktop)
  mode: 'build'          // 'build' | 'plan'
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
  closeSheet: $('closeSheet'),
  chatsBtn: $('chatsBtn'),
  chatsDrawer: $('chatsDrawer'),
  chatList: $('chatList'),
  closeDrawer: $('closeDrawer'),
  newChatBtn: $('newChatBtn'),
  modeBygga: $('modeBygga'),
  modePlaner: $('modePlaner'),
  previewPane: $('previewPane'),
  previewTitle: $('previewTitle'),
  previewFrame: $('previewFrame'),
  previewIframe: $('previewIframe'),
  previewEmpty: $('previewEmpty'),
  previewCode: $('previewCode'),
  codeBody: $('codeBody'),
  previewMetaText: $('previewMetaText'),
  pvCodeBtn: $('pvCodeBtn'),
  pvReloadBtn: $('pvReloadBtn'),
  pvCopyBtn: $('pvCopyBtn'),
  pvPopBtn: $('pvPopBtn'),
  pvDlBtn: $('pvDlBtn')
};

// ————— Toast —————
let toastTimer = null;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

// ————— Markdown-rendering (säker: HTML escapes först, bara http(s)/mailto-länkar) —————
function renderMarkdown(src) {
  if (!src) return '';
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) =>
      /^(https?:|mailto:)/i.test(u)
        ? '<a href="' + u.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer nofollow">' + t + '</a>'
        : t);

  const lines = esc(String(src)).split('\n');
  const tokens = [];
  const body = [];
  let i = 0;
  while (i < lines.length) {
    if (/^```/.test(lines[i])) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      if (i < lines.length) i++;
      tokens.push('<pre><code>' + buf.join('\n') + '</code></pre>');
      body.push('\u0000' + (tokens.length - 1) + '\u0000');
    } else {
      body.push(lines[i]);
      i++;
    }
  }

  let html = '';
  let open = null;
  let para = [];
  const closePara = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const closeQuote = () => { if (open === 'quote') { html += '</blockquote>'; open = null; } };
  const closeList = () => { if (open === 'ul') { html += '</ul>'; open = null; } if (open === 'ol') { html += '</ol>'; open = null; } };
  const closeAll = () => { closePara(); closeQuote(); closeList(); };

  for (const raw of body) {
    if (/^\s*$/.test(raw)) { closeAll(); continue; }
    const tok = raw.match(/^\u0000(\d+)\u0000$/);
    if (tok) { closeAll(); html += tokens[+tok[1]] + '\n'; continue; }
    const h = raw.match(/^(#{1,6})\s+(.*)/);
    if (h) { closeAll(); const lvl = h[1].length; html += '<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>'; continue; }
    const q = raw.match(/^&gt;\s?(.*)/);
    if (q) { closePara(); closeList(); if (open !== 'quote') { html += '<blockquote>'; open = 'quote'; } html += inline(q[1]) + '<br>'; continue; }
    const ul = raw.match(/^[-*]\s+(.*)/);
    if (ul) { closePara(); closeQuote(); if (open !== 'ul') { if (open === 'ol') html += '</ol>'; html += '<ul>'; open = 'ul'; } html += '<li>' + inline(ul[1]) + '</li>'; continue; }
    const ol = raw.match(/^(\d+)[.)]\s+(.*)/);
    if (ol) { closePara(); closeQuote(); if (open !== 'ol') { if (open === 'ul') html += '</ul>'; html += '<ol>'; open = 'ol'; } html += '<li>' + inline(ol[2]) + '</li>'; continue; }
    para.push(raw);
  }
  closeAll();
  return html;
}

// ————— Skapa meddelanden —————
function addMessage(role, text, isError) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isError ? ' error' : '');
  if (role === 'ai' && !isError) bubble.innerHTML = renderMarkdown(text);
  else bubble.textContent = text;
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
  const demoN = state.demoCount;
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
        <button class="icon-btn" data-act="dl" title="Ladda ner .html" aria-label="Ladda ner som HTML-fil">
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
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

  // Nyaste demo → preview-panelen (desktop); klick på kortet pinnar den dit
  state.latestDemo = { html, aim: meta, n: demoN };
  syncPreview(state.latestDemo);
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    state.latestDemo = { html, aim: meta, n: demoN };
    syncPreview(state.latestDemo);
    showPreview();
  });
  return card;
}

// ————— Preview-panel (desktop) —————
function showPreview() {
  if (!state.latestDemo) return;
  els.previewEmpty.classList.remove('show');
  els.previewCode.classList.add('hidden');
  els.previewFrame.classList.remove('hidden');
  els.previewIframe.setAttribute('srcdoc', state.latestDemo.html);
  const n = state.latestDemo.n || state.demoCount || '—';
  els.previewTitle.textContent = 'Demo ' + n + ' — ' + state.latestDemo.aim;
  els.previewMetaText.textContent = state.latestDemo.html.length.toLocaleString('sv-SE') + ' tecken · ' + state.latestDemo.aim;
}
function syncPreview(demo) {
  if (!demo || !els.previewPane) return;
  showPreview();
}
function resetPreview() {
  state.latestDemo = null;
  els.previewTitle.textContent = 'Ingen demo vald';
  els.previewMetaText.textContent = '';
  els.previewEmpty.classList.add('show');
  els.previewCode.classList.add('hidden');
  els.previewFrame.classList.remove('hidden');
  els.previewIframe.removeAttribute('srcdoc');
}
function togglePreviewCode() {
  const show = els.previewCode.classList.contains('hidden');
  if (show) {
    els.codeBody.textContent = state.latestDemo ? state.latestDemo.html : '';
    els.previewCode.classList.remove('hidden');
    els.previewFrame.classList.add('hidden');
    els.pvCodeBtn.title = 'Visa demo';
    els.pvCodeBtn.setAttribute('aria-label', 'Visa demo');
  } else {
    els.previewCode.classList.add('hidden');
    els.previewFrame.classList.remove('hidden');
    els.pvCodeBtn.title = 'Visa kod';
    els.pvCodeBtn.setAttribute('aria-label', 'Visa kod');
  }
}
function handlePreviewAction(act) {
  const demo = state.latestDemo;
  if (!demo) return;
  const html = demo.html;
  if (act === 'reload') {
    const old = els.previewIframe;
    const fresh = buildFrameDirect(html);
    fresh.id = 'previewIframe';
    old.parentNode.replaceChild(fresh, old);
    els.previewIframe = fresh;
    toast('Demo omladdad');
  } else if (act === 'copy') {
    copyText(html);
  } else if (act === 'pop') {
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else toast('Popup-blockerare — tillåt popups för den här sidan');
  } else if (act === 'dl') {
    const name = 'demo-' + (state.demoCount || 1) + '.html';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(name + ' laddad ner');
  }
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
  } else if (act === 'dl') {
    const name = `demo-${state.demoCount}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(name + ' laddad ner');
  } else if (act === 'del') {
    card.remove();
    // Ta bort exakt rätt historikpar (demo + dess prompt), även om plan-svar blandats in
    const idx = state.history.map((m) => m.content).lastIndexOf(html);
    if (idx >= 0) {
      const start = (idx >= 1 && state.history[idx - 1].role === 'user') ? idx - 1 : idx;
      state.history.splice(start, (idx - start) + 1);
    }
    commitSession();
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

// ————— Arbetsläge (Bygga / Planera) —————
function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch (_) {}
  els.modeBygga.classList.toggle('active', mode === 'build');
  els.modePlaner.classList.toggle('active', mode === 'plan');
  openChat();
}

// ————— Huvudflöde —————
function openChat() {
  els.emptyState.classList.toggle('show', state.history.length === 0);
  const modeLabel = state.mode === 'plan' ? 'Planera · ' : '';
  els.inputHint.textContent = state.settings
    ? modeLabel + 'Modell · ' + state.settings.model
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
  maybeSetSessionTitle(text);
  const removeDots = typingIndicator();
  setBusy(true);

  try {
    const isPlan = state.mode === 'plan';
    if (isPlan) {
      const { text: reply, model } = await callGeminiText(state.history, text, state.settings.key, state.settings.model);
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'model', content: reply, kind: 'text' });
      if (state.history.length > 40) state.history = state.history.slice(-40);
      commitSession();

      removeDots();
      if (model !== state.settings.model) {
        addMessage('ai', `ℹ️ "${state.settings.model}" var överbelastad — svarade med "${model}" istället.`);
      }
      addPlanReply(reply);
    } else {
      const { html, model } = await callGemini(state.history, text, state.settings.key, state.settings.model);
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'model', content: html });
      if (state.history.length > 40) state.history = state.history.slice(-40);
      commitSession();

      removeDots();
      if (model !== state.settings.model) {
        addMessage('ai', `ℹ️ "${state.settings.model}" var överbelastad — svarade med "${model}" istället.`);
      }
      addDemoCard(html, text);
    }
  } catch (err) {
    removeDots();
    addMessage('ai', err.message, true);
  } finally {
    setBusy(false);
    els.promptInput.focus();
  }
}

// Planläge-svar: vanlig textbubbla + genväg till bygget
function addPlanReply(reply) {
  const wrap = addMessage('ai', reply);
  const bubble = wrap.querySelector('.bubble');
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'build-chip';
  chip.innerHTML = 'Bygg det här <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  chip.addEventListener('click', () => {
    setMode('build');
    toast('Byggläge — beskriv vad jag ska bygga');
    els.promptInput.focus();
  });
  bubble.appendChild(chip);
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
  createSession();
  toast('Ny chatt');
  els.promptInput.focus();
}

// ————— Sessions (sparade chattar) —————
function loadSessions() {
  try { state.sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; }
  catch (_) { state.sessions = []; }
  if (!Array.isArray(state.sessions)) state.sessions = [];
}
function saveSessions() {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions.slice(-50))); }
  catch (_) {}
}
function currentSession() {
  return state.sessions.find((s) => s.id === state.activeId) || null;
}
function commitSession() {
  const s = currentSession();
  if (!s) return;
  s.history = state.history.slice();
  s.updated = Date.now();
  saveSessions();
}
function maybeSetSessionTitle(text) {
  const s = currentSession();
  if (!s || s.title) return;
  const t = (text || '').trim() || 'Ny chatt';
  s.title = t.length > 44 ? t.slice(0, 44) + '…' : t;
}
function createSession() {
  const fresh = { id: 's' + Date.now().toString(36), title: '', ts: Date.now(), updated: Date.now(), history: [] };
  state.sessions.push(fresh);
  state.activeId = fresh.id;
  localStorage.setItem(ACTIVE_KEY, fresh.id);
  state.history = [];
  state.demoCount = 0;
  clearChat();
  openChat();
  saveSessions();
  return fresh;
}
// Tömmer chatten men återskapar empty-state (den är barn av #chatContainer och försvinner annars)
function clearChat() {
  resetPreview();
  els.chatContainer.innerHTML = '';
  const fresh = els.emptyState.cloneNode(true);
  fresh.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => sendPrompt(chip.dataset.prompt));
  });
  els.emptyState = fresh;
  els.chatContainer.appendChild(fresh);
}
// Växlar aktiv session och återskapar hela chatten (meddelanden + demo-kort) från dess historik
function switchActive(s) {
  state.activeId = s.id;
  localStorage.setItem(ACTIVE_KEY, s.id);
  state.history = s.history.slice();
  state.demoCount = 0;
  clearChat();
  let lastUser = '';
  s.history.forEach((m) => {
    if (m.role === 'user') { lastUser = m.content; addMessage('user', m.content); }
    else if (m.kind === 'text') addMessage('ai', m.content);
    else if (m.content && m.content.trim()) addDemoCard(m.content, lastUser);
  });
  openChat();
}
function openChatsDrawer() {
  renderChatList();
  els.chatsDrawer.classList.add('open');
  els.chatsDrawer.setAttribute('aria-hidden', 'false');
}
function closeChatsDrawer() {
  els.chatsDrawer.classList.remove('open');
  els.chatsDrawer.setAttribute('aria-hidden', 'true');
}
function renderChatList() {
  els.chatList.innerHTML = '';
  const list = state.sessions.slice().sort((a, b) => b.updated - a.updated);
  if (!list.length) {
    els.chatList.innerHTML = '<div class="chat-empty">Inga sparade chattar än.<br>De som blir bra sparas här automatiskt.</div>';
    return;
  }
  list.forEach((s) => {
    const item = document.createElement('button');
    item.className = 'chat-item' + (s.id === state.activeId ? ' active' : '');
    const demos = s.history.filter((m) => m.role === 'model' && m.kind !== 'text').length;
    const d = new Date(s.updated);
    const sub = `${demos} demo${demos === 1 ? '' : 's'} · ${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
    const inner = document.createElement('span');
    inner.className = 'chat-item-main';
    inner.innerHTML = `<span class="chat-item-title">${escHtml(s.title || 'Ny chatt')}</span>` +
      `<span class="chat-item-sub">${escHtml(sub)}</span>`;
    item.appendChild(inner);

    const ex = document.createElement('button');
    ex.className = 'chat-item-del';
    ex.title = 'Exportera som Markdown';
    ex.setAttribute('aria-label', 'Exportera chatt som Markdown');
    ex.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
    ex.addEventListener('click', (e) => { e.stopPropagation(); exportSession(s.id); });
    item.appendChild(ex);

    const del = document.createElement('button');
    del.title = 'Ta bort';
    del.setAttribute('aria-label', 'Ta bort den här chatten');
    del.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(s.id); });
    item.appendChild(del);

    item.addEventListener('click', () => loadSession(s.id));
    els.chatList.appendChild(item);
  });
}
function loadSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  switchActive(s);
  closeChatsDrawer();
  toast('Öppnade: ' + (s.title || 'Ny chatt'));
}
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chatt';
}
function exportSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const lines = [];
  lines.push('# ' + (s.title || 'Ny chatt'));
  lines.push('');
  lines.push('*Sparad från AiPlayground · ' + new Date(s.updated).toLocaleString('sv-SE') + '*');
  lines.push('');
  let demoN = 0;
  let promptN = 0;
  s.history.forEach((m) => {
    if (m.role === 'user') {
      promptN++;
      lines.push('## Prompt ' + promptN + ' — Du');
      lines.push('');
      lines.push(m.content);
      lines.push('');
    } else if (m.kind === 'text') {
      lines.push('## AI-svar (planering)');
      lines.push('');
      m.content.split('\n').forEach((l) => lines.push('> ' + (l || '&nbsp;')));
      lines.push('');
    } else if (m.content && m.content.trim()) {
      demoN++;
      lines.push('## Demo ' + demoN + ' — AI-genererad (komplett HTML)');
      lines.push('');
      lines.push('```html');
      lines.push(m.content);
      lines.push('```');
      lines.push('');
    }
  });
  const md = lines.join('\n');
  const name = slugify(s.title || 'chatt') + '.md';
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(name + ' exporterad');
}
function deleteSession(id) {
  const wasActive = state.activeId === id;
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (wasActive) {
    const next = state.sessions.slice().sort((a, b) => b.updated - a.updated)[0] || null;
    if (next) switchActive(next);
    else { state.activeId = null; localStorage.removeItem(ACTIVE_KEY); createSession(); }
  }
  saveSessions();
  renderChatList();
  toast('Chatt borttagen');
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
els.chatsBtn.addEventListener('click', openChatsDrawer);
els.closeDrawer.addEventListener('click', closeChatsDrawer);
document.querySelectorAll('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeChatsDrawer));
els.newChatBtn.addEventListener('click', () => { newSession(); closeChatsDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChatsDrawer(); });

// Preview-panel (desktop)
els.pvReloadBtn.addEventListener('click', () => handlePreviewAction('reload'));
els.pvCopyBtn.addEventListener('click', () => handlePreviewAction('copy'));
els.pvPopBtn.addEventListener('click', () => handlePreviewAction('pop'));
els.pvDlBtn.addEventListener('click', () => handlePreviewAction('dl'));
els.pvCodeBtn.addEventListener('click', togglePreviewCode);

// Arbetsläge
els.modeBygga.addEventListener('click', () => setMode('build'));
els.modePlaner.addEventListener('click', () => setMode('plan'));

// ————— Init —————
const savedMode = localStorage.getItem(MODE_KEY);
if (savedMode === 'plan') setMode('plan');
loadSessions();
fillSettings();
updateModelChip();
const active = state.sessions.find((s) => s.id === localStorage.getItem(ACTIVE_KEY));
if (active) switchActive(active);
else createSession();
// Första körning: inga sparade inställningar → öppna inställningarna direkt
if (!loadSettings().key) {
  openSheet();
}