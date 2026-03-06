# Contributing to ClaimFlow

Thank you for contributing to ClaimFlow! This guide covers everything you need to know to write code, submit changes, and maintain quality across the project.

---

## 📋 Table of Contents

- [Development Setup](#-development-setup)
- [Branching Workflow](#-branching-workflow)
- [Making Changes](#-making-changes)
- [Code Style & Standards](#-code-style--standards)
- [Commit Conventions](#-commit-conventions)
- [Pull Request Process](#-pull-request-process)
- [Project Architecture](#-project-architecture)
- [Common Tasks](#-common-tasks)

---

## 🛠️ Development Setup

### 1. Fork & Clone

```bash
# Fork the repo on GitHub, then clone your fork
git clone git@github.com:YOUR-USERNAME/claimflow.git
cd claimflow

# Add the upstream remote
git remote add upstream git@github.com:Darsh-8/claimflow.git
```

### 2. Backend Environment

```bash
cd backend

# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up your environment
cp .env.example .env
# Fill in .env with your API keys
```

### 3. Frontend Environment

```bash
cd frontend
npm install
```

### 4. Run the App Locally

Open **two terminals**:

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

- Backend API: http://localhost:8000
- Frontend UI: http://localhost:5173
- API Docs: http://localhost:8000/docs

---

## 🔀 Branching Workflow

We follow Git Flow. **Never push directly to `main` or `develop`** — both branches are protected and require pull requests.

### Branch Types

| Branch | Source | Target | Naming | Example |
|---|---|---|---|---|
| `feature/*` | `develop` | `develop` | `feature/<area>-<desc>` | `feature/frontend-claim-upload` |
| `bugfix/*` | `develop` | `develop` | `bugfix/<desc>` | `bugfix/ocr-timeout-handling` |
| `hotfix/*` | `main` | `main` + `develop` | `hotfix/<desc>` | `hotfix/auth-token-expiry` |
| `release/*` | `develop` | `main` + `develop` | `release/v<X.Y.Z>` | `release/v1.1.0` |

### Step-by-Step: Feature Branch

```bash
# 1. Make sure develop is up to date
git checkout develop
git pull origin develop

# 2. Create your feature branch
git checkout -b feature/backend-icd-validation

# 3. Do your work, commit frequently (see Commit Conventions below)
git add .
git commit -m "feat(validation): add ICD-11 code lookup service"

# 4. Push your branch
git push origin feature/backend-icd-validation

# 5. Open a Pull Request on GitHub: feature/backend-icd-validation → develop
```

### Step-by-Step: Hotfix (Critical Production Bug)

```bash
# 1. Branch from main
git checkout main
git pull origin main
git checkout -b hotfix/auth-cookie-fix

# 2. Fix the bug, commit
git add .
git commit -m "fix(auth): resolve cookie expiry on token refresh"

# 3. Push and open PR: hotfix/auth-cookie-fix → main
# 4. After merging to main, also merge to develop
git checkout develop
git merge main
git push origin develop
```

---

## ✏️ Making Changes

### Backend (Python / FastAPI)

All backend source lives in the `backend/` directory:

```
backend/
├── controllers/     # Route handlers (thin — delegate to services)
├── services/        # Business logic (OCR, extraction, validation, fraud)
├── repositories/    # Database queries (data access layer)
├── models.py        # SQLAlchemy ORM models
├── views/           # Pydantic schemas for request/response
├── config.py        # App configuration
├── security.py      # Auth utilities (JWT, password hashing)
└── tests/           # Unit tests
```

**Key patterns to follow:**

1. **Controllers are thin** — Routes should only handle HTTP concerns (parsing input, returning responses). Put logic in `services/`.
2. **Services own the logic** — All business rules, external API calls, and data transformations live here.
3. **Repositories abstract the DB** — Use the repository pattern for database queries rather than putting raw SQLAlchemy in controllers.
4. **Models are pure data** — SQLAlchemy models should only define schema, not business methods.
5. **Schemas validate I/O** — Use Pydantic models in `views/schemas.py` for all request/response validation.

**Adding a new endpoint:**

```python
# 1. Define the Pydantic schema in views/schemas.py
class MyRequest(BaseModel):
    field: str

# 2. Add logic in services/
async def my_service_function(data: str, db: Session):
    # business logic here
    pass

# 3. Add the route in controllers/
@router.post("/my-endpoint")
async def my_endpoint(
    req: MyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await my_service_function(req.field, db)
    return result
```

### Frontend (React / TypeScript)

All frontend source lives in `frontend/src/`:

```
frontend/src/
├── pages/           # Page-level components (one per route)
├── components/      # Reusable UI components
├── context/         # React Context providers (e.g., AuthContext)
├── api/             # Axios HTTP client setup
└── services/        # Service integrations
```

**Key patterns to follow:**

1. **Pages are route-level** — Each page in `pages/` maps to one route. Keep them as orchestrators.
2. **Components are reusable** — Extract shared UI into `components/`. Keep them focused and props-driven.
3. **API calls go through `api/client.ts`** — All HTTP requests should use the centralized Axios instance (handles auth cookies automatically).
4. **Type everything** — Define TypeScript interfaces for all API responses and component props.
5. **Use React Context for global state** — Auth state is managed via `AuthContext`; follow this pattern for new global state.

**Adding a new page:**

```tsx
// 1. Create the page component in pages/
// frontend/src/pages/MyNewPage.tsx
export default function MyNewPage() {
  return <div>My New Page</div>;
}

// 2. Add the route in main.tsx
<Route path="/my-page" element={<MyNewPage />} />
```

### Adding a New Fraud Rule

The fraud engine is modular. Each rule module lives in `backend/services/fraud_rules/`:

```python
# backend/services/fraud_rules/my_new_rules.py

def check_my_new_rule(db, claim_id):
    """
    Returns a list of FraudAlert dicts if the rule triggers.
    Each dict should have:
      - rule_triggered: str
      - risk_score: int (1-100)
      - details: dict
    """
    alerts = []
    # ... your detection logic ...
    return alerts
```

Then register it in `fraud_rules/__init__.py` and call it from `fraud_service.py`.

---

## 🎨 Code Style & Standards

### Python

- **Formatter:** Use [Black](https://black.readthedocs.io) with default settings (line length 88)
- **Linter:** Use [Ruff](https://docs.astral.sh/ruff/) or Flake8
- **Type hints:** Required on all function signatures
- **Docstrings:** Required on all public functions and classes

```python
# ✅ Good
async def extract_fields(raw_text: str) -> dict:
    """Extract structured fields from raw OCR text using the LLM."""
    ...

# ❌ Bad
async def extract_fields(raw_text):
    ...
```

### TypeScript / React

- **Linter:** ESLint (already configured in `frontend/eslint.config.js`)
- **Types:** No `any` types — define proper interfaces
- **Components:** Use functional components with hooks
- **Naming:** PascalCase for components, camelCase for functions and variables

```tsx
// ✅ Good
interface ClaimCardProps {
  claimId: number;
  status: string;
}

export function ClaimCard({ claimId, status }: ClaimCardProps) {
  return <div>{status}</div>;
}

// ❌ Bad
export function claimCard(props: any) {
  return <div>{props.status}</div>;
}
```

### General

- **No hardcoded secrets** — Use environment variables via `config.py` / `.env`
- **No console.log in production code** — Use the `logger` in Python, remove in React
- **Keep functions small** — Aim for < 50 lines per function
- **Write tests** for new features — Place backend tests in `backend/tests/`

---

## 📝 Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear, parseable commit history:

```
<type>(<scope>): <short description>

[optional body]
```

### Types

| Type | When to Use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't add features or fix bugs |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc. (no logic change) |
| `test` | Adding or updating tests |
| `chore` | Build config, CI/CD, dependency updates |
| `perf` | Performance improvements |

### Scopes

Use the area of the codebase you're changing:

| Scope | Area |
|---|---|
| `auth` | Authentication system |
| `claims` | Claims controller / logic |
| `ocr` | OCR service |
| `extraction` | Field extraction service |
| `validation` | Medical validation engine |
| `fraud` | Fraud detection engine |
| `frontend` | Any frontend change |
| `db` | Database models or migrations |
| `infra` | CI/CD, Docker, config |

### Examples

```bash
feat(fraud): add temporal gap analysis rule
fix(ocr): handle PDF images with CMYK color space
refactor(claims): move validation logic to service layer
docs(readme): add API endpoint reference table
chore(infra): add GitHub Actions CI workflow
test(extraction): add unit tests for ICD code parsing
```

---

## 🔄 Pull Request Process

### 1. Before Opening a PR

- [ ] Your branch is up to date with `develop` (or `main` for hotfixes)
- [ ] All existing tests pass (`pytest` for backend, `npm run lint` for frontend)
- [ ] New features include relevant tests
- [ ] No secrets or credentials in the code
- [ ] Code follows the style guidelines above

### 2. Opening the PR

- Target branch: `develop` (or `main` for hotfixes)
- Fill in the [PR template](/.github/pull_request_template.md) completely
- Add appropriate labels (`feature`, `bugfix`, `hotfix`, `docs`, etc.)
- Request review from relevant CODEOWNERS

### 3. Review Process

- At least **1 approval** is required before merging
- Address all review comments before re-requesting review
- Keep PRs focused — one feature/fix per PR
- If the PR grows too large, consider splitting it

### 4. After Merging

- Delete your feature branch (GitHub does this automatically if configured)
- Verify the merge didn't break anything on `develop`

---

## 🗺️ Project Architecture

### Processing Pipeline

```
Upload → OCR → Extraction → Validation → Fraud Scoring
```

1. **Upload**: Hospital user uploads documents (images/PDFs) via `/claims/upload`
2. **OCR**: Each document is sent to Kimi K2.5 (AWS Bedrock) for text extraction
3. **Extraction**: Raw OCR text is parsed into structured fields (patient info, policy, clinical data, financials)
4. **Validation**: Medical rule engine checks completeness, ICD code validity, billing consistency
5. **Fraud Scoring**: 7-category rule engine scores fraud risk (billing, clinical, temporal, pattern, policy, network)

### Database Models

| Model | Purpose |
|---|---|
| `User` | System users with roles (Hospital / Insurer) |
| `Claim` | Top-level claim record with status tracking |
| `Document` | Uploaded files linked to a claim |
| `ExtractedField` | Individual structured data points from OCR |
| `ValidationResult` | Output of the validation engine |
| `FraudAlert` | Triggered fraud rules for review |
| `AuditLog` | Immutable action history |
| `PatientProfile` | Cross-claim patient tracking |
| `HospitalProfile` | Cross-claim hospital tracking |
| `DoctorProfile` | Cross-claim doctor tracking |

---

## 🔧 Common Tasks

### Reset the local database

```bash
cd backend
rm claimflow.db
# Restart the server — tables and test users will be recreated automatically
uvicorn main:app --reload --port 8000
```

### Add a new Python dependency

```bash
cd backend
pip install <package-name>
pip freeze | Select-String <package-name> >> requirements.txt
# Or manually add the pinned version to requirements.txt
```

### Add a new frontend dependency

```bash
cd frontend
npm install <package-name>
```

### Run the backend with debug logging

```bash
cd backend
uvicorn main:app --reload --port 8000 --log-level debug
```

---

## ❓ Questions?

If you have questions about the codebase or need help getting started, open an issue on GitHub or reach out to the maintainers listed in [CODEOWNERS](/.github/CODEOWNERS).
