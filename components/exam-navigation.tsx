import Link from "next/link";
import type { Route } from "next";
import { LogoutButton } from "@/components/logout-button";
import type { AppUser } from "@/lib/types";

const navItems = [
  ["/", "Dashboard", "首页", "⌂"],
  ["/practice", "Practice", "做题练习", "✎"],
  ["/chapters", "Chapter", "章节掌握", "▣"],
  ["/mistakes", "MistakeBook", "错题本", "▤"],
  ["/study-logs", "StudyLog", "学习记录", "◫"],
  ["/mock-exams", "MockExam", "模考记录", "◇"]
] as const;

export function ExamNavigation({ user, children }: { user: AppUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-3 border-b border-slate-100 px-6 py-6">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-200">◆</span>
          <span><strong className="block text-base text-slate-950">中级会计</strong><small className="text-xs text-slate-500">章节掌握提分系统</small></span>
        </Link>
        <nav className="flex-1 space-y-1 px-4 py-5">
          {navItems.map(([href, english, label, icon]) => (
            <Link key={href} href={href as Route} className="group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-base group-hover:border-blue-200">{icon}</span>
              <span className="min-w-0"><span className="block">{label}</span><span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{english}</span></span>
            </Link>
          ))}
        </nav>
        <div className="m-4 rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 p-4">
          <p className="text-xs font-semibold text-blue-700">Exam OS V1</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">章节掌握度决定今天学什么，不再盲目刷题。</p>
        </div>
        <div className="border-t border-slate-100 p-4"><LogoutButton email={user.source === "demo" ? "体验账号" : user.email ?? "已登录"} /></div>
      </aside>
      <main className="min-h-screen pb-24 lg:ml-64 lg:pb-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur lg:hidden">
        {navItems.map(([href, english, label, icon]) => (
          <Link key={href} href={href as Route} aria-label={english} className="flex min-w-0 flex-col items-center gap-1 px-1 text-[10px] text-slate-500">
            <span className="text-base text-blue-600">{icon}</span><span className="truncate">{label.replace("记录", "")}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
