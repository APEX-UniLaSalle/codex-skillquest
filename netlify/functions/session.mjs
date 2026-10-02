/* Sessions chronométrées du Codex — fonction serveur.

   Pourquoi : un chrono commun à un groupe, un classement et la remise des
   solutions à l'enseignant ont besoin d'une horloge de référence et d'un
   endroit où chaque poste dépose son résultat. Le site est statique ; cette
   fonction est le seul code qui tourne côté serveur. Elle vit sur le même
   compte Netlify que le site, avec Netlify Blobs comme stockage. Aucun autre
   fournisseur.

   Ce qu'elle tient : une arène = un lanceur, des participants sous pseudo,
   avec leur adresse étudiante en évaluation, et des manches successives, une
   par exercice, chacune avec sa durée, son départ commun, ses pauses, et une
   soumission par participant (code, tests passés, temps). En évaluation, une
   note sur 20 et une médaille cumulées sur les manches, et un fichier
   d'import pour l'application. Une arène s'efface 24 h après sa création.
   Pseudos, adresses et codes soumis disparaissent avec elle.

   Ce qu'elle ne garantit pas : le nombre de tests passés est déclaré par le
   navigateur, qui exécute les tests. Seul le temps est mesuré ici, sur
   l'horloge du serveur. Entraînement et contrôle en séance, pas évaluation
   certificative.

   Chaque participant et chaque soumission est un blob distinct : deux postes
   qui écrivent en même temps ne s'écrasent pas. Deux requêtes simultanées du
   même participant, elles, peuvent se doubler : lecture puis écriture sans
   verrou. Un seul navigateur par participant, le cas n'a pas de portée.

   Quitter ne détruit rien : le participant est marqué parti, sa soumission et
   ses sorties restent, et il garde sa place dans les scores et le fichier
   d'import. Une personne se reconnaît à son adresse : revenir, sous le même
   pseudo ou un autre, reprend son état avec un jeton neuf. Sans adresse, en
   entraînement, c'est le pseudo qui fait foi. Le lanceur peut exclure un
   participant : son pseudo et son adresse ne reviennent plus.

   Ne pas soumettre vaut 0 à la note : une remise automatique garde le code
   pour le lanceur, mais ne rapporte rien. Décision du 2 octobre 2026.

   Appels, tous sur /api/session :
     POST {action:'creer', page, niveau, exo, titre, duree, points, mode} → {code, cle, session}
       Ouverte à tous, sans mot de passe : décision du 28 septembre 2026, une
       arène coûte moins d'un crédit Netlify sur les 3 000 du mois.
       page : python, r ou sql — la page qui ouvrira l'exercice
       mode : 'eval' — plein écran demandé, sorties décomptées, score cumulé sur
              les manches, solutions réservées au lanceur ;
              'entrainement' — rien de tout cela, et chacun voit les solutions
              des autres une fois la sienne soumise
     GET  ?code=…&nom=…&jeton=…                               → vue d'un participant :
       son score, et en entraînement les solutions déjà soumises
     GET  ?code=ABC234[&cle=…]                                → {session, maintenant}
       avec la clé du lanceur, la vue porte aussi les soumissions et leur code
     POST {action:'rejoindre', code, nom, email[, jeton, eval]} → {jeton, session}
       nom : le pseudo, affiché à tous ; email : l'adresse @etu.unilasalle.fr,
       exigée en évaluation, visible du seul lanceur, qui s'en sert pour le
       fichier d'import de l'application SkillQuest
       eval:false — dans une arène d'évaluation, le participant la passe hors
       évaluation : sans plein écran, sans score, indices et solution après
       sa soumission. Choix fait en rejoignant, définitif.
     POST {action:'quitter', code, nom, jeton}                → {session}
     POST {action:'exclure', code, cle, nom}                  → {session}
     POST {action:'sortie', code, nom, jeton}                 → {session}
       le participant a quitté le plein écran ou l'onglet ; compté par manche,
       montré au lanceur ; sa soumission de la manche n'est pas comptée, sauf
       décision du lanceur :
     POST {action:'compter', code, cle, nom, manche, compte}  → {session}
     POST {action:'demarrer', code, cle}                      → {session}
     POST {action:'prolonger', code, cle, secondes}           → {session}
     POST {action:'pause', code, cle} / {action:'reprendre', code, cle} → {session}
       le chrono s'arrête ; à la reprise, la fin recule d'autant ; le temps des
       soumissions ne compte pas les pauses
     POST {action:'relancer', code, cle, niveau, exo, titre, duree} → {session}
       manche suivante sur un autre exercice : les participants restent, les
       soumissions de la manche close sont gardées pour l'export
     POST {action:'soumettre', code, nom, jeton, source, ok, total[, auto, manche]}
                                                              → {soumission, session}
*/

import { getStore } from '@netlify/blobs';

export const config = { path: '/api/session' };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ni 0/O, ni 1/I
const DUREE_VIE = 24 * 3600 * 1000;
const COMPTE_A_REBOURS = 10 * 1000;
const TOLERANCE_FIN = 3 * 1000;      // une soumission cliquée juste avant la fin peut arriver juste après
const TOLERANCE_PROLONGATION = 20 * 1000;   // le lanceur peut encore prolonger juste après la fin
const TOLERANCE_AUTO = 90 * 1000;    // la page envoie d'elle-même le code de ceux qui n'ont pas soumis
const MAX_PARTICIPANTS = 200;
const MAX_SOURCE = 20000;
const DUREE_VALIDATION = 3600;   // une heure d'exercices cumulée avant de donner une médaille

const json = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const erreur = (message, statut = 400) => json({ erreur: message }, statut);

const tirerCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), o => ALPHABET[o % ALPHABET.length]).join('');
const tirerSecret = () => crypto.randomUUID();

/* Seuils du socle pour un savoir-faire : Bronze 10/20, Argent 15/20, Or 20/20. */
const medaille = note => note >= 20 ? 'Or' : note >= 15 ? 'Argent' : note >= 10 ? 'Bronze' : null;

const meme = (a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }) === 0;

const EMAIL = /^[a-z0-9][a-z0-9._-]*@etu\.unilasalle\.fr$/;
const nettoyerEmail = e => String(e || '').trim().toLowerCase().slice(0, 80);

const nettoyerNom = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);

/* « Léa Martin » et « léa martin » sont la même personne : la clé est en
   minuscules sans accents, le blob garde la graphie saisie. */
const cleId   = nom => encodeURIComponent(nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
const cleMeta = code => `sess/${code}/meta`;
const clePart = (code, nom) => `sess/${code}/p/${cleId(nom)}`;
const cleSoum = (code, manche, nom) => `sess/${code}/s/${manche}/${cleId(nom)}`;

async function lireMeta(store, code) {
  if (!/^[A-Z2-9]{6}$/.test(code || '')) return null;
  const meta = await store.get(cleMeta(code), { type: 'json' });
  if (!meta) return null;
  if (Date.now() > meta.expire) return null;
  return meta;
}

async function lireTous(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
}

/* Vue d'une session. Sans la clé du lanceur : ni jetons, ni code soumis.
   Avec elle : les soumissions complètes, pour l'enseignant. */
async function vue(store, meta, lanceur = false, participant = null) {
  const [parts, soums] = await Promise.all([
    lireTous(store, `sess/${meta.code}/p/`),
    lireTous(store, `sess/${meta.code}/s/${meta.manche}/`),
  ]);
  const tri = (a, b) => a.localeCompare(b, 'fr');
  const participants = parts.filter(p => !p.parti).map(p => p.nom).sort(tri);
  const tousParticipants = parts.filter(p => !p.exclu).map(p => p.nom).sort(tri);
  const soumis = soums.map(s => s.nom).sort(tri);
  const sortiesDe = (p, manche) => (p.sortiesParManche || {})[manche] || 0;
  // une soumission compte si son auteur n'est pas sorti du plein écran pendant
  // la manche, ou si le lanceur a décidé de la compter malgré tout
  const partDe = nom => parts.find(x => x.nom.localeCompare(nom, 'fr', { sensitivity: 'base' }) === 0);
  const enEval = nom => { const p = partDe(nom); return !!p && p.eval !== false; };
  const compte = s => {
    if (meta.mode !== 'eval' || !enEval(s.nom)) return true;
    if (typeof s.compte === 'boolean') return s.compte;
    const p = partDe(s.nom);
    return !p || sortiesDe(p, s.manche) === 0;
  };
  const horsEval = meta.mode === 'eval' ? parts.filter(p => p.eval === false).map(p => p.nom).sort(tri) : [];
  const resultats = soums.filter(s => s.reussi && compte(s)).sort((a, b) => a.temps - b.temps)
    .map(s => ({ nom: s.nom, temps: s.temps }));
  const eval_ = meta.mode === 'eval';
  // Score en évaluation, règle du 28 septembre 2026 : tous les exercices de l'arène
  // sont du même niveau ; la note est la moyenne, sur les manches jouées, du
  // pourcentage de tests passés, ramenée sur 20 ; une soumission non comptée ou
  // absente vaut 0. La médaille n'est donnée qu'au bout d'une heure d'exercices
  // cumulée ; avant, on dit combien il manque.
  const maintenant0 = Date.now();
  const courante = meta.debut ? { manche: meta.manche, duree: meta.duree + (meta.prolongations || 0), debut: meta.debut,
                                  close: !meta.pause && maintenant0 >= meta.fin } : null;
  const manchesToutes = [...(meta.historique || []), ...(courante ? [courante] : [])];
  // les prolongations comptent dans le temps d'exercices ; une manche close est dans l'historique ou finie
  const dureeTotale = manchesToutes.reduce((t, m) => t + (m.duree || 0), 0);   // secondes
  const valide = dureeTotale >= DUREE_VALIDATION;
  let scores = null;
  if (eval_ && manchesToutes.length) {
    const toutes = await lireTous(store, `sess/${meta.code}/s/`);
    scores = tousParticipants.filter(enEval).map(nom => {
      // la manche en cours n'entre dans la moyenne d'un participant qu'une fois close,
      // ou dès qu'il a soumis ; une remise automatique vaut 0
      const taux = manchesToutes.map(m => {
        const x = toutes.find(y => y.manche === m.manche && y.nom.localeCompare(nom, 'fr', { sensitivity: 'base' }) === 0);
        if (!x && m === courante && !courante.close) return null;
        return x && compte(x) && !x.auto && x.total ? x.ok / x.total : 0;
      }).filter(t => t !== null);
      if (!taux.length) return { nom, manches: 0, moyenne: 0, note: 0, dureeTotale, valide, manque: valide ? 0 : Math.ceil((DUREE_VALIDATION - dureeTotale) / 60), medaille: null };
      const moyenne = taux.reduce((a, b) => a + b, 0) / taux.length;
      const note = Math.round(moyenne * 20 * 10) / 10;
      return { nom, manches: taux.length, moyenne: Math.round(moyenne * 1000) / 10, note,
               dureeTotale, valide, manque: valide ? 0 : Math.ceil((DUREE_VALIDATION - dureeTotale) / 60),
               medaille: valide ? medaille(note) : null };
    });
  }
  const maintenant = Date.now();
  const etat = !meta.debut ? 'attente'
             : maintenant < meta.debut ? 'compte_a_rebours'
             : meta.pause ? 'pause'
             : maintenant < meta.fin ? 'en_cours' : 'fini';
  // avant le départ, l'exercice n'est connu que du lanceur : personne ne l'ouvre en avance
  const cache = etat === 'attente' && !lanceur;
  const v = {
    code: meta.code, page: meta.page, niveau: cache ? null : meta.niveau, exo: cache ? null : meta.exo, titre: cache ? null : meta.titre,
    duree: meta.duree, pleinEcran: !!meta.pleinEcran, debut: meta.debut, fin: meta.fin, etat,
    pause: meta.pause || null, manche: meta.manche, mode: meta.mode, participants, soumis, resultats,
    horsEval, dureeTotale, valide, tousParticipants,
    // en évaluation, le classement cumulé est public : noms, notes, médailles, sans code
    scores: eval_ ? (scores || []).map(k => ({ ...k })).sort((a, b) => b.note - a.note || a.nom.localeCompare(b.nom, 'fr')) : null,
  };
  if (participant) {
    const p = parts.find(x => x.nom.localeCompare(participant.nom, 'fr', { sensitivity: 'base' }) === 0);
    if (p && p.jeton === participant.jeton) {
      v.monEval = p.eval !== false;
      if (scores) v.monScore = scores.find(x => meme(x.nom, p.nom)) || null;
      // en entraînement, qui a soumis voit les solutions des autres
      if (!eval_ && soums.some(x => meme(x.nom, p.nom)))
        v.solutions = soums.map(x => ({ nom: x.nom, ok: x.ok, total: x.total, temps: x.temps, reussi: x.reussi, source: x.source }))
          .sort((a, b) => tri(a.nom, b.nom));
    }
  }
  if (lanceur) {
    v.emails = Object.fromEntries(parts.filter(p => p.email).map(p => [p.nom, p.email]));
    v.premierDepart = Math.min(...manchesToutes.filter(m => m.debut).map(m => m.debut), Infinity);
    if (!isFinite(v.premierDepart)) v.premierDepart = null;
    v.exclus = parts.filter(p => p.exclu).map(p => p.nom).sort(tri);
    const enrichir = s => ({ ...s, compte: compte(s), sorties: sortiesDe(parts.find(x => x.nom.localeCompare(s.nom, 'fr', { sensitivity: 'base' }) === 0) || {}, s.manche) });
    v.soumissions = soums.map(enrichir).sort((a, b) => tri(a.nom, b.nom));
    v.sorties = Object.fromEntries(parts.filter(p => !p.parti && sortiesDe(p, meta.manche)).map(p => [p.nom, sortiesDe(p, meta.manche)]));
    // toutes les manches, pour l'export : les closes viennent de l'historique
    const toutes = (await lireTous(store, `sess/${meta.code}/s/`)).map(enrichir);
    const courante = { manche: meta.manche, niveau: meta.niveau, exo: meta.exo, titre: meta.titre,
                       duree: meta.duree, debut: meta.debut, fin: meta.fin };
    v.manches = [...(meta.historique || []), courante].map(m => ({
      ...m, soumissions: toutes.filter(x => x.manche === m.manche).sort((a, b) => tri(a.nom, b.nom)),
    }));
  }
  return v;
}

/* Les sessions périmées sont effacées au passage, lors d'une création :
   Blobs n'a pas d'expiration automatique. Le parcours est borné. */
async function purger(store) {
  const { blobs } = await store.list({ prefix: 'sess/' });
  const metas = blobs.filter(b => b.key.endsWith('/meta')).slice(0, 200);
  const maintenant = Date.now();
  for (const b of metas) {
    const meta = await store.get(b.key, { type: 'json' });
    if (meta && maintenant <= meta.expire) continue;
    const code = b.key.split('/')[1];
    const tout = blobs.filter(x => x.key.startsWith(`sess/${code}/`));
    await Promise.all(tout.map(x => store.delete(x.key)));
  }
}

export default async (req) => {
  const store = getStore({ name: 'sessions', consistency: 'strong' });

  if (req.method === 'GET') {
    const u = new URL(req.url);
    const meta = await lireMeta(store, String(u.searchParams.get('code') || '').toUpperCase());
    if (!meta) return erreur('Session inconnue ou expirée.', 404);
    const lanceur = !!u.searchParams.get('cle') && u.searchParams.get('cle') === meta.cle;
    const nom = nettoyerNom(u.searchParams.get('nom')), jeton = u.searchParams.get('jeton');
    return json({ session: await vue(store, meta, lanceur, nom && jeton ? { nom, jeton } : null), maintenant: Date.now() });
  }

  if (req.method !== 'POST') return erreur('Méthode non prise en charge.', 405);

  let corps;
  try { corps = await req.json(); } catch { return erreur('Corps JSON attendu.'); }
  const action = corps.action;
  const code = String(corps.code || '').toUpperCase();

  if (action === 'creer') {
    const duree = Math.round(Number(corps.duree));
    if (!Number.isFinite(duree) || duree < 30 || duree > 3 * 3600)
      return erreur('Durée entre 30 secondes et 3 heures.');
    if (!['python', 'r', 'sql'].includes(corps.page)) return erreur('Page invalide.');
    const niveau = String(corps.niveau || '').slice(0, 20);
    const exo = typeof corps.exo === 'number' ? corps.exo : String(corps.exo || '').slice(0, 40);
    if (!niveau || exo === '') return erreur('Exercice invalide.');
    const mode = corps.mode === 'entrainement' ? 'entrainement' : 'eval';
    purger(store).catch(() => {});
    let nouveau;
    for (let i = 0; i < 5; i++) {
      nouveau = tirerCode();
      if (!(await store.get(cleMeta(nouveau)))) break;
    }
    const meta = {
      code: nouveau, cle: tirerSecret(),
      page: corps.page, niveau, exo, titre: String(corps.titre || '').slice(0, 120),
      duree, mode, pleinEcran: mode === 'eval', points: Math.max(0, Number(corps.points) || 0),
      debut: null, fin: null, pause: null, pauses: 0,
      manche: 1, historique: [],
      cree: Date.now(), expire: Date.now() + DUREE_VIE,
    };
    await store.setJSON(cleMeta(nouveau), meta);
    return json({ code: nouveau, cle: meta.cle, session: await vue(store, meta, true), maintenant: Date.now() });
  }

  const meta = await lireMeta(store, code);
  if (!meta) return erreur('Session inconnue ou expirée.', 404);
  const lanceur = !!corps.cle && corps.cle === meta.cle;
  const repondre = async (extra = {}) => json({ ...extra,
    session: await vue(store, meta, lanceur, corps.nom && corps.jeton ? { nom: nettoyerNom(corps.nom), jeton: corps.jeton } : null),
    maintenant: Date.now() });

  if (action === 'rejoindre') {
    const nom = nettoyerNom(corps.nom);
    if (nom.length < 2) return erreur('Un pseudo de deux caractères au moins.');
    const email = nettoyerEmail(corps.email);
    const enEvaluation = meta.mode === 'eval' && corps.eval !== false;
    if (email && !EMAIL.test(email)) return erreur('Adresse attendue : prenom.nom@etu.unilasalle.fr.');
    if (enEvaluation && !email) return erreur('En évaluation, l’adresse @etu.unilasalle.fr est demandée.');
    const tous = await lireTous(store, `sess/${code}/p/`);
    const existant = tous.find(p => meme(p.nom, nom));
    // l'adresse fait foi : la personne qui revient, sous un pseudo ou un autre, reprend son état
    const parAdresse = email ? tous.find(p => p.email === email) : null;
    if ((existant && existant.exclu) || (parAdresse && parAdresse.exclu)) return erreur('Vous avez été exclu de cette arène par le lanceur.', 403);
    const revenir = async (p) => {
      const jeton = tirerSecret();
      await store.setJSON(clePart(code, p.nom), { ...p, jeton, parti: false, revenu: Date.now(), email: p.email || email });
      return repondre({ jeton, nom: p.nom });
    };
    if (parAdresse) {
      if (corps.jeton && corps.jeton === parAdresse.jeton) return repondre({ jeton: parAdresse.jeton, nom: parAdresse.nom });
      if (!parAdresse.parti) return erreur(`Cette adresse est déjà dans l’arène, sous le pseudo « ${parAdresse.nom} ».`, 409);
      return revenir(parAdresse);
    }
    if (existant) {
      if (corps.jeton && corps.jeton === existant.jeton) return repondre({ jeton: existant.jeton, nom: existant.nom });
      if (!existant.parti) return erreur('Ce pseudo est déjà pris dans cette arène.', 409);
      // un pseudo parti ne se reprend qu'avec la même adresse, ou sans adresse d'aucun côté
      if (existant.email && existant.email !== email) return erreur('Ce pseudo appartient à quelqu’un d’autre : choisissez-en un autre.', 409);
      return revenir(existant);
    }
    if (tous.filter(p => !p.parti).length >= MAX_PARTICIPANTS) return erreur('Arène complète.', 409);
    const jeton = tirerSecret();
    await store.setJSON(clePart(code, nom), { nom, email, jeton, rejoint: Date.now(), eval: corps.eval !== false });
    return repondre({ jeton });
  }

  if (action === 'quitter') {
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (part && part.jeton === corps.jeton) {
      part.parti = true;
      await store.setJSON(clePart(code, nom), part);
    }
    return repondre();
  }

  if (action === 'sortie') {
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (part && part.jeton === corps.jeton && meta.debut && (meta.pause || Date.now() < meta.fin)) {
      part.sortiesParManche = part.sortiesParManche || {};
      part.sortiesParManche[meta.manche] = (part.sortiesParManche[meta.manche] || 0) + 1;
      await store.setJSON(clePart(code, nom), part);
    }
    return repondre();
  }

  if (action === 'compter') {
    if (!lanceur) return erreur('Seul le lanceur décide.', 403);
    const nom = nettoyerNom(corps.nom);
    const manche = Number(corps.manche) || meta.manche;
    const soum = await store.get(cleSoum(code, manche, nom), { type: 'json' });
    if (!soum) return erreur('Soumission inconnue.', 404);
    soum.compte = !!corps.compte;
    await store.setJSON(cleSoum(code, manche, nom), soum);
    return repondre();
  }

  if (action === 'exclure') {
    if (!lanceur) return erreur('Seul le lanceur peut exclure.', 403);
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (!part) return erreur('Participant inconnu.', 404);
    part.parti = true; part.exclu = true; part.jeton = tirerSecret();   // le jeton en circulation ne vaut plus
    await store.setJSON(clePart(code, nom), part);
    return repondre();
  }

  if (action === 'demarrer') {
    if (!lanceur) return erreur('Seul le lanceur peut démarrer.', 403);
    if (meta.debut) return erreur('Déjà démarrée.', 409);
    meta.debut = Date.now() + COMPTE_A_REBOURS;
    meta.fin = meta.debut + meta.duree * 1000;
    await store.setJSON(cleMeta(code), meta);
    return repondre();
  }

  if (action === 'pause' || action === 'reprendre') {
    if (!lanceur) return erreur('Seul le lanceur peut mettre en pause.', 403);
    const maintenant = Date.now();
    if (!meta.debut || maintenant < meta.debut || (!meta.pause && maintenant > meta.fin)) return erreur('Rien à mettre en pause.', 409);
    if (action === 'pause' && !meta.pause) meta.pause = maintenant;
    if (action === 'reprendre' && meta.pause) {
      const duree = maintenant - meta.pause;
      meta.fin += duree; meta.pauses = (meta.pauses || 0) + duree; meta.pause = null;
    }
    await store.setJSON(cleMeta(code), meta);
    return repondre();
  }

  if (action === 'prolonger') {
    if (!lanceur) return erreur('Seul le lanceur peut prolonger.', 403);
    const sec = Math.round(Number(corps.secondes));
    if (!(sec >= 30 && sec <= 600)) return erreur('Prolongation entre 30 secondes et 10 minutes.');
    if (!meta.debut || (!meta.pause && Date.now() > meta.fin + TOLERANCE_PROLONGATION)) return erreur('Rien à prolonger.', 409);
    meta.fin += sec * 1000;
    meta.prolongations = (meta.prolongations || 0) + sec;
    await store.setJSON(cleMeta(code), meta);
    // les postes qui avaient déjà remis d'eux-mêmes reprennent la main
    const autos = (await lireTous(store, `sess/${code}/s/${meta.manche}/`)).filter(x => x.auto);
    await Promise.all(autos.map(x => store.delete(cleSoum(code, meta.manche, x.nom))));
    return repondre();
  }

  if (action === 'relancer') {
    if (!lanceur) return erreur('Seul le lanceur peut relancer.', 403);
    if (meta.debut && (meta.pause || Date.now() <= meta.fin + TOLERANCE_FIN)) return erreur('La manche en cours n’est pas finie.', 409);
    const duree = Math.round(Number(corps.duree));
    if (!Number.isFinite(duree) || duree < 30 || duree > 3 * 3600) return erreur('Durée entre 30 secondes et 3 heures.');
    const niveau = String(corps.niveau || '').slice(0, 20);
    const exo = typeof corps.exo === 'number' ? corps.exo : String(corps.exo || '').slice(0, 40);
    if (!niveau || exo === '') return erreur('Exercice invalide.');
    if (meta.mode === 'eval' && niveau !== meta.niveau)
      return erreur(`En évaluation, tous les exercices sont du même niveau : cette arène est en ${meta.niveau}.`, 409);
    if (meta.debut) {
      meta.historique = [...(meta.historique || []), { manche: meta.manche, niveau: meta.niveau, exo: meta.exo,
        titre: meta.titre, duree: meta.duree + (meta.prolongations || 0), debut: meta.debut, fin: meta.fin, pauses: meta.pauses || 0, points: meta.points || 0 }];
      meta.manche += 1;
    }
    Object.assign(meta, { niveau, exo, titre: String(corps.titre || '').slice(0, 120), duree, debut: null, fin: null, pause: null, pauses: 0, prolongations: 0,
      points: Math.max(0, Number(corps.points) || 0) });
    await store.setJSON(cleMeta(code), meta);
    return repondre();
  }

  if (action === 'soumettre') {
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (!part || part.jeton !== corps.jeton) return erreur('Participant inconnu.', 403);
    const maintenant = Date.now();
    const auto = !!corps.auto;
    // Une remise automatique peut viser une manche déjà close, si le lanceur a
    // relancé entre-temps : elle est rangée dans sa manche, code gardé, sans réussite.
    const manche = Number(corps.manche) || meta.manche;
    let cadre = meta;
    if (manche < meta.manche) {
      cadre = (meta.historique || []).find(h => h.manche === manche);
      if (!cadre || !auto) return erreur('Manche close.', 409);
    } else if (!meta.debut) return erreur('La manche n’a pas démarré.', 409);
    else if (meta.pause && !auto) return erreur('Le chrono est en pause.', 409);
    if (maintenant < cadre.debut) return erreur('Le chrono n’a pas démarré.', 409);
    if (maintenant > cadre.fin + (auto ? TOLERANCE_AUTO : TOLERANCE_FIN)) return erreur('Temps écoulé.', 409);
    const deja = await store.get(cleSoum(code, cadre.manche || manche, nom), { type: 'json' });
    if (deja) return repondre({ soumission: deja });
    const total = Math.min(1000, Math.max(0, Math.round(Number(corps.total)) || 0));
    const ok = Math.min(total, Math.max(0, Math.round(Number(corps.ok)) || 0));
    // une remise automatique après la fin garde le code, mais ne réussit pas
    const dansLeTemps = maintenant <= cadre.fin + TOLERANCE_FIN;
    const soumission = {
      nom: part.nom, auto, manche: cadre.manche || manche,
      temps: dansLeTemps ? Math.min(maintenant, cadre.fin) - cadre.debut - (cadre.pauses || 0) : null,
      ok, total,
      reussi: dansLeTemps && total > 0 && ok === total,
      source: String(corps.source || '').slice(0, MAX_SOURCE),
    };
    await store.setJSON(cleSoum(code, soumission.manche, nom), soumission);
    return repondre({ soumission });
  }

  return erreur('Action inconnue.');
};
