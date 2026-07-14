import { requireUser } from "@/lib/auth";
import { listExamMockExams } from "@/lib/exam-os";
import { MockExamsManager } from "@/components/mock-exams-manager";

export default async function MockExamsPage() {
  const user = await requireUser();
  return <MockExamsManager initialExams={await listExamMockExams(user.id)} />;
}
