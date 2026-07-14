import { requireUser } from "@/lib/auth";
import { listExamMistakes } from "@/lib/exam-os";
import { MistakesManager } from "@/components/mistakes-manager";

export default async function MistakesPage() {
  const user = await requireUser();
  return <MistakesManager initialMistakes={await listExamMistakes(user.id)} />;
}
