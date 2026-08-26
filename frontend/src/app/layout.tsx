import type { Metadata } from 'next';
import { App as AntdApp } from 'antd';
import 'antd/dist/reset.css';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'DeepChat',
  description: 'DeepSeek-style streaming AI chat app'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AntdApp>{children}</AntdApp>
        </ThemeProvider>
      </body>
    </html>
  );
}
