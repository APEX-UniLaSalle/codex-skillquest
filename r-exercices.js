/* r-exercices.js — exercices R testés, pour les pages du parcours de démarrage R
   (TD 1, TD 2). Écrit le 4 novembre 2026.

   La page déclare window.TD = { preparation: ['agro', 'sante'], exercices: [...] }
   puis charge ce module. Chaque exercice :
     id, titre, consigne (HTML), prelude (code R exécuté avant celui de
     l'étudiant, invisible), depart (code proposé dans l'éditeur), corrige,
     verifs   : [{ test: 'expression R qui doit valoir TRUE', msg: 'ce qui est vérifié' }],
     appels   : fonctions que le code doit appeler (['hist']),
     interdits: fonctions que le code ne doit pas appeler (['mean', 'sd']),
     graphique: true si un graphique doit être produit.
   R s'exécute dans le navigateur par WebR, comme sur la page r.html. Les
   fichiers CSV de la préparation sont écrits dans le dossier de travail de R,
   à partir des jeux de données du Codex (data/r.json). */
import { WebR, ChannelType } from 'https://webr.r-wasm.org/latest/webr.mjs';

const TD = window.TD || { exercices: [] };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const litteral = s => '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
const sansCommentaires = code => code.split('\n').map(l => l.replace(/#.*$/, '')).join('\n');
const appelle = (code, f) => new RegExp('(^|[^\\w.])' + f.replace('.', '\\.') + '\\s*\\(').test(sansCommentaires(code));
let webR = null, shelter = null, pret = false;

const OUTILS = String.raw`
.td_env <- function(prelude) {
  e <- new.env(parent = globalenv())
  if (nzchar(prelude)) eval(parse(text = prelude), envir = e)
  e
}
.td_run <- function(prelude, code) {
  e <- .td_env(prelude)
  for (expr in parse(text = code)) {
    v <- withVisible(eval(expr, envir = e))
    if (v$visible) print(v$value)
  }
  invisible(NULL)
}
.td_verifier <- function(prelude, code, tests) {
  e <- .td_env(prelude)
  r <- try(invisible(capture.output(for (expr in parse(text = code)) eval(expr, envir = e))), silent = TRUE)
  if (inherits(r, "try-error")) { cat("@@ERREUR", conditionMessage(attr(r, "condition")), "\n"); return(invisible(NULL)) }
  res <- vapply(tests, function(t) isTRUE(try(eval(parse(text = t), envir = e), silent = TRUE)), logical(1))
  cat("@@", paste(as.integer(res), collapse = ""), "\n")
}
.td_csv <- function(prelude, nom) {
  e <- .td_env(prelude)
  d <- get(nom, envir = e)
  rownames(d) <- d[[1]]
  d[[1]] <- NULL
  write.csv2(d, paste0(nom, ".csv"))
}
`;

function dessiner() {
  TD.exercices.forEach((e, i) => {
    const ou = document.getElementById('ex-' + e.id);
    if (!ou) return;
    const lignes = (e.verifs || []).map(v => v.msg)
      .concat((e.appels || []).map(f => `le code appelle ${f}()`))
      .concat((e.interdits || []).map(f => `le code n'utilise pas ${f}()`))
      .concat(e.graphique ? ['un graphique est produit'] : []);
    ou.innerHTML = `<div class="ex">
      <h3>Exercice ${esc(e.id)} — ${esc(e.titre)}</h3>
      <div class="cons">${e.consigne}</div>
      <textarea id="code${i}" class="code-r" spellcheck="false">${esc(e.depart || '')}</textarea>
      <div class="actions">
        <button class="principal" data-run="${i}" disabled>▶ Exécuter</button>
        <button class="principal" data-verif="${i}" disabled>✔ Vérifier</button>
        <button data-reset="${i}">Réinitialiser</button>
        <span class="etat" id="verdict${i}"></span>
      </div>
      <ul class="verifs" id="verifs${i}">${lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="sortie" id="sortie${i}"></div>
      <canvas class="trace" id="trace${i}"></canvas>
      <details><summary>Voir une solution</summary><pre>${esc(e.corrige)}</pre></details>
    </div>`;
  });
  document.querySelectorAll('[data-run]').forEach(b => b.onclick = () => executer(+b.dataset.run));
  document.querySelectorAll('[data-verif]').forEach(b => b.onclick = () => verifier(+b.dataset.verif));
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => {
    const i = +b.dataset.reset;
    document.getElementById('code' + i).value = TD.exercices[i].depart || '';
  });
  document.querySelectorAll('textarea.code-r').forEach(ta => ta.addEventListener('keydown', ev => {
    if (ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault();
      if (!document.execCommand('insertText', false, '  ')) ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      executer(+ta.id.slice(4));
    }
  }));
}

function image(i, img) {
  const c = document.getElementById('trace' + i);
  if (!img) { c.classList.remove('actif'); return; }
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  c.classList.add('actif');
}

async function capturer(code) {
  const cap = await shelter.captureR(code, { withAutoprint: false, captureStreams: true,
    captureConditions: false, captureGraphics: true });
  shelter.purge();
  return cap;
}

async function executer(i) {
  if (!pret) return;
  const e = TD.exercices[i], code = document.getElementById('code' + i).value;
  const s = document.getElementById('sortie' + i);
  s.classList.add('visible'); s.innerHTML = '<span class="cmt">Exécution…</span>';
  try {
    const cap = await capturer(`.td_run(${litteral(e.prelude)}, ${litteral(code)})`);
    s.innerHTML = cap.output.map(l => l.type === 'stderr' ? `<span class="ko">${esc(l.data)}</span>` : esc(l.data)).join('\n')
      || '<span class="cmt">(aucune sortie)</span>';
    image(i, cap.images && cap.images[cap.images.length - 1]);
  } catch (err) {
    s.innerHTML = `<span class="ko">${esc(String(err.message || err).replace(/^Error( in [^:]*)?:\s*/, ''))}</span>`;
  }
}

async function verifier(i) {
  if (!pret) return;
  const e = TD.exercices[i], code = document.getElementById('code' + i).value;
  const v = document.getElementById('verdict' + i), ul = document.getElementById('verifs' + i);
  v.textContent = 'Vérification…'; v.style.color = '';
  const tests = (e.verifs || []).map(x => x.test);
  let res = [], erreur = null, dessin = false;
  try {
    const cap = await capturer(`.td_verifier(${litteral(e.prelude)}, ${litteral(code)}, c(${tests.map(litteral).join(', ')}))`);
    const ligne = cap.output.map(l => l.data).find(d => d.startsWith('@@')) || '';
    if (ligne.startsWith('@@ERREUR')) erreur = ligne.slice(8).trim();
    else res = (ligne.slice(2).trim().match(/[01]/g) || []).map(x => x === '1');
    dessin = !!(cap.images && cap.images.length);
    if (dessin) image(i, cap.images[cap.images.length - 1]);
  } catch (err) { erreur = String(err.message || err); }
  const etats = tests.map((_, k) => !erreur && res[k] === true)
    .concat((e.appels || []).map(f => appelle(code, f)))
    .concat((e.interdits || []).map(f => !appelle(code, f)))
    .concat(e.graphique ? [!erreur && dessin] : []);
  [...ul.children].forEach((li, k) => li.className = etats[k] ? 'ok' : 'ko');
  const n = etats.filter(Boolean).length;
  if (erreur) { v.textContent = 'Le code s’arrête sur une erreur : ' + erreur; v.style.color = 'var(--rouge)'; return; }
  v.textContent = n === etats.length ? `✅ ${n} / ${etats.length} vérifications réussies` : `${n} / ${etats.length} vérifications réussies`;
  v.style.color = n === etats.length ? 'var(--vert)' : 'var(--rouge)';
}

(async () => {
  dessiner();
  const etat = $('#etat');
  try {
    webR = new WebR({ channelType: ChannelType.PostMessage });
    await webR.init();
    shelter = await new webR.Shelter();
    await webR.evalRVoid(OUTILS);
    if ((TD.preparation || []).length) {
      const banque = await (await fetch('data/r.json')).json();
      for (const [jeu, nom] of TD.preparation) {
        const q = banque.questions.find(x => x.jeu === jeu && (x.prelude || '').startsWith(nom + ' <- data.frame('));
        if (q) await webR.evalRVoid(`.td_csv(${litteral(q.prelude)}, ${litteral(nom)})`);
      }
    }
    pret = true;
    etat.textContent = 'R est prêt : écrivez votre code, exécutez-le, puis vérifiez.';
    document.querySelectorAll('[data-run], [data-verif]').forEach(b => b.disabled = false);
  } catch (err) {
    etat.textContent = 'R n’a pas pu démarrer. Vérifiez votre connexion, puis rechargez la page.';
    console.error(err);
  }
})();
