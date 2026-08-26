'use client';

import { DeleteOutlined, EditOutlined, MenuOutlined, MoonOutlined, PlusOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Modal, Tooltip } from 'antd';
import clsx from 'clsx';
import type { SessionSummary } from '@/lib/types';
import { useThemeMode } from './ThemeProvider';

interface SidebarProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  open: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  open,
  onClose,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onRenameSession
}: SidebarProps) {
  const { mode, toggleTheme } = useThemeMode();
  const [modal, contextHolder] = Modal.useModal();

  const requestRename = (session: SessionSummary) => {
    let nextTitle = session.title;
    modal.confirm({
      title: '重命名会话',
      content: <Input defaultValue={session.title} maxLength={80} onChange={(event) => (nextTitle = event.target.value)} />,
      okText: '保存',
      cancelText: '取消',
      onOk: () => onRenameSession(session.id, nextTitle)
    });
  };

  const requestDelete = (session: SessionSummary) => {
    modal.confirm({
      title: '删除会话',
      content: `确定删除“${session.title}”吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => onDeleteSession(session.id)
    });
  };

  const content = (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-50 flex h-full w-[260px] shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-3 transition-transform dark:border-zinc-800 dark:bg-zinc-950 lg:static lg:z-auto lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {contextHolder}
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-950 dark:text-zinc-50">DeepChat</div>
          <div className="text-xs text-slate-500 dark:text-zinc-500">AI assistant</div>
        </div>
        <Tooltip title={mode === 'dark' ? '切换浅色' : '切换深色'}>
          <Button shape="circle" icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
        </Tooltip>
      </div>

      <Button type="primary" icon={<PlusOutlined />} block onClick={onNewSession}>
        新建会话
      </Button>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {sessions.length === 0 ? (
          <div className="mt-12">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={clsx(
                  'group flex h-10 items-center gap-1 rounded-md px-2 text-sm transition',
                  activeSessionId === session.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200'
                    : 'text-slate-700 hover:bg-slate-200/70 dark:text-zinc-300 dark:hover:bg-zinc-900'
                )}
              >
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  type="button"
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                >
                  {session.title}
                </button>
                <Tooltip title="重命名">
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => requestRename(session)} />
                </Tooltip>
                <Tooltip title="删除">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => requestDelete(session)} />
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      {content}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return <Button className="lg:hidden" shape="circle" icon={<MenuOutlined />} onClick={onClick} />;
}
