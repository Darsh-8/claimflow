import logging
from sqlalchemy.orm import Session
from models.models import Claim, FraudAlert, ExtractedField, Document
from .policy_rules import (
    rule_early_claim_after_policy_purchase,
    rule_multiple_claims_in_short_window,
    rule_sum_insured_spike_usage,
    rule_non_disclosure_suspicion
)
from .billing_rules import (
    rule_claim_amount_outlier,
    rule_length_of_stay_outlier,
    rule_weekend_holiday_surgery,
    rule_line_item_inflation,
    rule_duplicate_billing_pattern
)
from .clinical_rules import (
    rule_diagnosis_procedure_mismatch,
    rule_investigation_inconsistency,
    rule_medication_mismatch,
    rule_pre_auth_vs_final_bill_drift
)
from .temporal_rules import (
    rule_admission_right_after_policy_upgrade,
    rule_delayed_bill_submission,
    rule_repeated_high_value_claims_same_doctor
)
from .network_rules import (
    rule_high_frequency_patient_hospital_pair,
    rule_abnormal_hospital_billing_deviation,
    rule_shared_contact_phone_reuse,
    rule_doctor_hospital_collusion_ring,
    rule_synthetic_identity_cluster,
    rule_phantom_clinic_detection
)
from .pattern_rules import (
    rule_code_upcoding_velocity,
    rule_weekend_admission_ratio_pivot
)
from .hospital_history_rules import (
    rule_hospital_claim_volume_spike,
    rule_hospital_rejection_rate,
    rule_hospital_avg_bill_inflation,
    rule_newly_registered_hospital,
    rule_hospital_diagnosis_concentration,
)
from .patient_history_rules import (
    rule_patient_cumulative_amount_spike,
    rule_patient_claim_frequency,
    rule_patient_hospital_hopping,
    rule_repeat_diagnosis_abuse,
    rule_age_procedure_mismatch,
)
from .irdai_rules import (
    rule_missing_mandatory_documents,
    rule_pre_authorization_violation,
    rule_waiting_period_violation,
    rule_daycare_procedure_overbilling,
    rule_cashless_reimbursement_gap,
)
from .ayush_rules import (
    rule_ayush_hospital_not_registered,
    rule_ayush_allopathic_crossover,
    rule_ayush_excessive_duration,
    rule_ayush_bill_amount_outlier,
    rule_unregistered_ayush_practitioner,
)

logger = logging.getLogger(__name__)

ALL_RULES = [
    # Policy
    rule_early_claim_after_policy_purchase,
    rule_multiple_claims_in_short_window,
    rule_sum_insured_spike_usage,
    rule_non_disclosure_suspicion,
    # Billing
    rule_claim_amount_outlier,
    rule_length_of_stay_outlier,
    rule_weekend_holiday_surgery,
    rule_line_item_inflation,
    rule_duplicate_billing_pattern,
    # Clinical
    rule_diagnosis_procedure_mismatch,
    rule_investigation_inconsistency,
    rule_medication_mismatch,
    rule_pre_auth_vs_final_bill_drift,
    # Temporal
    rule_admission_right_after_policy_upgrade,
    rule_delayed_bill_submission,
    rule_repeated_high_value_claims_same_doctor,
    # Network
    rule_high_frequency_patient_hospital_pair,
    rule_abnormal_hospital_billing_deviation,
    rule_shared_contact_phone_reuse,
    rule_doctor_hospital_collusion_ring,
    rule_synthetic_identity_cluster,
    rule_phantom_clinic_detection,
    # Pattern
    rule_code_upcoding_velocity,
    rule_weekend_admission_ratio_pivot,
    # Hospital History
    rule_hospital_claim_volume_spike,
    rule_hospital_rejection_rate,
    rule_hospital_avg_bill_inflation,
    rule_newly_registered_hospital,
    rule_hospital_diagnosis_concentration,
    # Patient History
    rule_patient_cumulative_amount_spike,
    rule_patient_claim_frequency,
    rule_patient_hospital_hopping,
    rule_repeat_diagnosis_abuse,
    rule_age_procedure_mismatch,
    # IRDAI Compliance
    rule_missing_mandatory_documents,
    rule_pre_authorization_violation,
    rule_waiting_period_violation,
    rule_daycare_procedure_overbilling,
    rule_cashless_reimbursement_gap,
    # AYUSH Fraud Detection
    rule_ayush_hospital_not_registered,
    rule_ayush_allopathic_crossover,
    rule_ayush_excessive_duration,
    rule_ayush_bill_amount_outlier,
    rule_unregistered_ayush_practitioner,
]


def evaluate_claim(db: Session, claim: Claim) -> tuple[int, list]:
    """
    Evaluates a claim against all fraud rules.
    Returns (total_score (0-100), list of RuleResult objects that triggered)
    """
    documents = db.query(Document).filter(Document.claim_id == claim.id).all()
    fields = {
        (f.field_category, f.field_name): f.field_value
        for f in db.query(ExtractedField).filter(ExtractedField.claim_id == claim.id).all()
    }

    claim_context = {
        "db": db,
        "claim": claim,
        "documents": documents,
        "fields": fields
    }

    results = []

    for rule_func in ALL_RULES:
        try:
            result = rule_func(claim_context)
            if result:
                results.append(result)
        except Exception as e:
            logger.error(
                f"Error evaluating rule {rule_func.__name__} for claim {claim.id}: {e}")

    total_score = sum(r.score for r in results)
    final_score = min(total_score, 100)

    return final_score, results
