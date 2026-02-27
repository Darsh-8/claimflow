import logging
import asyncio
import os
import sys

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Add backend to path
sys.path.append("backend")

from backend.database import SessionLocal, engine, Base
from backend.models import Claim, Document, ClaimStatus, DocumentType
from backend.services.pipeline import process_claim

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
        
        # Create a test document
        # Ensure test_discharge_summary.png exists
        if not os.path.exists("test_discharge_summary.png"):
             # Generate it if missing? Or assume user has it.
             # Let's rely on previous step having created it.
             logger.error("test_discharge_summary.png not found!")
             return

        # It needs to be in uploads dir for the service to find it?
        # The service uses absolute path stored in DB.
        # But let's copy it to uploads dir just to be safe/consistent with app logic.
        import shutil
        upload_dir = "backend/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        dest_path = os.path.join(upload_dir, f"{claim.id}_debug.png")
        shutil.copy("test_discharge_summary.png", dest_path)
        
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
        await process_claim(claim.id, lambda: db)
        
        logger.info("Pipeline finished.")
        
        # Check results
        db.refresh(claim)
        logger.info(f"Final Claim Status: {claim.status}")
        
        from backend.models import ExtractedField
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
