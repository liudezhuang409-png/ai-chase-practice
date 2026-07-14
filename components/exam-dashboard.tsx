import Link from "next/link";
import type { Route } from "next";
import { SUBJECT_STYLES, SubjectBadge } from "@/components/exam-ui";
import type { ExamDashboardSnapshot } from "@/lib/exam-os-types";

function masteryTone(score: number) {
  if (score < 50) return "text-red-600 bg-red-50";
  if (score < 70) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

export function ExamDashboard({ data, email }: { data: ExamDashboardSnapshot; email: string }) {
  const maxMinutes = Math.max(...data.weeklyMinutes.map((item) => item.minutes), 1);
  return <div className="min-h-screen">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Exam OS · Decision Center</p><h1 className="mt-1 text-2xl font-bold text-slate-950">今天该学什么，已经替你排好了</h1></div>
      <div className="hidden text-right sm:block"><p className="text-sm font-semibold text-slate-800">{email}</p><p className="text-xs text-slate-400">章节掌握提分系统</p></div>
    </header>
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <section className="grid gap-4 md:grid-cols-3">
        {data.subjectMastery.map((item) => <article key={item.subject} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><SubjectBadge subject={item.subject} /><span className="text-xs text-slate-400">掌握度</span></div>
          <div className="mt-5 flex items-end gap-1"><strong className="text-4xl font-bold text-slate-950">{item.mastery}</strong><span className="pb-1 text-slate-500">%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${SUBJECT_STYLES[item.subject].bar}`} style={{ width: `${item.mastery}%` }} /></div>
          <div className="mt-4 flex justify-between text-xs text-slate-500"><span>累计 {item.questionCount} 题</span><span>错题 {item.wrongCount}</span></div>
        </article>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">最大薄弱章节 TOP3</h2><Link href={"/chapters" as Route} className="text-xs font-semibold text-blue-600">查看全部</Link></div>
          <div className="mt-5 space-y-4">{data.weakestChapters.map((chapter, index) => <div key={chapter.id} className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold">{index + 1}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{chapter.chapter_name}</p><p className="text-xs text-slate-400">错题 {chapter.wrong_count} · 复习 {chapter.review_count} 次</p></div>
            <span className={`rounded-lg px-2 py-1 text-sm font-bold ${masteryTone(chapter.mastery_score)}`}>{Math.round(chapter.mastery_score)}%</span>
          </div>)}</div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">今日学习路径</p><h2 className="mt-1 text-xl font-bold text-slate-950">今天只做 3 件事</h2>
          <div className="mt-5 space-y-3">{data.todayPath.map((task) => <div key={`${task.subject}-${task.chapter}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">{task.rank}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{task.chapter} · {task.action}</p><p className="text-xs text-slate-400">{task.questionCount} 题 · 优先级 {task.priority}</p></div>
            <SubjectBadge subject={task.subject} />
          </div>)}</div>
          <Link href={data.todayPath[0] ? `/practice?subject=${encodeURIComponent(data.todayPath[0].subject)}&chapter=${encodeURIComponent(data.todayPath[0].chapter)}&count=${data.todayPath[0].questionCount}` : "/practice"} className="mt-5 flex h-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">开始今日学习 →</Link>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-950">今日学习数据</h2>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center"><div><strong className="block text-xl text-slate-950">{data.todayMinutes}</strong><span className="text-[11px] text-slate-400">分钟</span></div><div><strong className="block text-xl text-slate-950">{data.todayQuestions}</strong><span className="text-[11px] text-slate-400">做题</span></div><div><strong className="block text-xl text-slate-950">{data.todayWrong}</strong><span className="text-[11px] text-slate-400">错题</span></div><div><strong className="block text-xl text-emerald-600">{data.todayAccuracy}%</strong><span className="text-[11px] text-slate-400">正确率</span></div></div>
          <div className="mt-7 flex h-36 items-end justify-between gap-2 border-b border-slate-100 px-1">{data.weeklyMinutes.map((item) => <div key={item.date} className="flex flex-1 flex-col items-center gap-2"><div className="w-full max-w-7 rounded-t-md bg-gradient-to-t from-blue-600 to-blue-300" style={{ height: `${Math.max(8, (item.minutes / maxMinutes) * 110)}px` }} /><span className="text-[10px] text-slate-400">{item.date.slice(5)}</span></div>)}</div>
        </article>
      </section>

      <section className="rounded-2xl bg-gradient-to-r from-slate-950 to-blue-950 px-6 py-6 text-white shadow-xl shadow-slate-200 sm:flex sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">系统判断</p><h2 className="mt-2 text-xl font-bold">不要平均用力，先解决最危险的章节。</h2><p className="mt-2 text-sm text-slate-300">每次做题、复盘和模考都会更新掌握度，明天的路径也会跟着改变。</p></div>
        <Link href={"/mistakes" as Route} className="mt-4 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 sm:mt-0">查看高优先错题</Link>
      </section>
    </div>
  </div>;
}
