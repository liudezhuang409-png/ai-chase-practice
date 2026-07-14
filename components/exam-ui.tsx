import type { ExamSubject } from "@/lib/exam-os-types";

export const SUBJECT_STYLES: Record<ExamSubject, { badge: string; bar: string; dot: string }> = {
  "中级会计实务": { badge: "bg-blue-50 text-blue-700", bar: "bg-blue-600", dot: "bg-blue-600" },
  "财务管理": { badge: "bg-orange-50 text-orange-700", bar: "bg-orange-500", dot: "bg-orange-500" },
  "经济法": { badge: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", dot: "bg-emerald-500" }
};

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
    <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action}
  </header>;
}

export function SubjectBadge({ subject }: { subject: ExamSubject }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${SUBJECT_STYLES[subject].badge}`}>{subject}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"><strong className="text-slate-800">{title}</strong><p className="mt-2 text-sm text-slate-500">{description}</p></div>;
}
