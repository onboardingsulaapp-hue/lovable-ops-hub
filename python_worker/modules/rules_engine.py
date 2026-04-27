"""
rules_engine.py
Applies the validation rules from rules_validacao_v1.json to a CSV row.
Returns a list of pending item names (itens_pendentes).
If empty, no pendencia should be created.
"""

import json
import os
import re
from datetime import datetime
from typing import List, Tuple

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


from modules.utils import normalize_select

def _is_in_progress(value: str, rules: dict) -> bool:
    """Returns True if the value is an in-progress marker (e.g. 'Em Tratativa')."""
    if not value:
        return False
    progress_values = rules.get("in_progress_values", [])
    value_norm = normalize_select(value)
    return any(normalize_select(v) == value_norm for v in progress_values)


def evaluate(row: dict) -> tuple:
    """
    Applies all rules and returns (itens_pendentes, itens_em_tratativa, diag_flags).
    - itens_pendentes: list of field names with real pendencies
    - itens_em_tratativa: list of field names that are in-progress (warning, not pendency)
    - diag_flags: dict with aditivo-specific diagnostics
    """
    rules = _load_rules()
    itens: List[str] = []
    em_tratativa: List[str] = []
    
    # Constantes de campo exatas
    ADITIVO_TRIGGER_FIELD = "Houve pedido de Aditivo"
    ADITIVO_FINALIZADO_FIELD = "Adtivo Finalizado ?"

    # 1. Required fields
    for field in rules.get("required_fields", []):
        if _is_empty(row.get(field, "")):
            itens.append(field)

    # 2. Conditional required fields
    from modules.alerta_service import is_aditivo_em_tratativa
    aditivo_em_tratativa_flag, aditivo_finalizado_val = is_aditivo_em_tratativa(row)
    trigger_norm = normalize_select(row.get(ADITIVO_TRIGGER_FIELD, ""))

    for cond in rules.get("conditional_required", []):
        if_block = cond.get("if", {})
        trigger_field = if_block.get("field", "")
        trigger_values = [normalize_select(v) for v in if_block.get("equals_any", [])]
        actual_value = normalize_select(row.get(trigger_field, ""))

        if actual_value in trigger_values:
            # Regra especial: bloco de Aditivo + "EM TRATATIVA"
            if trigger_field == ADITIVO_TRIGGER_FIELD and aditivo_em_tratativa_flag:
                # Adicionamos aos "avisos" para visibilidade
                for req_field in cond.get("then_require", []):
                    if req_field not in em_tratativa:
                        em_tratativa.append(req_field)
                continue

            for req_field in cond.get("then_require", []):
                field_value = row.get(req_field, "")
                # Campo genérico "Em Tratativa"
                if normalize_select(field_value) == "EM TRATATIVA":
                    if req_field not in em_tratativa:
                        em_tratativa.append(req_field)
                    continue
                if _is_empty(field_value) and req_field not in itens:
                    itens.append(req_field)

    # 3. Marketing block
    marketing = rules.get("marketing", {})
    marketing_fields = marketing.get("fields", [])
    pending_name = marketing.get("pendencia_name_if_any_empty", "Ações de marketing")
    if any(_is_empty(row.get(f, "")) for f in marketing_fields):
        if pending_name not in itens:
            itens.append(pending_name)

    diag_flags = {
        "aditivo_sim": trigger_norm == "SIM",
        "aditivo_em_tratativa": aditivo_em_tratativa_flag,
        "aditivo_finalizado_val": aditivo_finalizado_val
    }

    return itens, em_tratativa, diag_flags


def parse_date(date_str: str) -> datetime | None:
    if not date_str:
        return None
    date_str = date_str.strip()
    
    # DD/MM/YYYY
    match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", date_str)
    if match:
        try:
            return datetime(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        except ValueError:
            return None
            
    # YYYY-MM-DD
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", date_str)
    if match:
        try:
            return datetime.fromisoformat(date_str)
        except ValueError:
            return None
            
    return None


def passes_date_filter(row: dict) -> Tuple[bool, str]:
    """
    Returns (passes, reason).
    Only allows dates >= 2026 and < today.
    """
    vigencia_str = str(row.get("Inicio da Vigência de Contrato", ""))
    dt = parse_date(vigencia_str)
    hoje = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    if dt:
        # Regra 1: Ano >= 2026
        if dt.year <= 2025:
            return False, f"Ano {dt.year} <= 2025"
        # Regra 2: Antes de hoje
        if dt >= hoje:
            return False, f"Data {vigencia_str} >= hoje"
        return True, ""
    else:
        # Fallback: tentar capturar o ano por regex se o parse falhar
        match = re.search(r"\b(20\d{2})\b", vigencia_str)
        if match:
            ano = int(match.group(1))
            if ano <= 2025:
                return False, f"Ano {ano} <= 2025 (fallback)"
    
    return True, ""
