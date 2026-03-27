import logging
from sqlalchemy.orm import Session
from sqlalchemy import func

from model.models import Claim, UserRole, User, ClaimStatus, ExtractedField
from dao.claim_repository import ClaimRepository
from dto.schemas import (
    ClaimAnalyticsResponse, MonthlyStat, FraudBucket, DocTypeStat,
    RecentClaimStat, RejectionReason, RoleAnalyticsResponse, ClinicalTrend, HospitalTrend
)

logger = logging.getLogger(__name__)

class AnalyticsService:
    """Service handling broad analytics, keeping controllers thin."""

    @staticmethod
    def get_analytics(db: Session, current_user: User) -> ClaimAnalyticsResponse:
        claims = ClaimRepository.get_all_claims(db)
        
        # Filter by ownership
        if current_user.role == UserRole.HOSPITAL:
            claims = [c for c in claims if c.created_by == current_user.id]
        elif current_user.role == UserRole.INSURER:
            claims = [c for c in claims if c.insurer_id == current_user.id]

        total_claims = len(claims)
        processing = 0
        approved = 0
        rejected = 0
        info_requested = 0
        processing_times = []
        fraud_scores = []
        rejection_comments: list[str] = []
        
        monthly_data = {}

        for claim in claims:
            month_key = claim.created_at.strftime("%b %Y")
            if month_key not in monthly_data:
                monthly_data[month_key] = {"total": 0, "approved": 0, "rejected": 0, "sort_val": claim.created_at.strftime("%Y%m")}
            
            monthly_data[month_key]["total"] += 1

            status = claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status
            if status in ["PENDING", "PROCESSING", "EXTRACTED", "VALIDATED"]:
                processing += 1
            elif status == "APPROVED":
                approved += 1
                monthly_data[month_key]["approved"] += 1
                if claim.reviewed_at:
                    time_diff = claim.reviewed_at - claim.created_at
                    processing_times.append(time_diff.total_seconds() / 3600.0)
            elif status == "REJECTED":
                rejected += 1
                monthly_data[month_key]["rejected"] += 1
                if claim.reviewer_comments:
                    rejection_comments.append(claim.reviewer_comments.strip())
            elif status == "INFO_REQUESTED":
                info_requested += 1

            if claim.fraud_risk_score is not None:
                fraud_scores.append(claim.fraud_risk_score)

        success_rate = (approved / total_claims * 100) if total_claims > 0 else 0
        avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0
        avg_fraud = sum(fraud_scores) / len(fraud_scores) if fraud_scores else 0

        sorted_months = sorted(monthly_data.items(), key=lambda x: x[1]["sort_val"])
        monthly_stats = [
            MonthlyStat(month=month, total=data["total"], approved=data["approved"], rejected=data["rejected"])
            for month, data in sorted_months
        ][-6:]

        buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        for score in fraud_scores:
            if score <= 20: buckets["0-20"] += 1
            elif score <= 40: buckets["21-40"] += 1
            elif score <= 60: buckets["41-60"] += 1
            elif score <= 80: buckets["61-80"] += 1
            else: buckets["81-100"] += 1
        fraud_risk_distribution = [FraudBucket(label=k, count=v) for k, v in buckets.items()]

        doc_type_counts: dict[str, int] = {}
        for claim in claims:
            for doc in claim.documents:
                dt = doc.doc_type or "unknown"
                doc_type_counts[dt] = doc_type_counts.get(dt, 0) + 1
        doc_type_breakdown = [
            DocTypeStat(doc_type=dt, count=ct)
            for dt, ct in sorted(doc_type_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        sorted_claims = sorted(claims, key=lambda c: c.created_at, reverse=True)[:5]
        recent_claims = [
            RecentClaimStat(
                id=c.id, patient_name=c.patient_name,
                status=c.status.value if isinstance(c.status, ClaimStatus) else c.status,
                fraud_risk_score=c.fraud_risk_score, created_at=c.created_at.isoformat()
            ) for c in sorted_claims
        ]

        reason_counts: dict[str, int] = {}
        for comment in rejection_comments:
            short = comment[:80]
            reason_counts[short] = reason_counts.get(short, 0) + 1
        top_rejection_reasons = [
            RejectionReason(reason=r, count=c)
            for r, c in sorted(reason_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        return ClaimAnalyticsResponse(
            total_claims=total_claims, processing=processing, approved=approved, rejected=rejected,
            info_requested=info_requested, success_rate=round(success_rate, 1),
            avg_processing_time_hours=round(avg_processing_time, 1), avg_fraud_risk_score=round(avg_fraud, 1),
            monthly_stats=monthly_stats, fraud_risk_distribution=fraud_risk_distribution,
            doc_type_breakdown=doc_type_breakdown, recent_claims=recent_claims, top_rejection_reasons=top_rejection_reasons
        )

    @staticmethod
    def get_role_analytics(db: Session, current_user: User) -> RoleAnalyticsResponse:
        claims = ClaimRepository.get_all_claims(db)
        
        if current_user.role == UserRole.HOSPITAL:
            claims = [c for c in claims if c.created_by == current_user.id]
        elif current_user.role == UserRole.INSURER:
            claims = [c for c in claims if c.insurer_id == current_user.id]

        total_revenue_claimed = 0.0
        total_revenue_approved = 0.0
        total_fraud_savings = 0.0
        
        diagnoses_counts: dict[str, int] = {}
        hospitals_counts: dict[str, int] = {}

        for claim in claims:
            diagnosis = None
            amount = 0.0
            hospital = claim.patient_name
            
            for ef in claim.extracted_fields:
                if not ef.field_value: continue
                name = ef.field_name.lower()
                if "diagnosis" in name:
                    diagnosis = ef.field_value
                elif "amount" in name and ("total" in name or "bill" in name):
                    try:
                        clean_amt = ef.field_value.replace(",", "").replace("$", "").replace("₹", "").strip()
                        amount = float(clean_amt)
                    except (ValueError, TypeError):
                        pass
                elif "hospital" in name and "name" in name:
                    hospital = ef.field_value

            total_revenue_claimed += amount
            status_val = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
            if status_val == "APPROVED": total_revenue_approved += amount

            if current_user.role == UserRole.INSURER:
                if status_val == "REJECTED" and claim.fraud_risk_score and claim.fraud_risk_score > 50:
                    total_fraud_savings += amount
                if hospital:
                    hospitals_counts[hospital] = hospitals_counts.get(hospital, 0) + 1

            if diagnosis:
                norm_diag = diagnosis.strip().title()
                if norm_diag:
                    diagnoses_counts[norm_diag] = diagnoses_counts.get(norm_diag, 0) + 1

        top_diagnoses = [
            ClinicalTrend(label=k, count=v)
            for k, v in sorted(diagnoses_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        top_hospitals = None
        if current_user.role == UserRole.INSURER:
            top_hospitals = [
                HospitalTrend(hospital_name=k, count=v)
                for k, v in sorted(hospitals_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            ]
        role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        return RoleAnalyticsResponse(
            role=role_str, total_revenue_claimed=total_revenue_claimed,
            total_revenue_approved=total_revenue_approved,
            total_fraud_savings=total_fraud_savings if current_user.role == UserRole.INSURER else None,
            top_diagnoses=top_diagnoses, top_hospitals=top_hospitals
        )
