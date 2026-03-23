import os
import re

replacements = {
    # Absolute paths mapping
    "from database import": "from db.database import",
    "import database": "import db.database as database",
    "from config import": "from config.config import",
    "import config": "import config.config as config",
    "from models import": "from model.models import",
    "import models": "import model.models as models",
    "from repositories.": "from dao.",
    "from views.": "from dto.",
    "from services.": "from service.",
    "from controllers.": "from api.routes.",
    "from security import": "from utils.security import",
    "import security": "import utils.security as security"
}

target_dir = r"d:\Code\Claimflow\backend"

for root, dirs, files in os.walk(target_dir):
    if ".pytest_cache" in root or "__pycache__" in root or "venv" in root or "logs" in root:
        continue
    for file in files:
        if file.endswith(".py") and file != "refactor_imports.py":
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                original = content

                for old, new in replacements.items():
                    content = content.replace(old, new)

                if content != original:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"Updated: {path}")
            except Exception as e:
                print(f"Error on {path}: {e}")

print("Import refactoring completed.")
