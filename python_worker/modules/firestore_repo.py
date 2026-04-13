"""
firestore_repo.py
Abstraction layer for Firestore reads/writes used by the worker.
"""

import firebase_admin
from firebase_admin import firestore


def get_db():
    """Returns the Firestore client (must be initialized before calling)."""
    return firestore.client()


def get_next_queued_job(db, job_type: str = "sync_pendencias_csv"):
    """
    Fetches the oldest queued job of the given type.
    Returns (doc_id, doc_data) or (None, None).
    """
    query = (
        db.collection("jobs")
        .where("status", "==", "queued")
        .where("tipo", "==", job_type)
        .order_by("requested_at")
        .limit(1)
    )
    docs = list(query.stream())
    if not docs:
        return None, None
    doc = docs[0]
    return doc.id, doc.to_dict()


def set_job_running(db, job_id: str):
    from google.cloud.firestore_v1 import SERVER_TIMESTAMP
    db.collection("jobs").document(job_id).update({
        "status": "running",
        "started_at": SERVER_TIMESTAMP,
    })


def set_job_success(db, job_id: str, result: dict):
    from google.cloud.firestore_v1 import SERVER_TIMESTAMP
    db.collection("jobs").document(job_id).update({
        "status": "success",
        "result": result,
        "finished_at": SERVER_TIMESTAMP,
    })


def set_job_failed(db, job_id: str, error_msg: str):
    from google.cloud.firestore_v1 import SERVER_TIMESTAMP
    db.collection("jobs").document(job_id).update({
        "status": "failed",
        "error": error_msg,
        "finished_at": SERVER_TIMESTAMP,
    })


def get_pendencia(db, fingerprint: str):
    """Returns existing pendencia doc dict or None."""
    doc = db.collection("pendencias").document(fingerprint).get()
    if doc.exists:
        return doc.to_dict()
    return None


def upsert_pendencia(db, fingerprint: str, data: dict):
    """Merge-writes a pendencias document."""
    db.collection("pendencias").document(fingerprint).set(data, merge=True)


def add_historico(db, fingerprint: str, entry: dict):
    """Adds a historico document inside the pendencias subcollection."""
    db.collection("pendencias").document(fingerprint).collection("historico").add(entry)
