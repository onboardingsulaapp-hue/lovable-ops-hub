import unicodedata

def normalize_select(value: str) -> str:
    """Normalize: remove accents, uppercase, collapse spaces."""
    if not value:
        return ""
    # Tratar caso de valor não string (ex: números ou None)
    val_str = str(value)
    normalized = unicodedata.normalize("NFD", val_str).encode("ascii", "ignore").decode("ascii")
    return " ".join(normalized.upper().split())
