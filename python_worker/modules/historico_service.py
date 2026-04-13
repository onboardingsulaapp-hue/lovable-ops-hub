"""
historico_service.py
Writes entries to the historico subcollection of a pendencia.
"""

from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from typing import Optional


def record(db, fingerprint: str, acao: str,
           before: Optional[dict] = None, depois: Optional[dict] = None,
           comentario: str = "Importado via CSV (worker automático)"):
    """
    Adds a historico entry under pendencias/{fingerprint}/historico.
    """
    entry = {
        "acao": acao,
        "usuario_id": "worker_python",
        "usuario_nome": "Worker Automático",
        "perfil": "sistema",
        "timestamp": SERVER_TIMESTAMP,
        "comentario": comentario,
    }
    if before is not None:
        entry["antes"] = before
    if depois is not None:
        entry["depois"] = depois

    db.collection("pendencias").document(fingerprint).collection("historico").add(entry)
