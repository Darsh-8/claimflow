# 🏥 ClaimFlow — AI-Powered Medical Claim Processing Engine

[![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

ClaimFlow is an intelligent document processing system that automates the lifecycle of hospital insurance claims — from document upload and OCR extraction to medical validation and fraud risk scoring.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Document Upload** | Drag-and-drop multi-file upload (discharge summaries, bills, lab reports, prescriptions) |
| **AI-Powered OCR** | Extracts text from images and PDFs using the Kimi K2.5 model on AWS Bedrock |
| **Structured Extraction** | Parses patient, policy, clinical, and financial data into structured fields |
| **Medical Validation** | Automated rule engine checks ICD code validity, billing consistency, and completeness |
| **Fraud Detection** | 7-rule fraud engine covering billing, clinical, temporal, pattern, policy, and network analysis |
| **Role-Based Access** | Hospital users upload and correct; Insurer users review and approve/reject |
| **Audit Trail** | Immutable log of every action taken on each claim |
| **Field Correction** | Hospital staff can manually correct extracted data and re-validate |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              Frontend (React)            │
│  Login → Dashboard → Upload → Detail     │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│           Backend (FastAPI)              │
│                                          │
│  Auth Controller ──── JWT Cookie Auth    │
│  Claims Controller ── CRUD + Pipeline    │
│                                          │
│  ┌─────────── Pipeline ───────────────┐  │
│  │ OCR → Extraction → Validation →    │  │
│  │ Fraud Scoring                      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  SQLite Database (SQLAlchemy ORM)        │
└──────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
Claimflow/
├── backend/                    # Python FastAPI server
│   ├── main.py                 # App entry point, lifespan events
│   ├── config.py               # Environment configuration (pydantic-settings)
│   ├── database.py             # SQLAlchemy engine & session factory
│   ├── models.py               # 10 ORM models (User, Claim, Document, etc.)
│   ├── security.py             # JWT auth, password hashing, role guards
│   ├── controllers/
│   │   ├── auth.py             # /auth — login, refresh, logout
│   │   └── claims.py           # /claims — upload, list, detail, review
│   ├── services/
│   │   ├── ocr_service.py      # AWS Bedrock OCR integration
│   │   ├── extraction_service.py  # LLM-based structured field extraction
│   │   ├── validation_service.py  # Medical rule validation engine
│   │   ├── fraud_service.py    # Fraud risk scoring orchestrator
│   │   ├── pipeline.py         # Full claim processing pipeline
│   │   └── fraud_rules/        # 7 pluggable fraud rule modules
│   ├── repositories/           # Data access layer
│   ├── views/                  # Pydantic request/response schemas
│   ├── tests/                  # Unit tests
│   └── .env.example            # Environment variable template
├── frontend/                   # React + TypeScript (Vite)
│   ├── src/
│   │   ├── pages/              # LoginPage, DashboardPage, UploadPage, ClaimDetailPage
│   │   ├── components/         # FieldEditor, FileDropzone, ValidationCard, etc.
│   │   ├── context/            # AuthContext (React Context for auth state)
│   │   ├── api/                # Axios HTTP client
│   │   └── services/           # AI service integration
│   └── package.json
├── .github/
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .gitignore
└── README.md                   ← You are here
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+** — [Download](https://python.org/downloads)
- **Node.js 18+** — [Download](https://nodejs.org)
- **Git** — [Download](https://git-scm.com)

### 1. Clone the repository

```bash
git clone git@github.com:Darsh-8/claimflow.git
cd claimflow
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your actual API keys (see Configuration section below)

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at **http://localhost:8000** with interactive docs at **http://localhost:8000/docs**.

### 3. Frontend Setup

```bash
# From the project root, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend will be available at **http://localhost:5173**.

### 4. Default Test Users

The app auto-seeds two users on first run:

| Username | Password | Role |
|---|---|---|
| `hospital` | `password123` | Hospital (upload & correct claims) |
| `insurer` | `password123` | Insurer (review & approve/reject) |

---

## ⚙️ Configuration

Create a `backend/.env` file from the template:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy database URL | ✅ (defaults to SQLite) |
| `UPLOAD_DIR` | Directory for uploaded files | ✅ (defaults to `./uploads`) |
| `KIMI_API_KEY` | API key for Kimi K2.5 model | ✅ |
| `KIMI_API_URL` | Bedrock endpoint URL | ✅ |
| `KIMI_MODEL_NAME` | Model identifier | ✅ |
| `AWS_ACCESS_KEY_ID` | AWS access key | ✅ |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | ✅ |
| `AWS_REGION` | AWS region (e.g., `us-west-2`) | ✅ |

> ⚠️ **Never commit the `.env` file.** It is excluded in `.gitignore`.

---

## 🔌 API Endpoints

### Authentication (`/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Login and receive JWT cookies |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Clear auth cookies |

### Claims (`/claims`)

| Method | Endpoint | Description | Role |
|---|---|---|---|
| `POST` | `/claims/upload` | Upload documents and create a claim | Hospital |
| `GET` | `/claims/` | List all claims (paginated) | Any |
| `GET` | `/claims/{id}/status` | Get claim processing status | Any |
| `GET` | `/claims/{id}/data` | Get full claim data (fields, validation, alerts) | Any |
| `POST` | `/claims/{id}/validate` | Re-run validation pipeline | Hospital, Insurer |
| `PUT` | `/claims/{id}/corrections` | Submit field corrections | Hospital |
| `POST` | `/claims/{id}/documents` | Upload additional documents | Hospital |
| `POST` | `/claims/{id}/review` | Submit approval/rejection decision | Insurer |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info |
| `GET` | `/health` | Health check |

---

## 🔀 Branching Strategy

We follow a **Git Flow** model:

| Branch | Purpose |
|---|---|
| `main` | Production-ready code (protected — PRs required with 1 approval) |
| `develop` | Integration branch for active development (protected — PRs required) |
| `feature/*` | New features — branch from `develop`, merge back to `develop` |
| `bugfix/*` | Bug fixes — branch from `develop`, merge back to `develop` |
| `hotfix/*` | Critical production fixes — branch from `main`, merge to `main` + `develop` |
| `release/*` | Release stabilization — branch from `develop`, merge to `main` + `develop` |

**Naming examples:** `feature/frontend-claim-upload`, `bugfix/ocr-timeout`, `hotfix/auth-token-fix`

See [CONTRIBUTING.md](CONTRIBUTING.md) for full workflow details.

---

## 🧪 Running Tests

```bash
# Backend unit tests
cd backend
pytest

# Frontend lint
cd frontend
npm run lint

# Frontend build check
npm run build
```

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Our branching strategy and commit conventions
- Code style and standards
- How to submit a pull request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
