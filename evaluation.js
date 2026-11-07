/* Évaluation sur le Codex — côté navigateur. Lot 4, 7 novembre 2026.

   L'étudiant connecté choisit un niveau ; le serveur tire les exercices selon le
   format figé (Programmation I : 7 exercices en 42 min, II : 5 en 60, III : 3 en
   54, IV : 2 en 48) et tient le chrono. Les essais se font ici, avec Pyodide et
   les jeux d'essai publiés ; « Soumettre » envoie le code au serveur, qui le joue
   contre le jeu de validation, jamais envoyé au navigateur. La dernière
   soumission de chaque exercice compte.

   Examen : plein écran demandé ; sortie du plein écran, onglet caché, perte de
   focus, copier, couper, coller enregistrés, texte compris, et signalés à
   l'étudiant ; rien n'est bloqué ; trace de l'éditeur envoyée pour le replay. L'enseignant
   décide, la page ne sanctionne rien.
   Examen blanc : même épreuve, sans plein écran, sans journal, sans trace.

   La page l'appelle avec les mêmes accroches que l'arène, plus `code` :
     Evaluation.init({ page: 'python', ouvrir, code: () => getCode(), pret, accueil });
   accueil : ramène à l'accueil de la page à la fin de l'épreuve.
   Pendant l'épreuve, body porte eval-verrou : la liste et les filtres
   disparaissent, indices et solutions sont masqués par Evaluation.verrouille(). */
window.Evaluation = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CLE = 'codex_evaluation';
  const H = {};
  let E = null;            // la tentative en cours : {id, niveau, libelle, blanc, exercices, fin (local ms), soumissions, courant, ouverts}
  let formats = null, horloge = null, traceur = null, dernierCode = '', avis = '';

  const lireStock = () => { try { return JSON.parse(sessionStorage.getItem(CLE)) || null; } catch { return null; } };
  const stocker = () => { try { E ? sessionStorage.setItem(CLE, JSON.stringify(E)) : sessionStorage.removeItem(CLE); } catch {} };

  async function appel(methode, chemin, corps) {
    const rep = await fetch('/api/evaluation' + chemin, { method: methode, cache: 'no-store',
      headers: corps ? { 'content-type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined });
    let d = null; try { d = await rep.json(); } catch {}
    if (!rep.ok) throw new Error((d && d.detail) || `Erreur ${rep.status}`);
    return d;
  }

  /* ───── style et gabarits ───── */
  const STYLE = `
  body.eval-verrou .arene-cache{display:none !important}
  body.eval-verrou .arene-fige{pointer-events:none;opacity:.45}
  body.eval-verrou #sessBtn{display:none !important}
  #evalBar{background:var(--panel2);border-bottom:1px solid var(--line);padding:9px 18px;display:none;gap:12px 20px;
    align-items:center;flex-wrap:wrap;font-size:15px;position:sticky;top:0;z-index:19}
  #evalBar.on{display:flex}
  #evalBar .chrono{font-size:27.5px;font-weight:700;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace;min-width:84px}
  #evalBar .chrono.fin{color:var(--ko)}
  #evalBar .titre{color:var(--muted)} #evalBar .titre b{color:var(--ink);font-weight:600}
  #evalBar .exos{display:flex;gap:6px;flex-wrap:wrap}
  #evalBar .exos button{padding:4px 10px;font-variant-numeric:tabular-nums}
  #evalBar .exos button.on{outline:2px solid var(--accent)}
  #evalBar .exos button.ok{background:var(--ok-soft);color:var(--ok)}
  #evalBar .exos button.partiel{background:var(--accent-soft);color:var(--accent)}
  #evalBar .actions{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #evalBar .msg{color:var(--muted);font-size:14px;max-width:420px}
  #evalAvis{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:60;background:var(--ko);color:#fff;padding:10px 16px;
    border-radius:8px;font-size:15px;display:none;gap:12px;align-items:center;box-shadow:0 4px 18px rgba(0,0,0,.35)}
  #evalAvis.on{display:flex}
  #evalAvis button{font:inherit;padding:4px 10px}
  dialog.evalDlg{border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);padding:0;max-width:560px;width:92vw}
  dialog.evalDlg::backdrop{background:rgba(0,0,0,.55)}
  dialog.evalDlg h3{margin:0;padding:14px 20px;border-bottom:1px solid var(--line);font-size:18px}
  dialog.evalDlg .corps{padding:16px 20px;display:flex;flex-direction:column;gap:10px;font-size:15px}
  dialog.evalDlg .pied{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  dialog.evalDlg select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--ink)}
  dialog.evalDlg .modes label{display:block;font-weight:400;margin:4px 0}
  dialog.evalDlg .aide{color:var(--muted);font-size:14px;margin:0}
  dialog.evalDlg .etat{color:var(--ko);font-size:14px}
  dialog.evalDlg .note{font-size:40px;font-weight:700;color:var(--accent)}
  dialog.evalDlg table{border-collapse:collapse;width:100%} dialog.evalDlg td,dialog.evalDlg th{padding:4px 8px;border-bottom:1px solid var(--line);text-align:left}`;

  const BARRE = `<div id="evalBar">
    <span class="chrono" id="evalChrono">--:--</span>
    <span class="titre" id="evalTitre"></span>
    <span class="exos" id="evalExos"></span>
    <span class="actions">
      <span class="msg" id="evalMsg" aria-live="polite"></span>
      <button class="primary" id="evalSoumettre">✔ Soumettre cet exercice</button>
      <button id="evalPlein" style="display:none" title="Repasser en plein écran">⛶ Plein écran</button>
      <button id="evalFin">Terminer l'épreuve</button>
    </span>
  </div>
  <div id="evalAvis"><span id="evalAvisTxt"></span><button id="evalAvisPlein">⛶ Revenir en plein écran</button><button id="evalAvisOk">OK</button></div>
  <dialog class="evalDlg" id="evalDlg">
    <h3 id="evalDlgTitre">Évaluation</h3>
    <div class="corps" id="evalDlgCorps"></div>
    <div class="pied">
      <button class="primary" id="evalOk">Commencer</button>
      <button id="evalAnnul">Annuler</button>
      <span class="etat" id="evalEtat" aria-live="polite"></span>
    </div>
  </dialog>`;

  /* ───── la fenêtre de départ ───── */
  async function ouvrirDialogue() {
    if (E) { $('#evalBar').scrollIntoView({ behavior: 'smooth' }); return; }
    if (window.Session && Session.active) { alert('Quittez l’arène avant de commencer une évaluation.'); return; }
    const d = $('#evalDlg'); $('#evalDlgTitre').textContent = 'Évaluation';
    $('#evalOk').style.display = ''; $('#evalOk').textContent = 'Commencer'; $('#evalEtat').textContent = '';
    const moi = window.Compte && Compte.moi();
    if (!moi || !moi.connecte) {
      $('#evalDlgCorps').innerHTML = `<p>L'évaluation demande d'être connecté : la note et la médaille sont rattachées à votre compte.</p>
        <p><a href="/auth/login?suite=${encodeURIComponent(location.pathname + '?evaluation=1')}">Se connecter avec le compte UniLaSalle</a></p>`;
      $('#evalOk').style.display = 'none';
    } else {
      formats = formats || await appel('GET', '/formats');
      $('#evalDlgCorps').innerHTML = `
        <label for="evalNiveau">Niveau</label>
        <select id="evalNiveau">${Object.entries(formats).map(([n, f]) =>
          `<option value="${n}"${f.disponibles < f.exercices ? ' disabled' : ''}>${esc(f.libelle)} — ${f.exercices} exercice${f.exercices > 1 ? 's' : ''} en ${f.minutes} min${f.disponibles < f.exercices ? ' (indisponible)' : ''}</option>`).join('')}</select>
        <div class="modes">
          <label><input type="radio" name="evalMode" value="examen" checked style="width:auto;margin-right:6px"><b>Examen</b> — plein écran ; sorties, pertes de focus et copier-coller enregistrés et visibles par l'enseignant ; note et médaille rattachées à votre compte.</label>
          <label><input type="radio" name="evalMode" value="blanc" style="width:auto;margin-right:6px"><b>Examen blanc</b> — la même épreuve, pour s'entraîner : sans plein écran ni journal ; la note n'est visible que de vous.</label>
        </div>
        <p class="aide">Les exercices sont tirés au hasard dans le niveau. Vous pouvez tester votre code avec les jeux d'essai autant que vous voulez ; « Soumettre » envoie le code au serveur, qui le joue contre des tests que vous ne voyez pas. La dernière soumission de chaque exercice compte. Le chrono ne s'arrête pas ; à la fin, ce qui est soumis est noté. Pendant l'épreuve, ni indice ni solution ; ce qui est collé est enregistré.</p>`;
    }
    if (!d.open) d.showModal();
  }

  async function commencer() {
    const ok = $('#evalOk'); ok.disabled = true; $('#evalEtat').textContent = '';
    try {
      const niveau = $('#evalNiveau').value;
      const blanc = (document.querySelector('input[name=evalMode]:checked') || {}).value === 'blanc';
      const t = await appel('POST', '', { niveau, blanc });
      $('#evalDlg').close();
      adopter(t, true);
      if (!E.blanc) pleinEcran();   // encore dans le geste du clic : le navigateur l'accepte
    } catch (e) { $('#evalEtat').textContent = e.message; }
    ok.disabled = false;
  }

  function adopter(t, depart) {
    E = { id: t.id, niveau: t.niveau, libelle: t.libelle, blanc: t.blanc, exercices: t.exercices,
          fin: Date.now() + t.reste * 1000, soumissions: t.soumissions || {}, courant: 0, ouverts: [] };
    if (!depart) { const st = lireStock(); if (st && st.id === E.id) { E.courant = st.courant || 0; E.ouverts = st.ouverts || []; } }
    stocker();
    document.body.classList.add('eval-verrou');
    $('#evalBar').classList.add('on');
    clearInterval(horloge); horloge = setInterval(tic, 500);
    if (!E.blanc) { brancherJournal(); clearInterval(traceur); traceur = setInterval(tracer, 2000); }
    ouvrirExercice(E.courant);
    rendre();
    recaler();
  }
  // la barre change la hauteur disponible : la page recale ses zones sur « resize »
  const recaler = () => setTimeout(() => window.dispatchEvent(new Event('resize')), 50);

  /* ───── les exercices ───── */
  async function ouvrirExercice(i) {
    if (!E) return;
    E.courant = i; stocker();
    const id = E.exercices[i];
    const premiere = !E.ouverts.includes(id);
    try { await H.ouvrir(E.niveau, id, premiere); } catch (e) { dire('Exercice introuvable : ' + e.message); return; }
    if (premiere) { E.ouverts.push(id); stocker(); }
    signaler('exercice_ouvert');   // pour le temps passé par exercice, dans la relecture
    dernierCode = H.code ? H.code() : '';
    rendre();
  }

  async function soumettre() {
    if (!E) return;
    const b = $('#evalSoumettre'); b.disabled = true; dire('Exécution sur le serveur…');
    try {
      const id = E.exercices[E.courant];
      const r = await appel('POST', `/${E.id}/soumettre`, { exercice: id, code: H.code() });
      E.soumissions[id] = r; stocker();
      const ok = r.resultats.filter(x => x.ok).length;
      dire(`${ok} test${ok > 1 ? 's' : ''} sur ${r.resultats.length} réussi${ok > 1 ? 's' : ''}, ${r.points} point${r.points > 1 ? 's' : ''} sur ${r.pointsMax}.`
        + (r.resultats.some(x => x.erreur) ? ' ' + r.resultats.find(x => x.erreur).erreur : ''));
      rendre();
    } catch (e) { dire(e.message); }
    b.disabled = false;
  }

  async function terminer(force) {
    if (!E) return;
    if (!force && !confirm('Terminer l’épreuve ? Ce qui est soumis sera noté ; le reste vaudra 0.')) return;
    let r = null;
    try { r = await appel('POST', `/${E.id}/terminer`); } catch (e) { if (!force) { dire(e.message); return; } }
    const blanc = E.blanc;
    fermer();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (r) {
      $('#evalDlgTitre').textContent = blanc ? 'Examen blanc terminé' : 'Épreuve terminée';
      $('#evalDlgCorps').innerHTML = `<div class="note">${r.note} / 20</div>
        <p>${r.medaille ? `Médaille <b>${r.medaille}</b>.` : 'Pas de médaille : il faut 10 / 20.'}${blanc ? ' Examen blanc : cette note n’est visible que de vous.' : ''}</p>
        <table><tr><th>Exercice</th><th>Points</th></tr>${r.exercices.map((x, i) => { const s = r.soumissions[x]; return `<tr><td>${i + 1}</td><td>${s ? s.points + ' / ' + s.pointsMax : 'non soumis'}</td></tr>`; }).join('')}</table>`;
      $('#evalOk').style.display = 'none'; $('#evalAnnul').textContent = 'Fermer';
      const d = $('#evalDlg'); if (!d.open) d.showModal();
    }
  }

  function fermer() {
    E = null; stocker(); clearInterval(horloge); clearInterval(traceur); horloge = traceur = null;
    document.body.classList.remove('eval-verrou');
    $('#evalBar').classList.remove('on'); $('#evalAvis').classList.remove('on');
    if (location.search.includes('evaluation=')) history.replaceState(null, '', location.pathname);
    if (H.accueil) H.accueil(); else if (H.deverrouiller) H.deverrouiller();   // fin d'épreuve : retour à l'accueil (7 novembre 2026)
    recaler();
  }

  /* ───── rendu ───── */
  function rendre() {
    if (!E) return;
    $('#evalTitre').innerHTML = `<b>${esc(E.libelle)}</b> · ${E.blanc ? 'examen blanc' : 'examen'}`;
    $('#evalExos').innerHTML = E.exercices.map((id, i) => {
      const s = E.soumissions[id];
      const cl = i === E.courant ? ' on' : '';
      const etat = s ? (s.points >= s.pointsMax ? ' ok' : s.points > 0 ? ' partiel' : '') : '';
      return `<button data-i="${i}" class="${(cl + etat).trim()}" title="${s ? s.points + ' / ' + s.pointsMax + ' points' : 'non soumis'}">${i + 1}${s ? ` · ${s.points}` : ''}</button>`;
    }).join('');
    $('#evalExos').querySelectorAll('button').forEach(b => b.onclick = () => ouvrirExercice(Number(b.dataset.i)));
    $('#evalPlein').style.display = !E.blanc && !document.fullscreenElement ? '' : 'none';
  }
  function dire(m) { $('#evalMsg').textContent = m; }
  function tic() {
    if (!E) return;
    const reste = Math.max(0, Math.round((E.fin - Date.now()) / 1000));
    const c = $('#evalChrono'); c.textContent = `${String(Math.floor(reste / 60)).padStart(2, '0')}:${String(reste % 60).padStart(2, '0')}`;
    c.classList.toggle('fin', reste <= 120);
    if (reste <= 0) terminer(true);
  }

  /* ───── plein écran et journal d'intégrité ───── */
  function pleinEcran() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  function signaler(type, detail) {
    if (!E || E.blanc) return;
    fetch(`/api/evaluation/${E.id}/evenement`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, detail: { exercice: E.exercices[E.courant], ...(detail || {}) } }) }).catch(() => {});
  }
  function avertir(texte, plein) {
    $('#evalAvisTxt').textContent = texte;
    $('#evalAvisPlein').style.display = plein ? '' : 'none';
    $('#evalAvis').classList.add('on');
  }
  let journalBranche = false;
  function brancherJournal() {
    if (journalBranche) return; journalBranche = true;
    document.addEventListener('fullscreenchange', () => {
      if (!E || E.blanc) return;
      if (document.fullscreenElement) { signaler('retour_plein_ecran'); $('#evalAvis').classList.remove('on'); }
      else { signaler('sortie_plein_ecran'); avertir('Sortie du plein écran enregistrée. Revenez en plein écran.', true); }
      rendre();
    });
    document.addEventListener('visibilitychange', () => {
      if (!E || E.blanc) return;
      if (document.hidden) signaler('onglet_cache'); else { signaler('onglet_visible'); avertir('Changement d’onglet ou de fenêtre enregistré.', !document.fullscreenElement); }
    });
    window.addEventListener('blur', () => { if (E && !E.blanc) signaler('perte_focus'); });
    window.addEventListener('focus', () => { if (E && !E.blanc) signaler('retour_focus'); });
    // les exécutions de jeux d'essai, pour la ligne de temps de la relecture
    document.addEventListener('click', ev => {
      const b = ev.target.closest('#run, #exec, button[data-jeu]');
      if (b && E && !E.blanc) signaler('tests_lances', { tous: b.id === 'run' });
    }, true);
    const texteSel = () => String(window.getSelection && window.getSelection()).slice(0, 2000);
    document.addEventListener('copy', () => { if (E && !E.blanc) signaler('copier', { texte: texteSel() }); });
    document.addEventListener('cut', () => { if (E && !E.blanc) signaler('couper', { texte: texteSel() }); });
    document.addEventListener('paste', ev => {
      if (!E || E.blanc) return;
      // décision du 7 novembre 2026 : coller n'est pas interdit, il est enregistré, texte compris, pour le contrôle
      const texte = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      signaler('coller', { texte: texte.slice(0, 5000), longueur: texte.length });
      avertir('Texte collé enregistré : l’enseignant le verra.', !document.fullscreenElement);
    }, true);
  }
  function tracer() {
    if (!E || E.blanc || !H.code) return;
    const code = H.code();
    if (code === dernierCode) return;
    dernierCode = code;
    fetch(`/api/evaluation/${E.id}/trace`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ exercice: E.exercices[E.courant], code }) }).catch(() => {});
  }

  /* ───── init ───── */
  function init(accroches) {
    Object.assign(H, accroches);
    const st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    const entete = document.querySelector('#sessBar') || document.querySelector('header');
    entete.insertAdjacentHTML('afterend', BARRE);
    $('#evalOk').onclick = commencer; $('#evalAnnul').onclick = () => $('#evalDlg').close();
    $('#evalSoumettre').onclick = soumettre; $('#evalFin').onclick = () => terminer(false);
    $('#evalPlein').onclick = pleinEcran; $('#evalAvisPlein').onclick = () => { pleinEcran(); $('#evalAvis').classList.remove('on'); };
    $('#evalAvisOk').onclick = () => $('#evalAvis').classList.remove('on');
    // reprise après rechargement : la tentative en cours est au serveur ; recharger a fait sortir du plein écran
    const reprise = async () => {
      if (!(window.Compte && Compte.connecte())) return;
      try {
        const t = await appel('GET', '/courante');
        if (t && t.id) { adopter(t, false); if (!t.blanc) signaler('sortie_plein_ecran', { motif: 'rechargement' }); if (!t.blanc) avertir('Épreuve reprise après rechargement : repassez en plein écran.', true); }
      } catch {}
    };
    if (window.Compte) Compte.qui().then(m => { if (m && m.connecte) reprise(); else if (new URLSearchParams(location.search).get('evaluation')) ouvrirDialogue(); });
    if (new URLSearchParams(location.search).get('evaluation')) setTimeout(() => { if (!E) ouvrirDialogue(); }, 600);
  }

  const verrouille = () => !!E;
  return { init, ouvrirDialogue, verrouille, get active() { return !!E; } };
})();
