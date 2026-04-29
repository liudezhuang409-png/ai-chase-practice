import Link from "next/link";
import { getAuthedUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/quota";
import { PayPanel } from "@/components/pay-panel";

const FEATURES = [
  "免费版每天 2 次出题机会，适合轻量试用",
  "Pro 版无限追杀，不再限制当天生成次数",
  "答错后会围绕同一个知识点持续生成变式题",
  "已预留支付宝与微信支付双通道状态机"
];

export default async function PayPage() {
  const user = await getAuthedUser();
  const plan = user ? await getUserPlan(user.id) : "free";

  return (
    <main className="shell" style={{ padding: "48px 0 96px", display: "grid", gap: 24 }}>
      <section className="panel" style={{ padding: 36, display: "grid", gap: 12 }}>
        <div className="eyebrow">plan benefits</div>
        {FEATURES.map((feature) => (
          <div key={feature} className="danger-box">
            {feature}
          </div>
        ))}
      </section>

      {!user ? (
        <section className="panel" style={{ padding: 36, display: "grid", gap: 16 }}>
          <div className="eyebrow">login required</div>
          <h1 style={{ margin: 0, fontSize: 40 }}>先登录，再解锁无限追杀。</h1>
          <p className="muted">支付与套餐升级会绑定到你的账号，请先回首页登录或注册。</p>
          <Link className="button button--danger" href="/">
            回首页登录
          </Link>
        </section>
      ) : plan === "pro" ? (
        <section className="panel" style={{ padding: 36, display: "grid", gap: 16 }}>
          <div className="eyebrow">already pro</div>
          <h1 style={{ margin: 0, fontSize: 40 }}>你已经是 Pro 用户。</h1>
          <p className="muted">现在可以无限追杀，不再受每日 2 题限制。</p>
          <Link className="button button--danger" href="/practice">
            回到做题页
          </Link>
        </section>
      ) : (
        <PayPanel />
      )}
    </main>
  );
}
