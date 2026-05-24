# Frontend Human Evaluation MVP

This is a lightweight Next.js app with:
- Public evaluator page (`/`) with `True`, `False`, and `Unsure/Ambiguous`
- Admin dashboard (`/admin`) for sample size and progress
- Image blur loading placeholder for smoother UX

## Data Preparation (Important)

Before running the app, generate the frontend data files:

```bash
cd frontend
python scripts/prepare_eval_data.py
```

This script explicitly scans the local `../4k-dollarstreet` folder and extracts **exact image filenames with extensions**. It then builds image URLs in the format:

`https://raw.githubusercontent.com/HayBeeCoder/4k-dollarstreet/refs/heads/main/{image_id_with_extension}`

Generated files:
- `data/image_filename_map.json`
- `data/items.json`
- `data/runtime.json`

## Run Locally

Node version: use Node 20 or 22 (`frontend/.nvmrc` is set to `22`).

Local development uses file-backed simulation by default, even if Supabase variables are present in `.env`. If you want to force remote persistence locally, set `EVAL_BACKEND=supabase`.

```bash
cd frontend
nvm use || nvm install
npm install
npm run dev
```

Open:
- `http://localhost:3000/`
- `http://localhost:3000/admin`

## Go Live (Recommended)

For production, use:
- Hosting: Vercel (or any Next.js host)
- Persistent storage: Supabase Postgres (runtime data only)
- Static catalog: keep using `data/items.json`

### 1) Create Supabase tables

In Supabase SQL editor, run:

`frontend/scripts/supabase_schema.sql`

### 2) Set production environment variables

Copy `frontend/.env.example` values into your host (for example Vercel Project Settings -> Environment Variables):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_RUNTIME_TABLE` (optional, default `eval_runtime`)
- `SUPABASE_RESPONSES_TABLE` (optional, default `eval_responses`)
- `SUPABASE_SKIPPED_TABLE` (optional, default `eval_skipped`)
- `ADMIN_TOKEN` (optional)

### 3) Deploy

```bash
cd frontend
npm run build
```

Then deploy your `frontend` directory to your hosting provider.

### 4) Verify after deploy

- Open `/` and submit at least one response.
- Use Skip once and verify it moves to next task.
- Open `/admin` and confirm:
  - `Responses submitted` increases
  - `Tasks skipped` increases
