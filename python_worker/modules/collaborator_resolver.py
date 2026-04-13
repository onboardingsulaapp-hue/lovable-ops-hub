"""
collaborator_resolver.py
Maps the "Representante da Implantação" name to a Firestore UID.
Falls back gracefully when no mapping is found.
"""

import json
import os
import unicodedata
import re

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
SENTINEL = "PREENCHER_UID"


def _load_map() -> dict:
    path = os.path.join(CONFIG_DIR, "colaboradores_map.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _normalize_name(name: str) -> str:
    """Uppercase, remove accents, collapse whitespace."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"\s+", " ", ascii_str.strip()).upper()
    return cleaned


def resolve(representante: str) -> tuple[str | None, bool]:
    """
    Returns (uid_or_None, is_mapped).
    is_mapped=False means no UID was found or it is still the sentinel value.
    """
    col_map = _load_map()
    normalized = _normalize_name(representante)

    uid = col_map.get(normalized)
    if uid and uid != SENTINEL:
        return uid, True

    print(f"[Collaborator] NOT MAPPED: '{representante}' (normalized: '{normalized}')")
    return None, False
