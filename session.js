/* Sessions chronométrées du Codex — côté navigateur.

   Un groupe lance un même exercice, avec un chrono commun et un classement de
   ceux qui l'ont réussi. Le serveur est netlify/functions/session.mjs, joint
   sur /api/session : c'est lui qui tient l'horloge et les résultats.

   Ce fichier ne connaît pas la page qui l'accueille. Chaque page l'appelle
   avec trois accroches :
     Session.init({
       page:      'python',                      // python, r ou sql
       courant:   () => ({niveau, exo, titre, duree}) ou null,   // l'exercice ouvert
       ouvrir:    async (niveau, exo) => {...},  // ouvre l'exercice de la session
     });
   et signale une réussite par Session.reussite(niveau, exo) là où elle
   constate que tous les tests passent.

   Ce que le navigateur retient : sessionStorage garde le code, le pseudo, le
   jeton et, pour le lanceur, sa clé. Un rechargement de la page reprend la
   session ; fermer l'onglet l'oublie.

   Registre : c'est de l'entraînement. La réussite est déclarée par le
   navigateur, le serveur ne la vérifie pas ; seul le temps est mesuré chez lui. */

window.Session = (() => {
  const API = '/api/session';
  const CLE = 'codex_session';
  const H = {};                 // accroches de la page
  let S = null;                 // {code, pseudo, jeton, cle} — la session suivie
  let vue = null;               // dernière vue serveur
  let decalage = 0;             // horloge serveur − horloge locale
  let minuterie = null, horloge = null;

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const maintenant = () => Date.now() + decalage;

  const lireStock = () => { try { return JSON.parse(sessionStorage.getItem(CLE)) || null; } catch { return null; } };
  const stocker = () => { try { S ? sessionStorage.setItem(CLE, JSON.stringify(S)) : sessionStorage.removeItem(CLE); } catch {} };

  async function appel(methode, corps, code) {
    const rep = await fetch(methode === 'GET' ? `${API}?code=${encodeURIComponent(code)}` : API, {
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
    display:none;gap:14px 22px;align-items:center;flex-wrap:wrap;font-size:13.5px;position:sticky;top:0;z-index:19}
  #sessBar.on{display:flex}
  #sessBar .code{font-size:22px;font-weight:700;letter-spacing:3px;color:var(--accent);font-family:ui-monospace,Menlo,monospace}
  #sessBar .chrono{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace;min-width:84px}
  #sessBar .chrono.fin{color:var(--ko)}
  #sessBar .titre{color:var(--muted)}
  #sessBar .titre b{color:var(--ink);font-weight:600}
  #sessBar .moi{padding:3px 10px;border-radius:14px;background:var(--ok-soft);color:var(--ok);font-weight:600}
  #sessBar .classement{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center}
  #sessBar .classement span{background:var(--code);border-radius:4px;padding:2px 8px;font-variant-numeric:tabular-nums}
  #sessBar .classement span.moi{background:var(--ok-soft);color:var(--ok)}
  #sessBar .classement em{color:var(--muted);font-style:normal}
  #sessBar .actions{margin-left:auto;display:flex;gap:8px;align-items:center}
  #sessBar .msg{color:var(--muted);font-size:12.5px}
  #sessBtn{font-size:12.5px;padding:5px 11px}
  dialog#sessDlg{border:1px solid var(--line);border-radius:6px;padding:0;max-width:460px;
    width:calc(100% - 32px);background:var(--panel);color:var(--ink);font:inherit}
  dialog#sessDlg::backdrop{background:rgba(60,56,54,.45)}
  #sessDlg h3{margin:0;padding:13px 18px;border-bottom:1px solid var(--line);font-size:15px;color:var(--accent)}
  #sessDlg .onglets{display:flex;border-bottom:1px solid var(--line)}
  #sessDlg .onglets button{flex:1;border:0;border-radius:0;background:none;padding:9px;font-weight:600;color:var(--muted)}
  #sessDlg .onglets button.on{color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}
  #sessDlg .corps{padding:14px 18px}
  #sessDlg label{display:block;font-size:13px;font-weight:600;margin:10px 0 5px}
  #sessDlg label:first-child{margin-top:0}
  #sessDlg input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:5px;font:inherit;background:var(--bg);color:var(--ink)}
  #sessDlg input.code{font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:4px;text-transform:uppercase;text-align:center}
  #sessDlg .aide{margin:6px 0 0;font-size:12.5px;color:var(--muted)}
  #sessDlg .pied{padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center}
  #sessDlg .etat{font-size:12.5px;color:var(--ko);margin-left:auto}
  #sessDlg .exo{background:var(--code);border-radius:5px;padding:8px 10px;font-size:13px}
  #sessDlg .exo b{font-weight:600}`;

  const BARRE = `<div id="sessBar">
    <span class="code" id="sessCode"></span>
    <span class="chrono" id="sessChrono">--:--</span>
    <span class="titre" id="sessTitre"></span>
    <span id="sessMoi"></span>
    <span class="classement" id="sessClass"></span>
    <span class="actions">
      <span class="msg" id="sessMsg"></span>
      <button id="sessLien" title="Copier le lien de la session">🔗 Copier le lien</button>
      <button class="primary" id="sessGo" style="display:none">▶ Démarrer</button>
      <button id="sessQuit">Quitter</button>
    </span>
  </div>`;

  const DLG = `<dialog id="sessDlg">
    <h3>Session chronométrée</h3>
    <div class="onglets">
      <button id="sessTabJ" class="on">Rejoindre</button>
      <button id="sessTabL">Lancer</button>
    </div>
    <div class="corps" id="sessPanJ">
      <label for="sessInCode">Code de la session</label>
      <input class="code" id="sessInCode" maxlength="6" autocomplete="off" spellcheck="false" placeholder="ABC234">
      <label for="sessInPseudo">Votre pseudo</label>
      <input id="sessInPseudo" maxlength="24" autocomplete="off" placeholder="Comme vous voulez apparaître au classement">
      <p class="aide">Aucun nom, aucun compte. Le pseudo ne sert qu'au classement de cette session.</p>
    </div>
    <div class="corps" id="sessPanL" style="display:none">
      <div class="exo" id="sessExo"></div>
      <label for="sessInDuree">Durée, en minutes</label>
      <input id="sessInDuree" type="number" min="1" max="180" step="1">
      <label for="sessInPseudoL">Votre pseudo <span style="font-weight:400;color:var(--muted)">facultatif</span></label>
      <input id="sessInPseudoL" maxlength="24" autocomplete="off" placeholder="Laissez vide pour seulement animer">
      <p class="aide">Vous recevez un code à donner au groupe. Le chrono démarre quand vous le décidez, après un compte à rebours de 10 secondes.</p>
    </div>
    <div class="pied">
      <button class="primary" id="sessOk">Rejoindre</button>
      <button id="sessAnnul">Annuler</button>
      <span class="etat" id="sessEtat"></span>
    </div>
  </dialog>`;

  /* ───── rendu de la barre ───── */
  function rendre() {
    const bar = $('#sessBar');
    if (!S || !vue) { bar.classList.remove('on'); return; }
    bar.classList.add('on');
    $('#sessCode').textContent = vue.code;
    $('#sessTitre').innerHTML = `<b>${esc(vue.titre || 'Exercice ' + vue.exo)}</b> · ${Math.round(vue.duree / 60)} min · ${vue.participants.length} participant${vue.participants.length > 1 ? 's' : ''}`;
    const moi = S.pseudo ? vue.resultats.findIndex(r => r.pseudo.toLowerCase() === S.pseudo.toLowerCase()) : -1;
    $('#sessMoi').innerHTML = !S.pseudo ? '' : moi >= 0
      ? `<span class="moi">${esc(S.pseudo)} · ${moi + 1}${moi === 0 ? 'er' : 'e'} en ${mmss(vue.resultats[moi].temps)}</span>`
      : `<span class="titre">${esc(S.pseudo)}</span>`;
    const cl = $('#sessClass');
    if (vue.etat === 'attente') {
      cl.innerHTML = vue.participants.map(p => `<span${S.pseudo && p.toLowerCase() === S.pseudo.toLowerCase() ? ' class="moi"' : ''}>${esc(p)}</span>`).join('')
        || '<em>Personne n’a encore rejoint.</em>';
    } else {
      cl.innerHTML = vue.resultats.map((r, i) =>
        `<span${S.pseudo && r.pseudo.toLowerCase() === S.pseudo.toLowerCase() ? ' class="moi"' : ''}>${i + 1}. ${esc(r.pseudo)} ${mmss(r.temps)}</span>`).join('')
        || (vue.etat === 'fini' ? '<em>Personne n’a réussi dans le temps.</em>' : '<em>Aucune réussite pour l’instant.</em>');
    }
    $('#sessGo').style.display = S.cle && vue.etat === 'attente' ? '' : 'none';
    $('#sessMsg').textContent = vue.etat === 'attente'
      ? (S.cle ? 'Donnez le code au groupe, puis démarrez.' : 'En attente du départ…')
      : vue.etat === 'compte_a_rebours' ? 'Départ imminent…'
      : vue.etat === 'fini' ? 'Terminé. Classement figé.' : '';
    tic();
  }

  function tic() {
    const el = $('#sessChrono');
    if (!vue || !vue.debut) { el.textContent = mmss(vue ? vue.duree * 1000 : 0); el.classList.remove('fin'); return; }
    const t = maintenant();
    if (t < vue.debut) { el.textContent = '− ' + Math.ceil((vue.debut - t) / 1000); el.classList.remove('fin'); return; }
    const reste = vue.fin - t;
    el.textContent = mmss(reste);
    el.classList.toggle('fin', reste <= 0);
    if (reste <= 0 && vue.etat !== 'fini') { vue.etat = 'fini'; rendre(); rafraichir(); }
  }

  /* ───── suivi ───── */
  let dernierEtat = null;
  async function rafraichir() {
    if (!S) return;
    try {
      await appel('GET', null, S.code);
    } catch (e) {
      if (/inconnue|expirée/.test(e.message)) { quitter(); return; }
      $('#sessMsg').textContent = 'Connexion perdue, nouvel essai…';
      return;
    }
    if (vue.etat !== dernierEtat) {
      if (vue.etat === 'compte_a_rebours' || (vue.etat === 'en_cours' && dernierEtat !== 'compte_a_rebours' && dernierEtat !== 'en_cours'))
        await H.ouvrir(vue.niveau, vue.exo);
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

  function quitter() {
    clearInterval(minuterie); clearInterval(horloge); minuterie = horloge = null;
    S = null; vue = null; dernierEtat = null; stocker(); rendre();
    if (location.search.includes('session=')) history.replaceState(null, '', location.pathname);
  }

  /* ───── réussite ───── */
  let envoi = false;
  async function reussite(niveau, exo) {
    if (!S || !S.pseudo || !vue || !vue.debut) return;
    if (String(vue.niveau) !== String(niveau) || String(vue.exo) !== String(exo)) return;
    if (envoi || vue.resultats.some(r => r.pseudo.toLowerCase() === S.pseudo.toLowerCase())) return;
    envoi = true;
    try { await appel('POST', { action: 'reussir', code: S.code, pseudo: S.pseudo, jeton: S.jeton }); }
    catch (e) { $('#sessMsg').textContent = e.message; }
    envoi = false;
    rendre();
  }

  /* ───── dialogue ───── */
  let onglet = 'J';
  function montrerOnglet(o) {
    onglet = o;
    $('#sessTabJ').classList.toggle('on', o === 'J'); $('#sessTabL').classList.toggle('on', o === 'L');
    $('#sessPanJ').style.display = o === 'J' ? '' : 'none'; $('#sessPanL').style.display = o === 'L' ? '' : 'none';
    $('#sessEtat').textContent = '';
    if (o === 'L') {
      const c = H.courant();
      $('#sessExo').innerHTML = c
        ? `Exercice ouvert : <b>${esc(c.titre)}</b><br><span style="color:var(--muted)">Pour en changer, fermez cette fenêtre et ouvrez-en un autre, au choix ou 🎲 au hasard avec les filtres.</span>`
        : `<span style="color:var(--muted)">Ouvrez d'abord un exercice, au choix dans la liste ou 🎲 au hasard avec les filtres. C'est lui que le groupe fera.</span>`;
      if (c && !$('#sessInDuree').value) $('#sessInDuree').value = c.duree || 10;
      $('#sessOk').textContent = 'Créer la session'; $('#sessOk').disabled = !c;
    } else {
      $('#sessOk').textContent = 'Rejoindre'; $('#sessOk').disabled = false;
    }
  }

  function ouvrirDialogue(codePrerempli) {
    if (S) { $('#sessBar').scrollIntoView({ behavior: 'smooth' }); return; }
    if (codePrerempli) $('#sessInCode').value = codePrerempli;
    montrerOnglet(codePrerempli || !H.courant() ? 'J' : 'L');
    const d = $('#sessDlg'); if (!d.open) d.showModal();
    (codePrerempli ? $('#sessInPseudo') : onglet === 'J' ? $('#sessInCode') : $('#sessInDuree')).focus();
  }

  async function valider() {
    const etat = $('#sessEtat'); etat.textContent = '';
    const ok = $('#sessOk'); ok.disabled = true;
    try {
      if (onglet === 'J') {
        const code = $('#sessInCode').value.trim().toUpperCase(), pseudo = $('#sessInPseudo').value.trim();
        if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Le code fait six lettres ou chiffres.');
        if (pseudo.length < 2) throw new Error('Un pseudo de deux caractères au moins.');
        const d = await appel('POST', { action: 'rejoindre', code, pseudo });
        $('#sessDlg').close();
        suivre({ code, pseudo, jeton: d.jeton });
      } else {
        const c = H.courant(); if (!c) throw new Error('Aucun exercice ouvert.');
        const min = Number($('#sessInDuree').value);
        if (!(min >= 1 && min <= 180)) throw new Error('Durée entre 1 et 180 minutes.');
        const pseudo = $('#sessInPseudoL').value.trim();
        if (pseudo && pseudo.length < 2) throw new Error('Un pseudo de deux caractères au moins.');
        const d = await appel('POST', { action: 'creer', page: H.page, niveau: c.niveau, exo: c.exo, titre: c.titre, duree: Math.round(min * 60) });
        let jeton = null;
        if (pseudo) jeton = (await appel('POST', { action: 'rejoindre', code: d.code, pseudo })).jeton;
        $('#sessDlg').close();
        suivre({ code: d.code, cle: d.cle, pseudo: pseudo || null, jeton });
      }
    } catch (e) { etat.textContent = e.message; }
    ok.disabled = false;
  }

  async function demarrer() {
    const b = $('#sessGo'); b.disabled = true;
    try { await appel('POST', { action: 'demarrer', code: S.code, cle: S.cle }); await rafraichir(); }
    catch (e) { $('#sessMsg').textContent = e.message; }
    b.disabled = false;
  }

  function lien() {
    const url = `${location.origin}${location.pathname}?session=${S.code}`;
    const fait = () => { $('#sessMsg').textContent = 'Lien copié.'; setTimeout(rendre, 2500); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(fait, () => prompt('Lien de la session', url));
    else prompt('Lien de la session', url);
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
    btn.id = 'sessBtn'; btn.textContent = '👥 Session'; btn.title = 'Lancer ou rejoindre un exercice chronométré en groupe';
    btn.onclick = () => ouvrirDialogue();
    const zone = document.getElementById('status') || document.querySelector('header');
    zone.insertBefore(btn, zone.firstChild);

    $('#sessTabJ').onclick = () => montrerOnglet('J'); $('#sessTabL').onclick = () => montrerOnglet('L');
    $('#sessOk').onclick = valider; $('#sessAnnul').onclick = () => $('#sessDlg').close();
    $('#sessDlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); valider(); } });
    $('#sessGo').onclick = demarrer; $('#sessLien').onclick = lien;
    $('#sessQuit').onclick = () => { if (!vue || vue.etat === 'fini' || confirm('Quitter la session ?')) quitter(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S) rafraichir(); });

    const code = new URLSearchParams(location.search).get('session');
    const st0 = lireStock();
    if (st0 && (!code || st0.code === code.toUpperCase())) suivre(st0);
    else if (code) ouvrirDialogue(code.toUpperCase());
  }

  return { init, reussite, ouvrirDialogue, get active() { return !!S; } };
})();
