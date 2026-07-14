import { requireUser } from "@/lib/auth";
import { listExamChapters } from "@/lib/exam-os";
import { PracticeWorkspace } from "@/components/practice-workspace";

export default async function PracticePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(); const params = searchParams ? await searchParams : {};
  return <PracticeWorkspace chapters={await listExamChapters(user.id)} initialSubject={typeof params.subject === "string" ? params.subject : undefined} initialChapter={typeof params.chapter === "string" ? params.chapter : undefined} initialCount={typeof params.count === "string" ? Number(params.count) : undefined} />;
}
