import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PracticeSession, QuestionPayload } from "@/lib/types";

export async function createPracticeSession(params: {
  userId: string;
  knowledgePoint: string;
  questionPayload: QuestionPayload;
  chaseMode: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("practice_sessions")
    .insert({
      user_id: params.userId,
      knowledge_point: params.knowledgePoint,
      question_payload: params.questionPayload,
      chase_mode: params.chaseMode,
      status: "generated"
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("FAILED_TO_CREATE_SESSION");
  }

  return data as PracticeSession;
}

export async function getPracticeSessionForUser(sessionId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("practice_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_READ_SESSION");
  }

  return (data as PracticeSession | null) ?? null;
}

export async function markPracticeSessionAnswered(params: {
  sessionId: string;
  userId: string;
  selectedAnswer: "A" | "B" | "C" | "D";
  isCorrect: boolean;
}) {
  const { data, error } = await supabaseAdmin
    .from("practice_sessions")
    .update({
      selected_answer: params.selectedAnswer,
      is_correct: params.isCorrect,
      status: "answered",
      answered_at: new Date().toISOString()
    })
    .eq("id", params.sessionId)
    .eq("user_id", params.userId)
    .eq("status", "generated")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_UPDATE_SESSION");
  }

  return (data as PracticeSession | null) ?? null;
}

export async function upsertKnowledgeStatus(params: {
  userId: string;
  knowledgePoint: string;
  correct: boolean;
}) {
  const { data: current } = await supabaseAdmin
    .from("user_knowledge")
    .select("wrong_streak, total_attempts, total_wrong")
    .eq("user_id", params.userId)
    .eq("knowledge_point", params.knowledgePoint)
    .maybeSingle();

  const wrongStreak = params.correct ? 0 : (current?.wrong_streak ?? 0) + 1;

  await supabaseAdmin.from("user_knowledge").upsert(
    {
      user_id: params.userId,
      knowledge_point: params.knowledgePoint,
      wrong_streak: wrongStreak,
      total_attempts: (current?.total_attempts ?? 0) + 1,
      total_wrong: (current?.total_wrong ?? 0) + (params.correct ? 0 : 1),
      last_result: params.correct ? "correct" : "wrong",
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "user_id,knowledge_point"
    }
  );
}

export async function insertPracticeLog(params: {
  userId: string;
  knowledgePoint: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  chaseMode: boolean;
  questionPayload: QuestionPayload;
  sessionId: string;
}) {
  await supabaseAdmin.from("practice_logs").insert({
    user_id: params.userId,
    knowledge_point: params.knowledgePoint,
    question: params.questionPayload.question,
    options: params.questionPayload.options,
    selected_answer: params.selectedAnswer,
    correct_answer: params.correctAnswer,
    is_correct: params.isCorrect,
    chase_mode: params.chaseMode,
    analysis: params.questionPayload.analysis,
    practice_session_id: params.sessionId
  });
}

export function buildNextPromptHint(params: {
  knowledgePoint: string;
  correctAnswer: string;
  selectedAnswer: string | null;
  correct: boolean;
}) {
  if (params.correct) {
    return "本轮已答对，不需要继续追杀。";
  }

  return `用户在「${params.knowledgePoint}」上把正确答案 ${params.correctAnswer} 误判成 ${params.selectedAnswer ?? "未作答"}，请继续围绕这个薄弱点生成更有迷惑性的变式题。`;
}
