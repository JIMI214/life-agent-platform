# Life Agent v1.1 Deployment Edition

멀티모달 AI Agent 기반 개인 생활 통합 관리 플랫폼 / 多模态 AI Agent 个人生活综合管理平台

## v1.1 핵심 변경 / 核心更新

- Cloud-ready FastAPI + Next.js architecture
- SQLite local development + PostgreSQL/Supabase deployment support
- Environment-driven CORS for public frontend URLs
- Role-based Admin Console (`/admin`)
- User enable/disable and user/admin role management
- Mobile responsive layout + fixed bottom navigation
- PWA manifest, icons and service-worker registration
- SEO metadata, `robots.txt`, `sitemap.xml`
- Vercel frontend configuration + Render backend blueprint
- Korean / Chinese UI switch retained
- Existing Personal Context, Planner, Reasoning, Vision demo, Voice, Human-in-the-loop, Undo and Evaluation retained

## 1. Local run

### Backend

```bat
conda activate lifeagent
cd backend
python -m uvicorn app.main:app --reload
```

Health check: `http://127.0.0.1:8000/health`

Expected version: `1.1.0`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## 2. Local Admin account

Copy `backend/.env.example` to `backend/.env` and set:

```env
ADMIN_USERNAME=your_admin_name
ADMIN_PASSWORD=use_a_strong_password_here
ADMIN_DISPLAY_NAME=Life Agent Admin
```

Restart FastAPI. The account is created/promoted automatically. Login on the normal login screen. Admin users will see an `ADMIN` button and can open `/admin`.

Never commit a real admin password or API key.

## 3. Database

Local default:

```env
DATABASE_URL=sqlite:///./life_agent_v11.db
```

For public deployment, use a PostgreSQL connection string from Supabase. A normal `postgresql://...` URL is automatically converted to SQLAlchemy psycopg v3 format.

v1.1 intentionally uses a new local SQLite filename because the User table gained `role`, `status`, and `last_login_at` columns. This avoids pretending that `create_all()` is a migration system. For an existing production database, use a real migration workflow before upgrading.

## 4. Free public deployment architecture

Recommended hobby/demo topology:

```text
Browser / Phone
      ↓
Vercel (Next.js)
      ↓ HTTPS
Render (FastAPI)
      ↓ TLS
Supabase PostgreSQL
```

### Backend environment variables on Render

```env
DATABASE_URL=<Supabase PostgreSQL connection string>
FRONTEND_ORIGINS=https://YOUR-PROJECT.vercel.app
ADMIN_USERNAME=<admin username>
ADMIN_PASSWORD=<strong password>
ADMIN_DISPLAY_NAME=Life Agent Admin
OPENAI_API_KEY=
```

Render start command is already defined in `render.yaml`:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Frontend environment variables on Vercel

```env
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com
NEXT_PUBLIC_SITE_URL=https://YOUR-PROJECT.vercel.app
```

Set the Vercel project Root Directory to `frontend`.

## 5. Mobile / PWA

The same public URL is used on desktop and phone. On narrow screens the UI becomes a single-column layout and shows a bottom navigation bar. Production builds register `/sw.js`, expose a web app manifest, and provide 192/512 icons. Compatible browsers can add Life Agent to the home screen.

## 6. Admin security model

Admin access is not based on knowing the `/admin` URL. Backend endpoints require an authenticated user with `role=admin`.

Admin endpoints:

- `GET /admin/stats`
- `GET /admin/users`
- `PATCH /admin/users/{id}`

A disabled user has active sessions revoked. An administrator cannot disable or demote their own current admin account through the API.

## 7. Important demo/free-tier notes

Public free tiers are suitable for a graduation-project demo, not a production SLA. Backend cold starts and provider inactivity pauses can occur. Do not store persistent production data in Render's local filesystem; use PostgreSQL for public deployment.
