/* Service worker — met en cache Python, l'éditeur et les exercices.
   Objectif : après une première visite, l'app démarre instantanément
   et fonctionne sans connexion. */

const VERSION = 'skillquest-entrainement-v140';
const SHELL   = VERSION + '-shell';   // app + données (peuvent changer)
// Les moteurs ne dépendent pas de VERSION : avant le 1er octobre 2026, chaque
// mise en ligne d'une banque faisait retélécharger les 10 Mo de Pyodide à tous.
const VENDOR  = 'skillquest-vendor-v1';   // CDN versionnés (immuables)

const A_PRECHARGER = [
  './',
  './index.html',
  './python.html',
  './coderpad.html',
  './debuter.html',
  './sql.html',
  './r.html',
  './session.js',
  './theme.css',
  './theme.js',
  './data/sql.json',
  './data/sql-sommaire.json',
  './data/r.json',
  './data/r-sommaire.json',
  './data/index.json',
  './data/prog1.json',
  './data/prog2.json',
  './data/prog3.json',
  './data/prog4.json',
  './ressources/cheat-sheet-python.pdf',
  './ressources/cheat-sheet-sql.png',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/r/r.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/sql-hint.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/runmode/runmode.min.js',
];

// URLs versionnées : une fois en cache, elles ne changent plus
const estVendor = url =>
  url.includes('cdn.jsdelivr.net/pyodide/') ||
  url.includes('cdnjs.cloudflare.com/ajax/libs/codemirror/') ||
  url.includes('cdnjs.cloudflare.com/ajax/libs/sql.js/') ||
  (url.includes('webr.r-wasm.org/') && /webr\.r-wasm\.org\/v\d/.test(url));
// WebR est chargé par « latest », une adresse qui bouge : réseau d'abord, cache en secours
const estWebRLatest = url => url.includes('webr.r-wasm.org/latest/');

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll échoue en bloc si une seule ressource manque : on tolère les absences.
    // cache.add() rejette les réponses opaques, ce qui est le comportement voulu.
    await Promise.allSettled(A_PRECHARGER.map(u => cache.add(new Request(u, { cache: 'reload', mode: 'cors' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter(n => n !== SHELL && n !== VENDOR).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // 0. L'API des sessions chronométrées ne passe jamais par le cache : chaque
  // réponse porte l'heure du serveur et l'état du groupe.
  const chemin = new URL(url).pathname;
  if (chemin.startsWith('/api/')) return;

  // 1. Pyodide et CodeMirror : cache d'abord (URLs versionnées, ~10 Mo au total)
  //
  // Les réponses opaques (mode no-cors, status 0) ne sont JAMAIS mises en cache.
  // Un même fichier peut être demandé de deux façons : <script> ou importScripts()
  // produisent une requête no-cors, un import() dynamique produit une requête cors.
  // Une réponse opaque servie à un import() dynamique le fait échouer
  // (« Failed to fetch dynamically imported module »), et Pyodide reste bloqué au
  // chargement. On refait donc toujours la requête en mode cors : la réponse
  // obtenue est lisible dans les deux cas.
  if (estVendor(url)) {
    ev.respondWith((async () => {
      const cache = await caches.open(VENDOR);
      const hit = await cache.match(req);
      if (hit && hit.type !== 'opaque' && hit.status === 200) return hit;
      if (hit) await cache.delete(req);          // entrée inutilisable : on la purge
      try {
        const rep = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (rep && rep.ok && rep.type !== 'opaque') cache.put(req, rep.clone());
        return rep;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // 1 bis. WebR « latest » : réseau d'abord, cache en secours, pour pouvoir
  // travailler hors ligne sans figer une adresse qui change
  if (estWebRLatest(url)) {
    ev.respondWith((async () => {
      const cache = await caches.open(VENDOR);
      try {
        const rep = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (rep && rep.ok && rep.type !== 'opaque') cache.put(req, rep.clone());
        return rep;
      } catch (e) {
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 2. Pages et banques d'exercices : réseau d'abord, cache en secours.
  //
  // Ces fichiers changent à chaque déploiement, et le « cache d'abord » de la
  // règle suivante laissait l'étudiant sur la version précédente tant que la
  // VERSION du service worker n'avait pas bougé. Un oubli de bump suffisait à
  // servir une banque périmée — et une banque d'un ancien format fait planter
  // la page. On accepte ici un aller-retour réseau : quelques centaines de
  // kilo-octets, contre les ~10 Mo de Pyodide qui restent, eux, en cache
  // d'abord. Le cache prend le relais dès que le réseau manque.
  // le test porte sur le chemin : python.html?arene=ABC234 est une page comme une autre
  const estContenu = c => /\/data\/[^/]+\.json$/.test(c) || /\.html$/.test(c)
    || /\/(session|theme)\.(js|css)$/.test(c) || url === self.registration.scope || c.endsWith('/');
  if (url.startsWith(self.registration.scope) && estContenu(chemin)) {
    ev.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const rep = await fetch(req, { cache: 'no-store' });
        if (rep && rep.ok) { cache.put(req, rep.clone()); return rep; }
        // Réponse reçue mais pas bonne (404, 500…). Le cache prend le relais s'il
        // a mieux ; sinon on rend la réponse telle quelle — un 404 lisible vaut
        // bien mieux qu'un ERR_FAILED, qui laisse croire que le site est mort.
        return (await cache.match(req)) || rep;
      } catch (e) {
        // Là, le réseau a vraiment manqué : pas de réponse du tout.
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 3. Ressources de l'app : on sert le cache tout de suite et on rafraîchit en fond
  if (url.startsWith(self.registration.scope)) {
    ev.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const reseau = fetch(req)
        .then(rep => { if (rep && rep.ok) cache.put(req, rep.clone()); return rep; })
        .catch(() => null);
      return hit || (await reseau) || Response.error();
    })());
  }
});

// La page peut demander l'état du cache Python
self.addEventListener('message', async ev => {
  if (ev.data === 'etat-cache') {
    const cache = await caches.open(VENDOR);
    const cles = await cache.keys();
    const pyodide = cles.filter(r => r.url.includes('pyodide')).length;
    ev.source && ev.source.postMessage({ type: 'etat-cache', pyodide, total: cles.length });
  }
});
