'use client';

import { App, Spin } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSession, getSession, listSessions, removeSession, renameSession, streamChat } from '@/lib/api';
import type { ChatMessage, SessionSummary } from '@/lib/types';
import { ChatInput } from './ChatInput';
import { ChatWindow } from './ChatWindow';
import { MobileMenuButton, Sidebar } from './Sidebar';

function optimisticMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    created_at: new Date().toISOString()
  };
}

export function ChatLayout() {
  const { message } = App.useApp();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    const data = await listSessions();
    setSessions(data);
    return data;
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const detail = await getSession(sessionId);
    setActiveSessionId(detail.id);
    setMessages(detail.messages);
  }, []);

  const createAndOpenSession = useCallback(async () => {
    const session = await createSession();
    await refreshSessions();
    setActiveSessionId(session.id);
    setMessages([]);
  }, [refreshSessions]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const data = await refreshSessions();
        if (data.length > 0) {
          await loadSession(data[0].id);
        } else {
          await createAndOpenSession();
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '初始化失败');
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [createAndOpenSession, loadSession, message, refreshSessions]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await removeSession(sessionId);
      const nextSessions = await refreshSessions();
      if (activeSessionId === sessionId) {
        if (nextSessions.length > 0) {
          await loadSession(nextSessions[0].id);
        } else {
          await createAndOpenSession();
        }
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    try {
      await renameSession(sessionId, title);
      await refreshSessions();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重命名失败');
    }
  };

  const handleSend = async (content: string) => {
    let sessionId = activeSessionId;
    try {
      if (!sessionId) {
        const session = await createSession();
        sessionId = session.id;
        setActiveSessionId(session.id);
      }

      const assistant = optimisticMessage('assistant', '');
      setMessages((current) => [...current, optimisticMessage('user', content), assistant]);
      setStreamingMessageId(assistant.id);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      await streamChat(sessionId, content, controller.signal, (chunk) => {
        setMessages((current) =>
          current.map((item) => (item.id === assistant.id ? { ...item, content: item.content + chunk } : item))
        );
      });

      await refreshSessions();
      await loadSession(sessionId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        message.info('已停止生成');
      } else {
        message.error(error instanceof Error ? error.message : '发送失败');
      }
    } finally {
      setSending(false);
      setStreamingMessageId(null);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-950 dark:bg-zinc-950 dark:text-zinc-50">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewSession={createAndOpenSession}
        onSelectSession={loadSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-4 dark:border-zinc-800">
          <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          <div className="min-w-0 truncate text-sm font-medium text-slate-600 dark:text-zinc-300">
            {sessions.find((item) => item.id === activeSessionId)?.title || '新会话'}
          </div>
        </header>
        <section className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spin />
            </div>
          ) : (
            <ChatWindow messages={messages} streamingMessageId={streamingMessageId} />
          )}
        </section>
        <ChatInput sending={sending} onSend={handleSend} onStop={handleStop} />
      </main>
    </div>
  );
}
