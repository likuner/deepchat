'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import type { ChatMessage } from '@/lib/types';

export function MessageBubble({ message, streaming = false }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={clsx('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[86%] rounded-lg px-4 py-3 text-sm leading-7 shadow-sm md:max-w-[76%]',
          isUser
            ? 'bg-blue-600 text-white'
            : 'border border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none break-words prose-pre:rounded-md prose-pre:bg-slate-950 prose-pre:text-zinc-100 dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (streaming ? '正在思考...' : '')}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
