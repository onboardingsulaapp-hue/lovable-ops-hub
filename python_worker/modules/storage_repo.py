"""
storage_repo.py
Downloads the uploaded CSV file from Firebase Storage.
"""

import os
import tempfile
import firebase_admin
from firebase_admin import storage as fb_storage


def download_csv(storage_path: str) -> str:
    """
    Downloads the file at storage_path to a local temp file.
    Returns the local file path (caller is responsible for cleanup).
    """
    bucket = fb_storage.bucket()
    blob = bucket.blob(storage_path)

    # Create a temporary file with .csv extension
    suffix = ".csv"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()

    blob.download_to_filename(tmp.name)
    print(f"[Storage] Downloaded '{storage_path}' → '{tmp.name}'")
    return tmp.name
