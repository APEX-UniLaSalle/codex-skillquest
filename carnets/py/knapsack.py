"""Remplaçant du paquet knapsack de PyPI, absent de Pyodide.

Même appel : knapsack(tailles, valeurs).solve(capacite) rend
(valeur totale, indices des objets retenus). Sac à dos 0-1, programmation
dynamique. Codex, 23 octobre 2026.
"""


class knapsack:
    def __init__(self, size, weight):
        self.size = list(size)
        self.weight = list(weight)

    def solve(self, limit):
        n, W = len(self.size), int(limit)
        meilleur = [[0] * (W + 1) for _ in range(n + 1)]
        for i in range(1, n + 1):
            t, v = self.size[i - 1], self.weight[i - 1]
            for c in range(W + 1):
                meilleur[i][c] = meilleur[i - 1][c]
                if t <= c and meilleur[i - 1][c - t] + v > meilleur[i][c]:
                    meilleur[i][c] = meilleur[i - 1][c - t] + v
        objets, c = [], W
        for i in range(n, 0, -1):
            if meilleur[i][c] != meilleur[i - 1][c]:
                objets.append(i - 1)
                c -= self.size[i - 1]
        return meilleur[n][W], sorted(objets)
