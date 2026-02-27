import requests
import time
import os

BASE_URL = "http://localhost:8000"
FILE_PATH = "test_discharge_summary.png"
LOG_FILE = "verification_log.txt"

def log(msg):
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def verify():
    # Clear log
    if os.path.exists(LOG_FILE):
        os.remove(LOG_FILE)
        
    log(f"--- Starting Backend Verification ---")
    
    # 1. Upload
    log(f"[1] Uploading {FILE_PATH}...")
    with open(FILE_PATH, "rb") as f:
        files = {"files": (FILE_PATH, f, "image/png")}
        data = {"doc_types": "discharge_summary"}
        resp = requests.post(f"{BASE_URL}/claims/upload", files=files, data=data)
    
    if resp.status_code != 200:
        log(f"❌ Upload failed: {resp.text}")
        return
    
    upload_data = resp.json()
    claim_id = upload_data["claim_id"]
    log(f"✅ Upload success. Claim ID: {claim_id}")

    # 2. Poll Status
    log(f"[2] Polling status for Claim {claim_id}...")
    for _ in range(30):  # Wait up to 30 seconds
        resp = requests.get(f"{BASE_URL}/claims/{claim_id}/status")
        status_data = resp.json()
        status = status_data["status"]
        ocr_done = status_data["ocr_completed"]
        doc_count = status_data["document_count"]
        
        log(f"    Status: {status} | OCR: {ocr_done}/{doc_count}")
        
        if status in ["EXTRACTED", "VALIDATED", "COMPLETE"]:
            log(f"✅ Processing complete!")
            break
        if status == "ERROR":
            log(f"❌ Processing failed with ERROR status.")
            return
        
        time.sleep(2)
    else:
        log("❌ Timed out waiting for processing.")
        return

    # 3. Get Data
    log(f"[3] Fetching extracted data...")
    resp = requests.get(f"{BASE_URL}/claims/{claim_id}/data")
    data = resp.json()
    
    patient = next((f for f in data["extracted_fields"] if f["field_category"] == "patient" and f["field_name"] == "name"), None)
    diagnosis = next((f for f in data["extracted_fields"] if f["field_category"] == "clinical" and f["field_name"] == "diagnosis"), None)
    amount = next((f for f in data["extracted_fields"] if f["field_category"] == "financial" and f["field_name"] == "bill_amount"), None)
    
    log(f"    Patient Name: {patient['field_value'] if patient else 'NOT FOUND'}")
    log(f"    Diagnosis: {diagnosis['field_value'] if diagnosis else 'NOT FOUND'}")
    log(f"    Bill Amount: {amount['field_value'] if amount else 'NOT FOUND'}")

    # 4. Run Validation
    log(f"[4] Running validation...")
    resp = requests.post(f"{BASE_URL}/claims/{claim_id}/validate")
    val_data = resp.json()
    
    log(f"    Status: {val_data['status']}")
    log(f"    Confidence: {val_data['overall_confidence']}")
    log(f"    Errors: {val_data['errors']}")
    log(f"    Warnings: {val_data['warnings']}")
    log(f"    Missing: {val_data['missing_docs']}")
    
    if val_data['status'] in ["COMPLETE", "INCOMPLETE"]:
        log("✅ Validation ran successfully.")
    else:
        log("❌ Validation failed.")

if __name__ == "__main__":
    try:
        verify()
    except Exception as e:
        print(f"❌ Script error: {e}")
