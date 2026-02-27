import logging
import asyncio
import os
import sys
import shutil

# Configure logging to stdout
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Assuming running from backend/ directory
from database import SessionLocal, engine, Base
from models import Claim, Document, ClaimStatus, DocumentType, ExtractedField
from services.pipeline import process_claim

TEST_IMAGE_PATH = "../test_discharge_summary.png"

async def main():
    logger.info("Starting local debug extraction...")
    
    # Create tables just in case (though should exist)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Create a test claim
        claim = Claim(status=ClaimStatus.PENDING)
        db.add(claim)
        db.commit()
        db.refresh(claim)
        logger.info(f"Created debug claim ID: {claim.id}")
        
        # Ensure test image exists
        if not os.path.exists(TEST_IMAGE_PATH):
             logger.error(f"{TEST_IMAGE_PATH} not found!")
             return

        # Copy to uploads dir
        import config
        upload_dir = config.settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        dest_path = os.path.join(upload_dir, f"{claim.id}_debug.png")
        shutil.copy(TEST_IMAGE_PATH, dest_path)
        
        doc = Document(
            claim_id=claim.id,
            doc_type=DocumentType.DISCHARGE_SUMMARY,
            file_path=dest_path,
            original_filename="debug_file.png",
            mime_type="image/png"
        )
        db.add(doc)
        db.commit()
        
        logger.info(f"Created debug document ID: {doc.id} at {dest_path}")
        
        # Run pipeline
        logger.info("Running pipeline...")
        # process_claim takes (claim_id, db_session_factory)
        # Pass a lambda that returns a NEW session each time, or reuse db session factory
        # process_claim expects a factory callable that returns a session
        await process_claim(claim.id, lambda: SessionLocal())
        
        logger.info("Pipeline finished.")
        
        # Check results - reload from DB (new session to ensure fresh read)
        db.expire_all()
        db.refresh(claim)
        logger.info(f"Final Claim Status: {claim.status}")
        
        fields = db.query(ExtractedField).filter(ExtractedField.claim_id == claim.id).all()
        logger.info(f"Extracted {len(fields)} fields:")
        for f in fields:
            logger.info(f"  - {f.field_category}.{f.field_name}: {f.field_value}")
            
    except Exception as e:
        logger.error(f"Debug script failed: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
