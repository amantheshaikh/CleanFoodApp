# Clean Food Backend

This backend exposes the FastAPI wrapper around the existing ingredient analysis logic. Use the steps below to run it locally, containerise it, and hook the frontend during development or deployment.

## 1. Run Locally (Python / uvicorn)

1. Ensure Python 3.11+ is installed.
2. From the repository root:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r backend/requirements.txt
   ```
3. Start the API:
   ```bash
   uvicorn backend.app:app --host 0.0.0.0 --port 8080 --reload
   ```
4. Verify it is live:
   ```bash
   curl http://localhost:8080/healthz
   curl -X POST http://localhost:8080/check \
     -H 'Content-Type: application/json' \
     -d '{"ingredients":"water, sugar"}'
   ```

## 2. Run with Docker

1. Build the image from the repo root:
   ```bash
   docker build -f backend/Dockerfile -t clean-food-backend .
   ```
2. Start the container (load env vars from the repo-level `.env` if present):
   ```bash
   docker run -it --rm -p 8080:8080 --env-file .env clean-food-backend
   ```
3. Exercise the API using the same `curl` checks above.

## 3. Wire Up the Frontend

1. In `Clean_Food_App_Revamped/.env`, add:
   ```env
   VITE_API_BASE=http://localhost:8080
   ```
2. Restart the frontend dev server:
   ```bash
   cd Clean_Food_App_Revamped
   npm install   # if not already installed
   npm run dev
   ```
3. Open http://localhost:5173 and confirm ingredient analysis flows through the new backend.

## 4. Deploy the Container (Render example)

1. Push the repository to GitHub (or your preferred hosting).
2. In Render: **New Web Service** → select the repo → set the root directory to `/backend`.
3. Build command: `docker build -t clean-food-backend .`
4. Start command: `uvicorn backend.app:app --host 0.0.0.0 --port 8080`
5. Set environment variables (e.g. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, any OFF paths).
6. Deploy and note the resulting URL (e.g. `https://clean-food-backend.onrender.com`).

For other platforms (Railway, Fly.io, ECS), use the same container image, expose port 8080, and configure the same environment.

## 5. Finalise Production Frontend

1. Update `VITE_API_BASE` locally and in Vercel project settings to the deployed backend URL.
2. Trigger a new Vercel deploy (`git push` or manual redeploy).
3. Run a live ingredient analysis and watch the network tab/logs to verify requests reach the container backend.

## 6. Cleanup

- Stop the uvicorn/Docker processes when finished.
- Deactivate the Python virtual environment with `deactivate`.
- Remove the Docker image if no longer needed: `docker rmi clean-food-backend`.
