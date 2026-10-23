"""display et clear_output, comme dans un notebook. Codex, 23 octobre 2026."""
import codex_carnet


def display(*objets, **kwargs):
    for o in objets:
        if hasattr(o, 'savefig'):
            codex_carnet.emettre('image', codex_carnet.figure_png(o))
        else:
            print(repr(o))


def clear_output(wait=False):
    # wait=True : la sortie s'efface au moment où arrive la suivante, sans clignoter
    codex_carnet.emettre('clear', 'wait' if wait else '')
