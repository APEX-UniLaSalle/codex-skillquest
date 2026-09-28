/* Mode arène du Codex — côté navigateur.

   Une arène : un groupe fait le même exercice, avec un chrono commun. Chacun soumet sa
   solution, une fois ; le classement montre ceux qui ont réussi, l'enseignant
   voit toutes les solutions. Le serveur est netlify/functions/session.mjs,
   joint sur /api/session : c'est lui qui tient l'horloge et les soumissions.

   Ce fichier ne connaît pas la page qui l'accueille. Chaque page l'appelle
   avec quatre accroches :
     Session.init({          // et un bouton par exercice qui appelle Session.lancer()
       page:    'python',                               // python, r ou sql
       courant: () => ({niveau, exo, titre, duree}) ou null,   // l'exercice ouvert
       ouvrir:  async (niveau, exo) => {...},           // ouvre l'exercice de la session
       tester:  async () => ({ok, total, source}),      // joue tous les tests sur le code en cours
     });
   Pendant le verrou, la classe arene-verrou est posée sur body : la page marque
   arene-cache ce qui doit disparaître (liste, filtres, retour) et arene-fige ce qui
   doit rester visible sans répondre (lien vers l'accueil).
   Elle demande Session.verrouille() avant d'afficher un indice ou une solution :
   vrai pendant l'arène, jusqu'à sa fin, sauf pour le lanceur qui a gardé l'accès.
   ouvrir() reçoit un troisième argument, depart : vrai au départ de l'arène,
   pour repartir de l'amorce de l'exercice ; faux à la reprise après rechargement.

   Ce que le navigateur retient : sessionStorage garde le code, le nom, le
   jeton et, pour le lanceur, sa clé. Un rechargement de la page reprend la
   session ; fermer l'onglet l'oublie ; « Quitter » retire de la session.

   Registre : c'est de l'entraînement. Les tests sont joués par le navigateur,
   le serveur ne les rejoue pas ; seul le temps est mesuré chez lui. */

window.Session = (() => {
  const API = '/api/session';
  const CLE = 'codex_arene';
  const H = {};                 // accroches de la page
  let S = null;                 // {code, nom, jeton, cle} — la session suivie
  let vue = null;               // dernière vue serveur
  let decalage = 0;             // horloge serveur − horloge locale
  let minuterie = null, horloge = null;

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const maintenant = () => Date.now() + decalage;
  const meme = (a, b) => a && b && a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0;
  const moiSoumis = () => !!(S && S.nom && vue && vue.soumis.some(n => meme(n, S.nom)));

  const lireStock = () => { try { return JSON.parse(sessionStorage.getItem(CLE)) || null; } catch { return null; } };
  const stocker = () => { try { S ? sessionStorage.setItem(CLE, JSON.stringify(S)) : sessionStorage.removeItem(CLE); } catch {} };

  async function appel(methode, corps) {
    const url = methode === 'GET'
      ? `${API}?code=${encodeURIComponent(S.code)}${S.cle ? '&cle=' + encodeURIComponent(S.cle) : ''}`
      : API;
    const rep = await fetch(url, {
      method: methode, cache: 'no-store',
      headers: methode === 'GET' ? {} : { 'content-type': 'application/json' },
      body: methode === 'GET' ? undefined : JSON.stringify(corps),
    });
    let d = {};
    try { d = await rep.json(); } catch {}
    if (!rep.ok) throw new Error(d.erreur || `Erreur ${rep.status}`);
    if (d.maintenant) decalage = d.maintenant - Date.now();
    if (d.session) vue = d.session;
    return d;
  }

  /* ───── style et gabarits ───── */
  const STYLE = `
  #sessBar{background:var(--panel2);border-bottom:1px solid var(--line);padding:9px 18px;
    display:none;gap:12px 22px;align-items:center;flex-wrap:wrap;font-size:13.5px;position:sticky;top:0;z-index:19}
  #sessBar.on{display:flex}
  #sessBar .code{font-size:22px;font-weight:700;letter-spacing:3px;color:var(--accent);font-family:ui-monospace,Menlo,monospace}
  #sessBar .chrono{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace;min-width:84px}
  #sessBar .chrono.fin{color:var(--ko)}
  #sessBar .titre{color:var(--muted)}
  #sessBar .titre b{color:var(--ink);font-weight:600}
  #sessBar .moi{padding:3px 10px;border-radius:14px;background:var(--code);font-weight:600}
  #sessBar .moi.ok{background:var(--ok-soft);color:var(--ok)}
  #sessBar .moi.ko{background:var(--ko-soft);color:var(--ko)}
  #sessBar .liste{display:flex;gap:6px 10px;flex-wrap:wrap;align-items:center}
  #sessBar .liste span{background:var(--code);border-radius:4px;padding:2px 8px;font-variant-numeric:tabular-nums}
  #sessBar .liste span.ok{background:var(--ok-soft);color:var(--ok)}
  #sessBar .liste span.soumis{opacity:.6}
  #sessBar .liste em{color:var(--muted);font-style:normal}
  #sessBar .actions{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #sessBar .msg{color:var(--muted);font-size:12.5px}
  #sessBtn{font-size:12.5px;padding:5px 11px}
  body.arene-verrou .arene-cache{display:none !important}
  body.arene-verrou .arene-fige{pointer-events:none;opacity:.45}
  #sessGrand2{position:fixed;inset:0;z-index:40;background:var(--bg);display:none;flex-direction:column;
    align-items:center;justify-content:center;gap:4vh;padding:4vh 6vw;text-align:center}
  #sessGrand2.on{display:flex}
  #sessGrand2 .g-titre{font-size:clamp(18px,3vw,34px);color:var(--muted)}
  #sessGrand2 .g-titre b{color:var(--ink);font-weight:650}
  #sessGrand2 .g-code{font-size:clamp(72px,22vw,300px);line-height:1;font-weight:800;letter-spacing:.12em;
    color:var(--accent);font-family:ui-monospace,Menlo,monospace}
  #sessGrand2 .g-lien{font-size:clamp(16px,2.6vw,30px);color:var(--ink)}
  #sessGrand2 .g-parts{display:flex;flex-wrap:wrap;gap:8px 12px;justify-content:center;max-width:90vw;font-size:clamp(14px,2vw,22px)}
  #sessGrand2 .g-parts em{width:100%;color:var(--muted);font-style:normal;font-size:.8em}
  #sessGrand2 .g-parts span{background:var(--code);border-radius:6px;padding:4px 12px}
  #sessGrand2 .g-actions{display:flex;gap:12px}
  #sessGrand2 .g-actions button{font-size:clamp(15px,1.8vw,20px);padding:10px 22px}
  dialog.sessDlg{border:1px solid var(--line);border-radius:6px;padding:0;max-width:460px;
    width:calc(100% - 32px);background:var(--panel);color:var(--ink);font:inherit}
  dialog.sessDlg::backdrop{background:rgba(60,56,54,.45)}
  dialog.sessDlg h3{margin:0;padding:13px 18px;border-bottom:1px solid var(--line);font-size:15px;color:var(--accent)}
  dialog.sessDlg .corps{padding:14px 18px}
  dialog.sessDlg label{display:block;font-size:13px;font-weight:600;margin:10px 0 5px}
  dialog.sessDlg label:first-child{margin-top:0}
  dialog.sessDlg input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:5px;font:inherit;background:var(--bg);color:var(--ink)}
  dialog.sessDlg input.code{font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:4px;text-transform:uppercase;text-align:center}
  dialog.sessDlg .deux{display:flex;gap:10px}
  dialog.sessDlg .deux>div{flex:1}
  dialog.sessDlg .aide{margin:6px 0 0;font-size:12.5px;color:var(--muted)}
  dialog.sessDlg .pied{padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center}
  dialog.sessDlg .etat{font-size:12.5px;color:var(--ko);margin-left:auto}
  dialog.sessDlg .sess-exo{background:var(--code);border-radius:5px;padding:8px 10px;font-size:13px}
  dialog.sessDlg .sess-exo b{font-weight:600}
  dialog.sessDlg input[type=checkbox]{accent-color:var(--accent)}
  dialog#sessSol{max-width:960px}
  #sessSol .corps{max-height:70vh;overflow:auto}
  #sessSol table{width:100%;border-collapse:collapse;font-size:13px}
  #sessSol th,#sessSol td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  #sessSol th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.3px}
  #sessSol td.etat.ok{color:var(--ok);font-weight:600}
  #sessSol td.etat.ko{color:var(--ko)}
  #sessSol pre{margin:0;font:12.5px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;
    background:var(--bg);border-radius:4px;padding:6px 8px;max-height:260px;overflow:auto}
  #sessSol .vide{color:var(--muted)}`;

  const BARRE = `<div id="sessBar">
    <span class="code" id="sessCode"></span>
    <span class="chrono" id="sessChrono">--:--</span>
    <span class="titre" id="sessTitre"></span>
    <span id="sessMoi"></span>
    <span class="liste" id="sessListe"></span>
    <span class="actions">
      <span class="msg" id="sessMsg"></span>
      <button class="primary" id="sessSoumettre" style="display:none">✔ Soumettre ma solution</button>
      <button id="sessVoir" style="display:none">📋 Solutions</button>
      <button id="sessGrand" style="display:none" title="Le code en grand, pour le vidéoprojecteur">🖥 Code en grand</button>
      <button id="sessPlein" style="display:none" title="Repasser en plein écran">⛶ Plein écran</button>
      <button id="sessLien" title="Copier le lien de l'arène">🔗 Copier le lien</button>
      <button class="primary" id="sessGo" style="display:none">▶ Démarrer</button>
      <button id="sessQuit">Quitter l'arène</button>
    </span>
  </div>`;

  const DLG = `<dialog class="sessDlg" id="sessDlg">
    <h3 id="sessDlgTitre">Mode arène</h3>
    <div class="corps" id="sessPanJ">
      <label for="sessInCode">Code de l'arène</label>
      <input class="code" id="sessInCode" maxlength="6" autocomplete="off" spellcheck="false" placeholder="ABC234">
      <div class="deux">
        <div><label for="sessInPrenom">Prénom</label><input id="sessInPrenom" maxlength="30" autocomplete="given-name"></div>
        <div><label for="sessInNom">Nom</label><input id="sessInNom" maxlength="30" autocomplete="family-name"></div>
      </div>
      <p class="aide">Votre nom sert au classement et à la remise de votre solution à l'enseignant. L'arène s'efface au bout de 24 heures.</p>
    </div>
    <div class="corps" id="sessPanL" style="display:none">
      <div class="sess-exo" id="sessExo"></div>
      <label for="sessInDuree">Durée, en minutes <span style="font-weight:400;color:var(--muted)">préremplie avec la durée conseillée de l'exercice</span></label>
      <input id="sessInDuree" type="number" min="1" max="180" step="1">
      <div class="deux">
        <div><label for="sessInPrenomL">Prénom</label><input id="sessInPrenomL" maxlength="30" autocomplete="given-name"></div>
        <div><label for="sessInNomL">Nom</label><input id="sessInNomL" maxlength="30" autocomplete="family-name"></div>
      </div>
      <label style="font-weight:400;margin-top:8px"><input type="checkbox" id="sessInJoue" checked style="width:auto;margin-right:6px">Je participe aussi</label>
      <label style="font-weight:400;margin-top:4px"><input type="checkbox" id="sessInIndices" checked style="width:auto;margin-right:6px">Je garde l'accès aux indices et aux solutions</label>
      <label style="font-weight:400;margin-top:4px"><input type="checkbox" id="sessInPlein" checked style="width:auto;margin-right:6px">Plein écran demandé à ceux qui rejoignent</label>
      <p class="aide">Ceux qui rejoignent n'ont ni indice ni solution pendant l'arène, et ne peuvent pas en sortir pour parcourir le Codex. Le plein écran ne peut pas être imposé par le navigateur : une sortie est comptée et vous est montrée.</p>
      <p class="aide">Vous recevez un code à afficher au groupe. Le chrono démarre quand vous le décidez, après un compte à rebours de 10 secondes. Vous verrez qui a rejoint, puis les solutions soumises.</p>
    </div>
    <div class="pied">
      <button class="primary" id="sessOk">Rejoindre</button>
      <button id="sessAnnul">Annuler</button>
      <span class="etat" id="sessEtat"></span>
    </div>
  </dialog>
  <dialog class="sessDlg" id="sessSol">
    <h3 id="sessSolTitre">Solutions soumises</h3>
    <div class="corps" id="sessSolCorps"></div>
    <div class="pied"><button id="sessSolFermer">Fermer</button><span class="msg" id="sessSolMsg" style="margin-left:auto;font-size:12.5px;color:var(--muted)"></span></div>
  </dialog>`;

  /* ───── le code en grand, pour le vidéoprojecteur ─────
     Plein écran chez le lanceur, tant que l'arène attend. Le code, le lien,
     la liste de ceux qui ont rejoint, le bouton de départ. Se ferme au départ. */
  const GRAND = `<div id="sessGrand2">
    <div class="g-titre" id="sessGrandTitre"></div>
    <div class="g-code" id="sessGrandCode"></div>
    <div class="g-lien" id="sessGrandLien"></div>
    <div class="g-parts" id="sessGrandParts"></div>
    <div class="g-actions">
      <button class="primary" id="sessGrandGo">▶ Démarrer</button>
      <button id="sessGrandFermer">Réduire</button>
    </div>
  </div>`;
  function rendreGrand() {
    const g = $('#sessGrand2');
    if (!g.classList.contains('on') || !vue) return;
    $('#sessGrandTitre').innerHTML = `Mode arène · <b>${esc(vue.titre || 'Exercice ' + vue.exo)}</b> · ${Math.round(vue.duree / 60)} min`;
    $('#sessGrandCode').textContent = vue.code;
    $('#sessGrandLien').textContent = `${location.host}${location.pathname} → ⚔️ Rejoindre une arène`;
    const n = vue.participants.length;
    $('#sessGrandParts').innerHTML = (n ? `<em>${n} dans l’arène</em>` : '<em>Personne n’a encore rejoint.</em>')
      + vue.participants.map(p => `<span>${esc(p)}</span>`).join('');
    $('#sessGrandGo').style.display = S.cle ? '' : 'none';
  }
  function montrerGrand(oui) {
    $('#sessGrand2').classList.toggle('on', oui);
    if (oui) rendreGrand();
  }

  /* ───── rendu de la barre ───── */
  function rendre() {
    const bar = $('#sessBar');
    $('#sessBtn').style.display = S ? 'none' : '';
    if (!S || !vue) { bar.classList.remove('on'); document.body.classList.remove('arene-verrou'); return; }
    bar.classList.add('on');
    const n = vue.participants.length, ns = vue.soumis.length;
    $('#sessCode').textContent = vue.code;
    $('#sessTitre').innerHTML = `<b>${esc(vue.titre || 'Exercice ' + vue.exo)}</b> · ${Math.round(vue.duree / 60)} min · ${n} participant${n > 1 ? 's' : ''}`
      + (vue.etat === 'attente' ? '' : ` · ${ns} soumis`);

    // moi
    const moi = S.nom ? vue.resultats.findIndex(r => meme(r.nom, S.nom)) : -1;
    $('#sessMoi').innerHTML = !S.nom ? (S.cle ? '<span class="titre">Lanceur</span>' : '')
      : moi >= 0 ? `<span class="moi ok">${esc(S.nom)} · ${moi + 1}${moi === 0 ? 'er' : 'e'} en ${mmss(vue.resultats[moi].temps)}</span>`
      : moiSoumis() && vue.etat !== 'attente' ? `<span class="moi ko">${esc(S.nom)} · soumis, non réussi</span>`
      : `<span class="moi">${esc(S.nom)}</span>`;

    // liste : les participants en attente ; ensuite le classement, puis les autres
    const li = $('#sessListe');
    if (vue.etat === 'attente') {
      li.innerHTML = vue.participants.map(p => `<span>${esc(p)}</span>`).join('') || '<em>Personne n’a encore rejoint.</em>';
    } else {
      const classes = vue.resultats.map((r, i) => `<span class="ok">${i + 1}. ${esc(r.nom)} ${mmss(r.temps)}</span>`);
      if (S.cle) {
        const reste = vue.participants.filter(p => !vue.resultats.some(r => meme(r.nom, p)));
        const sorties = vue.sorties || {};
        classes.push(...reste.map(p => `<span class="${vue.soumis.some(s => meme(s, p)) ? 'soumis' : ''}">${esc(p)}${vue.soumis.some(s => meme(s, p)) ? ' · soumis' : ''}${sorties[p] ? ` · ⚠ ${sorties[p]} sortie${sorties[p] > 1 ? 's' : ''}` : ''}</span>`));
      }
      li.innerHTML = classes.join('') || (vue.etat === 'fini' ? '<em>Personne n’a réussi dans le temps.</em>' : '<em>Aucune réussite pour l’instant.</em>');
    }

    $('#sessGo').style.display = S.cle && vue.etat === 'attente' ? '' : 'none';
    $('#sessGrand').style.display = vue.etat === 'attente' ? '' : 'none';
    $('#sessPlein').style.display = vue.pleinEcran && S.nom && !S.cle && vue.etat !== 'fini' && !document.fullscreenElement ? '' : 'none';
    document.body.classList.toggle('arene-verrou', verrouille());
    if (vue.etat !== 'attente') montrerGrand(false); else rendreGrand();
    $('#sessVoir').style.display = S.cle && vue.etat !== 'attente' ? '' : 'none';
    $('#sessVoir').textContent = `📋 Solutions (${ns})`;
    $('#sessSoumettre').style.display = S.nom && vue.etat === 'en_cours' && !moiSoumis() ? '' : 'none';
    $('#sessMsg').textContent = vue.etat === 'attente'
      ? (S.cle ? 'Affichez le code au groupe, puis démarrez.' : 'En attente du départ…')
      : vue.etat === 'compte_a_rebours' ? 'Départ imminent…'
      : vue.etat === 'fini' ? 'Terminé. Classement figé.' : '';
    tic();
  }

  function tic() {
    const el = $('#sessChrono');
    if (!vue || !vue.debut) { el.textContent = mmss(vue ? vue.duree * 1000 : 0); el.classList.remove('fin'); return; }
    const t = maintenant();
    if (t < vue.debut) { el.textContent = '− ' + Math.ceil((vue.debut - t) / 1000); el.classList.remove('fin'); return; }
    if (vue.etat === 'compte_a_rebours') { vue.etat = 'en_cours'; rendre(); return; }   // sans attendre le prochain appel
    const reste = vue.fin - t;
    el.textContent = mmss(reste);
    el.classList.toggle('fin', reste <= 0);
    if (reste <= 0 && vue.etat !== 'fini') { vue.etat = 'fini'; rendre(); finDuTemps(); }
  }

  /* À la fin du temps, le code de ceux qui n'ont pas soumis part de lui-même :
     l'enseignant le voit, mais il ne compte pas comme réussite. */
  async function finDuTemps() {
    if (S && S.nom && !moiSoumis()) await soumettre(true);
    rafraichir();
  }

  /* ───── suivi ───── */
  let dernierEtat = null;
  async function rafraichir() {
    if (!S) return;
    try {
      await appel('GET');
    } catch (e) {
      if (/inconnue|expirée/.test(e.message)) { quitter(false); return; }
      $('#sessMsg').textContent = 'Connexion perdue, nouvel essai…';
      return;
    }
    if (vue.etat !== dernierEtat) {
      const demarre = vue.etat === 'compte_a_rebours' || vue.etat === 'en_cours';
      const arrive = dernierEtat !== 'compte_a_rebours' && dernierEtat !== 'en_cours';
      if (demarre && arrive) await H.ouvrir(vue.niveau, vue.exo, dernierEtat === 'attente');
      dernierEtat = vue.etat;
      programmer();
    }
    rendre();
  }

  function programmer() {
    clearInterval(minuterie); minuterie = null;
    if (!S || !vue) return;
    const delai = vue.etat === 'attente' ? 3000 : vue.etat === 'compte_a_rebours' ? 2000
                : vue.etat === 'en_cours' ? 10000 : 0;
    if (delai) minuterie = setInterval(rafraichir, delai);
  }

  function suivre(nouveau) {
    S = nouveau; stocker(); dernierEtat = null;
    clearInterval(horloge); horloge = setInterval(tic, 250);
    rafraichir();
  }

  async function quitter(prevenir = true) {
    const ancien = S;
    clearInterval(minuterie); clearInterval(horloge); minuterie = horloge = null;
    S = null; vue = null; dernierEtat = null; stocker(); rendre();
    if (location.search.includes('arene=')) history.replaceState(null, '', location.pathname);
    if (prevenir && ancien && ancien.nom)
      fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'quitter', code: ancien.code, nom: ancien.nom, jeton: ancien.jeton }) }).catch(() => {});
  }

  /* ───── plein écran ─────
     Le navigateur n'accorde le plein écran que sur un geste de l'utilisateur et
     le rend sur Échap : on ne peut ni l'imposer ni le retenir. On le demande, et
     chaque sortie, ou passage à un autre onglet, est comptée pour le lanceur. */
  function pleinEcran() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  let derniereSortie = 0;
  function signalerSortie() {
    if (Date.now() - derniereSortie < 3000) return;   // un seul signal par sortie
    derniereSortie = Date.now();
    appel('POST', { action: 'sortie', code: S.code, nom: S.nom, jeton: S.jeton }).catch(() => {});
  }

  /* ───── soumission ───── */
  let envoi = false;
  async function soumettre(auto = false) {
    if (!S || !S.nom || !vue || !vue.debut || envoi || moiSoumis()) return;
    envoi = true;
    const b = $('#sessSoumettre'); b.disabled = true;
    try {
      const r = await H.tester();
      await appel('POST', { action: 'soumettre', code: S.code, nom: S.nom, jeton: S.jeton,
        source: r.source, ok: r.ok, total: r.total, auto });
      $('#sessMsg').textContent = auto ? 'Temps écoulé : votre code a été remis.' : '';
    } catch (e) { $('#sessMsg').textContent = e.message; }
    envoi = false; b.disabled = false;
    rendre();
  }

  async function confirmerSoumission() {
    if (!confirm('Soumettre votre solution ? C’est définitif : les tests sont joués une dernière fois et votre code est remis à l’enseignant.')) return;
    await soumettre(false);
  }

  /* ───── solutions, pour le lanceur ───── */
  async function voirSolutions() {
    const d = $('#sessSol'); const corps = $('#sessSolCorps');
    corps.innerHTML = '<p class="vide">Chargement…</p>';
    if (!d.open) d.showModal();
    try { await appel('GET'); } catch (e) { corps.innerHTML = `<p class="vide">${esc(e.message)}</p>`; return; }
    rendre();
    const so = vue.soumissions || [];
    $('#sessSolTitre').textContent = `Solutions soumises — ${vue.titre || 'exercice ' + vue.exo}`;
    const manquent = vue.participants.filter(p => !so.some(s => meme(s.nom, p)));
    $('#sessSolMsg').textContent = `${so.length} soumise${so.length > 1 ? 's' : ''} sur ${vue.participants.length} participant${vue.participants.length > 1 ? 's' : ''}`
      + (manquent.length ? ` · sans soumission : ${manquent.join(', ')}` : '');
    if (!so.length) { corps.innerHTML = '<p class="vide">Aucune soumission pour l’instant.</p>'; return; }
    corps.innerHTML = `<table>
      <tr><th>Nom</th><th>État</th><th>Temps</th><th>Code soumis</th></tr>
      ${so.map(s => `<tr>
        <td>${esc(s.nom)}</td>
        <td class="etat ${s.reussi ? 'ok' : 'ko'}">${s.reussi ? 'Réussi' : `${s.ok}/${s.total} tests`}${s.auto ? '<br><small>remis à la fin</small>' : ''}</td>
        <td>${s.temps == null ? '—' : mmss(s.temps)}</td>
        <td><pre>${esc(s.source || '(vide)')}</pre></td>
      </tr>`).join('')}
    </table>`;
  }

  /* ───── dialogue ───── */
  let onglet = 'J';
  const nomSaisi = suffixe => {
    const p = $('#sessInPrenom' + suffixe).value.trim(), n = $('#sessInNom' + suffixe).value.trim();
    if (p.length < 2 || n.length < 2) throw new Error('Prénom et nom, deux caractères au moins chacun.');
    return `${p} ${n}`;
  };

  function montrerOnglet(o) {
    onglet = o;
    $('#sessPanJ').style.display = o === 'J' ? '' : 'none'; $('#sessPanL').style.display = o === 'L' ? '' : 'none';
    $('#sessEtat').textContent = '';
    if (o === 'L') {
      const c = H.courant();
      $('#sessExo').innerHTML = `Exercice : <b>${esc(c.titre)}</b><br><span style="color:var(--muted)">C'est lui que le groupe fera. Pour en changer, fermez cette fenêtre et ouvrez-en un autre, au choix ou 🎲 au hasard avec les filtres.</span>`;
      if (c) $('#sessInDuree').value = c.duree || 10;   // la durée conseillée de l'exercice, qui dépend de son niveau
      $('#sessOk').textContent = 'Ouvrir l’arène'; $('#sessOk').disabled = !c;
    } else {
      $('#sessOk').textContent = 'Rejoindre'; $('#sessOk').disabled = false;
    }
  }

  /* Deux entrées, jamais de choix à faire dans la fenêtre : « Rejoindre » depuis
     l'en-tête, « Lancer en groupe » depuis l'exercice ouvert. Un bouton de
     lancement hors exercice serait un cul-de-sac. */
  function ouvrirDialogue(codePrerempli, mode = 'J') {
    if (S) { $('#sessBar').scrollIntoView({ behavior: 'smooth' }); return; }
    if (mode === 'L' && !H.courant()) return;
    if (codePrerempli) $('#sessInCode').value = codePrerempli;
    montrerOnglet(mode);
    $('#sessDlgTitre').textContent = mode === 'L' ? 'Lancer une arène sur cet exercice' : 'Rejoindre une arène';
    const d = $('#sessDlg'); if (!d.open) d.showModal();
    (codePrerempli ? $('#sessInPrenom') : mode === 'J' ? $('#sessInCode') : $('#sessInDuree')).focus();
  }
  const lancer = () => ouvrirDialogue(null, 'L');

  async function valider() {
    const etat = $('#sessEtat'); etat.textContent = '';
    const ok = $('#sessOk'); ok.disabled = true;
    try {
      if (onglet === 'J') {
        const code = $('#sessInCode').value.trim().toUpperCase();
        if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Le code fait six lettres ou chiffres.');
        const nom = nomSaisi('');
        S = { code };   // appel() lit S.code
        const d = await appel('POST', { action: 'rejoindre', code, nom });
        $('#sessDlg').close();
        suivre({ code, nom, jeton: d.jeton });
        if (vue.pleinEcran) pleinEcran();   // encore dans le geste du clic : le navigateur l'accepte
      } else {
        const c = H.courant(); if (!c) throw new Error('Aucun exercice ouvert.');
        const min = Number($('#sessInDuree').value);
        if (!(min >= 1 && min <= 180)) throw new Error('Durée entre 1 et 180 minutes.');
        const nom = nomSaisi('L');
        const joue = $('#sessInJoue').checked, indices = $('#sessInIndices').checked, pleinEcran = $('#sessInPlein').checked;
        const d = await appel('POST', { action: 'creer', page: H.page, niveau: c.niveau, exo: c.exo, titre: c.titre, duree: Math.round(min * 60), pleinEcran });
        let jeton = null;
        if (joue) jeton = (await appel('POST', { action: 'rejoindre', code: d.code, nom })).jeton;
        $('#sessDlg').close();
        suivre({ code: d.code, cle: d.cle, nom: joue ? nom : null, jeton, indices });
        montrerGrand(true);
      }
    } catch (e) { S = null; etat.textContent = e.message; }
    ok.disabled = false;
  }

  async function demarrer() {
    const b = $('#sessGo'); b.disabled = true;
    try { await appel('POST', { action: 'demarrer', code: S.code, cle: S.cle }); await rafraichir(); }
    catch (e) { $('#sessMsg').textContent = e.message; }
    b.disabled = false;
  }

  function lien() {
    const url = `${location.origin}${location.pathname}?arene=${S.code}`;
    const fait = () => { $('#sessMsg').textContent = 'Lien copié.'; setTimeout(rendre, 2500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(fait, () => prompt('Lien de l’arène', url));
    else prompt('Lien de l’arène', url);
  }

  /* ───── mise en place ───── */
  function init(accroches) {
    Object.assign(H, accroches);
    if (location.protocol === 'file:') return;   // pas de serveur en fichier local
    const st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    const entete = document.querySelector('header');
    entete.insertAdjacentHTML('afterend', BARRE);
    // la barre se colle sous l'en-tête, lui-même collant : le chrono reste visible pendant qu'on code
    const caler = () => { $('#sessBar').style.top = entete.offsetHeight + 'px'; };
    caler(); window.addEventListener('resize', caler);
    document.body.insertAdjacentHTML('beforeend', DLG);
    const btn = document.createElement('button');
    btn.id = 'sessBtn'; btn.textContent = '⚔️ Rejoindre une arène'; btn.title = 'Rejoindre un exercice chronométré en groupe, avec le code affiché';
    btn.onclick = () => ouvrirDialogue(null, 'J');
    const zone = document.getElementById('status') || entete;
    zone.insertBefore(btn, zone.firstChild);

    $('#sessOk').onclick = valider; $('#sessAnnul').onclick = () => $('#sessDlg').close();
    $('#sessDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); valider(); } });
    $('#sessGo').onclick = demarrer; $('#sessLien').onclick = lien;
    document.body.insertAdjacentHTML('beforeend', GRAND);
    $('#sessGrand').onclick = () => montrerGrand(true);
    $('#sessPlein').onclick = pleinEcran;
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && S && S.nom && !S.cle && vue && vue.pleinEcran && vue.etat === 'en_cours') signalerSortie();
      rendre();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && S && S.nom && !S.cle && vue && vue.pleinEcran && vue.etat === 'en_cours') signalerSortie();
    });
    $('#sessGrandFermer').onclick = () => montrerGrand(false);
    $('#sessGrandGo').onclick = demarrer;
    $('#sessSoumettre').onclick = confirmerSoumission;
    $('#sessVoir').onclick = voirSolutions; $('#sessSolFermer').onclick = () => $('#sessSol').close();
    $('#sessQuit').onclick = () => {
      if (!vue || vue.etat === 'fini' || confirm(S.cle ? 'Quitter l’arène ? Elle continue sans vous ; vous ne verrez plus les solutions.' : 'Quitter l’arène ? Vous en serez retiré.')) quitter(true);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S) rafraichir(); });

    const code = new URLSearchParams(location.search).get('arene');
    const st0 = lireStock();
    if (st0 && st0.code && (!code || st0.code === code.toUpperCase())) suivre(st0);
    else if (code) ouvrirDialogue(code.toUpperCase());
  }

  /* Vrai tant que la session cache indices et solutions : du compte à rebours à la fin. */
  const verrouille = () => !!(S && vue && !S.indices && (vue.etat === 'compte_a_rebours' || vue.etat === 'en_cours'));

  return { init, verrouille, lancer, ouvrirDialogue, get active() { return !!S; } };
})();
