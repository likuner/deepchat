'use client';

import { PauseCircleOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import { useState } from 'react';

interface ChatInputProps {
  sending: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}

export function ChatInput({ sending, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !sending;

  const submit = () => {
    const content = value.trim();
    if (!content || sending) return;
    setValue('');
    onSend(content);
  };

  return (
    <div className="border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-[800px] items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
        <Input.TextArea
          value={value}
          autoSize={{ minRows: 1, maxRows: 6 }}
          placeholder="给 DeepChat 发送消息"
          variant="borderless"
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {sending ? (
          <Button danger shape="circle" icon={<PauseCircleOutlined />} onClick={onStop} />
        ) : (
          <Button type="primary" shape="circle" icon={<SendOutlined />} disabled={!canSend} onClick={submit} />
        )}
      </div>
    </div>
  );
}
