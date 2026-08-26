# DeepChat

A DeepSeek-style AI chat application with a FastAPI backend and a Next.js frontend.

## Structure

```text
backend/
  app/
    main.py
    database.py
    models.py
    schemas.py
    routers/
    services/
frontend/
  src/
    app/
    components/
    lib/
```

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## DeepSeek API Integration

The backend currently uses a mock streaming response in `backend/app/services/chat_service.py`. Replace `build_mock_response` and `stream_chat_response` internals with a real DeepSeek streaming client while keeping the route contract unchanged.
