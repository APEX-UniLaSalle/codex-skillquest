/* Sessions chronométrées du Codex — fonction serveur.

   Pourquoi : un chrono commun à un groupe et un classement ont besoin d'une
   horloge de référence et d'un endroit où chaque poste dépose son résultat.
   Le site est statique ; cette fonction est le seul code qui tourne côté
   serveur. Elle vit sur le même compte Netlify que le site, avec Netlify
   Blobs comme stockage. Aucun autre fournisseur.

   Ce qu'elle tient : une session = un exercice, une durée, un départ commun,
   des participants sous pseudo libre, les temps de ceux qui ont réussi.
   Aucune donnée nominative n'est demandée. Une session s'efface 24 h après
   sa création.

   Ce qu'elle ne garantit pas : la réussite est déclarée par le navigateur,
   qui exécute les tests. Elle vaut pour l'entraînement, pas pour une
   évaluation. Seul le temps est mesuré ici, sur l'horloge du serveur.

   Chaque participant et chaque résultat est un blob distinct : deux postes
   qui écrivent en même temps ne s'écrasent pas.

   Appels, tous sur /api/session :
     POST {action:'creer', page, niveau, exo, titre, duree} → {code, cle, session}
       page : python, r ou sql — la page qui ouvrira l'exercice
     GET  ?code=ABC234                                  → {session, maintenant}
     POST {action:'rejoindre', code, pseudo}            → {jeton, session}
     POST {action:'demarrer', code, cle}                → {session}
     POST {action:'reussir', code, pseudo, jeton}       → {temps, session}
*/

import { getStore } from '@netlify/blobs';

export const config = { path: '/api/session' };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ni 0/O, ni 1/I
const DUREE_VIE = 24 * 3600 * 1000;
const COMPTE_A_REBOURS = 10 * 1000;
const TOLERANCE_FIN = 3 * 1000;   // le dernier « Tout tester » peut arriver juste après la fin
const MAX_PARTICIPANTS = 200;

const json = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const erreur = (message, statut = 400) => json({ erreur: message }, statut);

const tirerCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), o => ALPHABET[o % ALPHABET.length]).join('');
const tirerSecret = () => crypto.randomUUID();

const nettoyerPseudo = p => String(p || '').replace(/\s+/g, ' ').trim().slice(0, 24);

const cleMeta = code => `sess/${code}/meta`;
/* « Léa » et « léa » sont le même participant : la clé est en minuscules,
   le blob garde la graphie saisie. */
const cleId   = pseudo => encodeURIComponent(pseudo.toLowerCase());
const clePart = (code, pseudo) => `sess/${code}/p/${cleId(pseudo)}`;
const cleRes  = (code, pseudo) => `sess/${code}/r/${cleId(pseudo)}`;

async function lireMeta(store, code) {
  if (!/^[A-Z2-9]{6}$/.test(code || '')) return null;
  const meta = await store.get(cleMeta(code), { type: 'json' });
  if (!meta) return null;
  if (Date.now() > meta.expire) return null;
  return meta;
}

/* Vue publique d'une session : sans la clé du lanceur ni les jetons. */
async function vue(store, meta) {
  const [parts, res] = await Promise.all([
    store.list({ prefix: `sess/${meta.code}/p/` }),
    store.list({ prefix: `sess/${meta.code}/r/` }),
  ]);
  const participants = (await Promise.all(parts.blobs.map(b => store.get(b.key, { type: 'json' }))))
    .filter(Boolean).map(p => p.pseudo)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const resultats = (await Promise.all(res.blobs.map(b => store.get(b.key, { type: 'json' }))))
    .filter(Boolean)
    .sort((a, b) => a.temps - b.temps);
  const maintenant = Date.now();
  const etat = !meta.debut ? 'attente'
             : maintenant < meta.debut ? 'compte_a_rebours'
             : maintenant < meta.fin ? 'en_cours' : 'fini';
  return {
    code: meta.code, page: meta.page, niveau: meta.niveau, exo: meta.exo, titre: meta.titre,
    duree: meta.duree, debut: meta.debut, fin: meta.fin, etat,
    participants, resultats,
  };
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
    const code = new URL(req.url).searchParams.get('code');
    const meta = await lireMeta(store, String(code || '').toUpperCase());
    if (!meta) return erreur('Session inconnue ou expirée.', 404);
    return json({ session: await vue(store, meta), maintenant: Date.now() });
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
    return json({ code: nouveau, cle: meta.cle, session: await vue(store, meta), maintenant: Date.now() });
  }

  const meta = await lireMeta(store, code);
  if (!meta) return erreur('Session inconnue ou expirée.', 404);

  if (action === 'rejoindre') {
    const pseudo = nettoyerPseudo(corps.pseudo);
    if (pseudo.length < 2) return erreur('Pseudo de deux caractères au moins.');
    if (meta.debut && Date.now() > meta.fin) return erreur('Cette session est terminée.', 409);
    const existant = await store.get(clePart(code, pseudo), { type: 'json' });
    if (existant) {
      // même pseudo depuis le même navigateur : on rend le jeton connu
      if (corps.jeton && corps.jeton === existant.jeton)
        return json({ jeton: existant.jeton, session: await vue(store, meta), maintenant: Date.now() });
      return erreur('Ce pseudo est déjà pris dans cette session.', 409);
    }
    const { blobs } = await store.list({ prefix: `sess/${code}/p/` });
    if (blobs.length >= MAX_PARTICIPANTS) return erreur('Session complète.', 409);
    const jeton = tirerSecret();
    await store.setJSON(clePart(code, pseudo), { pseudo, jeton, rejoint: Date.now() });
    return json({ jeton, session: await vue(store, meta), maintenant: Date.now() });
  }

  if (action === 'demarrer') {
    if (corps.cle !== meta.cle) return erreur('Seul le lanceur peut démarrer.', 403);
    if (meta.debut) return erreur('Déjà démarrée.', 409);
    meta.debut = Date.now() + COMPTE_A_REBOURS;
    meta.fin = meta.debut + meta.duree * 1000;
    await store.setJSON(cleMeta(code), meta);
    return json({ session: await vue(store, meta), maintenant: Date.now() });
  }

  if (action === 'reussir') {
    const pseudo = nettoyerPseudo(corps.pseudo);
    const part = await store.get(clePart(code, pseudo), { type: 'json' });
    if (!part || part.jeton !== corps.jeton) return erreur('Participant inconnu.', 403);
    if (!meta.debut) return erreur('La session n’a pas démarré.', 409);
    const maintenant = Date.now();
    if (maintenant < meta.debut) return erreur('Le chrono n’a pas démarré.', 409);
    if (maintenant > meta.fin + TOLERANCE_FIN) return erreur('Temps écoulé.', 409);
    const deja = await store.get(cleRes(code, pseudo), { type: 'json' });
    if (deja) return json({ temps: deja.temps, session: await vue(store, meta), maintenant });
    const temps = Math.min(maintenant, meta.fin) - meta.debut;
    await store.setJSON(cleRes(code, pseudo), { pseudo, temps });
    return json({ temps, session: await vue(store, meta), maintenant });
  }

  return erreur('Action inconnue.');
};
