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


def is_aditivo_em_tratativa(row: dict) -> bool:
    """Returns True if 'Houve pedido de Aditivo'==SIM and 'Adtivo Finalizado ?'==EM TRATATIVA."""
    trigger_raw = row.get(ADITIVO_TRIGGER_FIELD, "")
    trigger = _norm(trigger_raw)
    if trigger != "SIM":
        # print(f"[Debug Aditivo] Trigger '{ADITIVO_TRIGGER_FIELD}' is '{trigger_raw}' (norm: '{trigger}'), skipping.")
        return False
    
    finalizado_raw = row.get(ADITIVO_FINALIZADO_FIELD, "")
    finalizado = _norm(finalizado_raw)
    result = (finalizado == "EM TRATATIVA")
    print(f"[Debug Aditivo] DETECTADO! '{ADITIVO_TRIGGER_FIELD}'=SIM e '{ADITIVO_FINALIZADO_FIELD}'='{finalizado_raw}' (norm: '{finalizado}'). Result: {result}")
    return result


def upsert_aditivo_alert(db, fingerprint: str, row: dict,
                          colaborador_nome: str, colaborador_id) -> bool:
    """
    Idempotent upsert of an 'aditivo_em_tratativa' alert.
    Returns True if created, False if only updated.
    """
    print(f"[Alertas] Iniciando upsert de alerta para fingerprint: {fingerprint}")
    alert_id = f"aditivo_tratativa_{fingerprint}"
    ref = db.collection("alertas").document(alert_id)
    existing = ref.get()

    base = {
        "tipo": "aditivo_em_tratativa",
        "fingerprint": fingerprint,
        "razao_social": row.get("Razão Social do Cliente", "N/A"),
        "produto": row.get("Produto", "N/A"),
        "data_vigencia": row.get("Inicio da Vigência de Contrato", "N/A"),
        "colaborador_nome": colaborador_nome,
        "colaborador_id": colaborador_id,
        "status_empresa": row.get("Status da Empresa", "N/A"),
        "aditivo_status": "EM TRATATIVA",
        "mensagem": "Aditivo em tratativa — pendências de aditivo suprimidas.",
        "updated_at": SERVER_TIMESTAMP,
    }

    if not existing.exists:
        ref.set({**base, "resolved": False, "created_at": SERVER_TIMESTAMP})
        print(f"[Alertas] Alerta CRIADO com sucesso: {alert_id}")
        return True
    else:
        # Reativar o alerta se ele já existia (garantir que apareça na aba de alertas)
        ref.update({**base, "resolved": False})
        print(f"[Alertas] Alerta ATUALIZADO (reativado) com sucesso: {alert_id}")
        return False
