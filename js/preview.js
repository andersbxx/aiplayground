// ————— preview.js —————
// Renderar AI-genererad HTML i en sandboxad iframe.

/**
 * Renderar en HTML-sträng i en iframe med sandbox (isolering från appen).
 * @param {string} html           Komplett HTML-sida
 * @param {HTMLElement} wrapper   Element som iframe:n placeras i
 */
export function renderPreview(html, wrapper) {
  // Skapa (eller återanvänd) iframe
  let frame = wrapper.querySelector('iframe');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals');
    frame.setAttribute('title', 'AI-genererad demo');
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = 'none';
    frame.style.minHeight = '300px';
    wrapper.replaceChildren(frame);
  }

  // Sätt srcdoc och återställ scroll
  frame.setAttribute('srcdoc', html);
  // Meh: scroll bar görs om efter nästa animation
  requestAnimationFrame(() => {
    try {
      frame.contentWindow.scrollTo(0, 0);
    } catch (_) {}
  });
}