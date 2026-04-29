import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPracticeQuotaSnapshot } from "@/lib/quota";
import { PracticeShell } from "@/components/practice-shell";

export default async function PracticePage() {
  const user = await requireUser();
  const quota = await getPracticeQuotaSnapshot(user.id);

  return (
    <main>
      {quota.plan === "free" && quota.remainingFreeQuota === 0 ? (
        <div className="shell" style={{ padding: "56px 0 96px" }}>
          <div className="panel" style={{ padding: 32, display: "grid", gap: 16 }}>
            <div className="eyebrow">quota exhausted</div>
            <h1 style={{ margin: 0, fontSize: 42 }}>今天的免费出题次数已经打满。</h1>
            <p className="muted">
              免费用户每天只有 2 次生成机会。如果你还想继续被同一个知识点追杀，现在就升级 Pro。
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <Link className="button button--danger" href="/pay">
                去升级
              </Link>
              <Link className="button" href="/">
                先回首页
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <PracticeShell initialPlan={quota.plan} initialRemaining={quota.remainingFreeQuota} />
      )}
    </main>
  );
}
