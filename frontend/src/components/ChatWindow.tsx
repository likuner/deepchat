'use client';

import { BulbOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

export function ChatWindow({ messages, streamingMessageId }: { messages: ChatMessage[]; streamingMessageId: string | null }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-xl text-white">
            <BulbOutlined />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950 dark:text-zinc-50">我是 DeepChat，很高兴见到你</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-zinc-400">可以问我技术方案、代码问题、产品想法或任何需要梳理的内容。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-[800px] flex-col gap-5">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} streaming={message.id === streamingMessageId} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
