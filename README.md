# MetaRouter

Multi-tenant WhatsApp AI support and broadcast platform. Each organization connects its WhatsApp Business numbers. An AI assistant (Gemini, grounded in the organization's own PDFs) answers customers and hands chats to the team when needed. Admins send template broadcasts that stay within Meta's quality and messaging-tier limits.

## Naming

| Word | Meaning | Used for |
|---|---|---|
| **Organization** | The customer company, as data | Database and models (`organizations`, `organization_id`), API fields (`organization_name`), the super admin pages |
| **Workspace** | The part of the app a company's team logs into | Frontend folders and routes (`pages/workspace`, `store/workspace`, `WorkspaceLayout`), backend auth (`get_current_workspace_user`), and all text the team reads ("Workspace name", "workspace administrators") |
| **Tenant** | Not used for names | Only in "multi-tenant", describing the architecture |

## Stack

| Part | Tech |
|---|---|
| Backend | FastAPI, SQLAlchemy, Alembic, Pydantic settings |
| Database | PostgreSQL 15 + pgvector (knowledge base embeddings) |
| Background jobs | Celery worker + Celery Beat, Redis broker |
| AI | Google Gemini (chat, embeddings, document parsing) |
| Messaging | WhatsApp Cloud API (Meta Graph API) |
| Frontend | React, TypeScript, Vite, Redux Toolkit, Formik + Yup, Tailwind CSS v4 |

## Running with Docker

```bash
cp .env.example .env                       # Docker Compose: database credentials + API URL for the frontend build
cp backend/.env.example backend/.env       # then fill in the empty values (see below)
cp frontend/.env.example frontend/.env     # only for `npm run dev`
docker compose up -d --build
```

Change `POSTGRES_PASSWORD` in the root `.env` for any shared or production setup, and set `COOKIE_SECURE=true` in `backend/.env` once the site runs on HTTPS.

| Service | URL / port | What it does |
|---|---|---|
| `frontend` | http://localhost | Built React app served by nginx |
| `backend` | http://localhost:8000 (docs at `/docs`) | API; runs `alembic upgrade head` on start |
| `celery_worker` | — | Runs background tasks (sending, media, broadcasts, knowledge PDFs, email) |
| `celery_beat` | — | Schedules the maintenance jobs below |
| `db` | 5432 | PostgreSQL + pgvector |
| `redis` | 6379 | Celery broker, locks and retry markers |

Docker Compose overrides `DATABASE_URL`, `REDIS_URL` and `FRONTEND_BASE_URL` with the service host names, so `.env` can keep `localhost` values for running outside Docker.

`docker compose restart` does not reload `.env`. After changing it, run `docker compose up -d --force-recreate backend celery_worker celery_beat`.

### Frontend dev server (hot reload)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, talks to VITE_API_URL
```

## Configuration

All settings live in `backend/app/config.py`, and each one has a line in `backend/.env`. URLs and credentials are never hard-coded. Values you must provide:

| Key | Notes |
|---|---|
| `SECRET_KEY` | JWT signing key. The generate command is in `.env.example` |
| `TOKEN_ENCRYPTION_KEY` | Fernet key that encrypts stored WhatsApp access tokens. **Never change or lose it** once tokens are saved |
| `GOOGLE_API_KEY` | Gemini API key |
| `META_APP_SECRET` | Meta app → Settings → Basic. Verifies webhook signatures |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Any random string; paste the same value into the Meta webhook settings |
| `SMTP_USER`, `SMTP_PASSWORD`, `EMAILS_FROM_EMAIL` | For invitation emails (a Gmail app password works) |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Platform super admin created on first start |

The other keys (broadcast rates, media and knowledge limits, Beat intervals) have working defaults in `.env.example`.

### WhatsApp webhook

In the Meta app, set the callback URL to `https://<your-domain>/api/v1/webhooks/whatsapp` with the verify token above. Subscribe to these fields:

- `messages`: incoming messages and delivery statuses
- `phone_number_quality_update`: quality flags and tier changes; pauses broadcasts when a number is flagged

## Database migrations

```bash
docker compose exec backend python -m alembic revision --autogenerate -m "describe the change"
docker compose exec backend python -m alembic upgrade head
docker compose exec backend python -m alembic check      # model and database in sync?
```

## Background jobs

| Task | Triggered by |
|---|---|
| `process_chat_message_task` | Incoming text: saves it, handles STOP/START, generates the AI reply |
| `process_media_message_task` → `download_whatsapp_media_task` → `parse_document_task` | Incoming image or document: downloads it, reads bills and receipts with Gemini |
| `send_whatsapp_message_task` | Every outgoing message, via `queue_outgoing_message` |
| `process_whatsapp_status_task` / `process_quality_update_task` | Status and quality webhooks |
| `process_broadcast_task` | Releases broadcast messages in batches within quality and tier limits |
| `process_knowledge_document_task` | Knowledge base PDF upload: extracts, chunks and embeds it |
| `send_invitation_email_task` | Team invitations |

Celery Beat schedules:

| Job | Every | Purpose |
|---|---|---|
| `refresh_whatsapp_numbers_task` | 6 h | Refreshes quality and tier from Meta; detects disconnected numbers |
| `sweep_stuck_messages_task` | 5 min | Queues stuck messages, knowledge PDFs and customer media again |
| `resume_due_broadcasts_task` | 60 s | Continues tier-paused broadcasts, restarts stalled ones, marks finished ones completed |

## Project structure

```
backend/
  alembic/                migrations
  app/
    api/v1/               routes (super_admin/ for platform admin routes)
    core/                 security, dependencies, encryption, redis client
    models/               SQLAlchemy models (*_model.py)
    schemas/              Pydantic schemas
    services/             business logic (*_service.py)
    workers/              Celery app + tasks/
    config.py  database.py  main.py
frontend/src/
  api/                    axios client, error helper
  components/             ui/ (shared), routes/ (guards), one folder per feature
  pages/                  superAdmin/, workspace/, public pages
  store/                  one folder per Redux slice (slice + thunks)
  types/  utils/  validation/
```
