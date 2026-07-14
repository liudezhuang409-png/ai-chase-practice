import { getDemoStudyPlan, getDemoTodayPracticeLogs, saveDemoStudyPlan } from "@/lib/demo";
import { getUserStats } from "@/lib/dashboard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  StudyPlanInput,
  StudyPlanPayload,
  StudyPlanTodayProgress,
  UserStatsSnapshot,
  UserStudyPlanRecord
} from "@/lib/types";
import { findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import { startOfChinaDayIso } from "@/lib/utils";

function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeStudyPlanRow(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    selected_subjects: normalizeTextArray(row.selected_subjects),
    selected_topics: normalizeTextArray(row.selected_topics)
  } as UserStudyPlanRecord;
}

export async function getLatestStudyPlan(userId: string) {
  if (userId === "demo-user") {
    return getDemoStudyPlan(userId);
  }

  const { data, error } = await supabaseAdmin
    .from("user_study_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_READ_STUDY_PLAN");
  }

  return normalizeStudyPlanRow(data as Record<string, unknown> | null);
}

export async function saveStudyPlan(params: {
  userId: string;
  input: StudyPlanInput;
  payload: StudyPlanPayload;
}) {
  if (params.userId === "demo-user") {
    return saveDemoStudyPlan(params);
  }

  await supabaseAdmin
    .from("user_study_plans")
    .update({
      status: "archived",
      updated_at: new Date().toISOString()
    })
    .eq("user_id", params.userId)
    .eq("status", "active");

  const { data, error } = await supabaseAdmin
    .from("user_study_plans")
    .insert({
      user_id: params.userId,
      plan_name: params.payload.planName,
      target_exam: params.input.targetExam,
      target_score: params.input.targetScore,
      days_to_exam: params.input.daysToExam,
      daily_minutes: params.input.dailyMinutes,
      study_style: params.input.studyStyle,
      selected_subjects: params.input.selectedSubjects,
      selected_topics: params.input.selectedTopics,
      plan_payload: params.payload,
      status: "active",
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("FAILED_TO_SAVE_STUDY_PLAN");
  }

  return normalizeStudyPlanRow(data as Record<string, unknown>);
}

export async function getStudyPlanSeed(userId: string): Promise<{
  stats: UserStatsSnapshot;
  suggestedSubjects: string[];
  suggestedTopics: string[];
}> {
  const stats = await getUserStats(userId);

  const suggestedSubjects = [
    ...new Set(
      stats.weakestKnowledge
        .map((item) => findSubjectByKnowledgePoint(item.knowledgePoint))
        .filter((item): item is string => Boolean(item))
    )
  ].slice(0, 3);

  const suggestedTopics = stats.weakestKnowledge.slice(0, 5).map((item) => item.knowledgePoint);

  return {
    stats,
    suggestedSubjects,
    suggestedTopics
  };
}

function buildTodayProgress(
  plan: UserStudyPlanRecord,
  rows: Array<{
    knowledge_point: string;
    question_type: string;
    is_correct: boolean;
    created_at: string;
  }>
): StudyPlanTodayProgress {
  const tasks = plan.plan_payload.todayTasks.map((task, index) => {
    const matches = rows.filter(
      (row) => row.knowledge_point === task.knowledgePoint && row.question_type === task.questionType
    );
    const completedQuestions = Math.min(matches.length, task.count);
    const correctCount = matches.filter((row) => row.is_correct).length;

    return {
      taskIndex: index,
      completedQuestions,
      targetQuestions: task.count,
      completed: completedQuestions >= task.count,
      correctCount,
      lastPracticedAt: matches[0]?.created_at ?? null
    };
  });

  return {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.completed).length,
    startedTasks: tasks.filter((task) => task.completedQuestions > 0).length,
    totalQuestions: tasks.reduce((sum, task) => sum + task.targetQuestions, 0),
    completedQuestions: tasks.reduce((sum, task) => sum + task.completedQuestions, 0),
    correctQuestions: tasks.reduce((sum, task) => sum + task.correctCount, 0),
    tasks
  };
}

export async function getTodayStudyPlanProgress(userId: string, plan: UserStudyPlanRecord | null) {
  if (!plan) {
    return null;
  }

  if (userId === "demo-user") {
    const rows = getDemoTodayPracticeLogs(userId).map((item) => ({
      knowledge_point: item.knowledgePoint,
      question_type: item.questionType,
      is_correct: item.correct,
      created_at: item.createdAt
    }));

    return buildTodayProgress(plan, rows);
  }

  const { data, error } = await supabaseAdmin
    .from("practice_logs")
    .select("knowledge_point, question_type, is_correct, created_at")
    .eq("user_id", userId)
    .gte("created_at", startOfChinaDayIso())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("FAILED_TO_READ_STUDY_PLAN_PROGRESS");
  }

  return buildTodayProgress(
    plan,
    (data ?? []) as Array<{
      knowledge_point: string;
      question_type: string;
      is_correct: boolean;
      created_at: string;
    }>
  );
}
