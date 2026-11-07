/* Icônes du Codex — 7 novembre 2026. Plus d'emoji sur le site : chaque glyphe est
   remplacé par un pictogramme SVG au trait, dans la couleur du texte, qui suit le
   thème. Le module surveille la page : ce que les scripts redessinent est traité
   aussi. Les flèches typographiques (→ ← ↩ ↓ ↗) et les signes ✓ ✗ ○ ● restent du
   texte : ce sont des caractères, pas des emojis. */
(() => {
  const T = (d, vb = 24) => `<svg class="ic" viewBox="0 0 ${vb} ${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    '⚔️': T('<path d="M4 4l11 11"/><path d="M20 4 9 15"/><path d="M4 4h3v3M20 4h-3v3"/><path d="M14 14l5 5M10 14l-5 5"/><path d="M12 12v0"/>'),
    '📄': T('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h8"/>'),
    '📋': T('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 12h8M8 16h5"/>'),
    '🧪': T('<path d="M9 3h6"/><path d="M10 3v6.5L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8.5V3"/><path d="M7.5 15h9"/>'),
    '🎲': T('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/>'),
    '🔍': T('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    '📗': T('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    '📘': T('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7"/>'),
    '💡': T('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
    '✅': T('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    '✔': T('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    '❌': T('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
    '⚠': T('<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>'),
    '⛶': T('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    '🖥': T('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    '🔗': T('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    '▶': T('<path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/>'),
    '⏸': T('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
    '⏳': T('<path d="M6 3h12M6 21h12"/><path d="M7 3v3a5 5 0 0 0 5 6 5 5 0 0 0 5-6V3M7 21v-3a5 5 0 0 1 5-6 5 5 0 0 1 5 6v3"/>'),
    '☰': T('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    '♨': T('<path d="M8 3c0 2-2 3-2 5s2 3 2 5M12 3c0 2-2 3-2 5s2 3 2 5M16 3c0 2-2 3-2 5s2 3 2 5"/><path d="M5 17h14a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4z"/>'),
    '🏆': T('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5"/>'),
    '🥇': T('<circle cx="12" cy="14" r="6"/><path d="M8.5 9 6 2h4l2 5 2-5h4l-2.5 7"/><path d="M11 13l1.5-1v5" />'),
    '🥈': T('<circle cx="12" cy="14" r="6"/><path d="M8.5 9 6 2h4l2 5 2-5h4l-2.5 7"/><path d="M10.5 12.5a1.5 1.5 0 0 1 3 1c0 1-3 2-3 3.5h3"/>'),
    '🥉': T('<circle cx="12" cy="14" r="6"/><path d="M8.5 9 6 2h4l2 5 2-5h4l-2.5 7"/><path d="M10.5 12h3l-1.5 1.8a1.5 1.5 0 1 1-1.5 2.6"/>'),
    '📣': T('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>'),
    '💻': T('<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M2 19h20"/>'),
    '🎉': T('<path d="M4 20 8 7l9 9z"/><path d="M12 3v2M18 4l-1 2M21 10h-2M15.5 2.5l-.5 2"/><path d="M9 12l3 3"/>'),
    '👤': T('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    '☀': T('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    '⚑': T('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
    '☾': T('<path d="M21 13A8 8 0 0 1 11 3a8 8 0 1 0 10 10z"/>'),
  };
  const MOTIF = '(' + Object.keys(I).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?';
  const RE = new RegExp(MOTIF, 'g'), TEST = new RegExp(MOTIF);
  const SAUT = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'INPUT', 'OPTION']);
  function traiter(racine) {
    const it = document.createNodeIterator(racine, NodeFilter.SHOW_TEXT, { acceptNode: n =>
      n.parentNode && !SAUT.has(n.parentNode.tagName) && !n.parentNode.closest('.CodeMirror, pre, code, textarea') && TEST.test(n.nodeValue) ? 1 : 2 });
    const noeuds = []; let n; while ((n = it.nextNode())) noeuds.push(n);
    for (const t of noeuds) {
      const span = document.createElement('span');
      span.innerHTML = t.nodeValue.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(RE, (_, g) => I[g]);
      const frag = document.createDocumentFragment();
      while (span.firstChild) frag.appendChild(span.firstChild);
      t.parentNode.replaceChild(frag, t);
    }
  }
  const style = document.createElement('style');
  style.textContent = 'svg.ic{display:inline-block;vertical-align:-.15em;margin:0 .1em;flex:none}';
  document.head.appendChild(style);
  const demarrer = () => {
    traiter(document.body);
    new MutationObserver(ms => { for (const m of ms) for (const a of m.addedNodes) { if (a.nodeType === 1) traiter(a); else if (a.nodeType === 3 && a.parentNode) traiter(a.parentNode); } })
      .observe(document.body, { childList: true, subtree: true, characterData: false });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', demarrer); else demarrer();
  // le titre de la fenêtre et les attributs title gardent leur texte : sans emoji, ils se lisent très bien
})();
