"""
rules_engine.py
Applies the validation rules from rules_validacao_v1.json to a CSV row.
Returns a list of pending item names (itens_pendentes).
If empty, no pendencia should be created.
"""

import json
import os
from typing import List

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


def _load_rules() -> dict:
    path = os.path.join(CONFIG_DIR, "rules_validacao_v1.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _is_empty(value: str) -> bool:
    return not value or value.strip() == ""


def passes_gate(row: dict, rules: dict) -> bool:
    """Returns True if the row status is in the allowed list."""
    gate = rules.get("gate", {})
    field = gate.get("field", "Status da Empresa")
    allowed = gate.get("allowed", [])
    status = row.get(field, "").strip().upper()
    allowed_upper = [a.upper() for a in allowed]
    return status in allowed_upper


def evaluate(row: dict) -> List[str]:
    """
    Applies all rules and returns the list of pending item names.
    """
    rules = _load_rules()
    itens: List[str] = []

    # 1. Required fields
    for field in rules.get("required_fields", []):
        if _is_empty(row.get(field, "")):
            itens.append(field)

    # 2. Conditional required fields
    for cond in rules.get("conditional_required", []):
        if_block = cond.get("if", {})
        trigger_field = if_block.get("field", "")
        trigger_values = [v.upper() for v in if_block.get("equals_any", [])]
        actual_value = row.get(trigger_field, "").strip().upper()

        if actual_value in trigger_values:
            for req_field in cond.get("then_require", []):
                if _is_empty(row.get(req_field, "")) and req_field not in itens:
                    itens.append(req_field)

    # 3. Marketing block: if ANY marketing field is empty → one combined item
    marketing = rules.get("marketing", {})
    marketing_fields = marketing.get("fields", [])
    pending_name = marketing.get("pendencia_name_if_any_empty", "Ações de marketing")
    if any(_is_empty(row.get(f, "")) for f in marketing_fields):
        if pending_name not in itens:
            itens.append(pending_name)

    return itens
