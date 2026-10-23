"""Exécution des cellules d'un carnet du Codex, dans Pyodide.

Écrit le 23 octobre 2026 pour les notebooks des cours convertis en pages du
Codex. Chaque page tient un seul espace de noms, partagé par toutes ses
cellules, comme un notebook Jupyter. La page appelle executer(code, emettre)
pour chaque cellule ; emettre(genre, donnee) renvoie au navigateur le texte
affiché, les images, l'effacement d'une sortie, le résultat de la dernière
expression et les erreurs.
"""
import ast
import base64
import io
import os
import re
import sys
import time
import traceback

os.environ.setdefault('MPLBACKEND', 'AGG')

ESPACE = {'__name__': '__main__'}
_emettre = None
ORIGINE = 'https://codex-skillquest.netlify.app/'


def emettre(genre, donnee=''):
    if _emettre is not None:
        _emettre(genre, donnee)


class Flux(io.TextIOBase):
    def __init__(self, nom):
        self.nom = nom

    def writable(self):
        return True

    def write(self, s):
        if s:
            emettre(self.nom, s)
        return len(s)


# ── Figures matplotlib : affichées comme dans un notebook ──────────────────
def figure_png(fig):
    tampon = io.BytesIO()
    fig.savefig(tampon, format='png', bbox_inches='tight')
    return base64.b64encode(tampon.getvalue()).decode('ascii')


def vider_figures():
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is None:
        return
    for num in plt.get_fignums():
        emettre('image', figure_png(plt.figure(num)))
    plt.close('all')


def _show(*a, **k):
    vider_figures()


def preparer_matplotlib():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.show = _show


# ── Adaptations du notebook au navigateur ──────────────────────────────────
def adapter(code):
    """Les commandes de Jupyter : ! est ignoré, %timeit est mesuré."""
    lignes = []
    for ligne in code.split('\n'):
        retrait = ligne[:len(ligne) - len(ligne.lstrip())]
        nue = ligne.strip()
        if nue.startswith('!'):
            lignes.append(retrait + 'pass  # commande système, sans objet dans le Codex')
        elif nue.startswith('%timeit'):
            instr = nue[len('%timeit'):].strip()
            lignes.append(retrait + '__codex_timeit__(' + repr(instr) + ')')
        elif nue.startswith('%'):
            lignes.append(retrait + 'pass  # commande magique, sans objet dans le Codex')
        else:
            lignes.append(ligne)
    return '\n'.join(lignes)


def _unite(s):
    for u, f in (('s', 1), ('ms', 1e3), ('µs', 1e6), ('ns', 1e9)):
        if s * f >= 1:
            return f'{s * f:.3g} {u}'
    return f'{s * 1e9:.3g} ns'


def __codex_timeit__(instr, repetitions=7):
    import timeit
    import statistics
    t = timeit.Timer(instr, globals=ESPACE)
    n, _ = t.autorange()
    mesures = [x / n for x in t.repeat(repeat=repetitions, number=n)]
    moy, ecart = statistics.mean(mesures), statistics.pstdev(mesures)
    print(f'{_unite(moy)} ± {_unite(ecart)} par boucle '
          f'(moyenne ± écart type de {repetitions} exécutions, {n:,} boucles chacune)'.replace(',', ' '))


def _urlopen_codex(url, *a, **k):
    """urllib.request.urlopen sur les fichiers de données du Codex."""
    u = url if isinstance(url, str) else url.full_url
    try:
        import js
        from pyodide.http import open_url
        if u.startswith(ORIGINE):
            u = str(js.location.origin) + '/' + u[len(ORIGINE):]
        texte = open_url(u).read()
    except ImportError:          # hors du navigateur : copie locale, pour les essais
        racine = os.environ.get('CODEX_RACINE', '.')
        with open(os.path.join(racine, u[len(ORIGINE):]), encoding='utf-8') as f:
            texte = f.read()
    return io.BytesIO(texte.encode('utf-8'))


def _attendre(secondes):
    fin = time.perf_counter() + max(0.0, float(secondes))
    while time.perf_counter() < fin:
        pass


def preparer():
    ESPACE['__codex_timeit__'] = __codex_timeit__
    # Si time.sleep ne suspend rien dans ce Python, une attente active le remplace :
    # une animation garde son rythme. Elle ne bloque que le Worker, pas la page.
    t = time.perf_counter()
    time.sleep(0.02)
    if time.perf_counter() - t < 0.015:
        time.sleep = _attendre
    try:
        import ssl  # noqa: F401
    except ImportError:
        import types
        ssl = types.ModuleType('ssl')
        ssl._create_unverified_context = lambda *a, **k: None
        ssl._create_default_https_context = None
        sys.modules['ssl'] = ssl
    import urllib.request
    urllib.request.urlopen = _urlopen_codex


def _filtrer(tb):
    """La pile d'appels, sans les cadres de ce module."""
    garde = [f for f in traceback.extract_tb(tb) if f.filename == '<cellule>' or not f.filename.endswith('codex_carnet.py')]
    return garde


def executer(code, rappel):
    global _emettre
    _emettre = rappel
    ancien = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = Flux('stdout'), Flux('stderr')
    try:
        code = adapter(code)
        if 'matplotlib' in code or 'networkx' in code or 'display' in code:
            preparer_matplotlib()
        arbre = ast.parse(code, '<cellule>')
        dernier = None
        if arbre.body and isinstance(arbre.body[-1], ast.Expr):
            dernier = ast.Expression(arbre.body.pop().value)
        exec(compile(arbre, '<cellule>', 'exec'), ESPACE)
        if dernier is not None:
            valeur = eval(compile(dernier, '<cellule>', 'eval'), ESPACE)
            if valeur is not None:
                ESPACE['_'] = valeur
                if hasattr(valeur, 'savefig'):
                    pass                      # une figure : vider_figures l'affiche
                else:
                    emettre('resultat', repr(valeur))
    except SyntaxError as e:
        emettre('erreur', ''.join(traceback.format_exception_only(type(e), e)))
    except BaseException as e:  # noqa: BLE001 - tout s'affiche, comme dans Jupyter
        cadres = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == '<cellule>' or 'codex_carnet' not in f.filename]
        texte = ''.join(traceback.format_list(cadres)) + ''.join(traceback.format_exception_only(type(e), e))
        emettre('erreur', 'Traceback (most recent call last):\n' + texte)
    finally:
        sys.stdout.flush()
        sys.stdout, sys.stderr = ancien
        try:
            vider_figures()
        except Exception:  # noqa: BLE001
            pass
