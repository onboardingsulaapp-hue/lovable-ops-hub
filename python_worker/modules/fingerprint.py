"""
fingerprint.py
Generates a deterministic document ID for each pendencia row
based on: Razão Social + Produto + Inicio Vigencia Contrato.
"""

import re
import unicodedata


def _normalize(text: str) -> str:
    """Lowercase, remove accents, keep only alphanumeric + underscores."""
    if not text:
        return "vazio"
    # Normalize unicode
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Remove special chars, collapse spaces
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", ascii_str)
    cleaned = re.sub(r"\s+", "_", cleaned.strip()).lower()
    return cleaned or "vazio"


def generate(row: dict) -> str:
    """
    Generates fingerprint as: norm(razao_social)__norm(produto)__norm(inicio_vigencia)
    """
    razao = _normalize(row.get("Razão Social do Cliente", ""))
    produto = _normalize(row.get("Produto", ""))
    vigencia = _normalize(row.get("Inicio da Vigência de Contrato", ""))
    fp = f"{razao}__{produto}__{vigencia}"
    # Truncate to 250 chars max (Firestore doc ID limit is 1500 bytes)
    return fp[:250]
