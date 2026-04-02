"""
Unit tests for the 20 new fraud detection rules:
- Hospital History (HOSP_001–005)
- Patient History (PAT_H01–05)
- IRDAI Compliance (IRDAI_001–005)
- AYUSH Fraud Detection (AYUSH_001–005)
"""

from services.fraud_rules.patient_history_rules import (
    rule_age_procedure_mismatch,
)
from services.fraud_rules.ayush_rules import (
    rule_ayush_allopathic_crossover,
    rule_ayush_bill_amount_outlier,
    rule_unregistered_ayush_practitioner,
)
from services.fraud_rules.irdai_rules import (
    rule_missing_mandatory_documents,
    rule_pre_authorization_violation,
    rule_daycare_procedure_overbilling,
)
from services.fraud_rules.policy_rules import RuleResult
import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))


# ─── Helpers ───


def make_claim(patient_name="Test Patient", status="VALIDATED", created_at=None):
    claim = MagicMock()
    claim.id = 1
    claim.patient_name = patient_name
    claim.status = status
    claim.created_at = created_at or datetime.utcnow()
    return claim


def make_doc(doc_type="discharge_summary"):
    doc = MagicMock()
    dt = MagicMock()
    dt.value = doc_type
    doc.doc_type = dt
    return doc


def make_context(fields=None, docs=None, claim=None, db=None):
    return {
        "fields": fields or {},
        "documents": docs or [],
        "claim": claim or make_claim(),
        "db": db or MagicMock(),
    }


# ═══════════════════════════════════════════
# IRDAI Rules
# ═══════════════════════════════════════════


class TestIRDAIRules:
    def test_missing_mandatory_documents_no_docs(self):
        ctx = make_context(docs=[])
        result = rule_missing_mandatory_documents(ctx)
        assert result is not None
        assert result.rule_id == "IRDAI_001"

    def test_missing_mandatory_documents_complete(self):
        docs = [make_doc("discharge_summary"), make_doc("bill")]
        ctx = make_context(docs=docs)
        result = rule_missing_mandatory_documents(ctx)
        assert result is None

    def test_missing_mandatory_documents_partial(self):
        docs = [make_doc("bill")]
        ctx = make_context(docs=docs)
        result = rule_missing_mandatory_documents(ctx)
        assert result is not None
        assert "Discharge Summary" in result.reason

    def test_pre_auth_violation_triggered(self):
        fields = {
            ("clinical", "procedure"): "Knee Replacement Surgery",
            ("clinical", "diagnosis"): "Osteoarthritis",
        }
        docs = [make_doc("discharge_summary")]
        ctx = make_context(fields=fields, docs=docs)
        result = rule_pre_authorization_violation(ctx)
        assert result is not None
        assert result.rule_id == "IRDAI_002"

    def test_pre_auth_violation_not_triggered_with_preauth_doc(self):
        fields = {
            ("clinical", "procedure"): "Knee Replacement Surgery",
        }
        docs = [make_doc("pre_auth")]
        ctx = make_context(fields=fields, docs=docs)
        result = rule_pre_authorization_violation(ctx)
        assert result is None

    def test_daycare_overbilling(self):
        fields = {
            ("clinical", "procedure"): "Cataract Surgery",
            ("clinical", "diagnosis"): "",
            ("financial", "admission_date"): "01/03/2026",
            ("financial", "discharge_date"): "05/03/2026",
        }
        ctx = make_context(fields=fields)
        result = rule_daycare_procedure_overbilling(ctx)
        assert result is not None
        assert result.rule_id == "IRDAI_004"


# ═══════════════════════════════════════════
# AYUSH Rules
# ═══════════════════════════════════════════


class TestAYUSHRules:
    def test_ayush_allopathic_crossover_triggered(self):
        fields = {
            ("clinical", "procedure"): "Panchakarma therapy",
            ("clinical", "diagnosis"): "",
            ("clinical", "medications"): "Paracetamol 500mg",
            ("hospital", "name"): "Test Hospital",
            ("hospital", "department"): "",
        }
        ctx = make_context(fields=fields)
        result = rule_ayush_allopathic_crossover(ctx)
        assert result is not None
        assert result.rule_id == "AYUSH_002"
        assert "paracetamol" in result.reason.lower()

    def test_ayush_bill_outlier_high(self):
        fields = {
            ("clinical", "procedure"): "Panchakarma",
            ("clinical", "diagnosis"): "",
            ("hospital", "name"): "Ayurvedic Centre",
            ("hospital", "department"): "",
            ("financial", "bill_amount"): "75000",
        }
        ctx = make_context(fields=fields)
        result = rule_ayush_bill_amount_outlier(ctx)
        assert result is not None
        assert result.rule_id == "AYUSH_004"

    def test_ayush_bill_outlier_normal(self):
        fields = {
            ("clinical", "procedure"): "Panchakarma",
            ("clinical", "diagnosis"): "",
            ("hospital", "name"): "Ayurvedic Centre",
            ("hospital", "department"): "",
            ("financial", "bill_amount"): "25000",
        }
        ctx = make_context(fields=fields)
        result = rule_ayush_bill_amount_outlier(ctx)
        assert result is None

    def test_unregistered_ayush_practitioner(self):
        fields = {
            ("clinical", "procedure"): "Homeopathic treatment",
            ("clinical", "diagnosis"): "",
            ("hospital", "name"): "Homeo Clinic",
            ("hospital", "department"): "",
            ("hospital", "treating_doctor"): "Dr. Sharma",
            ("hospital", "doctor_qualifications"): "MBBS, MD",
        }
        ctx = make_context(fields=fields)
        result = rule_unregistered_ayush_practitioner(ctx)
        assert result is not None
        assert result.rule_id == "AYUSH_005"

    def test_registered_ayush_practitioner_passes(self):
        fields = {
            ("clinical", "procedure"): "Homeopathic treatment",
            ("clinical", "diagnosis"): "",
            ("hospital", "name"): "Homeo Clinic",
            ("hospital", "department"): "",
            ("hospital", "treating_doctor"): "Dr. Sharma",
            ("hospital", "doctor_qualifications"): "BHMS, MD(Hom)",
        }
        ctx = make_context(fields=fields)
        result = rule_unregistered_ayush_practitioner(ctx)
        assert result is None


# ═══════════════════════════════════════════
# Patient History Rules
# ═══════════════════════════════════════════


class TestPatientHistoryRules:
    def test_age_procedure_mismatch_pediatric_adult(self):
        fields = {
            ("patient", "age"): "45",
            ("clinical", "procedure"): "Neonatal care",
            ("clinical", "diagnosis"): "",
        }
        ctx = make_context(fields=fields)
        result = rule_age_procedure_mismatch(ctx)
        assert result is not None
        assert result.rule_id == "PAT_H05"

    def test_age_procedure_mismatch_geriatric_young(self):
        fields = {
            ("patient", "age"): "22",
            ("clinical", "procedure"): "Knee Replacement",
            ("clinical", "diagnosis"): "",
        }
        ctx = make_context(fields=fields)
        result = rule_age_procedure_mismatch(ctx)
        assert result is not None
        assert result.rule_id == "PAT_H05"

    def test_age_procedure_normal(self):
        fields = {
            ("patient", "age"): "55",
            ("clinical", "procedure"): "Knee Replacement",
            ("clinical", "diagnosis"): "",
        }
        ctx = make_context(fields=fields)
        result = rule_age_procedure_mismatch(ctx)
        assert result is None

    def test_no_age_returns_none(self):
        fields = {
            ("clinical", "procedure"): "Knee Replacement",
        }
        ctx = make_context(fields=fields)
        result = rule_age_procedure_mismatch(ctx)
        assert result is None
