import logging
from typing import Optional
from .policy_rules import RuleResult

logger = logging.getLogger(__name__)

def rule_diagnosis_procedure_mismatch(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Procedure code does not align with diagnosis
    """
    fields = claim_context.get("fields", {})
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    procedure = fields.get(("clinical", "procedure"), "").lower()
    
    if not diagnosis or not procedure:
        return None

    # Basic MVP hardcoded mismatch examples
    mismatches = [
        ({"gastritis", "fever", "malaria"}, {"surgery", "amputation", "cabg"}),
        ({"cataract"}, {"laparotomy", "angioplasty"}),
    ]
    
    for diag_set, proc_set in mismatches:
        if any(d in diagnosis for d in diag_set) and any(p in procedure for p in proc_set):
            return RuleResult(
                rule_id="CLIN_001",
                severity="HIGH",
                score=30,
                reason=f"Clinical mismatch: Diagnosis suggests '{diagnosis}' but procedure billed is '{procedure}'."
            )
            
    return None

def rule_investigation_inconsistency(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Surgery billed but No pre-op investigation reports attached
    """
    fields = claim_context.get("fields", {})
    docs = claim_context.get("documents", [])
    procedure = fields.get(("clinical", "procedure"), "").lower()
    
    is_surgery = any(x in procedure for x in ["surgery", "ectomy", "plasty", "otomy"])
    
    if is_surgery:
        from models import DocumentType
        has_lab = any(d.doc_type == DocumentType.LAB_REPORT or d.doc_type == "lab_report" for d in docs)
        
        if not has_lab:
            return RuleResult(
                rule_id="CLIN_002",
                severity="MEDIUM",
                score=15,
                reason="Minor/Major surgery was billed, but no investigation/lab reports were provided."
            )
            
    return None

def rule_medication_mismatch(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Expensive oncology drugs billed but Diagnosis not cancer-related
    """
    fields = claim_context.get("fields", {})
    diagnosis = fields.get(("clinical", "diagnosis"), "").lower()
    medications = fields.get(("clinical", "medications"), "").lower()
    
    if not medications:
        return None
        
    oncology_drugs = ["trastuzumab", "rituximab", "bevacizumab", "paclitaxel"]
    is_cancer_diagnosis = any(x in diagnosis for x in ["cancer", "carcinoma", "neoplasm", "tumor", "leukemia", "lymphoma"])
    
    has_onco_meds = any(drug in medications for drug in oncology_drugs)
    
    if has_onco_meds and not is_cancer_diagnosis:
        return RuleResult(
            rule_id="CLIN_003",
            severity="HIGH",
            score=30,
            reason=f"Medication mismatch: Expensive oncology drugs billed but diagnosis ('{diagnosis}') is not cancer-related."
        )
        
    return None

def rule_pre_auth_vs_final_bill_drift(claim_context: dict) -> Optional[RuleResult]:
    """
    If: Final amount > pre-auth by >25% AND new procedures added
    """
    fields = claim_context.get("fields", {})
    final_amount_str = fields.get(("financial", "bill_amount"))
    preauth_amount_str = fields.get(("financial", "pre_auth_amount"))
    
    if not final_amount_str or not preauth_amount_str:
        return None

    try:
        final_amt = float(final_amount_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())
        preauth_amt = float(preauth_amount_str.replace(",", "").replace("₹", "").replace("Rs", "").strip())
        
        drift = (final_amt - preauth_amt) / preauth_amt
        if drift > 0.25:
            return RuleResult(
                rule_id="CLIN_004",
                severity="HIGH",
                score=30,
                reason=f"Financial drift: Final bill ({final_amt}) is >25% higher than pre-auth estimate ({preauth_amt})."
            )
    except Exception:
        pass
        
    return None
