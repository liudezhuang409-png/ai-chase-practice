import { answerDemoSession, createDemoSession, getDemoSession, getDemoKnowledgeSummary, serializeCorrectAnswer } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  DifficultyLevel,
  MasteryLevel,
  PracticeMode,
  PracticeSession,
  QuestionPayload,
  QuestionType,
  SubjectiveAIReview,
  SubmissionVerdict
} from "@/lib/types";

export async function createPracticeSession(params: {
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode: PracticeMode;
  questionPayload: QuestionPayload;
  chaseMode: boolean;
}) {
  if (params.userId === "demo-user") {
    return createDemoSession(params);
  }

  const { data, error } = await supabaseAdmin
    .from("practice_sessions")
    .insert({
      user_id: params.userId,
      knowledge_point: params.knowledgePoint,
      question_type: params.questionType,
      difficulty: params.difficulty,
      practice_mode: params.practiceMode,
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
  if (userId === "demo-user") {
    return getDemoSession(sessionId, userId);
  }

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
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  isCorrect: boolean;
  questionPayloadOverride?: QuestionPayload;
}) {
  if (params.userId === "demo-user") {
    const session = getDemoSession(params.sessionId, params.userId);

    if (!session || session.status !== "generated") {
      return session;
    }

    session.selected_answer = params.selectedAnswer ?? null;
    session.self_assessment = params.selfAssessment ?? null;
    session.is_correct = params.isCorrect;
    session.status = "answered";
    session.answered_at = new Date().toISOString();
    if (params.questionPayloadOverride) {
      session.question_payload = params.questionPayloadOverride;
    }
    return session;
  }

  const { data, error } = await supabaseAdmin
    .from("practice_sessions")
    .update({
      selected_answer: params.selectedAnswer ?? null,
      self_assessment: params.selfAssessment ?? null,
      is_correct: params.isCorrect,
      status: "answered",
      answered_at: new Date().toISOString(),
      ...(params.questionPayloadOverride ? { question_payload: params.questionPayloadOverride } : {})
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
  questionType: QuestionType;
  correct: boolean;
  verdict: SubmissionVerdict;
}) {
  if (params.userId === "demo-user") {
    return;
  }

  const { data: current } = await supabaseAdmin
    .from("user_knowledge")
    .select("wrong_streak, total_attempts, total_wrong, correct_count, confused_count")
    .eq("user_id", params.userId)
    .eq("knowledge_point", params.knowledgePoint)
    .maybeSingle();

  const wrongStreak = params.correct ? 0 : (current?.wrong_streak ?? 0) + 1;
  const totalAttempts = (current?.total_attempts ?? 0) + 1;
  const totalWrong = (current?.total_wrong ?? 0) + (params.correct ? 0 : 1);
  const correctCount = (current?.correct_count ?? 0) + (params.correct ? 1 : 0);
  const confusedCount = (current?.confused_count ?? 0) + (params.verdict === "confused" ? 1 : 0);
  const masteryScore = Math.max(0, Math.min(100, Math.round((correctCount / totalAttempts) * 100 - totalWrong * 4)));

  await supabaseAdmin.from("user_knowledge").upsert(
    {
      user_id: params.userId,
      knowledge_point: params.knowledgePoint,
      wrong_streak: wrongStreak,
      total_attempts: totalAttempts,
      total_wrong: totalWrong,
      correct_count: correctCount,
      confused_count: confusedCount,
      mastery_score: masteryScore,
      last_question_type: params.questionType,
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
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  selectedAnswer: string;
  correctAnswer: string;
  verdict: SubmissionVerdict;
  isCorrect: boolean;
  chaseMode: boolean;
  practiceMode: PracticeMode;
  questionPayload: QuestionPayload;
  sessionId: string;
}) {
  if (params.userId === "demo-user") {
    return;
  }

  await supabaseAdmin.from("practice_logs").insert({
    user_id: params.userId,
    knowledge_point: params.knowledgePoint,
    question_type: params.questionType,
    difficulty: params.difficulty,
    practice_mode: params.practiceMode,
    question: params.questionPayload.question,
    options: params.questionPayload.options,
    selected_answer: params.selectedAnswer,
    correct_answer: params.correctAnswer,
    verdict: params.verdict,
    is_correct: params.isCorrect,
    chase_mode: params.chaseMode,
    analysis: params.questionPayload.analysis,
    practice_session_id: params.sessionId
  });
}

export function buildNextPromptHint(params: {
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  correctAnswer: string;
  selectedAnswer: string | null;
  correct: boolean;
  verdict: SubmissionVerdict;
  question?: QuestionPayload;
}) {
  if (params.correct) {
    return `用户在「${params.knowledgePoint}」的 ${params.questionType} / ${params.difficulty} 题上已答对，可以提升难度或切换题型。`;
  }

  if (params.verdict === "confused") {
    return `用户把「${params.knowledgePoint}」标记为不懂，请先回到更基础的同知识点题，再逐步提高难度。`;
  }

  const stem = params.question?.question.replace(/\s+/g, " ").slice(0, 90);
  const correctOption =
    params.question?.options && typeof params.question.answer === "string"
      ? `${params.question.answer}（${params.question.options[params.question.answer as keyof typeof params.question.options] ?? params.correctAnswer}）`
      : params.correctAnswer;
  const microContext = stem ? `原题：${stem}；正确口径：${correctOption}。` : "";

  return `用户在「${params.knowledgePoint}」的 ${params.questionType} / ${params.difficulty} 题上把正确答案 ${params.correctAnswer} 误判成 ${params.selectedAnswer ?? "未作答"}。${microContext}下一题必须保持同一微考点和同题型，只更换主体、数据、问法或干扰项。`;
}

export function evaluateAnswer(params: {
  question: QuestionPayload;
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  markedConfused?: boolean;
}) {
  if (params.markedConfused || params.selfAssessment === "confused") {
    return { correct: false, verdict: "confused" as SubmissionVerdict };
  }

  const { question, selectedAnswer } = params;

  if (question.type === "single") {
    const correct = selectedAnswer === question.answer;
    return { correct, verdict: correct ? "correct" : "wrong" as SubmissionVerdict };
  }

  if (question.type === "multiple") {
    const actual = (selectedAnswer ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .sort();
    const expected = [...(question.answer as string[])].sort();
    const correct = JSON.stringify(actual) === JSON.stringify(expected);
    return { correct, verdict: correct ? "correct" : "wrong" as SubmissionVerdict };
  }

  if (question.type === "judge") {
    const expected = question.answer ? "A" : "B";
    const correct = selectedAnswer === expected;
    return { correct, verdict: correct ? "correct" : "wrong" as SubmissionVerdict };
  }

  const verdict = params.selfAssessment ?? "wrong";
  return { correct: verdict === "correct", verdict };
}

export async function resolveMasteryLevel(userId: string, knowledgePoint: string): Promise<MasteryLevel> {
  if (userId === "demo-user") {
    return (
      getDemoKnowledgeSummary(userId).find((item) => item.knowledgePoint === knowledgePoint)?.mastery ??
      "warning"
    );
  }

  const { data } = await supabaseAdmin
    .from("user_knowledge")
    .select("mastery_score, total_wrong, total_attempts")
    .eq("user_id", userId)
    .eq("knowledge_point", knowledgePoint)
    .maybeSingle();

  const masteryScore = data?.mastery_score ?? 0;
  const wrong = data?.total_wrong ?? 0;
  const attempts = data?.total_attempts ?? 0;
  const accuracy = attempts === 0 ? 0 : (attempts - wrong) / attempts;

  if (masteryScore < 35 || accuracy < 0.45) {
    return "warning";
  }

  if (masteryScore < 60 || accuracy < 0.65) {
    return "shaky";
  }

  if (masteryScore < 80) {
    return "stable";
  }

  return "mastered";
}

export function serializeAnswer(answer: QuestionPayload["answer"]) {
  return serializeCorrectAnswer(answer);
}

export async function answerSessionInDemo(params: {
  sessionId: string;
  userId: string;
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  markedConfused?: boolean;
  resolvedVerdict?: SubmissionVerdict;
  resolvedCorrect?: boolean;
  analysisOverride?: string;
  gradingSource?: "ai" | "self";
  aiReview?: SubjectiveAIReview | null;
}) {
  return answerDemoSession(params);
}
