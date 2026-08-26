from __future__ import annotations

from datetime import datetime, timezone
from sqlite3 import Row
from uuid import uuid4

from fastapi import HTTPException, status

from app.database import get_connection
from app.schemas import Message, SessionDetail, SessionSummary


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_session(row: Row) -> SessionSummary:
    return SessionSummary(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def row_to_message(row: Row) -> Message:
    return Message(
        id=row["id"],
        role=row["role"],
        content=row["content"],
        created_at=row["created_at"],
    )


def list_sessions() -> list[SessionSummary]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        ).fetchall()
    return [row_to_session(row) for row in rows]


def create_session(title: str | None = None) -> SessionSummary:
    now = utc_now()
    session_id = str(uuid4())
    clean_title = (title or "新会话").strip() or "新会话"

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (session_id, clean_title[:80], now, now),
        )
        conn.commit()

    return SessionSummary(id=session_id, title=clean_title[:80], created_at=now, updated_at=now)


def get_session(session_id: str) -> SessionDetail:
    with get_connection() as conn:
        session_row = conn.execute(
            "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if session_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        message_rows = conn.execute(
            """
            SELECT id, session_id, role, content, created_at
            FROM messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()

    session = row_to_session(session_row)
    return SessionDetail(**session.model_dump(), messages=[row_to_message(row) for row in message_rows])


def update_session_title(session_id: str, title: str) -> SessionSummary:
    clean_title = title.strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title cannot be empty")

    now = utc_now()
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
            (clean_title[:80], now, session_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        conn.commit()

    return get_session(session_id)


def delete_session(session_id: str) -> None:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        conn.commit()


def add_message(session_id: str, role: str, content: str) -> Message:
    now = utc_now()
    message_id = str(uuid4())
    with get_connection() as conn:
        session = conn.execute("SELECT id, title FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (message_id, session_id, role, content, now),
        )

        if role == "user" and session["title"] == "新会话":
            title = content.strip().replace("\n", " ")[:28] or "新会话"
            conn.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, session_id),
            )
        else:
            conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))

        conn.commit()

    return Message(id=message_id, role=role, content=content, created_at=now)
