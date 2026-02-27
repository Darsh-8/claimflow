import asyncio
import json
from database import SessionLocal
from models import Claim
from services.validation_service import validate_claim

async def main():
    db = SessionLocal()
    claim = db.query(Claim).first()
    if claim:
        result = await validate_claim(db, claim.id)
        with open('val_out.json', 'w') as f:
            json.dump(result, f, indent=2)
    db.close()

if __name__ == '__main__':
    asyncio.run(main())
