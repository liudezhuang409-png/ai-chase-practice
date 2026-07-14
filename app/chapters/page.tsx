import { requireUser } from "@/lib/auth";
import { listExamChapters } from "@/lib/exam-os";
import { ChaptersManager } from "@/components/chapters-manager";

export default async function ChaptersPage() {
  const user = await requireUser();
  return <ChaptersManager initialChapters={await listExamChapters(user.id)} />;
}
