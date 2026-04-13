"""
csv_reader.py
Reads and parses the exported CSV, auto-detecting the real header row
and resolving column aliases.
"""

import csv
import json
import os
from typing import List, Dict

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


def _load_json(filename: str) -> dict:
    path = os.path.join(CONFIG_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _build_alias_map(aliases: dict) -> Dict[str, str]:
    """
    Produces a flat map: alias_lowercase → canonical_field_name
    """
    result = {}
    for canonical, alias_list in aliases.items():
        for alias in alias_list:
            result[alias.strip().lower()] = canonical
    return result


def read_csv(filepath: str) -> List[Dict[str, str]]:
    """
    Finds the header row (starts_with 'Carimbo de data/hora'),
    resolves column aliases, and returns a list of row dicts.
    Tries multiple encodings as defined in csv_layout.json.
    """
    layout = _load_json("csv_layout.json")
    aliases_raw = _load_json("column_aliases.json")
    alias_map = _build_alias_map(aliases_raw)

    header_starts = layout["header_detection"]["starts_with"]
    delimiter = layout.get("delimiter", ",")
    encodings = layout.get("encoding_try_order", ["utf-8", "iso-8859-1", "latin-1"])

    raw_lines = None
    for enc in encodings:
        try:
            with open(filepath, encoding=enc, errors="strict") as f:
                raw_lines = f.readlines()
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if raw_lines is None:
        raise ValueError("Could not read CSV with any of the configured encodings.")

    # Find header row index
    header_idx = None
    for i, line in enumerate(raw_lines):
        if line.strip().startswith(header_starts):
            header_idx = i
            break

    if header_idx is None:
        raise ValueError(
            f"Header row not found. Expected a line starting with '{header_starts}'."
        )

    # Parse header + data rows using csv.DictReader
    relevant_lines = raw_lines[header_idx:]
    reader = csv.DictReader(relevant_lines, delimiter=delimiter)

    rows = []
    for row in reader:
        # Strip keys and values
        cleaned = {k.strip(): (v.strip() if v else "") for k, v in row.items() if k}

        # Resolve aliases: remap column names to canonical names
        resolved = {}
        for col, val in cleaned.items():
            canonical = alias_map.get(col.lower(), col)
            resolved[canonical] = val

        rows.append(resolved)

    print(f"[CSV] Parsed {len(rows)} data rows from '{filepath}' (header at line {header_idx + 1})")
    return rows
