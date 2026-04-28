"""
pendencias_service.py
Handles upsert of pendencia documents in Firestore.
Returns ("criada" | "atualizada" | "sem_mudanca", before_data).
"""

from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from typing import List, Tuple


def upsert(db, fingerprint: str, itens_pendentes: List[str],
           em_tratativa: List[str], colaborador_id, row: dict) -> Tuple[str, dict | None]:
    """
    Creates or updates a pendencia document.
    Returns (action, before_snapshot) where action is "criada", "atualizada" or "sem_mudanca".
    """
    ref = db.collection("pendencias").document(fingerprint)
    existing = ref.get()
    before = existing.to_dict() if existing.exists else None

    texto = f"Pendências identificadas: {', '.join(itens_pendentes)}. Favor regularizar e atualizar."
    if em_tratativa:
        texto += f" Em tratativa: {', '.join(em_tratativa)}."

    new_data = {
        "fingerprint": fingerprint,
        "razao_social": row.get("Razão Social do Cliente", ""),
        "produto": row.get("Produto", ""),
        "data_vigencia": row.get("Inicio da Vigência de Contrato", ""),
        "status": "Pendente",
        "prioridade": "Media",
        "origem": "Automatica",
        "isDeleted": False,
        "itens_pendentes": itens_pendentes,
        "pendencias": itens_pendentes,  # alias used by frontend
        "itens_em_tratativa": em_tratativa,  # campos em andamento — aviso, não pendência
        "texto_pendencia": texto,
        "colaborador_id": colaborador_id,
        "representante_nome": row.get("Representante da Implantação", ""),
        "atualizado_em": SERVER_TIMESTAMP,
        "linha_csv": row,
    }

    if not existing.exists:
        new_data["criado_em"] = SERVER_TIMESTAMP
        ref.set(new_data)
        return "criada", None
    else:
        # Only update if itens_pendentes OR em_tratativa changed
        old_itens = set(before.get("itens_pendentes", []) or before.get("pendencias", []))
        new_itens = set(itens_pendentes)
        old_tratativa = set(before.get("itens_em_tratativa", []))
        new_tratativa = set(em_tratativa)
        if old_itens == new_itens and old_tratativa == new_tratativa:
            return "sem_mudanca", before
        ref.set(new_data, merge=True)
        return "atualizada", before


def resolve_if_exists(db, fingerprint: str) -> bool:
    """
    If a pendencia exists and is not 'OK', set it to 'OK'.
    Returns True if updated, False otherwise.
    """
    ref = db.collection("pendencias").document(fingerprint)
    doc = ref.get()
    if doc.exists:
        data = doc.to_dict()
        # Se estiver deletado, ignorar
        if data.get("isDeleted"):
            return False
            
        if data.get("status") != "OK":
            ref.update({
                "status": "OK",
                "atualizado_em": SERVER_TIMESTAMP
            })
            return True
    return False
