"""Solveur SAT en Python pur, avec l'appel de pysat.solvers.Glucose3.

python-sat est une bibliothèque compilée, absente de Pyodide. Ce remplaçant
garde les méthodes dont se servent les carnets du Codex : add_clause,
append_formula, solve, get_model. Recherche DPLL avec propagation unitaire
par littéraux surveillés ; chaque variable est d'abord essayée à faux.
Le modèle rendu peut différer de celui de Glucose quand plusieurs existent.
Décision de Julien du 23 octobre 2026.
"""


class Glucose3:
    def __init__(self, bootstrap_with=None, **kwargs):
        self.clauses = []
        self.nv = 0
        self.modele = None
        if bootstrap_with:
            self.append_formula(bootstrap_with)

    def add_clause(self, clause, no_return=True):
        c = [int(x) for x in clause]
        self.clauses.append(c)
        if c:
            self.nv = max(self.nv, max(abs(x) for x in c))

    def append_formula(self, formula, no_return=True):
        for c in formula:
            self.add_clause(c)

    def nof_vars(self):
        return self.nv

    def nof_clauses(self):
        return len(self.clauses)

    def get_model(self):
        return self.modele

    def delete(self):
        self.clauses = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.delete()

    def solve(self, assumptions=()):
        n = max([self.nv] + [abs(a) for a in assumptions])
        val = [0] * (n + 1)                 # 0 inconnu, 1 vrai, -1 faux
        if any(len(c) == 0 for c in self.clauses):
            self.modele = None
            return False
        surv = {}                           # littéral -> clauses qui le surveillent
        cls = [list(dict.fromkeys(c)) for c in self.clauses]
        unitaires = []
        for i, c in enumerate(cls):
            if len(c) == 1:
                unitaires.append(c[0])
            else:
                surv.setdefault(c[0], []).append(i)
                surv.setdefault(c[1], []).append(i)
        pile = []                           # (littéral, niveau de décision)

        def lit_val(l):
            v = val[abs(l)]
            return v if l > 0 else -v

        def affecter(l, file):
            val[abs(l)] = 1 if l > 0 else -1
            pile.append(l)
            file.append(l)

        def propager(file):
            while file:
                l = file.pop()
                faux = -l
                liste = surv.get(faux, [])
                garde = []
                conflit = False
                for k, i in enumerate(liste):
                    if conflit:
                        garde.append(i)
                        continue
                    c = cls[i]
                    if c[0] == faux:
                        c[0], c[1] = c[1], c[0]
                    if lit_val(c[0]) == 1:
                        garde.append(i)
                        continue
                    trouve = False
                    for j in range(2, len(c)):
                        if lit_val(c[j]) != -1:
                            c[1], c[j] = c[j], c[1]
                            surv.setdefault(c[1], []).append(i)
                            trouve = True
                            break
                    if trouve:
                        continue
                    garde.append(i)
                    if lit_val(c[0]) == -1:
                        conflit = True
                    elif lit_val(c[0]) == 0:
                        affecter(c[0], file)
                surv[faux] = garde
                if conflit:
                    file.clear()
                    return False
            return True

        file = []
        for l in list(unitaires) + list(assumptions):
            if lit_val(l) == -1:
                self.modele = None
                return False
            if lit_val(l) == 0:
                affecter(l, file)
        if not propager(file):
            self.modele = None
            return False
        decisions = []                      # (taille de la pile avant, littéral, déjà inversé)
        var = 1
        while True:
            while var <= n and val[var] != 0:
                var += 1
            if var > n:
                self.modele = [v if val[v] == 1 else -v for v in range(1, n + 1)]
                return True
            decisions.append((len(pile), -var, False))
            affecter(-var, file)
            while not propager(file):
                # retour arrière chronologique jusqu'à une décision non inversée
                while decisions and decisions[-1][2]:
                    taille, l, _ = decisions.pop()
                    for x in pile[taille:]:
                        val[abs(x)] = 0
                    del pile[taille:]
                if not decisions:
                    self.modele = None
                    return False
                taille, l, _ = decisions.pop()
                for x in pile[taille:]:
                    val[abs(x)] = 0
                del pile[taille:]
                decisions.append((taille, -l, True))
                affecter(-l, file)
            var = 1


Glucose4 = Minisat22 = Cadical153 = Lingeling = Solver = Glucose3
