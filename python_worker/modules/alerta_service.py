"""
alerta_service.py
Handles idempotent upsert of alert documents in the 'alertas' Firestore collection.
"""

from google.cloud.firestore_v1 import SERVER_TIMESTAMP


ADITIVO_TRIGGER_FIELD = "Houve pedido de Aditivo"
ADITIVO_FINALIZADO_FIELD = "Adtivo Finalizado ?"
ADITIVO_PENDENCY_FIELDS = [
    "Data do pedido de Aditivo",
    "Data da Assinatura do Aditivo",
    "Adtivo Finalizado ?",
]


def _norm(value: str) -> str:
    """Normalize: strip, uppercase, remove accents, collapse spaces."""
    if not value:
        return ""
    import unicodedata
    normalized = unicodedata.normalize("NFD", str(value)).encode("ascii", "ignore").decode("ascii")
    return " ".join(normalized.upper().split())


def is_aditivo_em_tratativa(row: dict) -> tuple:
    """
    Returns (is_tratativa, finalizado_val).
    is_tratativa: True if 'Houve pedido de Aditivo'==SIM and 'Adtivo Finalizado ?'==EM TRATATIVA.
    """
    from modules.utils import normalize_select
    
    trigger_raw = row.get(ADITIVO_TRIGGER_FIELD, "")
    trigger = normalize_select(trigger_raw)
    if trigger != "SIM":
        return False, ""
    
    finalizado_raw = row.get(ADITIVO_FINALIZADO_FIELD, "")
    finalizado = normalize_select(finalizado_raw)
    
    markers = ["EM TRATATIVA", "EM TRATATIVAS", "TRATATIVA", "TRATATIVAS"]
    return (finalizado in markers), finalizado_raw


def upsert_tratativa_alert(db, fingerprint: str, row: dict,
                           colaborador_nome: str, colaborador_id,
                           em_tratativa: list, aditivo_em_tratativa: bool) -> bool:
    """
    Idempotent upsert of a 'tratativa' alert.
    """
    print(f"[Alertas] Iniciando upsert de alerta para fingerprint: {fingerprint}")
    alert_id = f"tratativa_{fingerprint}"
    ref = db.collection("alertas").document(alert_id)
    existing = ref.get()

    if aditivo_em_tratativa:
        mensagem = "Aditivo em tratativa — pendências de aditivo suprimidas."
    else:
        mensagem = f"Itens em tratativa identificados: {', '.join(em_tratativa)}."

    base = {
        "tipo": "aditivo_em_tratativa", # Mantemos o tipo para compatibilidade com UI
        "fingerprint": fingerprint,
        "razao_social": row.get("Razão Social do Cliente", "N/A"),
        "produto": row.get("Produto", "N/A"),
        "data_vigencia": row.get("Inicio da Vigência de Contrato", "N/A"),
        "colaborador_nome": colaborador_nome,
        "colaborador_id": colaborador_id,
        "status_empresa": row.get("Status da Empresa", "N/A"),
        "aditivo_status": "EM TRATATIVA" if aditivo_em_tratativa else "AVISO",
        "mensagem": mensagem,
        "itens_em_tratativa": em_tratativa,
        "updated_at": SERVER_TIMESTAMP,
    }

    if not existing.exists:
        ref.set({**base, "resolved": False, "created_at": SERVER_TIMESTAMP})
        print(f"[Alertas] Alerta CRIADO com sucesso: {alert_id}")
        return True
    else:
        before = existing.to_dict()
        # Prevenção de duplicidade: Só atualiza se houve mudança real ou se estava resolvido e continua no CSV
        has_changed = (before.get("mensagem") != mensagem or 
                       before.get("itens_em_tratativa") != em_tratativa)
        
        if has_changed or before.get("resolved") is True:
            ref.update({**base, "resolved": False})
            print(f"[Alertas] Alerta ATUALIZADO/REATIVADO: {alert_id}")
            return True
        else:
            print(f"[Alertas] Alerta sem mudanças, ignorando update: {alert_id}")
            return False
