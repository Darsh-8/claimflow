"""
Document Summary Service — generates plain-English, readable summaries
of all documents associated with a claim. Designed so that anyone
(non-medical staff, managers, reviewers) can quickly understand
what the documents contain.

Uses Kimi K2.5 when available, with a comprehensive rule-based fallback.
"""

import json
import logging
from typing import Optional

from config.config import settings
from service.extraction_service import AIServiceClient

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """You are a document processing assistant. Your job is to read
medical claim documents and write a clear, plain-English summary that ANYONE
can understand — not just medical professionals.

Given the raw OCR text and structured extracted data, write a multi-paragraph
summary using simple, everyday language. Avoid medical jargon where possible;
if you must use a medical term, briefly explain it in parentheses.

Structure your summary as follows (each as a separate paragraph):

Paragraph 1 — OVERVIEW: Who is the patient, what happened to them, and where
were they treated? Include their name, age, gender, the hospital name, and
dates of visit/admission.

Paragraph 2 — MEDICAL DETAILS: What was the diagnosis? What treatment or
procedures were performed? What medications were prescribed? Explain in
simple terms what the condition is and what was done about it.

Paragraph 3 — FINANCIAL & POLICY: What is the total bill amount? Any
breakdown of charges? What is the insurance policy number? Summarize the
cost picture.

Paragraph 4 — ADDITIONAL NOTES: Any other relevant information such as
follow-up instructions, vitals recorded, doctor qualifications, etc.

Return ONLY valid JSON:
{
  "summary_text": "Paragraph 1 text.\\n\\nParagraph 2 text.\\n\\nParagraph 3 text.\\n\\nParagraph 4 text.",
  "key_findings": []
}

Use \\n\\n to separate paragraphs. Do NOT include markdown. Do NOT include
bullet points. Write in flowing, natural prose."""


async def generate_document_summary(
    raw_texts: list[str],
    extracted_fields: dict,
) -> dict:
    """
    Generate a plain-English, multi-paragraph summary of all documents in a claim.

    Args:
        raw_texts: List of raw OCR text strings from each document.
        extracted_fields: Dict of structured extraction results (fields/confidences).

    Returns:
        A dict with 'summary_text' (str) and 'key_findings' (list[str]).
    """
    combined_text = "\n\n---\n\n".join(
        t for t in raw_texts if t and not t.startswith("[OCR ERROR")
    )

    if not combined_text.strip():
        return _build_fallback_summary(extracted_fields)

    fields_context = json.dumps(extracted_fields, indent=2, default=str)

    user_message = (
        f"Here is the raw text from the medical documents:\n\n{combined_text}\n\n"
        f"Here are the structured fields already extracted:\n\n{fields_context}\n\n"
        "Write the plain-English summary."
    )

    payload = {
        "model": settings.KIMI_MODEL_NAME,
        "messages": [
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 2048,
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {settings.KIMI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        http_client = AIServiceClient().client
        resp = await http_client.post(
            settings.KIMI_API_URL,
            json=payload,
            headers=headers,
        )

        if resp.status_code != 200:
            logger.error(
                f"Summary API Error: {resp.status_code} - {resp.text}")
            return _build_fallback_summary(extracted_fields)

        result = resp.json()

        content = ""
        if "choices" in result:
            content = result["choices"][0]["message"]["content"]
        elif "generated_text" in result:
            content = result["generated_text"]
        elif isinstance(result, list) and result and "generated_text" in result[0]:
            content = result[0]["generated_text"]
        else:
            content = json.dumps(result)

        content = content.strip()
        if content.startswith("```"):
            content = content.replace("```json", "").replace("```", "").strip()

        parsed = json.loads(content)

        summary_text = parsed.get("summary_text", "")
        if not summary_text:
            return _build_fallback_summary(extracted_fields)

        return {
            "summary_text": summary_text,
            "key_findings": parsed.get("key_findings", []),
        }

    except json.JSONDecodeError as e:
        logger.error(f"Summary JSON parse error: {e}")
        return _build_fallback_summary(extracted_fields)
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return _build_fallback_summary(extracted_fields)


def _build_fallback_summary(extracted_fields: dict) -> dict:
    """
    Build a comprehensive, plain-English multi-paragraph summary from
    extracted structured fields. Written so anyone can understand it.

    Returns:
        A dict with 'summary_text' (multi-paragraph str) and 'key_findings' ([]).
    """
    fields = extracted_fields.get("fields", extracted_fields)
    if not fields:
        return {
            "summary_text": "The uploaded documents could not be processed into a readable summary. This may be due to poor image quality or an unsupported document format. Please try re-uploading clearer copies of the documents.",
            "key_findings": [],
        }

    patient = fields.get("patient", {})
    clinical = fields.get("clinical", {})
    hospital = fields.get("hospital", {})
    financial = fields.get("financial", {})
    policy = fields.get("policy", {})

    paragraphs: list[str] = []

    # ── Paragraph 1: Patient & Hospital Overview ──
    overview_parts: list[str] = []

    name = patient.get("name", "")
    age = patient.get("age", "")
    gender = patient.get("gender", "")
    weight = patient.get("weight", "")
    phone = patient.get("phone", "")
    address = patient.get("address", "")

    if name:
        intro = f"This document pertains to a patient named {name}"
        if age:
            intro += f", {age} years old"
        if gender:
            intro += f", {gender}"
        intro += "."
        overview_parts.append(intro)
    else:
        overview_parts.append(
            "The patient's name could not be determined from the uploaded documents.")

    if weight:
        overview_parts.append(
            f"The patient's weight was recorded as {weight}.")

    hosp_name = hospital.get("name", "")
    hosp_addr = hospital.get("address", "")
    doctor = hospital.get("treating_doctor", "")
    qualifications = hospital.get("doctor_qualifications", "")
    membership = hospital.get("professional_membership", "")
    department = hospital.get("department", "")

    if hosp_name:
        hosp_info = f"The patient was treated at {hosp_name}"
        if hosp_addr:
            hosp_info += f", located at {hosp_addr}"
        hosp_info += "."
        overview_parts.append(hosp_info)

    if doctor:
        doc_info = f"The treating doctor was {doctor}"
        if qualifications:
            doc_info += f" ({qualifications})"
        if membership:
            doc_info += f", {membership}"
        doc_info += "."
        overview_parts.append(doc_info)

    if department:
        overview_parts.append(
            f"The patient was seen in the {department} department.")

    adm = financial.get("admission_date", "")
    dis = financial.get("discharge_date", "")
    if adm and dis:
        overview_parts.append(
            f"The patient was admitted on {adm} and discharged on {dis}.")
    elif adm:
        overview_parts.append(
            f"The visit/admission date was recorded as {adm}.")

    if overview_parts:
        paragraphs.append(" ".join(overview_parts))

    # ── Paragraph 2: Clinical Details ──
    clinical_parts: list[str] = []

    diagnosis = clinical.get("diagnosis", "")
    procedure = clinical.get("procedure", "")
    symptoms = clinical.get("symptoms", "")
    bp = clinical.get("blood_pressure", "")
    pulse = clinical.get("pulse", "")
    temp = clinical.get("temperature", "")
    spo2 = clinical.get("spo2", "")
    icd = clinical.get("icd_codes", "")
    allergies = clinical.get("allergies", "")

    if diagnosis:
        clinical_parts.append(f"The diagnosis recorded was {diagnosis}.")
    if symptoms:
        clinical_parts.append(
            f"The patient presented with the following symptoms: {symptoms}.")
    if procedure:
        clinical_parts.append(f"The procedure performed was {procedure}.")

    vitals: list[str] = []
    if bp:
        vitals.append(f"blood pressure {bp}")
    if pulse:
        vitals.append(f"pulse {pulse} bpm")
    if temp:
        vitals.append(f"temperature {temp}")
    if spo2:
        vitals.append(f"oxygen saturation (SpO2) {spo2}%")
    if vitals:
        clinical_parts.append(
            f"Vital signs recorded include: {', '.join(vitals)}.")

    if icd:
        clinical_parts.append(
            f"The medical classification code(s) noted: {icd}.")

    if allergies:
        clinical_parts.append(f"Known allergies: {allergies}.")

    # Collect all medications
    meds: list[str] = []
    for key, val in clinical.items():
        if key.startswith("medication_") and val:
            meds.append(val)
    medications_str = clinical.get("medications", "")

    if meds:
        med_list = ", ".join(meds)
        clinical_parts.append(
            f"The following medications were prescribed: {med_list}.")
    elif medications_str:
        clinical_parts.append(f"Medications prescribed: {medications_str}.")

    if clinical_parts:
        paragraphs.append(" ".join(clinical_parts))
    else:
        paragraphs.append(
            "No specific clinical details such as diagnosis, procedures, or medications could be extracted from the documents.")

    # ── Paragraph 3: Financial & Policy ──
    finance_parts: list[str] = []

    total = financial.get("total_bill_amount", "")
    room = financial.get("room_charges", "")
    medicine_charges = financial.get("medicine_charges", "")
    investigation = financial.get("investigation_charges", "")
    consultation = financial.get("consultation_charges", "")
    ot = financial.get("ot_charges", "")
    discount = financial.get("discount", "")
    paid = financial.get("amount_paid", "")
    balance = financial.get("balance_due", "")
    pol_num = policy.get("policy_number", "")
    insurer = policy.get("insurer_name", "")
    tpa = policy.get("tpa_name", "")

    if total:
        finance_parts.append(f"The total bill amount is ₹{total}.")

    breakdown: list[str] = []
    if room:
        breakdown.append(f"room charges ₹{room}")
    if medicine_charges:
        breakdown.append(f"medicine charges ₹{medicine_charges}")
    if investigation:
        breakdown.append(f"investigation/lab charges ₹{investigation}")
    if consultation:
        breakdown.append(f"consultation fees ₹{consultation}")
    if ot:
        breakdown.append(f"operation theatre charges ₹{ot}")
    if breakdown:
        finance_parts.append(f"The bill includes: {', '.join(breakdown)}.")

    if discount:
        finance_parts.append(f"A discount of ₹{discount} was applied.")
    if paid:
        finance_parts.append(f"Amount already paid: ₹{paid}.")
    if balance:
        finance_parts.append(f"Balance due: ₹{balance}.")

    if pol_num:
        finance_parts.append(f"The insurance policy number is {pol_num}.")
    if insurer:
        finance_parts.append(f"The claim is filed under {insurer}.")
    if tpa:
        finance_parts.append(f"Third-party administrator: {tpa}.")

    if finance_parts:
        paragraphs.append(" ".join(finance_parts))

    # ── Combine all paragraphs ──
    if not paragraphs:
        summary_text = "The uploaded documents were processed but contained insufficient information to generate a detailed summary."
    else:
        summary_text = "\n\n".join(paragraphs)

    return {
        "summary_text": summary_text,
        "key_findings": [],
    }
