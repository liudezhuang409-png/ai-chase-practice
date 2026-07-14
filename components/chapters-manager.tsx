"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, SubjectBadge } from "@/components/exam-ui";
import type { ExamChapter, ExamSubject } from "@/lib/exam-os-types";

const subjects: Array<ExamSubject | "全部科目"> = ["全部科目", "中级会计实务", "财务管理", "经济法"];
const trendLabel = { up: "↑ 上升", flat: "→ 稳定", down: "↓ 下降" } as const;

export function ChaptersManager({ initialChapters }: { initialChapters: ExamChapter[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState<(typeof subjects)[number]>("全部科目");
  const [sort, setSort] = useState<"weak" | "strong">("weak");
  const [editing, setEditing] = useState<ExamChapter | null>(null);
  const [message, setMessage] = useState("");
  const rows = initialChapters.filter((item) => subject === "全部科目" || item.subject === subject).sort((a, b) => sort === "weak" ? a.mastery_score - b.mastery_score : b.mastery_score - a.mastery_score);

  async function patchChapter(chapter: ExamChapter, input: Record<string, unknown>) {
    setMessage("");
    const response = await fetch("/api/exam-os/chapters", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chapter.id, ...input }) });
    if (!response.ok) { const data = await response.json(); setMessage(data.error ?? "更新失败"); return; }
    setEditing(null); startTransition(() => router.refresh());
  }

  async function deleteChapter(chapter: ExamChapter) {
    if (!window.confirm(`确认删除“${chapter.chapter_name}”吗？`)) return;
    await fetch(`/api/exam-os/chapters?id=${encodeURIComponent(chapter.id)}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return <div className="min-h-screen">
    <PageHeader eyebrow="Chapter Mastery" title="章节掌握系统" description="按掌握度发现真正危险的章节。做题、复盘会自动更新，你也可以人工校正。" />
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <select value={subject} onChange={(event) => setSubject(event.target.value as typeof subject)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">{subjects.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"><option value="weak">掌握度从低到高</option><option value="strong">掌握度从高到低</option></select>
        <span className="ml-auto text-sm text-slate-500">共 {rows.length} 个章节</span>
      </div>
      {message ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div> : null}
      {rows.length === 0 ? <EmptyState title="还没有章节" description="首次进入 Dashboard 后系统会自动初始化正式考试章节。" /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.7fr_0.7fr_0.55fr_0.55fr_0.55fr_0.6fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid"><span>章节</span><span>掌握度</span><span>错题</span><span>已掌握</span><span>复习</span><span>趋势</span><span>操作</span></div>
        <div className="divide-y divide-slate-100">{rows.map((chapter) => <article key={chapter.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.7fr_0.7fr_0.55fr_0.55fr_0.55fr_0.6fr_0.8fr] md:items-center">
          <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{chapter.chapter_name}</p><div className="mt-1"><SubjectBadge subject={chapter.subject} /></div></div>
          <div><span className={`rounded-lg px-2 py-1 text-sm font-bold ${chapter.mastery_score < 50 ? "bg-red-50 text-red-600" : chapter.mastery_score < 70 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{Math.round(chapter.mastery_score)}%</span></div>
          <span className="text-sm"><i className="mr-2 text-xs not-italic text-slate-400 md:hidden">错题</i>{chapter.wrong_count}</span><span className="text-sm"><i className="mr-2 text-xs not-italic text-slate-400 md:hidden">已掌握</i>{chapter.mastered_count}</span><span className="text-sm"><i className="mr-2 text-xs not-italic text-slate-400 md:hidden">复习</i>{chapter.review_count}</span>
          <span className={`text-sm font-medium ${chapter.trend === "up" ? "text-emerald-600" : chapter.trend === "down" ? "text-red-500" : "text-slate-500"}`}>{trendLabel[chapter.trend]}</span>
          <div className="flex gap-2"><button onClick={() => setEditing(chapter)} className="text-sm font-semibold text-blue-600">校正</button><button onClick={() => patchChapter(chapter, { manual_mastery_score: 100, subject: chapter.subject, chapter_name: chapter.chapter_name })} className="text-sm font-semibold text-emerald-600">标记掌握</button><button onClick={() => deleteChapter(chapter)} className="text-sm text-slate-400">删除</button></div>
        </article>)}</div>
      </div>}
    </div>
    {editing ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm"><form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void patchChapter(editing, { subject: editing.subject, chapter_name: editing.chapter_name, manual_mastery_score: Number(form.get("score")), exam_weight: Number(form.get("weight")) }); }}><h2 className="text-xl font-bold text-slate-950">人工校正掌握度</h2><p className="mt-2 text-sm text-slate-500">{editing.chapter_name}</p><label className="mt-5 block text-sm font-medium">掌握度 0-100<input name="score" type="number" min="0" max="100" defaultValue={editing.mastery_score} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="mt-4 block text-sm font-medium">考试权重 0-100<input name="weight" type="number" min="0" max="100" defaultValue={editing.exam_weight} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><div className="mt-6 flex gap-3"><button disabled={pending} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">保存</button><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">取消</button></div></form></div> : null}
  </div>;
}
