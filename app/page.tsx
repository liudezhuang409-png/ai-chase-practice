import Link from "next/link";
import { getAuthedUser } from "@/lib/auth";
import { getExamDashboard } from "@/lib/exam-os";
import { AuthCard } from "@/components/auth-card";
import { ExamDashboard } from "@/components/exam-dashboard";

export default async function HomePage() {
  const user = await getAuthedUser();
  if (user) return <ExamDashboard data={await getExamDashboard(user.id)} email={user.source === "demo" ? "小明同学 · 体验账号" : user.email ?? "已登录"} />;

  return <main className="min-h-screen bg-[#f4f7fb] px-4 py-10 sm:py-20">
    <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/70 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative overflow-hidden bg-slate-950 p-8 text-white sm:p-14">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-600/30 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">Exam OS · 中级会计</p>
        <h1 className="relative mt-5 max-w-xl text-4xl font-bold leading-tight sm:text-6xl">今天学什么，系统直接告诉你。</h1>
        <p className="relative mt-6 max-w-xl text-base leading-8 text-slate-300">不是再多刷一套题，而是找到最危险章节，用错题驱动掌握度，再用模考验证提分结果。</p>
        <div className="relative mt-10 grid gap-3 sm:grid-cols-3">{["章节掌握度", "今日学习路径", "错题 AI 纠偏"].map((item, index) => <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4"><span className="text-xs text-blue-300">0{index + 1}</span><strong className="mt-2 block text-sm">{item}</strong></div>)}</div>
        <Link href="#login" className="relative mt-10 inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold shadow-lg shadow-blue-950">开始体验提分系统</Link>
      </section>
      <section id="login" className="p-6 sm:p-10"><AuthCard /></section>
    </div>
  </main>;
}
