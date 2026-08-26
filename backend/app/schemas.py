from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Message(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class SessionSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class SessionDetail(SessionSummary):
    messages: list[Message]


class CreateSessionRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)


class UpdateSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class ChatStreamRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=8000)
