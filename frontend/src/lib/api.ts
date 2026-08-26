import type { SessionDetail, SessionSummary } from './types';

// 默认同源请求：nginx 将 /api/* 转发到后端，避免 CORS 与硬编码地址
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions');
}

export function createSession(title?: string): Promise<SessionSummary> {
  return request<SessionSummary>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title })
  });
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${sessionId}`);
}

export function renameSession(sessionId: string, title: string): Promise<SessionSummary> {
  return request<SessionSummary>(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
}

export function removeSession(sessionId: string): Promise<void> {
  return request<void>(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function streamChat(
  sessionId: string,
  message: string,
  signal: AbortSignal,
  onChunk: (chunk: string) => void
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal
  });

  if (!response.ok || !response.body) {
    throw new Error(await response.text() || 'Chat stream failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data !== '[DONE]') {
          onChunk(JSON.parse(data) as string);
        }
      }
    }
  }
}
