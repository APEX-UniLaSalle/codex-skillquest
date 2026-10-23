"""Remplaçant d'IPython pour les carnets du Codex : display et clear_output.
Codex, 23 octobre 2026."""
from . import display  # noqa: F401

version_info = (8, 0, 0)
__version__ = '8.0.0'


def get_ipython():
    return None
