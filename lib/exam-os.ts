import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getChapterCatalog, findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  DailyStudyTask,
  ExamChapter,
  ExamDashboardSnapshot,
  ExamMistake,
  ExamMockExam,
  ExamStudyLog,
  ExamSubject
} from "@/lib/exam-os-types";
import type { QuestionPayload, QuestionType } from "@/lib/types";

const SUBJECTS: ExamSubject[] = ["中级会计实务", "财务管理", "经济法"];
const DEMO_FILE = path.join(process.cwd(), ".codex", "exam-os-demo.json");

type DemoExamStore = {
  chapters: ExamChapter[];
  mistakes: ExamMistake[];
  studyLogs: ExamStudyLog[];
  mockExams: ExamMockExam[];
};

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function examWeight(chapter: string) {
  const high = ["长期股权投资", "企业合并", "合并财务报表", "金融资产", "收入", "所得税", "本量利", "投资管理", "筹资管理", "合同法律制度", "公司法律制度"];
  const medium = ["存货", "固定资产", "无形资产", "财务分析", "成本管理", "预算管理", "物权法律制度", "金融法律制度"];

  if (high.some((item) => chapter.includes(item))) return 90;
  if (medium.some((item) => chapter.includes(item))) return 72;
  return 55;
}

function seedChapters(userId: string) {
  const overrides: Record<string, { mastery: number; wrong: number; mastered: number; review: number; trend: ExamChapter["trend"] }> = {
    "长期股权投资和合营安排": { mastery: 42, wrong: 18, mastered: 6, review: 3, trend: "down" },
    "企业合并与合并财务报表": { mastery: 38, wrong: 22, mastered: 5, review: 4, trend: "down" },
    "财务分析与评价": { mastery: 45, wrong: 16, mastered: 8, review: 2, trend: "flat" },
    "收入": { mastery: 78, wrong: 5, mastered: 20, review: 3, trend: "up" },
    "所得税费用": { mastery: 70, wrong: 8, mastered: 12, review: 2, trend: "up" }
  };

  return getChapterCatalog().map(({ subject, chapterName }, index) => {
    const preset = overrides[chapterName];
    const mastery = preset?.mastery ?? Math.max(48, 76 - (index % 7) * 4);
    return {
      id: id(),
      user_id: userId,
      subject: subject as ExamSubject,
      chapter_name: chapterName,
      mastery_score: mastery,
      manual_mastery_score: null,
      wrong_count: preset?.wrong ?? Math.max(2, 12 - (index % 6)),
      mastered_count: preset?.mastered ?? 8 + (index % 8),
      review_count: preset?.review ?? 1 + (index % 3),
      trend: preset?.trend ?? (index % 4 === 0 ? "up" : "flat"),
      exam_weight: examWeight(chapterName),
      last_reviewed_at: new Date(Date.now() - ((index % 9) + 1) * 86400000).toISOString(),
      updated_at: now()
    } satisfies ExamChapter;
  });
}

function createDemoStore(): DemoExamStore {
  const userId = "demo-user";
  const createdAt = now();
  return {
    chapters: seedChapters(userId),
    mistakes: [
      {
        id: id(), user_id: userId, subject: "中级会计实务", chapter: "长期股权投资和合营安排",
        question: "非同一控制下企业合并形成长期股权投资时，初始投资成本应如何确定？",
        my_answer: "按被投资单位账面净资产份额确认", correct_answer: "按购买方付出对价的公允价值确认",
        wrong_reason: "初始计量口径混淆", review_count: 2, is_mastered: false, question_type: "single", difficulty: "medium", ai_analysis: null, created_at: createdAt, updated_at: createdAt
      },
      {
        id: id(), user_id: userId, subject: "中级会计实务", chapter: "企业合并与合并财务报表",
        question: "合并抵销分录中，内部交易未实现利润应如何处理？", my_answer: "全部计入投资收益",
        correct_answer: "抵销内部交易收入、成本及期末存货中的未实现利润", wrong_reason: "抵销分录遗漏", review_count: 1, is_mastered: false, question_type: "calculation", difficulty: "hard", ai_analysis: null, created_at: createdAt, updated_at: createdAt
      },
      {
        id: id(), user_id: userId, subject: "财务管理", chapter: "财务管理基础",
        question: "本量利分析中安全边际率如何计算？", my_answer: "保本销售量÷实际销售量",
        correct_answer: "安全边际量÷实际销售量", wrong_reason: "公式记忆错误", review_count: 2, is_mastered: false, question_type: "single", difficulty: "easy", ai_analysis: null, created_at: createdAt, updated_at: createdAt
      }
    ],
    studyLogs: [
      { id: id(), user_id: userId, subject: "财务管理", chapter: "财务管理基础", question_count: 20, wrong_count: 5, minutes: 120, created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: id(), user_id: userId, subject: "中级会计实务", chapter: "企业合并与合并财务报表", question_count: 15, wrong_count: 4, minutes: 90, created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: id(), user_id: userId, subject: "经济法", chapter: "合同法律制度", question_count: 25, wrong_count: 3, minutes: 80, created_at: new Date(Date.now() - 3 * 86400000).toISOString() }
    ],
    mockExams: [
      { id: id(), user_id: userId, date: new Date().toISOString().slice(0, 10), accounting_score: 54, finance_score: 58, law_score: 52, created_at: createdAt, updated_at: createdAt },
      { id: id(), user_id: userId, date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), accounting_score: 62, finance_score: 48, law_score: 56, created_at: createdAt, updated_at: createdAt }
    ]
  };
}

function loadDemoStore() {
  try {
    if (existsSync(DEMO_FILE)) return JSON.parse(readFileSync(DEMO_FILE, "utf8")) as DemoExamStore;
  } catch {
    // Recreate malformed demo data instead of blocking the product tour.
  }
  const store = createDemoStore();
  saveDemoStore(store);
  return store;
}

function saveDemoStore(store: DemoExamStore) {
  mkdirSync(path.dirname(DEMO_FILE), { recursive: true });
  writeFileSync(DEMO_FILE, JSON.stringify(store, null, 2), "utf8");
}

function isDemo(userId: string) {
  return userId === "demo-user";
}

function calculateMastery(chapter: Pick<ExamChapter, "wrong_count" | "mastered_count" | "review_count" | "trend" | "manual_mastery_score">) {
  if (chapter.manual_mastery_score !== null) return chapter.manual_mastery_score;
  const attempts = chapter.wrong_count + chapter.mastered_count;
  const correctRate = attempts > 0 ? (chapter.mastered_count / attempts) * 100 : 0;
  const reviewRate = Math.min(chapter.review_count / 3, 1) * 100;
  const trendScore = chapter.trend === "up" ? 100 : chapter.trend === "down" ? 30 : 60;
  return Math.round((0.5 * correctRate + 0.3 * reviewRate + 0.2 * trendScore) * 10) / 10;
}

export async function ensureExamChapters(userId: string) {
  if (isDemo(userId)) return loadDemoStore().chapters;
  const { data } = await supabaseAdmin.from("chapters").select("*").eq("user_id", userId);
  if (data?.length) return data as ExamChapter[];
  const rows = seedChapters(userId).map(({ id: seededId, ...chapter }) => {
    void seededId;
    return chapter;
  });
  const { data: inserted, error } = await supabaseAdmin.from("chapters").insert(rows).select("*");
  if (error) throw new Error("FAILED_TO_SEED_CHAPTERS");
  return inserted as ExamChapter[];
}

export async function listExamChapters(userId: string, subject?: string) {
  const chapters = await ensureExamChapters(userId);
  return chapters
    .filter((chapter) => !subject || subject === "all" || chapter.subject === subject)
    .map((chapter) => ({ ...chapter, mastery_score: chapter.manual_mastery_score ?? chapter.mastery_score }))
    .sort((a, b) => a.mastery_score - b.mastery_score);
}

export async function listExamMistakes(userId: string) {
  if (isDemo(userId)) return loadDemoStore().mistakes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await supabaseAdmin.from("mistakes").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error("FAILED_TO_READ_MISTAKES");
  return data as ExamMistake[];
}

export async function listExamStudyLogs(userId: string) {
  if (isDemo(userId)) return loadDemoStore().studyLogs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await supabaseAdmin.from("study_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error("FAILED_TO_READ_STUDY_LOGS");
  return data as ExamStudyLog[];
}

export async function listExamMockExams(userId: string) {
  if (isDemo(userId)) return loadDemoStore().mockExams.sort((a, b) => b.date.localeCompare(a.date));
  const { data, error } = await supabaseAdmin.from("mock_exams").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) throw new Error("FAILED_TO_READ_MOCK_EXAMS");
  return data as ExamMockExam[];
}

function buildTodayPath(chapters: ExamChapter[]): DailyStudyTask[] {
  const scored = chapters.map((chapter) => {
    const days = chapter.last_reviewed_at ? Math.floor((Date.now() - new Date(chapter.last_reviewed_at).getTime()) / 86400000) : 14;
    const priority = Math.round((Math.min(chapter.wrong_count / 20, 1) * 100 * 0.5 + Math.min(days / 14, 1) * 100 * 0.3 + chapter.exam_weight * 0.2) * 10) / 10;
    return { chapter, priority };
  }).sort((a, b) => b.priority - a.priority);

  const subjectCounts = new Map<string, number>();
  const selected = scored.filter(({ chapter }) => {
    const count = subjectCounts.get(chapter.subject) ?? 0;
    if (count >= 2) return false;
    subjectCounts.set(chapter.subject, count + 1);
    return true;
  }).slice(0, 3);

  return selected.map(({ chapter, priority }, index) => ({
    rank: index + 1,
    subject: chapter.subject,
    chapter: chapter.chapter_name,
    action: chapter.wrong_count > 0 ? "错题复盘" : chapter.mastery_score < 60 ? "基础训练" : "巩固练习",
    questionCount: index === 2 ? 20 : 10,
    priority
  }));
}

export async function getExamDashboard(userId: string): Promise<ExamDashboardSnapshot> {
  const [chapters, logs] = await Promise.all([listExamChapters(userId), listExamStudyLogs(userId)]);
  const subjectMastery = SUBJECTS.map((subject) => {
    const rows = chapters.filter((item) => item.subject === subject);
    return {
      subject,
      mastery: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.mastery_score, 0) / rows.length) : 0,
      questionCount: rows.reduce((sum, item) => sum + item.mastered_count + item.wrong_count, 0),
      wrongCount: rows.reduce((sum, item) => sum + item.wrong_count, 0)
    };
  });
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((log) => log.created_at.slice(0, 10) === todayKey);
  const todayQuestions = todayLogs.reduce((sum, log) => sum + log.question_count, 0);
  const todayWrong = todayLogs.reduce((sum, log) => sum + log.wrong_count, 0);
  const weeklyMinutes = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10);
    return { date, minutes: logs.filter((log) => log.created_at.slice(0, 10) === date).reduce((sum, log) => sum + log.minutes, 0) };
  });
  return {
    subjectMastery,
    weakestChapters: chapters.slice(0, 3),
    todayPath: buildTodayPath(chapters),
    weeklyMinutes,
    todayMinutes: todayLogs.reduce((sum, log) => sum + log.minutes, 0),
    todayQuestions,
    todayWrong,
    todayAccuracy: todayQuestions ? Math.round(((todayQuestions - todayWrong) / todayQuestions) * 100) : 0
  };
}

type Resource = "chapters" | "mistakes" | "study-logs" | "mock-exams";

export async function createExamResource(userId: string, resource: Resource, input: Record<string, unknown>) {
  const createdAt = now();
  if (isDemo(userId)) {
    const store = loadDemoStore();
    if (resource === "chapters") store.chapters.push({ id: id(), user_id: userId, mastery_score: 0, manual_mastery_score: null, wrong_count: 0, mastered_count: 0, review_count: 0, trend: "flat", exam_weight: 50, last_reviewed_at: null, updated_at: createdAt, ...input } as ExamChapter);
    if (resource === "mistakes") store.mistakes.push({ id: id(), user_id: userId, review_count: 0, is_mastered: false, ai_analysis: null, created_at: createdAt, updated_at: createdAt, ...input } as ExamMistake);
    if (resource === "study-logs") store.studyLogs.push({ id: id(), user_id: userId, created_at: createdAt, ...input } as ExamStudyLog);
    if (resource === "mock-exams") store.mockExams.push({ id: id(), user_id: userId, created_at: createdAt, updated_at: createdAt, ...input } as ExamMockExam);
    saveDemoStore(store);
    return { ok: true };
  }
  const table = resource.replace("-", "_");
  const { error } = await supabaseAdmin.from(table).insert({ ...input, user_id: userId });
  if (error) throw new Error(`FAILED_TO_CREATE_${resource}`);
  return { ok: true };
}

export async function updateExamResource(userId: string, resource: Resource, resourceId: string, input: Record<string, unknown>) {
  const updatedAt = now();
  if (isDemo(userId)) {
    const store = loadDemoStore();
    const collection = resource === "chapters" ? store.chapters : resource === "mistakes" ? store.mistakes : resource === "study-logs" ? store.studyLogs : store.mockExams;
    const index = collection.findIndex((item) => item.id === resourceId && item.user_id === userId);
    if (index < 0) throw new Error("RESOURCE_NOT_FOUND");
    collection[index] = { ...collection[index], ...input, ...(resource === "study-logs" ? {} : { updated_at: updatedAt }) } as never;
    saveDemoStore(store);
    return { ok: true };
  }
  const table = resource.replace("-", "_");
  const payload = resource === "study-logs" ? input : { ...input, updated_at: updatedAt };
  const { error } = await supabaseAdmin.from(table).update(payload).eq("id", resourceId).eq("user_id", userId);
  if (error) throw new Error(`FAILED_TO_UPDATE_${resource}`);
  return { ok: true };
}

export async function deleteExamResource(userId: string, resource: Resource, resourceId: string) {
  if (isDemo(userId)) {
    const store = loadDemoStore();
    if (resource === "chapters") store.chapters = store.chapters.filter((item) => item.id !== resourceId);
    if (resource === "mistakes") store.mistakes = store.mistakes.filter((item) => item.id !== resourceId);
    if (resource === "study-logs") store.studyLogs = store.studyLogs.filter((item) => item.id !== resourceId);
    if (resource === "mock-exams") store.mockExams = store.mockExams.filter((item) => item.id !== resourceId);
    saveDemoStore(store);
    return { ok: true };
  }
  const table = resource.replace("-", "_");
  const { error } = await supabaseAdmin.from(table).delete().eq("id", resourceId).eq("user_id", userId);
  if (error) throw new Error(`FAILED_TO_DELETE_${resource}`);
  return { ok: true };
}

export async function saveMistakeAnalysis(userId: string, mistakeId: string, analysis: Record<string, unknown>) {
  return updateExamResource(userId, "mistakes", mistakeId, {
    ai_analysis: analysis,
    wrong_reason: typeof analysis.errorTypeLabel === "string" ? analysis.errorTypeLabel : "AI 已分析"
  });
}

function stringifyAnswer(answer: QuestionPayload["answer"]) {
  if (typeof answer === "boolean") return answer ? "正确" : "错误";
  if (Array.isArray(answer)) return answer.join("、");
  if (typeof answer === "string") return answer;
  return answer.sampleSolution;
}

export async function recordPracticeOutcome(params: {
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: "easy" | "medium" | "hard";
  question: QuestionPayload;
  selectedAnswer: string;
  correct: boolean;
  chaseMode: boolean;
}) {
  const subject = (findSubjectByKnowledgePoint(params.knowledgePoint) ?? "中级会计实务") as ExamSubject;
  const chapterName = params.knowledgePoint.split(" / ")[0] || params.knowledgePoint;
  const chapters = await listExamChapters(params.userId);
  const chapter = chapters.find((item) => item.subject === subject && item.chapter_name === chapterName);
  if (chapter) {
    const next = {
      wrong_count: chapter.wrong_count + (params.correct ? 0 : 1),
      mastered_count: chapter.mastered_count + (params.correct ? 1 : 0),
      review_count: chapter.review_count + (params.chaseMode ? 1 : 0),
      last_reviewed_at: now(),
      manual_mastery_score: chapter.manual_mastery_score,
      trend: chapter.trend
    };
    const score = calculateMastery(next);
    await updateExamResource(params.userId, "chapters", chapter.id, {
      ...next,
      mastery_score: score,
      trend: score > chapter.mastery_score + 3 ? "up" : score < chapter.mastery_score - 3 ? "down" : "flat"
    });
  }
  if (!params.correct) {
    await createExamResource(params.userId, "mistakes", {
      subject,
      chapter: chapterName,
      question: params.question.question,
      my_answer: params.selectedAnswer || "未作答",
      correct_answer: stringifyAnswer(params.question.answer),
      wrong_reason: "待 AI 分析",
      question_type: params.questionType,
      difficulty: params.difficulty
    });
  }
}
