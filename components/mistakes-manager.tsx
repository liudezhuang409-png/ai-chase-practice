"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, SubjectBadge } from "@/components/exam-ui";
import type { ExamMistake, ExamSubject } from "@/lib/exam-os-types";

const subjects: Array<ExamSubject | "全部科目"> = ["全部科目", "中级会计实务", "财务管理", "经济法"];

function buildPrompt(item: ExamMistake) {
  return `我是中级会计考生，这是我的错题：\n科目：${item.subject}\n章节：${item.chapter}\n题目：${item.question}\n我的答案：${item.my_answer}\n正确答案：${item.correct_answer}\n错因：${item.wrong_reason}\n请帮我分析：\n1. 为什么错\n2. 考点是什么\n3. 正确步骤\n4. 解题套路\n5. 再出2道同类题`;
}

export function MistakesManager({ initialMistakes }: { initialMistakes: ExamMistake[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState<(typeof subjects)[number]>("全部科目");
  const [status, setStatus] = useState<"all" | "active" | "mastered">("all");
  const [selectedId, setSelectedId] = useState(initialMistakes[0]?.id ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamMistake | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const items = initialMistakes.filter((item) => (subject === "全部科目" || item.subject === subject) && (status === "all" || (status === "mastered" ? item.is_mastered : !item.is_mastered)));
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const input = { subject: form.get("subject"), chapter: form.get("chapter"), question: form.get("question"), my_answer: form.get("my_answer"), correct_answer: form.get("correct_answer"), wrong_reason: form.get("wrong_reason") || "待分析", question_type: form.get("question_type"), difficulty: form.get("difficulty") };
    const response = await fetch("/api/exam-os/mistakes", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing ? { id: editing.id, ...input } : input) });
    if (!response.ok) { const data = await response.json(); setError(data.error ?? "保存失败"); return; }
    setFormOpen(false); setEditing(null); startTransition(() => router.refresh());
  }

  async function patch(item: ExamMistake, input: Record<string, unknown>) {
    await fetch("/api/exam-os/mistakes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, ...input }) });
    startTransition(() => router.refresh());
  }

  async function remove(item: ExamMistake) {
    if (!window.confirm("确认删除这道错题吗？")) return;
    await fetch(`/api/exam-os/mistakes?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setSelectedId(""); startTransition(() => router.refresh());
  }

  async function analyze(item: ExamMistake) {
    setAnalyzing(true); setError("");
    const response = await fetch("/api/exam-os/mistakes/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) });
    if (!response.ok) { const data = await response.json(); setError(data.error ?? "AI 分析失败"); setAnalyzing(false); return; }
    setAnalyzing(false); startTransition(() => router.refresh());
  }

  async function copy(item: ExamMistake) {
    await navigator.clipboard.writeText(buildPrompt(item)); setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="min-h-screen">
    <PageHeader eyebrow="Mistake Book" title="错题本" description="错题不是收藏品。先定位错因，再用同类变式验证是否真正掌握。" action={<button onClick={() => { setEditing(null); setFormOpen(true); }} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200">+ 添加错题</button>} />
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><select value={subject} onChange={(e) => setSubject(e.target.value as typeof subject)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm">{subjects.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"><option value="all">全部状态</option><option value="active">待掌握</option><option value="mastered">已掌握</option></select><span className="ml-auto self-center text-sm text-slate-500">共 {items.length} 道错题</span></div>
      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {items.length === 0 ? <EmptyState title="当前筛选下没有错题" description="做题答错后会自动进入这里，也可以手动添加。" /> : <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">{items.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${selected?.id === item.id ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white hover:border-blue-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-900">{item.question}</p><div className="mt-2 flex flex-wrap gap-2"><SubjectBadge subject={item.subject} /><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{item.chapter}</span></div></div><span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${item.is_mastered ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>{item.is_mastered ? "已掌握" : "待复习"}</span></div><p className="mt-3 text-xs text-slate-400">错因：{item.wrong_reason} · 复习 {item.review_count} 次</p></button>)}</div>
        {selected ? <article className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">错题详情</p><h2 className="mt-1 text-lg font-bold text-slate-950">{selected.chapter}</h2></div><div className="flex gap-3"><button onClick={() => { setEditing(selected); setFormOpen(true); }} className="text-sm font-semibold text-blue-600">编辑</button><button onClick={() => remove(selected)} className="text-sm text-red-500">删除</button></div></div>
          <div className="mt-5 space-y-4 text-sm leading-7"><section><p className="text-xs font-semibold text-slate-400">题目</p><p className="mt-1 text-slate-800">{selected.question}</p></section><div className="grid gap-3 sm:grid-cols-2"><section className="rounded-xl bg-red-50 p-4"><p className="text-xs font-semibold text-red-500">我的答案</p><p className="mt-1 whitespace-pre-wrap text-red-800">{selected.my_answer}</p></section><section className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-600">正确答案</p><p className="mt-1 whitespace-pre-wrap text-emerald-900">{selected.correct_answer}</p></section></div><section className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-400">当前错因</p><p className="mt-1 text-slate-800">{selected.wrong_reason}</p></section></div>
          {selected.ai_analysis ? <section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">DeepSeek 分析</p><p className="mt-2 text-sm leading-7 text-slate-700">{String(selected.ai_analysis.diagnosis ?? "已完成错因分析")}</p><p className="mt-2 text-sm font-medium text-slate-900">{String(selected.ai_analysis.correction ?? "")}</p></section> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><button onClick={() => analyze(selected)} disabled={analyzing || pending} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">{analyzing ? "DeepSeek 分析中..." : "AI 分析错因"}</button><button onClick={() => copy(selected)} className="rounded-xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-700">{copied ? "已复制" : "复制给 ChatGPT 分析"}</button><button onClick={() => patch(selected, { is_mastered: !selected.is_mastered, review_count: selected.review_count + 1 })} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">{selected.is_mastered ? "重新加入复习" : "标记已掌握"}</button></div>
        </article> : null}
      </div>}
    </div>
    {formOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/30 p-4 backdrop-blur-sm"><form onSubmit={save} className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-950">{editing ? "编辑错题" : "添加错题"}</h2><button type="button" onClick={() => setFormOpen(false)} className="text-slate-400">关闭</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">科目<select name="subject" defaultValue={editing?.subject ?? "中级会计实务"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3">{subjects.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm">章节<input name="chapter" required defaultValue={editing?.chapter} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm">题型<select name="question_type" defaultValue={editing?.question_type ?? "single"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="single">单选题</option><option value="multiple">多选题</option><option value="judge">判断题</option><option value="calculation">计算分析</option><option value="comprehensive">综合题</option></select></label><label className="text-sm">难度<select name="difficulty" defaultValue={editing?.difficulty ?? "easy"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option value="easy">基础</option><option value="medium">进阶</option><option value="hard">冲刺</option></select></label></div><label className="mt-4 block text-sm">题目<textarea name="question" required rows={4} defaultValue={editing?.question} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">我的答案<textarea name="my_answer" required rows={4} defaultValue={editing?.my_answer} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><label className="text-sm">正确答案<textarea name="correct_answer" required rows={4} defaultValue={editing?.correct_answer} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label></div><label className="mt-4 block text-sm">错因<input name="wrong_reason" defaultValue={editing?.wrong_reason ?? "待分析"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3" /></label><button disabled={pending} className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">保存错题</button></form></div> : null}
  </div>;
}
