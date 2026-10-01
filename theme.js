/* Jour / nuit du Codex. Le choix est gardé sur le poste ; sans choix, le
   navigateur décide (prefers-color-scheme). Chargé dans <head>, avant le style
   de la page, pour que le thème soit posé avant le premier rendu. */
(() => {
  const CLE = 'codex_theme';
  const lire = () => { try { return localStorage.getItem(CLE); } catch (e) { return null; } };
  const systeme = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const poser = t => {
    document.documentElement.dataset.theme = t;
    const b = document.getElementById('themeBtn');
    if (b) { b.textContent = t === 'dark' ? '☀ Jour' : '☾ Nuit'; b.title = t === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'; }
  };
  const choix = lire();
  poser(choix === 'dark' || choix === 'light' ? choix : systeme());
  // sans choix sur le site, la page suit le système quand il bascule
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const c = lire(); if (c !== 'dark' && c !== 'light') poser(systeme());
  });
  window.addEventListener('DOMContentLoaded', () => {
    const zone = document.getElementById('status') || document.querySelector('header');
    if (!zone) return;
    const b = document.createElement('button');
    b.id = 'themeBtn'; b.type = 'button';
    b.onclick = () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(CLE, t); } catch (e) {}
      poser(t);
    };
    zone.appendChild(b);
    poser(document.documentElement.dataset.theme);
  });
})();
