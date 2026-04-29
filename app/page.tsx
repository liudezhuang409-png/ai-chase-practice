import Link from "next/link";
import { getAuthedUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth-card";

export default async function HomePage() {
  const user = await getAuthedUser();

  return (
    <main className="shell" style={{ padding: "48px 0 96px" }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24
        }}
      >
        <div
          className="panel"
          style={{
            padding: 36,
            minHeight: 560,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background:
              "linear-gradient(180deg, rgba(255,77,45,0.14), rgba(255,255,255,0.02))"
          }}
        >
          <div style={{ display: "grid", gap: 20 }}>
            <div className="eyebrow">accounting exam survival system</div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(48px, 9vw, 96px)",
                lineHeight: 0.94
              }}
            >
              AI
              <br />
              错题追杀器
            </h1>
            <p className="muted" style={{ maxWidth: 540, fontSize: 18, lineHeight: 1.7 }}>
              输入一个会计知识点，AI 立刻出一题。答对就过，答错就锁定同一薄弱点持续变式追杀，
              直到你不再犯同类错误。
            </p>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="danger-box">
              免费用户每天只有 2 次生成机会，追杀变式题同样计次。升级 Pro 后无限练。
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="button button--danger" href={user ? "/practice" : "#auth"}>
                立即开始
              </Link>
              <Link className="button" href="/pay">
                查看付费方案
              </Link>
            </div>
          </div>
        </div>

        <div id="auth">
          {user ? (
            <div className="panel" style={{ padding: 28, display: "grid", gap: 16 }}>
              <div className="eyebrow">ready to hunt</div>
              <h2 style={{ margin: 0, fontSize: 32 }}>你已经登录。</h2>
              <p className="muted">继续进入做题页，让系统盯着你的错点不放。</p>
              <Link className="button button--danger" href="/practice">
                进入做题页
              </Link>
            </div>
          ) : (
            <AuthCard />
          )}
        </div>
      </section>
    </main>
  );
}
