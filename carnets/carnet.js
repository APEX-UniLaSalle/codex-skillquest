/* Carnets du Codex : un notebook Jupyter converti en page, exécuté dans le navigateur.

   Écrit le 23 octobre 2026. Les pages sont produites par
   ClashOfCode/construire_carnets.py, une par notebook des cours. Elles ne sont
   reliées à rien dans le Codex : seule l'adresse directe y mène.

   Comme dans Jupyter : les cellules de code partagent les mêmes variables, on
   les exécute une à une ou toutes, dans l'ordre. Python tourne dans un Worker,
   avec Pyodide, comme sur la page Python du Codex. Les sorties enregistrées
   dans le notebook s'affichent tant que la cellule n'a pas été exécutée.

   Le code Python d'appui est dans carnets/py/ : codex_carnet.py exécute une
   cellule ; knapsack, tqdm, pysat et IPython y sont remplacés par des modules
   en Python pur, absents de Pyodide ou sans objet dans le navigateur. */
(() => {
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  const MODULES = ['codex_carnet.py', 'knapsack.py', 'tqdm.py', 'pysat/__init__.py', 'pysat/solvers.py',
                   'IPython/__init__.py', 'IPython/display.py'];
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const donnees = JSON.parse($('#cDonnees').textContent);
  const base = new URL('py/', location.href).href;

  /* Le Worker : Pyodide, puis les modules d'appui écrits dans son système de fichiers. */
  const SOURCE_WORKER = `
importScripts('${PYODIDE}pyodide.js');
let py = null;
async function demarrer(base, modules) {
  py = await loadPyodide({ indexURL: '${PYODIDE}' });
  py.FS.mkdirTree('/home/pyodide/codex/pysat'); py.FS.mkdirTree('/home/pyodide/codex/IPython');
  for (const m of modules) {
    const r = await fetch(base + m);
    py.FS.writeFile('/home/pyodide/codex/' + m, await r.text());
  }
  try { await py.loadPackage('ssl'); } catch (e) {}
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/codex'); import codex_carnet; codex_carnet.preparer()");
}
onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.type === 'init') { await demarrer(m.base, m.modules); postMessage({ type: 'pret' }); return; }
    if (m.type === 'run') {
      const emettre = (genre, donnee) => postMessage({ type: 'sortie', id: m.id, genre, donnee: donnee == null ? '' : String(donnee) });
      try { await py.loadPackagesFromImports(m.code); } catch (e) { /* paquet inconnu : l'erreur viendra de l'import */ }
      py.globals.get('codex_carnet').executer(m.code, emettre);
      postMessage({ type: 'fin', id: m.id });
    }
  } catch (e) {
    postMessage({ type: 'sortie', id: m.id, genre: 'erreur', donnee: String(e && e.message || e) });
    postMessage({ type: 'fin', id: m.id });
  }
};`;

  let worker = null, pret = null, compteur = 0, enCours = null;
  const attentes = new Map();
  const etat = t => { $('#cEtat').textContent = t; };

  function lancerWorker() {
    worker = new Worker(URL.createObjectURL(new Blob([SOURCE_WORKER], { type: 'text/javascript' })));
    pret = new Promise((ok, ko) => {
      worker.onmessage = ev => {
        const m = ev.data;
        if (m.type === 'pret') { etat('Python est prêt.'); ok(); return; }
        const c = attentes.get(m.id);
        if (!c) return;
        if (m.type === 'sortie') c.recevoir(m.genre, m.donnee);
        if (m.type === 'fin') { attentes.delete(m.id); c.finir(); }
      };
      worker.onerror = e => { etat('Python n’a pas pu se charger : ' + (e.message || 'erreur inconnue')); ko(e); };
    });
    etat('Chargement de Python… quelques secondes la première fois.');
    worker.postMessage({ type: 'init', base, modules: MODULES });
  }

  function redemarrer() {
    if (worker) worker.terminate();
    worker = null; pret = null; compteur = 0;
    for (const c of attentes.values()) c.finir(true);
    attentes.clear();
    document.querySelectorAll('.c-num').forEach(n => { n.textContent = '[ ]'; });
    etat('Python est arrêté. Les variables sont effacées.');
  }

  /* Une sortie de cellule : texte, image, résultat, erreur. */
  function ajouter(zone, genre, donnee) {
    // clear_output(wait=True) : l'effacement attend la sortie suivante, comme dans Jupyter
    if (genre === 'clear') { if (donnee === 'wait') zone.dataset.attente = '1'; else zone.innerHTML = ''; return; }
    if (zone.dataset.attente) { zone.innerHTML = ''; delete zone.dataset.attente; }
    if (genre === 'image') {
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,' + donnee; img.alt = 'Figure';
      zone.appendChild(img); return;
    }
    const classe = genre === 'erreur' ? 'c-err' : genre === 'stderr' ? 'c-stderr' : genre === 'resultat' ? 'c-res' : 'c-out';
    const dernier = zone.lastElementChild;
    if (dernier && dernier.tagName === 'PRE' && dernier.dataset.genre === genre && genre !== 'resultat') {
      dernier.textContent += donnee; return;
    }
    const pre = document.createElement('pre');
    pre.className = classe; pre.dataset.genre = genre; pre.textContent = donnee;
    zone.appendChild(pre);
  }

  async function executer(cellule) {
    if (!worker) lancerWorker();
    const { editeur, zone, num, bouton } = cellule;
    num.textContent = '[*]'; bouton.disabled = true;
    zone.classList.remove('c-enregistree'); zone.innerHTML = '';
    try { await pret; } catch (e) { num.textContent = '[ ]'; bouton.disabled = false; return false; }
    const id = ++compteur;
    return new Promise(fin => {
      let erreur = false;
      attentes.set(id, {
        recevoir: (genre, donnee) => { if (genre === 'erreur') erreur = true; ajouter(zone, genre, donnee); },
        finir: (arrete) => { delete zone.dataset.attente; num.textContent = arrete ? '[ ]' : `[${id}]`; bouton.disabled = false; fin(!erreur && !arrete); },
      });
      worker.postMessage({ type: 'run', id, code: editeur.getValue() });
    });
  }

  /* Le rendu de la page */
  const carnet = $('#carnet');
  const cellules = [];
  marked.setOptions({ mangle: false, headerIds: true });
  for (const c of donnees.cellules) {
    if (c.type === 'md') {
      const d = document.createElement('div');
      d.className = 'c-md';
      d.innerHTML = marked.parse(c.source);
      d.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
      carnet.appendChild(d);
      continue;
    }
    const bloc = document.createElement('section');
    bloc.className = 'c-cellule';
    bloc.innerHTML = `<div class="c-barre"><button class="c-exec" title="Exécuter (Maj + Entrée)">▶</button><span class="c-num">[ ]</span></div>
      <div class="c-corps"><div class="c-code"></div><div class="c-sortie"></div></div>`;
    const zone = bloc.querySelector('.c-sortie');
    if (c.sorties.length) {
      zone.classList.add('c-enregistree');
      zone.dataset.titre = 'Sortie enregistrée dans le notebook';
      c.sorties.forEach(o => ajouter(zone, o.genre, o.donnee));
    }
    let hote = bloc;
    if (c.correction) {
      const det = document.createElement('details');
      det.className = 'c-correction';
      det.innerHTML = '<summary>Afficher la correction</summary>';
      det.appendChild(bloc);
      hote = det;
    }
    carnet.appendChild(hote);
    const editeur = CodeMirror(bloc.querySelector('.c-code'), {
      value: c.source, mode: 'python', lineNumbers: true, indentUnit: 4, viewportMargin: Infinity,
      extraKeys: { 'Shift-Enter': () => executer(cellule), Tab: cm => cm.execCommand('insertSoftTab') },
    });
    const cellule = { editeur, zone, num: bloc.querySelector('.c-num'), bouton: bloc.querySelector('.c-exec') };
    cellule.bouton.onclick = () => executer(cellule);
    if (c.correction) hote.addEventListener('toggle', () => editeur.refresh());
    cellules.push(cellule);
  }

  $('#cTout').onclick = async () => {
    const b = $('#cTout'); b.disabled = true;
    for (const c of cellules) await executer(c);
    b.disabled = false;
  };
  $('#cRedemarrer').onclick = redemarrer;
  document.title = (document.querySelector('.c-md h1, .c-md h2') || { textContent: document.title }).textContent.trim() + ' — Le Codex';
})();
