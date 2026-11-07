/* Compte du Codex — le lien entre les pages et le serveur. Lot 2, 6 novembre 2026.

   Sans serveur (Netlify) ou sans connexion : rien ne change, la progression
   reste dans le localStorage du navigateur et aucun lien n'apparaît.

   Depuis le 8 novembre 2026, sur le serveur, les exercices demandent un compte : sans
   connexion, la page est verrouillée derrière une invitation à se connecter (verrouiller).

   Connecté : la progression de la page se lit et s'écrit sur le serveur, et le
   navigateur n'en garde rien — sur un poste partagé, la personne suivante ne
   voit pas celle d'avant. Décision du 6 novembre 2026 : à la première
   connexion, le serveur part de zéro ; ce que le navigateur contenait est
   ignoré, il reste disponible hors connexion.

   Chaque page appelle Compte.brancher(page, progression, enregistrerLocal,
   redessiner) et obtient en retour sa fonction d'enregistrement :
     - hors connexion, c'est enregistrerLocal ;
     - connecté, c'est un envoi au serveur des seules entrées modifiées,
       groupé sur une seconde, et forcé quand la page se cache ou se ferme.
*/
window.Compte = (() => {
  let moi = null;
  let attente = null;

  // /api/moi ne répond que sur le serveur : ailleurs, 404 et on ne montre rien.
  const qui = () => attente || (attente = fetch('/api/moi', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)
    .then(m => { moi = m; if (m) afficher(); return m; }));

  function afficher() {
    if (document.readyState === 'loading') { addEventListener('DOMContentLoaded', afficher); return; }
    const entete = document.getElementById('status') || document.querySelector('header');
    if (!entete || document.getElementById('compteLien')) return;
    const a = document.createElement('a');
    a.id = 'compteLien';
    a.className = 'fiche';
    if (moi.connecte) {
      a.href = '/compte';
      if (moi.avatar) {
        const img = document.createElement('img'); img.src = moi.avatar; img.alt = '';
        img.style.cssText = 'width:20px;height:20px;border-radius:50%;vertical-align:-5px;margin-right:6px;object-fit:cover';
        a.append(img, moi.pseudo || moi.nom);
      } else a.textContent = '👤 ' + (moi.pseudo || moi.nom);
      a.title = 'Mon compte — ' + moi.adresse + '. Votre progression est enregistrée sur le serveur.';
    } else {
      a.href = '/auth/login?suite=' + encodeURIComponent(location.pathname);
      a.textContent = 'Se connecter';
      a.title = 'Un compte pour s’entraîner et jouer en arène ; le compte UniLaSalle pour les évaluations.';
    }
    // en dernier, à droite : le lien arrive après le chargement, rien d'autre ne doit bouger (7 novembre 2026)
    entete.append(a);
  }

  function brancher(page, progression, enregistrerLocal, redessiner) {
    let serveur = false;
    let envoye = {};          // id → JSON de la dernière version envoyée
    let minuteur = null;

    const changes = () => {
      const delta = {};
      for (const [id, v] of Object.entries(progression)) {
        const j = JSON.stringify(v);
        if (envoye[id] !== j) delta[id] = v;
      }
      return delta;
    };

    const envoyer = (force) => {
      clearTimeout(minuteur); minuteur = null;
      const delta = changes();
      if (!Object.keys(delta).length) return;
      for (const id of Object.keys(delta)) envoye[id] = JSON.stringify(delta[id]);
      fetch('/api/progression?page=' + page, {
        method: 'POST', keepalive: !!force,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(delta),
      }).catch(() => { for (const id of Object.keys(delta)) delete envoye[id]; });  // renvoyé à la prochaine fois
    };

    const sauver = () => {
      if (!serveur) { enregistrerLocal(); return; }
      if (!minuteur) minuteur = setTimeout(() => envoyer(false), 1000);
    };

    qui().then(async m => {
      if (m && !m.connecte) { verrouiller(); return; }   // sur le serveur, les exercices demandent un compte (8 novembre 2026)
      if (!m || !m.connecte) return;
      let lu;
      try {
        const r = await fetch('/api/progression?page=' + page, { cache: 'no-store' });
        if (!r.ok) return;
        lu = await r.json();
      } catch (_) { return; }
      for (const id of Object.keys(progression)) delete progression[id];
      Object.assign(progression, lu);
      envoye = {};
      for (const [id, v] of Object.entries(lu)) envoye[id] = JSON.stringify(v);
      serveur = true;
      if (redessiner) redessiner();
    });

    addEventListener('pagehide', () => { if (serveur) envoyer(true); });
    addEventListener('visibilitychange', () => { if (serveur && document.visibilityState === 'hidden') envoyer(true); });
    return sauver;
  }

  qui();

  /* Décision du 8 novembre 2026 : sur le serveur, faire les exercices, lancer ou rejoindre une arène
     demande un compte ; l'évaluation, un compte UniLaSalle. Sans connexion, la page d'exercices reste
     visible mais inerte, derrière une invitation à se connecter. Les pages d'explication restent
     ouvertes. Sans serveur (Netlify), rien ne change jusqu'à la bascule. */
  function verrouiller() {
    if (document.readyState === 'loading') { addEventListener('DOMContentLoaded', verrouiller); return; }
    if (document.getElementById('compteVerrou')) return;
    const main = document.querySelector('main') || document.body;
    main.setAttribute('inert', ''); main.style.filter = 'blur(2px)'; main.style.opacity = '.55';
    const v = document.createElement('div');
    v.id = 'compteVerrou';
    v.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,57,92,.35)';
    const suite = encodeURIComponent(location.pathname + location.search);
    v.innerHTML = `<div style="max-width:460px;background:var(--panel,var(--carte,#fff));color:var(--ink,var(--texte,#00395C));border:1px solid var(--line,var(--trait,#CFD9E5));border-radius:12px;padding:26px 28px;box-shadow:0 18px 50px rgba(0,0,0,.25);font-family:inherit">
        <h2 style="margin:0 0 10px;font-size:20px">Un compte pour s'entraîner</h2>
        <p style="margin:0 0 14px;line-height:1.55">Les exercices, les arènes et les évaluations du Codex demandent un compte : votre progression, vos points et votre classement y sont rattachés.</p>
        <p style="margin:0 0 18px"><a href="/auth/login?suite=${suite}" style="display:inline-block;background:#FF595D;color:#fff;padding:10px 16px;border-radius:8px;font-weight:600;text-decoration:none">Se connecter</a>
           &nbsp; <a href="/auth/inscription?suite=${suite}" style="color:inherit">Créer un compte</a></p>
        <p style="margin:0;font-size:13.5px;color:var(--muted,var(--doux,#4D6386))">Compte UniLaSalle pour les étudiants et les personnels, seul à ouvrir les évaluations ; adresse et mot de passe pour les autres. <a href="/" style="color:inherit">Accueil</a> · <a href="debuter.html" style="color:inherit">Par où commencer</a></p>
      </div>`;
    document.body.append(v);
  }

  /* La mesure par exercice (7 novembre 2026) : ouvertures, essais, réussites, envoyés par lots
     de quelques secondes quand on est connecté. Sert à améliorer la banque : taux de réussite,
     temps jusqu'à la réussite, essais avant réussite, abandons. Rien n'est envoyé sans compte. */
  let lot = [], minuteurLot = null;
  function activite(page, exercice, type, ok, total) {
    if (!moi || !moi.connecte) return;
    lot.push({ page, exercice: String(exercice), type, ok, total, t: Date.now() });
    if (!minuteurLot) minuteurLot = setTimeout(() => envoyerLot(false), 4000);
  }
  function envoyerLot(force) {
    clearTimeout(minuteurLot); minuteurLot = null;
    if (!lot.length) return;
    const maintenant = Date.now();
    const corps = lot.map(e => ({ page: e.page, exercice: e.exercice, type: e.type, ok: e.ok, total: e.total, il_y_a: Math.round((maintenant - e.t) / 1000) }));
    lot = [];
    fetch('/api/activite', { method: 'POST', keepalive: !!force, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) }).catch(() => {});
  }
  addEventListener('pagehide', () => envoyerLot(true));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') envoyerLot(true); });

  // present : le serveur du Codex répond (faux sur Netlify) ; connecte : une personne est connectée
  return { qui, brancher, activite, present: () => !!moi, connecte: () => !!(moi && moi.connecte), moi: () => moi };
})();
