# Backend

FastAPI backend for the DeepSeek-style chat app.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

SQLite data is stored at `backend/chat.db` after the first startup.
