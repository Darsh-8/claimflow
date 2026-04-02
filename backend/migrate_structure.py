"""
migrate_structure.py
====================
One-shot migration script to canonicalize the ClaimFlow backend folder structure.

Run from: d:\\Code\\Claimflow\\backend
    python migrate_structure.py
"""

import re
import shutil
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────
BACKEND = Path(__file__).parent

# ── Step 1: Move db/ → config/ ────────────────────────────────────────
print("=== Step 1: Moving db/ → config/ ===")

def copy_with_updated_imports(src: Path, dst: Path, replacements: list[tuple[str, str]]):
    content = src.read_text(encoding="utf-8")
    for old, new in replacements:
        content = content.replace(old, new)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(content, encoding="utf-8")
    print(f"  Copied {src.relative_to(BACKEND)} → {dst.relative_to(BACKEND)}")


# Create config/__init__.py if missing
config_init = BACKEND / "config" / "__init__.py"
if not config_init.exists():
    config_init.write_text('"""Configuration package."""\n', encoding="utf-8")
    print("  Created config/__init__.py")

# Copy db/database.py → config/database.py
copy_with_updated_imports(
    BACKEND / "db" / "database.py",
    BACKEND / "config" / "database.py",
    [],  # no import changes needed inside database.py itself
)

# Copy db/seed.py → config/seed.py (fix its internal imports)
copy_with_updated_imports(
    BACKEND / "db" / "seed.py",
    BACKEND / "config" / "seed.py",
    [
        ("from db.database import", "from config.database import"),
        ("from model.models import", "from models.models import"),
    ],
)


# ── Step 2: Create missing __init__.py files ──────────────────────────
print("\n=== Step 2: Ensuring __init__.py files exist ===")

packages = ["models", "schemas", "routes", "controllers", "services", "dao",
            "middleware", "utils", "enums", "exceptions"]

for pkg in packages:
    init = BACKEND / pkg / "__init__.py"
    if not init.exists():
        init.write_text(f'"""{pkg} package."""\n', encoding="utf-8")
        print(f"  Created {pkg}/__init__.py")
    else:
        print(f"  {pkg}/__init__.py already exists")


# ── Step 3: Fix imports across all canonical folders ──────────────────
print("\n=== Step 3: Fixing imports ===")

# (old_pattern, new_pattern) — applied as plain string replacements
REPLACEMENTS = [
    ("from db.database import",         "from config.database import"),
    ("from model.models import",         "from models.models import"),
    ("from dto.schemas import",          "from schemas.schemas import"),
    ("from service.claim_service",       "from services.claim_service"),
    ("from service.analytics_service",   "from services.analytics_service"),
    ("from service.validation_service",  "from services.validation_service"),
    ("from service.extraction_service",  "from services.extraction_service"),
    ("from service.summary_service",     "from services.summary_service"),
    ("from service.comprehend_medical_service", "from services.comprehend_medical_service"),
    ("from service.fraud_service",       "from services.fraud_service"),
    ("from service.ocr_service",         "from services.ocr_service"),
    ("from service.pipeline",            "from services.pipeline"),
    ("from service.icd_data",            "from services.icd_data"),
    ("from api.dependencies import",     "from middleware.dependencies import"),
    ("from api.controller.auth_controller import", "from controllers.auth_controller import"),
    ("from api.websocket_manager import", "from utils.websocket_manager import"),
    ("from api.routes import",           "from routes import"),
    # main.py uses: from db.seed import  → already covered above, but also:
    ("from db.seed import",              "from config.seed import"),
]

# Folders whose Python files we want to update
TARGET_DIRS = [
    BACKEND / "routes",
    BACKEND / "controllers",
    BACKEND / "services",
    BACKEND / "dao",
    BACKEND / "middleware",
    BACKEND / "utils",
    BACKEND / "config",
]
TARGET_FILES = [BACKEND / "main.py"]

def fix_imports_in_file(path: Path):
    original = path.read_text(encoding="utf-8")
    updated = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"  Updated:    {path.relative_to(BACKEND)}")
    else:
        print(f"  No changes: {path.relative_to(BACKEND)}")

for target_dir in TARGET_DIRS:
    for py_file in sorted(target_dir.rglob("*.py")):
        fix_imports_in_file(py_file)

for py_file in TARGET_FILES:
    fix_imports_in_file(py_file)


# ── Step 4: Delete obsolete folders ──────────────────────────────────
print("\n=== Step 4: Deleting obsolete folders ===")

OBSOLETE = ["api", "db", "model", "dto", "service", "views"]

for folder_name in OBSOLETE:
    folder = BACKEND / folder_name
    if folder.exists():
        shutil.rmtree(folder)
        print(f"  Deleted: {folder_name}/")
    else:
        print(f"  Already gone: {folder_name}/")


print("\n✅ Migration complete.")
print("\nFinal structure:")
for item in sorted(BACKEND.iterdir()):
    if item.is_dir() and item.name not in ("__pycache__", ".pytest_cache", "uploads", "logger"):
        print(f"  {item.name}/")
    elif item.suffix == ".py":
        print(f"  {item.name}")
