import { requireUser } from "@/lib/auth";
import { listExamStudyLogs } from "@/lib/exam-os";
import { StudyLogsManager } from "@/components/study-logs-manager";

export default async function StudyLogsPage() {
  const user = await requireUser();
  return <StudyLogsManager initialLogs={await listExamStudyLogs(user.id)} />;
}
