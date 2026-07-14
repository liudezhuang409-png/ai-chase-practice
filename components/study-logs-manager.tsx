"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, SubjectBadge } from "@/components/exam-ui";
import type { ExamStudyLog, ExamSubject } from "@/lib/exam-os-types";

const subjects: Array<ExamSubject | "全部科目"> = ["全部科目", "中级会计实务", "财务管理", "经济法"];

export function StudyLogsManager({ initialLogs }: { initialLogs: ExamStudyLog[] }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState<(typeof subjects)[number]>("全部科目"); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<ExamStudyLog | null>(null); const [error, setError] = useState("");
  const logs = initialLogs.filter((item) => subject === "全部科目" || item.subject === subject);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const date = String(form.get("date"));
    const input = { subject: form.get("subject"), chapter: form.get("chapter"), question_count: Number(form.get("question_count")), wrong_count: Number(form.get("wrong_count")), minutes: Number(form.get("minutes")), created_at: new Date(`${date}T12:00:00+08:00`).toISOString() };
    const response = await fetch("/api/exam-os/study-logs", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, ...input } : input) });
    if (!response.ok) { const data = await response.json(); setError(data.error ?? "保存失败"); return; }
    setOpen(false); setEditing(null); startTransition(() => router.refresh());
  }
  async function remove(item: ExamStudyLog) { if (!window.confirm("确认删除这条学习记录吗？")) return; await fetch(`/api/exam-os/study-logs?id=${item.id}`, { method: "DELETE" }); startTransition(() => router.refresh()); }

  return <div className="min-h-screen"><PageHeader eyebrow="Study Log" title="学习记录" description="记录真实学习行为，用来观察投入节奏；章节掌握度仍以做题与错题复盘为核心。" action={<button onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">+ 添加记录</button>} />
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><select value={subject} onChange={(e) => setSubject(e.target.value as typeof subject)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm">{subjects.map((item) => <option key={item}>{item}</option>)}</select><span className="ml-auto text-sm text-slate-500">{logs.length} 条记录</span></div>{error ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {logs.length === 0 ? <EmptyState title="还没有学习记录" description="添加今天做了多少题、错了多少题和学习时长。" /> : <div className="space-y-3">{logs.map((item) => { const accuracy = item.question_count ? Math.round(((item.question_count - item.wrong_count) / item.question_count) * 100) : 0; return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><SubjectBadge subject={item.subject} /><span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString("zh-CN")}</span></div><h2 className="mt-3 font-bold text-slate-900">{item.chapter}</h2><p className="mt-1 text-sm text-slate-500">做题 {item.question_count} · 错题 {item.wrong_count} · 时长 {item.minutes} 分钟</p></div><div className="mt-4 flex items-center gap-5 sm:mt-0"><div className="text-right"><strong className="text-2xl text-emerald-600">{accuracy}%</strong><span className="block text-xs text-slate-400">正确率</span></div><button onClick={() => { setEditing(item); setOpen(true); }} className="text-sm font-semibold text-blue-600">编辑</button><button onClick={() => remove(item)} className="text-sm text-red-500">删除</button></div></article>; })}</div>}
    </div>
    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm"><form onSubmit={save} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold text-slate-950">{editing ? "编辑学习记录" : "添加学习记录"}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">日期<input name="date" type="date" required defaultValue={(editing?.created_at ?? new Date().toISOString()).slice(0, 10)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm">科目<select name="subject" defaultValue={editing?.subject ?? "中级会计实务"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3">{subjects.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm sm:col-span-2">章节<input name="chapter" required defaultValue={editing?.chapter} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm">做题数<input name="question_count" type="number" min="0" required defaultValue={editing?.question_count ?? 20} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm">错题数<input name="wrong_count" type="number" min="0" required defaultValue={editing?.wrong_count ?? 0} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm sm:col-span-2">学习时长（分钟）<input name="minutes" type="number" min="0" required defaultValue={editing?.minutes ?? 60} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label></div><div className="mt-6 flex gap-3"><button disabled={pending} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">保存</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-5 text-sm">取消</button></div></form></div> : null}
  </div>;
}
