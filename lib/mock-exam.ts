import { z } from "zod";
import { getCompatibleChatCandidateModels, isCompatibleChatProvider, requestJsonFromCompatibleChat } from "@/lib/ai";
import {
  createDemoQuestion,
  createDemoMockExamPaper,
  getLatestDemoMockExamPaper,
  getDemoMockExamPaper,
  isPlaceholderAI,
  saveDemoMockExamReport
} from "@/lib/demo";
import { findSubjectByKnowledgePoint, getTopicsForSubject } from "@/lib/knowledge-catalog";
import { createPracticeSession } from "@/lib/practice";
import { questionSchema } from "@/lib/question-schema";
import { getUserPlan } from "@/lib/quota";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  DifficultyLevel,
  MockExamConfig,
  MockExamGeneratedQuestion,
  MockExamPaper,
  MockExamReport,
  QuestionType,
  UserKnowledgeSnapshot
} from "@/lib/types";

const MINI_EXAM_BLUEPRINT: Array<{
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  score: number;
}> = [
  { questionType: "single", difficulty: "easy", score: 2 },
  { questionType: "multiple", difficulty: "easy", score: 4 },
  { questionType: "judge", difficulty: "medium", score: 2 },
  { questionType: "single", difficulty: "medium", score: 2 },
  { questionType: "calculation", difficulty: "medium", score: 5 },
  { questionType: "comprehensive", difficulty: "hard", score: 5 }
];

const mockExamQuestionSetSchema = z.object({
  questions: z.array(questionSchema).length(MINI_EXAM_BLUEPRINT.length)
});

function normalizeMockExamRow(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    generated_questions: Array.isArray(row.generated_questions) ? row.generated_questions : [],
    weakness_report:
      row.weakness_report && typeof row.weakness_report === "object" ? row.weakness_report : null
  } as MockExamPaper;
}

function buildMiniExamConfig(subject: string): MockExamConfig {
  return {
    subject,
    paperMode: "mini",
    totalQuestions: MINI_EXAM_BLUEPRINT.length,
    estimatedMinutes: 45
  };
}

function uniqueTopics(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function pickMockExamTopics(subject: string, weakestKnowledge: UserKnowledgeSnapshot[]) {
  const subjectTopics = getTopicsForSubject(subject).filter((topic) => topic.includes(" / "));
  const prioritizedWeak = uniqueTopics(
    weakestKnowledge
      .filter((item) => findSubjectByKnowledgePoint(item.knowledgePoint) === subject)
      .sort((a, b) => b.wrongCount - a.wrongCount || a.accuracyRate - b.accuracyRate)
      .map((item) => item.knowledgePoint)
  );

  const fallbackTopics = subjectTopics.filter((topic) => !prioritizedWeak.includes(topic));
  const selectedTopics = uniqueTopics([...prioritizedWeak, ...fallbackTopics]);

  if (selectedTopics.length === 0) {
    return ["收入 / 收入的确认和计量的步骤"];
  }

  return selectedTopics;
}

function buildMockExamPrompt(subject: string, topics: string[]) {
  const blueprintText = MINI_EXAM_BLUEPRINT.map((item, index) => {
    const knowledgePoint = topics[index % topics.length];
    return `${index + 1}. knowledgePoint=${knowledgePoint}；type=${item.questionType}；difficulty=${item.difficulty}；score=${item.score}`;
  }).join("\n");

  return `
你是一个中级会计师命题助手。请为科目「${subject}」生成一套迷你模考试卷。

要求：
1. 只输出 JSON，不要输出 Markdown，不要输出任何额外解释。
2. 输出结构固定为：
{
  "questions": [
    {
      "type": "single|multiple|judge|calculation|comprehensive",
      "question": "",
      "options": {"A":"", "B":"", "C":"", "D":""} 或 null,
      "answer": "A" | ["A","C"] | true/false | {"keyPoints":["",""],"sampleSolution":""},
      "analysis": "",
      "difficulty": "easy|medium|hard",
      "knowledgePoint": "",
      "source": "ai",
      "score": 2,
      "examTips": ["", ""]
    }
  ]
}
3. questions 必须严格生成 6 题，顺序与下列 blueprint 完全一致。
4. 客观题必须有合法选项；主观题 options 必须为 null。
5. 题目必须贴近中级会计师考试，不要写泛泛的教学口号。
6. 允许你在同一科目范围内对题干做真实变式，但不要偏离给定的知识点主线。

本套试卷 blueprint：
${blueprintText}
`.trim();
}

function buildDemoMockExamQuestions(subject: string, topics: string[]) {
  return MINI_EXAM_BLUEPRINT.map((item, index) =>
    createDemoQuestion({
      knowledgePoint: topics[index % topics.length],
      questionType: item.questionType,
      difficulty: item.difficulty,
      practiceMode: "mock-exam",
      lastWrongReason: `这是一套${subject}迷你模考，请围绕该考点生成更贴近正式考试的题。`
    })
  );
}

async function generateMockExamQuestionSet(subject: string, topics: string[]) {
  if (isPlaceholderAI()) {
    return buildDemoMockExamQuestions(subject, topics);
  }

  const prompt = buildMockExamPrompt(subject, topics);

  try {
    let raw: unknown = null;

    if (isCompatibleChatProvider()) {
      const candidateModels = getCompatibleChatCandidateModels({
        latencyProfile: "fast"
      });

      let lastError: unknown = null;

      for (const [index, model] of candidateModels.entries()) {
        try {
          raw = await requestJsonFromCompatibleChat({
            model,
            systemPrompt: "你是一个专业的中级会计师考试出题助手。必须严格按要求输出合法 JSON。",
            userPrompt: prompt,
            timeoutMs: index === 0 ? 25000 : 35000
          });
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!raw) {
        throw lastError ?? new Error("MOCK_EXAM_AI_FAILED");
      }
    } else {
      throw new Error("MOCK_EXAM_AI_FAILED");
    }

    const parsed = mockExamQuestionSetSchema.parse(raw).questions;

    return MINI_EXAM_BLUEPRINT.map((item, index) => {
      const candidate = parsed[index];
      const expectedKnowledgePoint = topics[index % topics.length];
      const sameBlueprint =
        candidate.type === item.questionType && candidate.difficulty === item.difficulty;

      if (!sameBlueprint) {
        return createDemoQuestion({
          knowledgePoint: expectedKnowledgePoint,
          questionType: item.questionType,
          difficulty: item.difficulty,
          practiceMode: "mock-exam",
          lastWrongReason: `这是一套${subject}迷你模考，请围绕该考点生成更贴近正式考试的题。`
        });
      }

      return {
        ...candidate,
        score: item.score
      };
    });
  } catch {
    return buildDemoMockExamQuestions(subject, topics);
  }
}

export function getRecommendedMockExamSubject(weakestKnowledge: UserKnowledgeSnapshot[]) {
  const firstSubject = weakestKnowledge
    .map((item) => findSubjectByKnowledgePoint(item.knowledgePoint))
    .find((subject): subject is string => Boolean(subject));

  return firstSubject ?? "中级会计实务";
}

export async function ensureMockExamAccess(userId: string) {
  const plan = await getUserPlan(userId);

  if (plan !== "premium") {
    throw new Error("MOCK_EXAM_PREMIUM_REQUIRED");
  }

  return plan;
}

export async function generateMockExamPaper(params: {
  userId: string;
  subject: string;
  weakestKnowledge: UserKnowledgeSnapshot[];
}) {
  const config = buildMiniExamConfig(params.subject);
  const topics = pickMockExamTopics(params.subject, params.weakestKnowledge);
  const examName = `${params.subject} · 迷你模考`;
  const questionSet = await generateMockExamQuestionSet(params.subject, topics);
  const generatedQuestions: MockExamGeneratedQuestion[] = [];

  for (const [index, item] of MINI_EXAM_BLUEPRINT.entries()) {
    const question = questionSet[index] ?? buildDemoMockExamQuestions(params.subject, topics)[index];
    const knowledgePoint = question.knowledgePoint || topics[index % topics.length];
    const session = await createPracticeSession({
      userId: params.userId,
      knowledgePoint,
      questionType: item.questionType,
      difficulty: item.difficulty,
      practiceMode: "mock-exam",
      questionPayload: question,
      chaseMode: false
    });

    generatedQuestions.push({
      sessionId: session.id,
      knowledgePoint,
      questionType: item.questionType,
      difficulty: item.difficulty,
      score: item.score,
      question
    });
  }

  return saveMockExamPaper({
    userId: params.userId,
    examName,
    config,
    generatedQuestions
  });
}

export async function saveMockExamPaper(params: {
  userId: string;
  examName: string;
  config: MockExamConfig;
  generatedQuestions: MockExamGeneratedQuestion[];
}) {
  if (params.userId === "demo-user") {
    return createDemoMockExamPaper(params);
  }

  const { data, error } = await supabaseAdmin
    .from("mock_exam_papers")
    .insert({
      user_id: params.userId,
      exam_name: params.examName,
      config: params.config,
      generated_questions: params.generatedQuestions
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("FAILED_TO_SAVE_MOCK_EXAM");
  }

  const normalized = normalizeMockExamRow(data as Record<string, unknown>);

  if (!normalized) {
    throw new Error("FAILED_TO_SAVE_MOCK_EXAM");
  }

  return normalized;
}

export async function getMockExamPaperForUser(paperId: string, userId: string) {
  if (userId === "demo-user") {
    return getDemoMockExamPaper(paperId, userId);
  }

  const { data, error } = await supabaseAdmin
    .from("mock_exam_papers")
    .select("*")
    .eq("id", paperId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_READ_MOCK_EXAM");
  }

  return normalizeMockExamRow(data as Record<string, unknown> | null);
}

export async function getLatestMockExamPaperForUser(userId: string) {
  if (userId === "demo-user") {
    return getLatestDemoMockExamPaper(userId);
  }

  const { data, error } = await supabaseAdmin
    .from("mock_exam_papers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("FAILED_TO_READ_LATEST_MOCK_EXAM");
  }

  return normalizeMockExamRow(data as Record<string, unknown> | null);
}

export async function saveMockExamReport(params: {
  userId: string;
  paperId: string;
  report: MockExamReport;
}) {
  if (params.userId === "demo-user") {
    return saveDemoMockExamReport(params);
  }

  const { data, error } = await supabaseAdmin
    .from("mock_exam_papers")
    .update({
      score: params.report.earnedScore,
      weakness_report: params.report
    })
    .eq("id", params.paperId)
    .eq("user_id", params.userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("FAILED_TO_SAVE_MOCK_EXAM_REPORT");
  }

  const normalized = normalizeMockExamRow(data as Record<string, unknown>);

  if (!normalized) {
    throw new Error("FAILED_TO_SAVE_MOCK_EXAM_REPORT");
  }

  return normalized;
}
