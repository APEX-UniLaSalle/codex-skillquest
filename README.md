# Le Codex — dossier publié

Recueil d'exercices de programmation de SkillQuest, UniLaSalle Beauvais. Les étudiants
y rédigent leurs solutions, les testent et les comparent à une solution commentée.

**Ce dépôt est exactement ce qui est mis en ligne** sur `codex-skillquest.netlify.app`.
Sa racine est le dossier `entrainement/` du projet ClashOfCode. Rien d'autre n'est publié.

Le code s'exécute **dans le navigateur** : Pyodide pour Python, WebR pour R, SQLite
compilé en WebAssembly pour SQL. Aucun serveur, aucun crédit consommé, aucun droit
Moodle requis.

## Contenu

```
.
├── index.html          portail des parcours
├── python.html         447 exercices, quatre niveaux
├── sql.html            requêtes SELECT sur cinq bases, avec explorateur et MCD
├── r.html              60 questions, trois jeux de données, un seul niveau
├── coderpad.html       préparation à l'examen (6 exercices input() → fonction)
├── session.js          sessions chronométrées en groupe, côté navigateur
├── netlify/functions/  session.mjs, la seule fonction serveur : horloge et classement des sessions
├── package.json        sa dépendance, @netlify/blobs, installée par Netlify au déploiement
├── sw.js               cache hors ligne
├── netlify.toml        en-têtes de cache, dossier des fonctions
├── data/               banques au format JSON
├── logos/              APEX et UniLaSalle
└── ressources/         Cheat Sheets Python et SQL
```

## Ce que ce dépôt ne contient pas, et pourquoi

Le dossier de travail qui se trouve **au-dessus** de cette racine porte le matériel
d'évaluation : les jeux de validation (`questions/*.json`, champ `tests`), le corpus
d'examen CoderPad et les banques XML Moodle. Rien de tout cela n'entre ici.

Ce n'est pas une précaution de forme. Les questions d'examen et les questions
d'entraînement forment deux corpus disjoints, arrêté du 28 août 2026 : un outil de
révision qui reprendrait l'épreuve ne la préparerait pas, il la divulguerait. La racine
du dépôt est placée sous le matériel d'examen pour que celui-ci ne puisse pas y entrer,
même par inadvertance.

`build_entrainement.py` contrôle en plus les clés exportées et échoue si un champ de
validation venait à fuiter.

## Mettre en ligne

Deux commandes, dans cet ordre. Le tampon d'abord, sans quoi le site annoncera une
version qui n'est pas la sienne.

```bash
python3 ../tamponner.py     # date et condensé du contenu, inscrits en pied de page
git add -A && git commit -m "…" && git push
```

Netlify déploie sur `push`. Le pied de chaque page affiche alors la date et les sept
premiers caractères du condensé SHA-256 du dossier. Pour savoir si ce qui est en ligne
est bien ce qu'on a sous la main : `python3 ../tamponner.py --lire` et comparer.

`r.html` est régénéré par `r/construire_page_r.py`, qui n'écrit pas le tampon. Une
régénération l'efface donc, et `tamponner.py` le repose. C'est la raison pour laquelle
il se lance avant chaque mise en ligne, et pas seulement quand la banque change.

## Tester en local

`fetch()` est bloqué en `file://` : il faut un petit serveur.

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Seul le parcours R porte un contrôleur intégré : `r.html?controle=1` rejoue les
60 réponses de référence dans le navigateur et signale celles qui échouent. À lancer
après chaque ajout de questions. C'est le seul moyen de vérifier une banque écrite sans
interpréteur R sous la main.

Python et SQL n'ont pas d'équivalent en page. Leur contrôle qualité est passé hors
ligne : 4 768 tests sans échec le 30 juillet 2026 pour Python, 96 requêtes de référence
rejouées les 27 et 28 août pour SQL.

## Régénérer les banques

```bash
python3 build_entrainement.py            # data/prog1..4.json, puis incrémente sw.js
python3 r/construire_banque_r.py         # data/r.json
python3 r/construire_page_r.py           # r.html
python3 sql/construire_banque_sql.py     # data/sql.json
```

`build_entrainement.py` incrémente lui-même la version du service worker. Sans cela, le
cache resservirait les anciens `data/*.json` et l'étudiant ne verrait pas la correction.

## Fonctionnement

- **Filtres** : niveau, thème (géologie, agronomie, alimentation & santé, pop-culture,
  SkillQuest), état (réussi / non réussi), recherche par titre.
- **Éditeur** : indentation automatique après `:`, tabulation à 4 espaces, numéros de ligne.
- **Exécution** : chaque jeu d'essai est exécuté, la sortie comparée à l'attendu ; les
  erreurs sont affichées telles quelles (nom de l'exception + message).
- **Anti-blocage** : le code tourne dans un *web worker*. Une boucle infinie est
  interrompue à 10 s et le moteur redémarre automatiquement — la page ne fige jamais.
- **Progression** : code et exercices réussis conservés dans le navigateur de l'étudiant
  (`localStorage`). Rien n'est envoyé sur un serveur, hors sessions chronométrées.
- **SQL** : la plateforme n'accepte que des requêtes `SELECT`. Toute instruction
  d'écriture est refusée, sur demande du responsable de la compétence.

## Sessions chronométrées en groupe

Page Python seulement, pour l'instant. Le bouton « 👥 Session » de l'en-tête ouvre deux
voies : rejoindre avec un code de six caractères, son prénom et son nom ; ou lancer depuis
l'exercice ouvert, choisi dans la liste ou tiré au hasard avec les filtres. Le lanceur
fixe la durée, préremplie avec la durée conseillée de l'exercice, qui dépend de son niveau
(5, 10, 15 ou 20 minutes). Il reçoit un code et un lien, voit qui a rejoint, puis démarre
quand il veut : compte à rebours de dix secondes, même exercice ouvert sur tous les postes,
chrono commun. Enseignant ou étudiant, n'importe qui peut lancer ; le lanceur participe
s'il coche la case.

Pendant la session, indices et solutions sont masqués ; ils reviennent à la fin. Chaque
participant soumet sa solution une fois, par le bouton de la barre : les tests sont joués
une dernière fois, le code part au serveur, c'est définitif. Réussi si tous les tests
passent à ce moment-là. Le classement montre les réussites dans l'ordre des temps et se
fige à la fin. Le code de ceux qui n'ont pas soumis est remis de lui-même à la fin du
temps, sans compter comme réussite. « Quitter » retire de la session.

Le lanceur voit, par « 📋 Solutions », le code soumis par chacun, avec l'état et le
temps, et la liste de ceux qui n'ont rien soumis.

Ce que tient le serveur, `netlify/functions/session.mjs` sur `/api/session`, avec Netlify
Blobs : l'exercice, la durée, l'heure de départ, les prénoms et noms, les soumissions. Le
temps est mesuré sur l'horloge du serveur à la réception de la soumission. Une session
s'efface au bout de 24 heures, avec les noms et les codes. Aucun compte.

Ce qu'il ne garantit pas : les tests sont joués par le navigateur, le serveur ne les
rejoue pas. Cela vaut pour l'entraînement, pas pour une évaluation.

Le rechargement de la page reprend la session en cours (`sessionStorage`). Fermer l'onglet
l'oublie. En `file://`, le bouton n'apparaît pas : il n'y a pas de serveur.

Transposer à R ou SQL : inclure `session.js`, appeler `Session.init({page, courant,
ouvrir, tester})` en fin de script, et masquer indices et solutions quand
`Session.verrouille()` est vrai. `tester()` joue tous les tests sur la réponse en cours et
rend `{ok, total, source}`.

## Cache hors ligne (service worker)

`sw.js` met en cache le moteur, l'éditeur et les exercices dès la première visite.
Ensuite l'app démarre instantanément et **fonctionne sans connexion**.

| Ressource | Stratégie |
|---|---|
| Pyodide, WebR, CodeMirror (URLs versionnées) | cache d'abord — jamais retéléchargés |
| Pages et `data/*.json` | servis du cache, rafraîchis en arrière-plan |

Un `✓ hors ligne` apparaît en haut à droite quand le moteur est en cache.

**Deux conditions** : le service worker exige **HTTPS** (ou `localhost`), et il ne
fonctionne pas en `file://`. La version `entrainement_autonome.html` n'en bénéficie donc
pas — c'est le prix de son autonomie.

## Limites connues

- Premier chargement : ~10 Mo de Pyodide depuis le CDN jsDelivr, donc quelques secondes
  et une connexion nécessaire. Les visites suivantes sont servies par le cache.
- WebR ne tourne pas en mode isolé (`ChannelType.PostMessage`) : l'interruption d'un
  calcul R n'est pas disponible. Le mode alternatif exigerait les en-têtes COOP/COEP,
  qui casseraient Pyodide et CodeMirror sur les autres pages.
- Pas de remontée de notes vers Moodle. L'entraînement n'est pas noté ; l'évaluation
  reste sur l'outil d'examen.
- La progression est locale au navigateur : elle ne suit pas l'étudiant d'un poste à l'autre.
