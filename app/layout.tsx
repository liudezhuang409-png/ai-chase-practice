import type { Metadata } from "next";
import { getAuthedUser } from "@/lib/auth";
import { ExamNavigation } from "@/components/exam-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exam OS｜中级会计章节掌握提分系统",
  description: "用章节掌握度模型替代盲目刷题，用学习路径算法决定今天学什么。"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getAuthedUser();
  return (
    <html lang="zh-CN">
      <body>
        {user ? <ExamNavigation user={user}>{children}</ExamNavigation> : children}
      </body>
    </html>
  );
}
