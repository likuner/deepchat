from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.schemas import CreateSessionRequest, SessionDetail, SessionSummary, UpdateSessionRequest
from app.services import session_service

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionSummary])
def list_sessions() -> list[SessionSummary]:
    return session_service.list_sessions()


@router.post("", response_model=SessionSummary, status_code=status.HTTP_201_CREATED)
def create_session(payload: CreateSessionRequest | None = None) -> SessionSummary:
    return session_service.create_session(payload.title if payload else None)


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: str) -> SessionDetail:
    return session_service.get_session(session_id)


@router.patch("/{session_id}", response_model=SessionSummary)
def update_session(session_id: str, payload: UpdateSessionRequest) -> SessionSummary:
    return session_service.update_session_title(session_id, payload.title)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str) -> Response:
    session_service.delete_session(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
