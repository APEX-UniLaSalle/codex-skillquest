/* Sessions chronométrées du Codex — fonction serveur.

   Pourquoi : un chrono commun à un groupe, un classement et la remise des
   solutions à l'enseignant ont besoin d'une horloge de référence et d'un
   endroit où chaque poste dépose son résultat. Le site est statique ; cette
   fonction est le seul code qui tourne côté serveur. Elle vit sur le même
   compte Netlify que le site, avec Netlify Blobs comme stockage. Aucun autre
   fournisseur.

   Ce qu'elle tient : une session = un exercice, une durée, un départ commun,
   des participants identifiés par prénom et nom, une soumission par
   participant (code, tests passés, temps). Une session s'efface 24 h après
   sa création. Les noms et les codes soumis disparaissent avec elle.

   Ce qu'elle ne garantit pas : le nombre de tests passés est déclaré par le
   navigateur, qui exécute les tests. Elle vaut pour l'entraînement, pas pour
   une évaluation. Seul le temps est mesuré ici, sur l'horloge du serveur.

   Chaque participant et chaque soumission est un blob distinct : deux postes
   qui écrivent en même temps ne s'écrasent pas.

   Appels, tous sur /api/session :
     POST {action:'creer', page, niveau, exo, titre, duree}   → {code, cle, session}
       page : python, r ou sql — la page qui ouvrira l'exercice
     GET  ?code=ABC234[&cle=…]                                → {session, maintenant}
       avec la clé du lanceur, la vue porte aussi les soumissions et leur code
     POST {action:'rejoindre', code, nom[, jeton]}            → {jeton, session}
     POST {action:'quitter', code, nom, jeton}                → {session}
     POST {action:'demarrer', code, cle}                      → {session}
     POST {action:'soumettre', code, nom, jeton, source, ok, total[, auto]}
                                                              → {soumission, session}
*/

import { getStore } from '@netlify/blobs';

export const config = { path: '/api/session' };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ni 0/O, ni 1/I
const DUREE_VIE = 24 * 3600 * 1000;
const COMPTE_A_REBOURS = 10 * 1000;
const TOLERANCE_FIN = 3 * 1000;      // une soumission cliquée juste avant la fin peut arriver juste après
const TOLERANCE_AUTO = 90 * 1000;    // la page envoie d'elle-même le code de ceux qui n'ont pas soumis
const MAX_PARTICIPANTS = 200;
const MAX_SOURCE = 20000;

const json = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const erreur = (message, statut = 400) => json({ erreur: message }, statut);

const tirerCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), o => ALPHABET[o % ALPHABET.length]).join('');
const tirerSecret = () => crypto.randomUUID();

const nettoyerNom = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 60);

/* « Léa Martin » et « léa martin » sont la même personne : la clé est en
   minuscules sans accents, le blob garde la graphie saisie. */
const cleId   = nom => encodeURIComponent(nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
const cleMeta = code => `sess/${code}/meta`;
const clePart = (code, nom) => `sess/${code}/p/${cleId(nom)}`;
const cleSoum = (code, nom) => `sess/${code}/s/${cleId(nom)}`;

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
async function vue(store, meta, lanceur = false) {
  const [parts, soums] = await Promise.all([
    lireTous(store, `sess/${meta.code}/p/`),
    lireTous(store, `sess/${meta.code}/s/`),
  ]);
  const tri = (a, b) => a.localeCompare(b, 'fr');
  const participants = parts.map(p => p.nom).sort(tri);
  const soumis = soums.map(s => s.nom).sort(tri);
  const resultats = soums.filter(s => s.reussi).sort((a, b) => a.temps - b.temps)
    .map(s => ({ nom: s.nom, temps: s.temps }));
  const maintenant = Date.now();
  const etat = !meta.debut ? 'attente'
             : maintenant < meta.debut ? 'compte_a_rebours'
             : maintenant < meta.fin ? 'en_cours' : 'fini';
  const v = {
    code: meta.code, page: meta.page, niveau: meta.niveau, exo: meta.exo, titre: meta.titre,
    duree: meta.duree, debut: meta.debut, fin: meta.fin, etat,
    participants, soumis, resultats,
  };
  if (lanceur) v.soumissions = soums.sort((a, b) => tri(a.nom, b.nom));
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
    return json({ session: await vue(store, meta, lanceur), maintenant: Date.now() });
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
    purger(store).catch(() => {});
    let nouveau;
    for (let i = 0; i < 5; i++) {
      nouveau = tirerCode();
      if (!(await store.get(cleMeta(nouveau)))) break;
    }
    const meta = {
      code: nouveau, cle: tirerSecret(),
      page: corps.page, niveau, exo, titre: String(corps.titre || '').slice(0, 120),
      duree, debut: null, fin: null,
      cree: Date.now(), expire: Date.now() + DUREE_VIE,
    };
    await store.setJSON(cleMeta(nouveau), meta);
    return json({ code: nouveau, cle: meta.cle, session: await vue(store, meta, true), maintenant: Date.now() });
  }

  const meta = await lireMeta(store, code);
  if (!meta) return erreur('Session inconnue ou expirée.', 404);
  const lanceur = !!corps.cle && corps.cle === meta.cle;
  const repondre = async (extra = {}) => json({ ...extra, session: await vue(store, meta, lanceur), maintenant: Date.now() });

  if (action === 'rejoindre') {
    const nom = nettoyerNom(corps.nom);
    if (nom.length < 3 || !nom.includes(' ')) return erreur('Prénom et nom, séparés par un espace.');
    if (meta.debut && Date.now() > meta.fin) return erreur('Cette session est terminée.', 409);
    const existant = await store.get(clePart(code, nom), { type: 'json' });
    if (existant) {
      // même personne depuis le même navigateur : on lui rend son jeton
      if (corps.jeton && corps.jeton === existant.jeton) return repondre({ jeton: existant.jeton });
      return erreur('Ce nom est déjà pris dans cette session.', 409);
    }
    const { blobs } = await store.list({ prefix: `sess/${code}/p/` });
    if (blobs.length >= MAX_PARTICIPANTS) return erreur('Session complète.', 409);
    const jeton = tirerSecret();
    await store.setJSON(clePart(code, nom), { nom, jeton, rejoint: Date.now() });
    return repondre({ jeton });
  }

  if (action === 'quitter') {
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (part && part.jeton === corps.jeton) {
      await store.delete(clePart(code, nom));
      await store.delete(cleSoum(code, nom));
    }
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

  if (action === 'soumettre') {
    const nom = nettoyerNom(corps.nom);
    const part = await store.get(clePart(code, nom), { type: 'json' });
    if (!part || part.jeton !== corps.jeton) return erreur('Participant inconnu.', 403);
    if (!meta.debut) return erreur('La session n’a pas démarré.', 409);
    const maintenant = Date.now();
    if (maintenant < meta.debut) return erreur('Le chrono n’a pas démarré.', 409);
    const auto = !!corps.auto;
    if (maintenant > meta.fin + (auto ? TOLERANCE_AUTO : TOLERANCE_FIN)) return erreur('Temps écoulé.', 409);
    const deja = await store.get(cleSoum(code, nom), { type: 'json' });
    if (deja) return repondre({ soumission: deja });
    const total = Math.max(0, Math.round(Number(corps.total)) || 0);
    const ok = Math.min(total, Math.max(0, Math.round(Number(corps.ok)) || 0));
    // une remise automatique après la fin garde le code, mais ne réussit pas
    const dansLeTemps = maintenant <= meta.fin + TOLERANCE_FIN;
    const soumission = {
      nom, auto,
      temps: dansLeTemps ? Math.min(maintenant, meta.fin) - meta.debut : null,
      ok, total,
      reussi: dansLeTemps && total > 0 && ok === total,
      source: String(corps.source || '').slice(0, MAX_SOURCE),
    };
    await store.setJSON(cleSoum(code, nom), soumission);
    return repondre({ soumission });
  }

  return erreur('Action inconnue.');
};
