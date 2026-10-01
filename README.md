# Le Codex — dossier publié

Recueil d'exercices de programmation de SkillQuest, UniLaSalle Beauvais. Les étudiants
y rédigent leurs solutions, les testent et les comparent à une solution commentée.

**Ce dépôt est exactement ce qui est mis en ligne** sur `codex-skillquest.netlify.app`.
Sa racine est le dossier `entrainement/` du projet ClashOfCode. Rien d'autre n'est publié.

Le code s'exécute **dans le navigateur** : Pyodide pour Python, WebR pour R, SQLite
compilé en WebAssembly pour SQL. Aucun droit Moodle requis. Le seul code serveur est la
fonction du mode arène, décrite plus bas.

## Contenu

```
.
├── index.html          portail des parcours
├── python.html         447 exercices, quatre niveaux
├── sql.html            requêtes SELECT sur cinq bases, avec explorateur et MCD
├── r.html              60 questions, trois jeux de données, un seul niveau
├── coderpad.html       préparation à l'examen (6 exercices input() → fonction)
├── session.js          mode arène, côté navigateur
├── netlify/functions/  session.mjs, la seule fonction serveur : horloge, classement et soumissions des arènes
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
  (`localStorage`). Rien n'est envoyé sur un serveur, hors mode arène.
- **SQL** : la plateforme n'accepte que des requêtes `SELECT`. Toute instruction
  d'écriture est refusée, sur demande du responsable de la compétence.

## Bac à sable

Sur les trois pages, une carte « 🧪 Bac à sable » sur l'accueil ouvre un éditeur libre,
sans énoncé, sans test, sans progression : pour suivre un cours ou essayer une idée. Le
code est gardé sur le poste, rien n'est envoyé. Python : l'entrée du programme se tape à
la main, une valeur par ligne, et la sortie s'affiche en console. R : un jeu de données au
choix, déjà en mémoire, la sortie et le graphique. SQL : une base au choix, le schéma, les
résultats en tableau, 500 lignes au plus ; la règle du Codex tient, sélection seule.

## Mode arène

Pages Python, R et SQL. Une arène : un groupe fait le même exercice, avec
un chrono commun, un classement et la remise des solutions au lanceur. Elle reste ouverte
pour enchaîner des manches sur d'autres exercices.

Deux entrées. « ⚔️ Lancer une arène », sur l'exercice ouvert, choisi dans la liste ou tiré
au hasard avec les filtres : prénom et nom, durée préremplie avec
la durée conseillée de l'exercice (5, 10, 15 ou 20 minutes selon le niveau), deux options
cochées par défaut, participer soi-même et garder l'accès aux indices et aux solutions, et
le mode. « ⚔️ Rejoindre une arène », dans l'en-tête : code de six caractères, prénom et nom ;
si l'arène est en évaluation, le participant choisit de la passer en évaluation ou hors
évaluation, sans plein écran ni note, avec indices et solution après sa soumission. Le
choix est définitif.

L'ouverture est libre, sans mot de passe : une arène coûte moins d'un crédit Netlify sur
les 3 000 du mois, décision du 28 septembre 2026.

Deux modes. **Évaluation** : plein écran demandé à ceux qui rejoignent ; chaque sortie du
plein écran ou de l'onglet est comptée et montrée au lanceur, et la soumission de la manche
n'est pas comptée, sauf si le lanceur décide de la compter, depuis « Solutions » ; après
sa soumission, le participant ne revoit plus son code, il suit le chrono et le classement
sur un écran d'attente ; à la fin, score sur 20 et médaille, cumulés sur les manches.
**Entraînement** : ni plein écran ni score ; après sa soumission, le participant retrouve
les indices, la solution et la liste, et voit les solutions des autres.

Dans les deux modes, pendant la manche, ceux qui ont rejoint n'ont ni indice ni solution,
la liste des exercices et les filtres disparaissent, le lien vers l'accueil ne répond plus.
Le lanceur qui a gardé l'accès voit tout.

Le lanceur obtient le code, affiché en grand pour le vidéoprojecteur avec la liste de ceux
qui ont rejoint, et démarre quand il veut : compte à rebours de dix secondes, même exercice
ouvert sur tous les postes, à partir de son amorce, chrono commun. En cours de manche, il
peut mettre le chrono en pause, le reprendre, le prolonger d'une ou deux minutes. Les pauses
ne comptent pas dans les temps.

Chaque participant soumet sa solution une fois : les tests sont joués une dernière fois, le
code part au serveur, c'est définitif. Réussi si tous les tests passent. « Tout tester »
reste un contrôle libre. Le code de ceux qui n'ont pas soumis est remis de lui-même à la fin
du temps, si leur page est ouverte, sans compter comme réussite. Une soumission attend que
le moteur soit chargé. « Quitter l'arène » retire de la liste ; la soumission et les sorties de la manche restent,
et le même nom qui revient reprend son état : quitter puis rejoindre ne donne pas une
seconde soumission. On peut rejoindre à tout moment, entre deux manches compris.

À la fin : le lanceur voit le podium en grand, classé par taux de tests réussis puis par
temps, ceux qui n'ont rien remis en dernier, avec score et médaille en évaluation ; chaque
participant voit un bilan personnel. Puis le lanceur ouvre un autre exercice et clique
« ⚔️ Relancer l'arène sur cet exercice » : manche suivante, même code, mêmes participants.

Score en évaluation, règle du 28 septembre 2026 : tous les exercices de l'arène sont du
même niveau, I à IV en Python, 1 à 3 en SQL, un seul en R, le serveur refuse une relance
sur un autre niveau ; la note sur 20 est
la moyenne, sur les manches jouées, du pourcentage de tests passés, une soumission absente
ou non comptée valant 0 ; la médaille suit les seuils du socle pour un savoir-faire, Bronze
10, Argent 15, Or 20, et n'est donnée qu'au bout d'une heure d'exercices cumulée sur
l'arène ; avant, le podium, le bilan et l'export disent combien de minutes manquent pour
valider la compétence.

« 📋 Solutions » montre au lanceur le code soumis par chacun dans la manche en cours, et
deux exports, toutes manches confondues : un Markdown lisible, scores puis tableau par
manche puis le code de chacun ; un JSON brut. À faire avant 24 heures, après quoi l'arène
s'efface, avec les noms et les codes.

Ce que tient le serveur, `netlify/functions/session.mjs` sur `/api/session`, avec Netlify
Blobs : l'exercice, la durée, le mode, l'heure de départ, les pauses, les prénoms et noms,
les sorties, les soumissions. Le temps est mesuré sur l'horloge du serveur à la réception de
la soumission. Aucun compte.

Ce qu'il ne garantit pas : les tests sont joués par le navigateur, le serveur ne les
rejoue pas ; un participant qui trafique la page peut déclarer ce qu'il veut ; le plein
écran ne peut être ni imposé ni retenu par le navigateur. Cela vaut pour l'entraînement,
pas pour une évaluation certificative, qui reste sur SEB.

Le rechargement de la page reprend l'arène en cours (`sessionStorage`), avec le dernier
code testé ou exécuté sur les trois pages. Fermer l'onglet l'oublie. En `file://`, les boutons n'apparaissent pas.

Chaque page fournit à `session.js` ses accroches, `Session.init({page, courant,
ouvrir, tester, pret, deverrouiller})`, un bouton `Session.lancer()` ou `Session.relancer()` sur
l'exercice ouvert, masque indices et solutions quand `Session.verrouille()` est vrai, et
marque `arene-cache` ce que le verrou doit masquer, `arene-fige` ce qu'il doit figer.
`tester()` joue tous les tests sur la réponse en cours et rend `{ok, total, source}` : en
Python et SQL, les jeux d'essai ; en R, la réponse unique, un test réussi ou non. La page R
est produite par `r/construire_page_r.py` : c'est lui qui porte ces accroches.

## Cache hors ligne (service worker)

`sw.js` met en cache le moteur, l'éditeur et les exercices dès la première visite.
Ensuite l'app démarre instantanément et **fonctionne sans connexion**.

| Ressource | Stratégie |
|---|---|
| Pyodide, sql.js, CodeMirror, WebR versionné (URLs figées) | cache d'abord, dans un cache qui survit aux mises en ligne — jamais retéléchargés |
| WebR par `latest`, adresse qui bouge | réseau d'abord, cache en secours |
| Pages, `data/*.json`, `session.js`, `theme.*` | réseau d'abord, cache en secours : une mise en ligne est vue au rechargement suivant |
| Le reste du site | cache d'abord, rafraîchi en arrière-plan |

Les trois pages d'exercices enregistrent le service worker. Un `✓ hors ligne` apparaît en
haut à droite de la page Python quand le moteur est en cache.

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
