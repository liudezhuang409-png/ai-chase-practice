import { getDemoRecentWrongQuestions, getDemoStats } from "@/lib/demo";
import { findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MasteryLevel, QuestionType, UserStatsSnapshot, WrongReviewItem } from "@/lib/types";
import { clamp } from "@/lib/utils";

const ALL_TYPES: QuestionType[] = ["single", "multiple", "judge", "calculation", "comprehensive"];

function buildDailyTrend(
  rows: Array<{
    created_at: string;
    is_correct: boolean;
  }>
) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dateKey = date.toISOString().slice(0, 10);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    const items = rows.filter((item) => item.created_at.slice(0, 10) === dateKey);
    const attempts = items.length;
    const correctCount = items.filter((item) => item.is_correct).length;

    return {
      dateKey,
      label,
      attempts,
      correctRate: attempts === 0 ? 0 : correctCount / attempts
    };
  });

  return days;
}

export async function getUserStats(userId: string): Promise<UserStatsSnapshot> {
  if (userId === "demo-user") {
    return getDemoStats(userId);
  }

  const [{ data: knowledgeRows }, { data: logRows }] = await Promise.all([
    supabaseAdmin
      .from("user_knowledge")
      .select("knowledge_point, mastery_score, total_wrong, total_attempts, updated_at")
      .eq("user_id", userId)
      .order("mastery_score", { ascending: true })
      .limit(8),
    supabaseAdmin
      .from("practice_logs")
      .select("question_type, is_correct, verdict, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(300)
  ]);

  const totalPractices = logRows?.length ?? 0;
  const correctCount = logRows?.filter((item) => item.is_correct).length ?? 0;
  const confusedCount = logRows?.filter((item) => item.verdict === "confused").length ?? 0;
  const weakestKnowledge =
    knowledgeRows?.map((row) => {
      const attempts = row.total_attempts ?? 0;
      const wrong = row.total_wrong ?? 0;
      const accuracyRate = attempts === 0 ? 0 : (attempts - wrong) / attempts;
      const mastery: MasteryLevel =
        (row.mastery_score ?? 0) < 35
          ? "warning"
          : (row.mastery_score ?? 0) < 60
            ? "shaky"
            : (row.mastery_score ?? 0) < 80
              ? "stable"
              : "mastered";
      return {
        knowledgePoint: row.knowledge_point,
        mastery,
        heat: clamp(Math.round((100 - (row.mastery_score ?? 0)) * 0.9), 10, 100),
        wrongCount: wrong,
        totalAttempts: attempts,
        accuracyRate,
        lastPracticedAt: row.updated_at ?? null,
        recommendedTypes: ["single", "multiple"] as QuestionType[]
      };
    }) ?? [];

  const typeAccuracy = ALL_TYPES.map((type) => {
    const items = logRows?.filter((row) => row.question_type === type) ?? [];
    const attempts = items.length;
    const correct = items.filter((row) => row.is_correct).length;
    return {
      type,
      attempts,
      correctRate: attempts === 0 ? 0 : correct / attempts
    };
  });

  return {
    totalPractices,
    correctRate: totalPractices === 0 ? 0 : correctCount / totalPractices,
    confusedCount,
    streakDays: Math.min(new Set((logRows ?? []).map((item) => item.created_at.slice(0, 10))).size, 7),
    dailyTrend: buildDailyTrend(
      (logRows ?? []).map((item) => ({
        created_at: item.created_at,
        is_correct: item.is_correct
      }))
    ),
    weakestKnowledge,
    typeAccuracy,
    masteryHeatmap: weakestKnowledge
  };
}

export async function getWrongReviewItems(userId: string) {
  if (userId === "demo-user") {
    return getDemoRecentWrongQuestions(userId);
  }

  const { data } = await supabaseAdmin
    .from("wrong_questions")
    .select("id, knowledge_point, question_type, difficulty, wrong_count, last_practiced_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("wrong_count", { ascending: false })
    .order("last_practiced_at", { ascending: false })
    .limit(12);

  return (
    data?.map((item) => {
      const subject = findSubjectByKnowledgePoint(item.knowledge_point) ?? "未分类科目";
      const daysSinceLastPractice = item.last_practiced_at
        ? Math.max(0, Math.floor((Date.now() - new Date(item.last_practiced_at).getTime()) / (24 * 60 * 60 * 1000)))
        : 999;
      const recencyBoost = Math.max(0, 14 - daysSinceLastPractice);
      const priorityScore = item.wrong_count * 10 + recencyBoost;
      const priorityLabel: WrongReviewItem["priorityLabel"] =
        item.wrong_count >= 3 || daysSinceLastPractice <= 2
          ? "高优先"
          : item.wrong_count >= 2 || daysSinceLastPractice <= 7
            ? "优先回补"
            : "安排巩固";

      return {
        id: item.id,
        subject,
        knowledgePoint: item.knowledge_point,
        questionType: item.question_type,
        difficulty: item.difficulty,
        wrongCount: item.wrong_count,
        lastPracticedAt: item.last_practiced_at,
        promptHint: `${subject} · ${item.knowledge_point} · ${item.question_type} · ${item.difficulty}`,
        question: null,
        priorityScore,
        priorityLabel
      } satisfies WrongReviewItem;
    }) ?? []
  );
}
