"""Remplaçant de tqdm : la boucle tourne, sans barre de progression.
Codex, 23 octobre 2026."""


class tqdm:
    def __init__(self, iterable=None, total=None, **kwargs):
        self.iterable = iterable
        self.n = 0

    def __iter__(self):
        for x in self.iterable:
            self.n += 1
            yield x

    def update(self, n=1):
        self.n += n

    def clear(self, *a, **k):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def trange(*args, **kwargs):
    return tqdm(range(*args), **kwargs)
