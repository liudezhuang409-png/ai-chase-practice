import type { Metadata } from "next";
import Link from "next/link";
import { getAuthedUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI错题追杀器",
  description: "错了就继续追杀，直到会为止。"
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
        <header style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div
            className="shell"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 0"
            }}
          >
            <Link href="/" style={{ fontWeight: 800, letterSpacing: "0.08em" }}>
              AI错题追杀器
            </Link>
            <nav
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <Link href="/practice">做题</Link>
              <Link href="/pay">付费</Link>
              {user ? <LogoutButton email={user.email ?? "已登录"} /> : null}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
