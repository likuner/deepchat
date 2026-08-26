from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas import ChatStreamRequest
from app.services.chat_service import stream_chat_response

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/stream")
def stream_chat(payload: ChatStreamRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_chat_response(payload.session_id, payload.message),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
