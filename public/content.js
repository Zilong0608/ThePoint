/* Shared, deliberately small article format. Raw HTML is always displayed as text. */
(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function safeUrl(value, image) {
    const url = String(value || '').trim();
    if (/[\s\\\u0000-\u001f]/.test(url)) return '';
    if (/^https?:\/\//i.test(url)) {
      try { const parsed = new URL(url); return parsed.username || parsed.password ? '' : parsed.href; } catch (_) { return ''; }
    }
    if (image) return /^(?:\/?)(?:uploads|media)\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes('..') ? url : '';
    return /^(?:[a-zA-Z0-9_-]+\.html(?:[?#][^\s]*)?|#[\w-]+)$/.test(url) ? url : '';
  }
  function inline(value) {
    // Parse links before escaping, and never accept markup inside their labels.
    return String(value).split(/(\[[^\]\n]+\]\([^\s)]+\))/g).map(part => {
      const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) { const url = safeUrl(m[2]); return url ? `<a href="${esc(url)}" rel="noopener noreferrer">${esc(m[1])}</a>` : esc(m[1]); }
      return esc(part).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    }).join('');
  }
  function render(text, format) {
    if (format !== 'markdown') return String(text || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = []; let paragraph = [], list = [];
    const flushP = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } };
    const flushL = () => { if (list.length) { out.push('<ul>' + list.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); list = []; } };
    for (const line of lines) {
      const image = line.match(/^!\[([^\]]*)\]\(([^\s)]+)\)$/);
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) { flushP(); list.push(bullet[1]); continue; }
      flushL();
      if (!line.trim()) { flushP(); continue; }
      if (image) {
        flushP(); const url = safeUrl(image[2], true);
        if (url) out.push(`<figure><img src="${esc(url)}" alt="${esc(image[1])}" loading="lazy">${image[1] ? `<figcaption>${esc(image[1])}</figcaption>` : ''}</figure>`);
      } else if (heading) { flushP(); const level = heading[1].length + 1; out.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
      else paragraph.push(line);
    }
    flushP(); flushL(); return out.join('');
  }
  const api = { esc, safeUrl, render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TPContent = api;
})(typeof window === 'undefined' ? globalThis : window);
