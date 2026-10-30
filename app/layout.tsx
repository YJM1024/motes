import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motes · 微粒 — AI 应用工作台",
  description: "用自然语言构建你的应用。在 Motes 中描述想法、即时预览、持续迭代。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
