import type { Metadata } from 'next';
import LiteOfflineRetirement from './lite/LiteOfflineRetirement';
import './globals.css';
export const metadata: Metadata = { title: 'Motes · 微粒 — 轻量 AI 应用工作台', description: '用一句话创建小应用，预览、继续修改并公开运行。', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body><LiteOfflineRetirement/>{children}</body></html>; }
