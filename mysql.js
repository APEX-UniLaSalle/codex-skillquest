/* mysql.js — compatibilité MySQL du Codex SQL, chargé par sql.html.
   Écrit le 17 octobre 2026 après les essais de Vincent Tellier sur la page
   « 07 Fonctions utiles » de SQL I. */

/* ═══════════════════════ Compatibilité MySQL ═══════════════════════
   Le Codex exécute les requêtes avec SQLite (sql.js) ; l'examen se passe sous
   MySQL. Tout ce que le cours de SQL I enseigne (page « 07 Fonctions utiles »)
   et que la Cheat Sheet distribue doit s'écrire ici comme à l'examen, sinon la
   fiche ment. Deux mécanismes :
     · fonctionsMySQL(db) ajoute les fonctions que SQLite ne connaît pas, ou
       qu'il connaît avec un autre comportement (LENGTH, SUBSTRING, ROUND…) ;
     · adapterMySQL(req) réécrit les deux syntaxes que l'analyseur de SQLite ne
       sait pas lire : l'INTERVAL des calculs de date et TRIM(LEADING … FROM …).
   Doit rester en accord avec fonctions_mysql() et adapter_mysql() de
   sql/construire_banque_sql.py : ce qui est contrôlé à la fabrication doit
   s'exécuter ici à l'identique.
   Reste une différence, assumée : 10 / 4 vaut 2 ici et 2.5 sous MySQL. SQLite
   divise deux entiers en entier ; écrire 10.0 / 4 donne le même résultat
   partout. */

// sql.js enregistre une fonction avec autant d'arguments que sa longueur : -1
// la déclare variadique, ce qui permet CONCAT(a, b, c, …) et les arguments facultatifs
const variadique = f => Object.defineProperty(f, 'length', { value: -1 });
const estNul = v => v === null || v === undefined;
const deux = n => String(Math.abs(Math.trunc(n))).padStart(2, '0');
const MOIS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const JOURS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Une valeur temporelle : date, horodatage, ou heure seule. */
function lireTemps(v) {
  if (estNul(v)) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?)?$/.exec(s);
  if (m) {
    const t = { date: true, heure: m[4] !== undefined, a: +m[1], mo: +m[2], j: +m[3],
      h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0),
      us: m[7] ? +(m[7] + '00000').slice(0, 6) : 0, frac: !!m[7] };
    if (t.mo < 1 || t.mo > 12 || t.j < 1 || t.j > joursDuMois(t.a, t.mo)) return null;
    return t;
  }
  m = /^(-)?(\d{1,3}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?$/.exec(s);
  if (m) return { date: false, heure: true, neg: !!m[1], h: +m[2], mi: +m[3], s: +(m[4] || 0),
    us: m[5] ? +(m[5] + '00000').slice(0, 6) : 0, frac: !!m[5] };
  return null;
}
const joursDuMois = (a, mo) => new Date(Date.UTC(a, mo, 0)).getUTCDate();
const jourUTC = t => new Date(Date.UTC(t.a, t.mo - 1, t.j));
const ecrireDate = d => `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
const sixChiffres = us => String(us).padStart(6, '0');
function ecrireHorodatage(d, us, frac) {
  return `${ecrireDate(d)} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}:${deux(d.getUTCSeconds())}`
    + (frac || us ? '.' + sixChiffres(us) : '');
}
/* Durée en microsecondes → « [-]HH:MM:SS[.ffffff] », les heures pouvant dépasser 24. */
function ecrireDuree(us, frac) {
  const neg = us < 0; us = Math.abs(us);
  const s = Math.floor(us / 1e6), r = us % 1e6;
  return (neg ? '-' : '') + deux(Math.floor(s / 3600)) + ':' + deux(Math.floor(s / 60) % 60)
    + ':' + deux(s % 60) + (frac || r ? '.' + sixChiffres(r) : '');
}
const dureeHeure = t => (t.neg ? -1 : 1) * (((t.h * 60 + t.mi) * 60 + t.s) * 1e6 + t.us);

/* Calcul de date : DATE_ADD(d, n, 'UNITÉ'), après réécriture de l'INTERVAL. */
const COMPOSANTES = ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'MICROSECOND'];
function decomposer(n, unite) {
  const u = String(unite).toUpperCase();
  const r = { YEAR: 0, MONTH: 0, DAY: 0, HOUR: 0, MINUTE: 0, SECOND: 0, MICROSECOND: 0 };
  if (u === 'WEEK') { r.DAY = 7 * Number(n); return r; }
  if (u === 'QUARTER') { r.MONTH = 3 * Number(n); return r; }
  if (COMPOSANTES.includes(u)) { r[u] = Number(n); return r; }
  const [de, a] = u.split('_');
  const i = COMPOSANTES.indexOf(de), k = COMPOSANTES.indexOf(a);
  if (i < 0 || k < i) return null;
  const s = String(n).trim(), signe = s.startsWith('-') ? -1 : 1;
  const nombres = s.split(/[^0-9]+/).filter(x => x !== '').map(Number);
  const champs = COMPOSANTES.slice(i, k + 1);
  if (nombres.length > champs.length) return null;
  // MySQL lit les nombres en partant de la droite : '1:30' DAY_MINUTE vaut 1 h 30
  const decalage = champs.length - nombres.length;
  nombres.forEach((x, j) => { r[champs[j + decalage]] = signe * x; });
  return r;
}
function ajouterDate(v, n, unite, sens) {
  const t = lireTemps(v);
  if (!t || !t.date || estNul(n) || estNul(unite)) return null;
  const c = decomposer(sens < 0 && typeof n === 'string' && !String(n).trim().startsWith('-')
    ? '-' + n : (sens < 0 && typeof n !== 'string' ? -n : n), unite);
  if (!c || Object.values(c).some(x => Number.isNaN(x))) return null;
  let a = t.a, mo = t.mo - 1 + c.YEAR * 12 + c.MONTH;
  a += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  const j = Math.min(t.j, joursDuMois(a, mo + 1));
  let us = t.us + c.MICROSECOND;
  const ms = Date.UTC(a, mo, j, t.h, t.mi, t.s)
    + (((c.DAY * 24 + c.HOUR) * 60 + c.MINUTE) * 60 + c.SECOND) * 1000 + Math.floor(us / 1e6) * 1000;
  us = ((us % 1e6) + 1e6) % 1e6;
  const d = new Date(ms);
  const heure = t.heure || c.HOUR || c.MINUTE || c.SECOND || c.MICROSECOND;
  return heure ? ecrireHorodatage(d, us, t.frac || c.MICROSECOND) : ecrireDate(d);
}

/* WEEK(date, mode) : l'algorithme de MySQL (calc_week), modes 0 à 7. */
function semaine(t, mode) {
  let m = mode & 7;
  if (!(m & 1)) m ^= 4;
  const lundi = !!(m & 1), plage = !!(m & 2), premierJour = !!(m & 4);
  const num = (a, mo, j) => Math.round(Date.UTC(a, mo - 1, j) / 86400000);
  const joursAn = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 366 : 365;
  const jourSem = n => lundi ? (new Date(n * 86400000).getUTCDay() + 6) % 7 : new Date(n * 86400000).getUTCDay();
  const nj = num(t.a, t.mo, t.j);
  let premier = num(t.a, 1, 1), js = jourSem(premier), an = t.a, wy = plage, jours;
  if (t.mo === 1 && t.j <= 7 - js) {
    if (!wy && ((premierJour && js !== 0) || (!premierJour && js >= 4))) return 0;
    wy = true; an--;
    jours = joursAn(an); premier -= jours; js = (js + 53 * 7 - jours) % 7;
  }
  if ((premierJour && js !== 0) || (!premierJour && js >= 4)) jours = nj - (premier + (7 - js));
  else jours = nj - (premier - js);
  if (wy && jours >= 52 * 7) {
    const js2 = (js + joursAn(an)) % 7;
    if ((!premierJour && js2 < 4) || (premierJour && js2 === 0)) return 1;
  }
  return Math.floor(jours / 7) + 1;
}

/* DATE_FORMAT : les spécificateurs usuels. */
function formaterDate(v, f) {
  const t = lireTemps(v);
  if (!t || estNul(f)) return null;
  const d = t.date ? jourUTC(t) : null;
  const h12 = t.h % 12 || 12;
  const table = {
    Y: () => String(t.a), y: () => deux(t.a % 100), m: () => deux(t.mo), c: () => String(t.mo),
    d: () => deux(t.j), e: () => String(t.j), H: () => deux(t.h), k: () => String(t.h),
    h: () => deux(h12), I: () => deux(h12), l: () => String(h12), i: () => deux(t.mi),
    s: () => deux(t.s), S: () => deux(t.s), f: () => sixChiffres(t.us), p: () => t.h < 12 ? 'AM' : 'PM',
    M: () => MOIS_EN[t.mo - 1], b: () => MOIS_EN[t.mo - 1].slice(0, 3),
    W: () => d ? JOURS_EN[d.getUTCDay()] : null, a: () => d ? JOURS_EN[d.getUTCDay()].slice(0, 3) : null,
    w: () => d ? String(d.getUTCDay()) : null,
    j: () => d ? String(Math.round((d - Date.UTC(t.a, 0, 1)) / 86400000) + 1).padStart(3, '0') : null,
    T: () => `${deux(t.h)}:${deux(t.mi)}:${deux(t.s)}`,
    r: () => `${deux(h12)}:${deux(t.mi)}:${deux(t.s)} ${t.h < 12 ? 'AM' : 'PM'}`,
    '%': () => '%'
  };
  return String(f).replace(/%(.)/g, (x, c) => table[c] ? (table[c]() ?? '') : c);
}

const enTexte = v => estNul(v) ? null : String(v);
const points = s => Array.from(s);   // un emoji compte pour un caractère, comme sous MySQL
const vrai = c => estNul(c) ? false : typeof c === 'number' ? c !== 0 : (parseFloat(c) || 0) !== 0;
const maintenant = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
const fsp = (s, n) => n > 0 ? s + '.' + String(new Date().getMilliseconds()).padStart(3, '0').padEnd(6, '0').slice(0, Math.min(6, n)) : s;
const decimales = (x, d, f) => {
  if (estNul(x)) return null;
  x = Number(x); d = estNul(d) ? 0 : Math.trunc(Number(d));
  if (d >= 0) { const p = 10 ** d; return f(x * p * (1 + Number.EPSILON)) / p; }
  const p = 10 ** -d; return f(x / p) * p;
};

function fonctionsMySQL(d) {
  const F = (nom, f) => d.create_function(nom, variadique(f));
  // ── nombres ──
  F('MOD', (a, b) => estNul(a) || estNul(b) || Number(b) === 0 ? null : Number(a) % Number(b));
  F('POW', (a, b) => estNul(a) || estNul(b) ? null : Math.pow(a, b));
  F('POWER', (a, b) => estNul(a) || estNul(b) ? null : Math.pow(a, b));
  F('SQRT', x => estNul(x) || x < 0 ? null : Math.sqrt(x));
  F('EXP', x => estNul(x) ? null : Math.exp(x));
  F('LN', x => estNul(x) || x <= 0 ? null : Math.log(x));
  F('LOG', (a, b) => {
    if (b === undefined) return estNul(a) || a <= 0 ? null : Math.log(a);
    return estNul(a) || estNul(b) || a <= 0 || a == 1 || b <= 0 ? null : Math.log(b) / Math.log(a);
  });
  F('LOG10', x => estNul(x) || x <= 0 ? null : Math.log10(x));
  F('LOG2', x => estNul(x) || x <= 0 ? null : Math.log2(x));
  F('CEIL', x => estNul(x) ? null : Math.ceil(x));
  F('CEILING', x => estNul(x) ? null : Math.ceil(x));
  F('FLOOR', x => estNul(x) ? null : Math.floor(x));
  F('SIGN', x => estNul(x) ? null : Math.sign(x));
  F('PI', () => Math.PI);
  // MySQL arrondit à l'écart de zéro et accepte un nombre de décimales négatif
  F('ROUND', (x, n) => decimales(x, n, v => Math.sign(v) * Math.round(Math.abs(v))));
  // TRUNCATE coupe sans arrondir : ROUND(3.99, 0) vaut 4, TRUNCATE(3.99, 0) vaut 3
  F('TRUNCATE', (x, n) => decimales(x, n, Math.trunc));
  F('GREATEST', (...v) => v.some(estNul) ? null : v.reduce((a, b) => (b > a ? b : a)));
  F('LEAST', (...v) => v.some(estNul) ? null : v.reduce((a, b) => (b < a ? b : a)));

  // ── dates : date et heure courantes, celles du poste ──
  F('NOW', n => { const s = maintenant().toISOString(); return fsp(s.slice(0, 10) + ' ' + s.slice(11, 19), n); });
  F('SYSDATE', n => { const s = maintenant().toISOString(); return fsp(s.slice(0, 10) + ' ' + s.slice(11, 19), n); });
  F('CURDATE', () => maintenant().toISOString().slice(0, 10));
  F('CURTIME', n => fsp(maintenant().toISOString().slice(11, 19), n));
  // ── dates : extraction ──
  const surDate = f => v => { const t = lireTemps(v); return t && t.date ? f(t) : null; };
  const surHeure = f => v => { const t = lireTemps(v); return t && t.heure ? f(t) : null; };
  F('YEAR', surDate(t => t.a));
  F('MONTH', surDate(t => t.mo));
  F('DAY', surDate(t => t.j));
  F('DAYOFMONTH', surDate(t => t.j));
  F('QUARTER', surDate(t => Math.floor((t.mo - 1) / 3) + 1));
  F('DAYOFWEEK', surDate(t => jourUTC(t).getUTCDay() + 1));         // 1 = dimanche
  F('WEEKDAY', surDate(t => (jourUTC(t).getUTCDay() + 6) % 7));     // 0 = lundi
  F('DAYOFYEAR', surDate(t => Math.round((jourUTC(t) - Date.UTC(t.a, 0, 1)) / 86400000) + 1));
  F('WEEK', (v, m) => { const t = lireTemps(v); return t && t.date ? semaine(t, estNul(m) ? 0 : Number(m)) : null; });
  F('WEEKOFYEAR', surDate(t => semaine(t, 3)));
  F('DAYNAME', surDate(t => JOURS_EN[jourUTC(t).getUTCDay()]));
  F('MONTHNAME', surDate(t => MOIS_EN[t.mo - 1]));
  // les fonctions d'heure lisent un horodatage ou une heure seule ; sur une date seule, NULL
  F('HOUR', surHeure(t => t.h));
  F('MINUTE', surHeure(t => t.mi));
  F('SECOND', surHeure(t => t.s));
  F('MICROSECOND', surHeure(t => t.us));
  // ── dates : calcul ──
  F('DATEDIFF', (a, b) => {
    const x = lireTemps(a), y = lireTemps(b);
    return x && y && x.date && y.date ? Math.round((jourUTC(x) - jourUTC(y)) / 86400000) : null;
  });
  F('TIMEDIFF', (a, b) => {
    const x = lireTemps(a), y = lireTemps(b);
    if (!x || !y || x.date !== y.date) return null;
    const us = x.date
      ? (Date.UTC(x.a, x.mo - 1, x.j, x.h, x.mi, x.s) - Date.UTC(y.a, y.mo - 1, y.j, y.h, y.mi, y.s)) * 1000 + x.us - y.us
      : dureeHeure(x) - dureeHeure(y);
    return ecrireDuree(us, x.frac || y.frac);
  });
  F('DATE_ADD', (v, n, u) => ajouterDate(v, n, u, 1));
  F('DATE_SUB', (v, n, u) => ajouterDate(v, n, u, -1));
  // ADDDATE(d, n) sans INTERVAL ajoute des jours
  F('ADDDATE', (v, n, u) => ajouterDate(v, n, u === undefined ? 'DAY' : u, 1));
  F('SUBDATE', (v, n, u) => ajouterDate(v, n, u === undefined ? 'DAY' : u, -1));
  F('LAST_DAY', surDate(t => ecrireDate(new Date(Date.UTC(t.a, t.mo, 0)))));
  F('MAKEDATE', (a, j) => estNul(a) || estNul(j) || j <= 0 ? null : ecrireDate(new Date(Date.UTC(a, 0, j))));
  F('MAKETIME', (h, m, s) => {
    if (estNul(h) || estNul(m) || estNul(s) || m < 0 || m > 59 || s < 0 || s >= 60) return null;
    return (h < 0 ? '-' : '') + deux(h) + ':' + deux(m) + ':' + (Number.isInteger(+s) ? deux(s) : String(s).padStart(2, '0'));
  });
  F('DATE_FORMAT', formaterDate);

  // ── texte ──
  F('LENGTH', v => estNul(v) ? null : new TextEncoder().encode(String(v)).length);   // en octets
  F('CHAR_LENGTH', v => estNul(v) ? null : points(String(v)).length);
  F('CHARACTER_LENGTH', v => estNul(v) ? null : points(String(v)).length);
  F('UCASE', v => estNul(v) ? null : String(v).toUpperCase());
  F('LCASE', v => estNul(v) ? null : String(v).toLowerCase());
  // MySQL compte la position depuis la fin quand elle est négative, et renvoie
  // une chaîne vide pour la position 0
  const sousChaine = (s, p, n) => {
    if (estNul(s) || estNul(p)) return null;
    const c = points(String(s)); p = Math.trunc(Number(p));
    if (p === 0 || Math.abs(p) > c.length) return '';
    const debut = p > 0 ? p - 1 : c.length + p;
    if (n === undefined) return c.slice(debut).join('');
    if (estNul(n)) return null;
    n = Math.trunc(Number(n));
    return n <= 0 ? '' : c.slice(debut, debut + n).join('');
  };
  F('SUBSTRING', sousChaine);
  F('SUBSTR', sousChaine);
  F('MID', sousChaine);
  F('LEFT', (s, n) => estNul(s) || estNul(n) ? null : points(String(s)).slice(0, Math.max(0, n)).join(''));
  F('RIGHT', (s, n) => {
    if (estNul(s) || estNul(n)) return null;
    const c = points(String(s)); return n <= 0 ? '' : c.slice(Math.max(0, c.length - n)).join('');
  });
  F('LEFT_MYSQL', (s, n) => estNul(s) || estNul(n) ? null : points(String(s)).slice(0, Math.max(0, n)).join(''));
  F('RIGHT_MYSQL', (s, n) => {
    if (estNul(s) || estNul(n)) return null;
    const c = points(String(s)); return n <= 0 ? '' : c.slice(Math.max(0, c.length - n)).join('');
  });
  F('LOCATE', (sub, s, p) => {
    if (estNul(sub) || estNul(s)) return null;
    const c = points(String(s)), x = points(String(sub));
    const depart = p === undefined ? 1 : Math.trunc(Number(p));
    if (depart < 1) return 0;
    for (let i = depart - 1; i + x.length <= c.length; i++)
      if (c.slice(i, i + x.length).join('') === x.join('')) return i + 1;
    return 0;
  });
  F('CONCAT', (...v) => v.some(estNul) ? null : v.map(String).join(''));
  // CONCAT_WS, à l'inverse de CONCAT, ignore les NULL : c'est tout son intérêt
  F('CONCAT_WS', (s, ...v) => estNul(s) ? null : v.filter(x => !estNul(x)).map(String).join(s));
  F('TRIM_MYSQL', (mode, rem, s) => {
    if (estNul(s)) return null;
    let t = String(s); const r = estNul(rem) ? ' ' : String(rem);
    if (r === '') return t;
    if (mode !== 'TRAILING') while (t.startsWith(r)) t = t.slice(r.length);
    if (mode !== 'LEADING') while (t.endsWith(r)) t = t.slice(0, t.length - r.length);
    return t;
  });
  F('REVERSE', v => estNul(v) ? null : points(String(v)).reverse().join(''));
  F('REPEAT', (v, n) => estNul(v) || estNul(n) ? null : String(v).repeat(Math.max(0, n)));
  F('LPAD', (v, n, p) => {
    if (estNul(v) || estNul(n) || estNul(p)) return null;
    const c = points(String(v)); if (n <= c.length) return c.slice(0, n).join('');
    const q = points(String(p)); if (!q.length) return null;
    let g = []; while (g.length < n - c.length) g = g.concat(q);
    return g.slice(0, n - c.length).join('') + c.join('');
  });
  F('RPAD', (v, n, p) => {
    if (estNul(v) || estNul(n) || estNul(p)) return null;
    const c = points(String(v)); if (n <= c.length) return c.slice(0, n).join('');
    const q = points(String(p)); if (!q.length) return null;
    let g = []; while (g.length < n - c.length) g = g.concat(q);
    return c.join('') + g.slice(0, n - c.length).join('');
  });
  // ── condition ──
  F('IF', (c, a, b) => vrai(c) ? a : b);
}

/* Réécriture des deux syntaxes de MySQL que SQLite ne sait pas analyser.
   Les littéraux sont mis de côté le temps de la réécriture : une chaîne
   « 'INTERVAL 3 DAY' » ne doit pas être touchée. */
const UNITES = 'MICROSECOND|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|QUARTER|YEAR|SECOND_MICROSECOND|MINUTE_MICROSECOND|MINUTE_SECOND|HOUR_MICROSECOND|HOUR_SECOND|HOUR_MINUTE|DAY_MICROSECOND|DAY_SECOND|DAY_MINUTE|DAY_HOUR|YEAR_MONTH';
const MESSAGE_BARRES = "|| n'est pas une concaténation en MySQL : c'est un OU logique, "
  + "et 'a' || 'b' y vaut 0. Pour assembler des textes, écrivez CONCAT(a, ' ', b).";
function adapterMySQL(req) {
  const lits = [];
  let s = String(req || '').replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, m => `\u0001${lits.push(m) - 1}\u0002`);
  // || : en MySQL, c'est un OU logique, et 'a' || 'b' vaut 0. SQLite y voit une
  // concaténation : la requête réussirait ici et échouerait à l'examen.
  // Décision de Julien du 20 octobre 2026 : refuser, et renvoyer vers CONCAT().
  if (/\|\|/.test(s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error(MESSAGE_BARRES);
  const LIT = '\\u0001\\d+\\u0002';
  const VAL = `(?:${LIT}|-?\\s*\\d+(?:\\.\\d+)?|-?\\s*[A-Za-z_][\\w]*(?:\\.[A-Za-z_][\\w]*)?)`;
  const OPE = `(?:${LIT}|[A-Za-z_][\\w]*\\s*\\([^()]*\\)|[A-Za-z_][\\w]*(?:\\.[A-Za-z_][\\w]*)?|\\d+(?:\\.\\d+)?)`;
  const U = `(${UNITES})\\b`;
  // date + INTERVAL n UNITÉ, date - INTERVAL n UNITÉ
  s = s.replace(new RegExp(`(${OPE})\\s*([+-])\\s*INTERVAL\\s+(${VAL})\\s+${U}`, 'gi'),
    (m, o, signe, n, u) => `${signe === '+' ? 'DATE_ADD' : 'DATE_SUB'}(${o}, ${n}, '${u.toUpperCase()}')`);
  // INTERVAL n UNITÉ + date
  s = s.replace(new RegExp(`INTERVAL\\s+(${VAL})\\s+${U}\\s*\\+\\s*(${OPE})`, 'gi'),
    (m, n, u, o) => `DATE_ADD(${o}, ${n}, '${u.toUpperCase()}')`);
  // DATE_ADD(d, INTERVAL n UNITÉ) et ses variantes : l'INTERVAL devient deux arguments
  s = s.replace(new RegExp(`,\\s*INTERVAL\\s+(${VAL})\\s+${U}`, 'gi'), (m, n, u) => `, ${n}, '${u.toUpperCase()}'`);
  // TRIM([BOTH | LEADING | TRAILING] [motif] FROM chaîne)
  s = s.replace(new RegExp(`\\bTRIM\\s*\\(\\s*(BOTH|LEADING|TRAILING)\\s+(?:(${VAL})\\s+)?FROM\\s+`, 'gi'),
    (m, mode, rem) => `TRIM_MYSQL('${mode.toUpperCase()}', ${rem || 'NULL'}, `);
  s = s.replace(new RegExp(`\\bTRIM\\s*\\(\\s*(${VAL})\\s+FROM\\s+`, 'gi'), (m, rem) => `TRIM_MYSQL('BOTH', ${rem}, `);
  // LEFT( et RIGHT( : certaines versions de SQLite y voient le début d'une jointure
  s = s.replace(/\b(LEFT|RIGHT)\s*\(/gi, (m, f) => f.toUpperCase() + '_MYSQL(');
  return s.replace(/\u0001(\d+)\u0002/g, (m, i) => lits[+i]);
}
