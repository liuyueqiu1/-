import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "事实判断体验",
  description: "预试体验版。十二条短文本的本机判断练习，不是正式研究招募。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
