"""
worker.py
Main entry point for the SulAmérica Python Worker.
Processes 'sync_pendencias_csv' jobs from Firestore.

Usage:
    Set FIREBASE_CREDENTIALS_PATH env variable to the path of your
    Firebase Admin SDK service account JSON file.
    Then run:  python worker.py
"""

import os
import sys
import time
import traceback

import firebase_admin
from firebase_admin import credentials, firestore, storage as fb_storage

# ---- Bootstrap path so modules can be imported ----
sys.path.insert(0, os.path.dirname(__file__))

from modules.firestore_repo import (
    get_next_queued_job,
    set_job_running,
    set_job_success,
    set_job_failed,
)
from modules.storage_repo import download_csv
from modules.csv_reader import read_csv
from modules.rules_engine import passes_gate, evaluate, passes_date_filter
from modules.fingerprint import generate as make_fingerprint
from modules.collaborator_resolver import resolve as resolve_collaborator
from modules.pendencias_service import upsert as upsert_pendencia
from modules.historico_service import record as record_historico
from modules.alerta_service import (
    is_aditivo_em_tratativa,
    upsert_aditivo_alert,
    ADITIVO_PENDENCY_FIELDS,
)

# -------------------------------------------------------
# Firebase initialization
# -------------------------------------------------------
CREDENTIALS_PATH = os.environ.get("FIREBASE_CREDENTIALS_PATH", "")
STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "")

if not CREDENTIALS_PATH:
    print("[ERROR] Environment variable FIREBASE_CREDENTIALS_PATH is not set.")
    print("  Set it to the path of your Firebase Admin SDK service account JSON.")
    sys.exit(1)

if not STORAGE_BUCKET:
    print("[ERROR] Environment variable FIREBASE_STORAGE_BUCKET is not set.")
    print("  Example: myproject.appspot.com")
    sys.exit(1)

cred = credentials.Certificate(CREDENTIALS_PATH)
firebase_admin.initialize_app(cred, {"storageBucket": STORAGE_BUCKET})
db = firestore.client()

print("✅ Firebase Admin SDK initialized.")
print(f"   Credentials: {CREDENTIALS_PATH}")
print(f"   Storage Bucket: {STORAGE_BUCKET}")


# -------------------------------------------------------
# Job processing
# -------------------------------------------------------
def process_job(job_id: str, job_data: dict):
    print(f"\n{'='*60}")
    print(f"[Worker] Processing job: {job_id}")
    print(f"  tipo     : {job_data.get('tipo')}")
    print(f"  file     : {job_data.get('file', {}).get('name', '—')}")
    print(f"  requested: {job_data.get('requested_by', '—')}")

    set_job_running(db, job_id)

    # Download CSV from Storage
    file_info = job_data.get("file", {})
    storage_path = file_info.get("path", "")
    if not storage_path:
        raise ValueError("Job has no file.path defined.")

    local_csv = download_csv(storage_path)

    try:
        rows = read_csv(local_csv)
    finally:
        if os.path.exists(local_csv):
            os.remove(local_csv)
            print(f"[Worker] Temp file removed: {local_csv}")

    # Counters
    linhas_total = len(rows)
    ignoradas_por_status = 0
    linhas_gate = 0
    linhas_sem_pendencia = 0
    criadas = 0
    atualizadas = 0
    nao_mapeados: list[str] = []
    amostras: list[str] = []
    # Aditivo Em Tratativa
    qtd_alertas_aditivo_tratativa = 0
    qtd_pendencias_aditivo_suprimidas = 0
    exemplos_alertas_aditivo: list[dict] = []

    for row in rows:
        from modules.rules_engine import _load_rules
        rules = _load_rules()

        # Gate 1: allowed status
        if not passes_gate(row, rules):
            ignoradas_por_status += 1
            continue

        # Gate 2: date filter (>= 2026 and < today)
        ok, reason = passes_date_filter(row)
        if not ok:
            print(f"[Worker] Linha ignorada por data: {reason}")
            ignoradas_por_status += 1
            continue

        linhas_gate += 1

        # Detectar caso especial: Aditivo Em Tratativa
        aditivo_tratativa = is_aditivo_em_tratativa(row)

        # Apply validation rules
        itens_pendentes, em_tratativa = evaluate(row)

        # Resolve collaborator
        representante = row.get("Representante da Implantação", "")
        uid, is_mapped = resolve_collaborator(representante)

        # Se Aditivo Em Tratativa: criar alerta e remover itens de aditivo
        fp = make_fingerprint(row)
        if aditivo_tratativa:
            try:
                created = upsert_aditivo_alert(db, fp, row, representante, uid)
                qtd_pendencias_aditivo_suprimidas += 1
                qtd_alertas_aditivo_tratativa += 1
                if len(exemplos_alertas_aditivo) < 5:
                    exemplos_alertas_aditivo.append({
                        "razao_social": row.get("Razão Social do Cliente", "N/A"),
                        "fingerprint": fp,
                        "novo": created
                    })
            except Exception as e:
                print(f"[Worker] Erro ao criar alerta de aditivo: {e}")

            # Remover itens de aditivo da lista (suprimidos)
            itens_pendentes = [i for i in itens_pendentes if i not in ADITIVO_PENDENCY_FIELDS]

        if not itens_pendentes and not em_tratativa:
            linhas_sem_pendencia += 1
            continue

        if not is_mapped and len(itens_pendentes) > 0:
            itens_pendentes.append("Sem responsável (mapear representante)")
            if representante not in nao_mapeados:
                nao_mapeados.append(representante)

        # Upsert pendencia
        action, before = upsert_pendencia(db, fp, itens_pendentes, em_tratativa, uid, row)

        if action == "criada":
            criadas += 1
            record_historico(db, fp, "criada", before=None)
            if len(amostras) < 20:
                amostras.append(f"[CRIADA] {row.get('Razão Social do Cliente', fp)}")
        elif action == "atualizada":
            atualizadas += 1
            record_historico(db, fp, "editada", before=before)
            if len(amostras) < 20:
                amostras.append(f"[ATUALIZADA] {row.get('Razão Social do Cliente', fp)}")
        # "sem_mudanca" → no historico needed

    result = {
        "linhas_total": linhas_total,
        "linhas_gate": linhas_gate,
        "linhas_com_pendencia": criadas + atualizadas,
        "ignoradas_por_status": ignoradas_por_status,
        "criadas": criadas,
        "atualizadas": atualizadas,
        "nao_mapeados": nao_mapeados,
        "amostras": amostras,
        "qtd_alertas_aditivo_tratativa": qtd_alertas_aditivo_tratativa,
        "qtd_pendencias_aditivo_suprimidas": qtd_pendencias_aditivo_suprimidas,
        "exemplos_alertas_aditivo_tratativa": exemplos_alertas_aditivo,
    }

    print(f"\n[Worker] Job {job_id} completed:")
    for k, v in result.items():
        print(f"  {k}: {v}")

    set_job_success(db, job_id, result)


# -------------------------------------------------------
# Main loop
# -------------------------------------------------------
def main():
    print("\n🚀 SulAmérica Worker started. Polling for jobs every 10s...")
    while True:
        try:
            job_id, job_data = get_next_queued_job(db)
            if job_id:
                try:
                    process_job(job_id, job_data)
                except Exception as e:
                    error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                    print(f"[Worker] ❌ Job {job_id} FAILED:\n{error_msg}")
                    set_job_failed(db, job_id, error_msg[:2000])
            else:
                print(".", end="", flush=True)
        except KeyboardInterrupt:
            print("\n[Worker] Shutting down gracefully.")
            break
        except Exception as e:
            print(f"\n[Worker] Unexpected error in main loop: {e}")
            traceback.print_exc()

        time.sleep(10)


if __name__ == "__main__":
    main()
