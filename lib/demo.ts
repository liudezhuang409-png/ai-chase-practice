import { cookies } from "next/headers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAnswerAnalysis } from "@/lib/answer-analysis";
import { publicEnv, serverEnv } from "@/lib/env";
import { findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import type {
  AppUser,
  CreateOrderResponse,
  DifficultyLevel,
  MasteryLevel,
  MockExamConfig,
  MockExamGeneratedQuestion,
  MockExamPaper,
  MockExamReport,
  PaymentChannel,
  PaymentOrder,
  PracticeMode,
  PracticeSession,
  QuestionPayload,
  QuestionType,
  SubjectiveAIReview,
  StudyPlanInput,
  StudyPlanPayload,
  StudyStyle,
  SubmissionVerdict,
  SubmitAnswerResponse,
  UserStudyPlanRecord,
  UserKnowledgeSnapshot,
  UserPlan,
  UserStatsSnapshot,
  WrongReviewItem
} from "@/lib/types";
import { clamp, createOrderNo, startOfChinaDayIso } from "@/lib/utils";

const DEMO_COOKIE = "ai_chase_demo";
const DEMO_USER_ID = "demo-user";
const DEMO_EMAIL = "demo@aichase.local";
const PRO_PRICE_FEN = 990;
const DEMO_STATE_FILE = path.join(process.cwd(), ".codex", "demo-store.json");

type DemoPracticeLog = {
  id: string;
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  verdict: SubmissionVerdict;
  correct: boolean;
  createdAt: string;
  chaseMode: boolean;
};

type DemoStore = {
  planByUserId: Map<string, UserPlan>;
  sessions: Map<string, PracticeSession>;
  orders: Map<string, PaymentOrder>;
  practiceDatesByUserId: Map<string, string[]>;
  logs: DemoPracticeLog[];
  studyPlansByUserId: Map<string, UserStudyPlanRecord>;
  mockExamPapers: Map<string, MockExamPaper>;
};

type PersistedDemoStore = {
  planByUserId: Array<[string, UserPlan]>;
  sessions: Array<[string, PracticeSession]>;
  orders: Array<[string, PaymentOrder]>;
  practiceDatesByUserId: Array<[string, string[]]>;
  logs: DemoPracticeLog[];
  studyPlansByUserId: Array<[string, UserStudyPlanRecord]>;
  mockExamPapers: Array<[string, MockExamPaper]>;
};

function createDefaultDemoStore(): DemoStore {
  return {
    planByUserId: new Map([[DEMO_USER_ID, "free"]]),
    sessions: new Map(),
    orders: new Map(),
    practiceDatesByUserId: new Map(),
    logs: [],
    studyPlansByUserId: new Map(),
    mockExamPapers: new Map()
  };
}

function loadPersistedDemoStore(): DemoStore {
  try {
    if (!existsSync(DEMO_STATE_FILE)) {
      return createDefaultDemoStore();
    }

    const raw = readFileSync(DEMO_STATE_FILE, "utf8").trim();
    if (!raw) {
      return createDefaultDemoStore();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDemoStore>;

    return {
      planByUserId: new Map(parsed.planByUserId ?? [[DEMO_USER_ID, "free"]]),
      sessions: new Map(parsed.sessions ?? []),
      orders: new Map(parsed.orders ?? []),
      practiceDatesByUserId: new Map(parsed.practiceDatesByUserId ?? []),
      logs: parsed.logs ?? [],
      studyPlansByUserId: new Map(parsed.studyPlansByUserId ?? []),
      mockExamPapers: new Map(parsed.mockExamPapers ?? [])
    };
  } catch {
    return createDefaultDemoStore();
  }
}

function persistDemoStore(store: DemoStore) {
  try {
    mkdirSync(path.dirname(DEMO_STATE_FILE), { recursive: true });
    const payload: PersistedDemoStore = {
      planByUserId: [...store.planByUserId.entries()],
      sessions: [...store.sessions.entries()],
      orders: [...store.orders.entries()],
      practiceDatesByUserId: [...store.practiceDatesByUserId.entries()],
      logs: store.logs,
      studyPlansByUserId: [...store.studyPlansByUserId.entries()],
      mockExamPapers: [...store.mockExamPapers.entries()]
    };
    writeFileSync(DEMO_STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // Demo persistence should never block the main learning flow.
  }
}

function getDemoStore(): DemoStore {
  const globalDemo = globalThis as typeof globalThis & {
    __AI_CHASE_DEMO_STORE__?: DemoStore;
  };

  if (!globalDemo.__AI_CHASE_DEMO_STORE__) {
    globalDemo.__AI_CHASE_DEMO_STORE__ = loadPersistedDemoStore();
  }

  return globalDemo.__AI_CHASE_DEMO_STORE__;
}

export function isDemoModeEnabled() {
  return (
    publicEnv.NEXT_PUBLIC_SUPABASE_URL === "https://example.supabase.co" &&
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key"
  );
}

export function isPlaceholderOpenAI() {
  return serverEnv.OPENAI_API_KEY === "placeholder-openai-api-key";
}

export function isPlaceholderDashScope() {
  return serverEnv.DASHSCOPE_API_KEY === "placeholder-dashscope-api-key";
}

export function isPlaceholderDeepSeek() {
  return serverEnv.DEEPSEEK_API_KEY === "placeholder-deepseek-api-key";
}

export function isPlaceholderAI() {
  if (serverEnv.AI_PROVIDER === "dashscope") {
    return isPlaceholderDashScope();
  }

  if (serverEnv.AI_PROVIDER === "deepseek") {
    return isPlaceholderDeepSeek();
  }

  return isPlaceholderOpenAI();
}

export function getDemoUser(): AppUser {
  return {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    source: "demo"
  };
}

export async function getDemoUserFromCookie(): Promise<AppUser | null> {
  if (!isDemoModeEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(DEMO_COOKIE)?.value === "1" ? getDemoUser() : null;
}

export async function enableDemoSession() {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax"
  });
}

export async function clearDemoSession() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
}

export function getDemoPlan(userId: string): UserPlan {
  return getDemoStore().planByUserId.get(userId) ?? "free";
}

export function getDemoPracticeCount(userId: string) {
  const today = startOfChinaDayIso();
  const records = getDemoStore().practiceDatesByUserId.get(userId) ?? [];
  return records.filter((item) => item >= today).length;
}

export function recordDemoPractice(userId: string) {
  const store = getDemoStore();
  const current = store.practiceDatesByUserId.get(userId) ?? [];
  current.push(new Date().toISOString());
  store.practiceDatesByUserId.set(userId, current);
  persistDemoStore(store);
}

function getMasteryLevel(wrongCount: number, accuracyRate: number): MasteryLevel {
  if (wrongCount >= 6 || accuracyRate < 0.45) {
    return "warning";
  }

  if (wrongCount >= 3 || accuracyRate < 0.65) {
    return "shaky";
  }

  if (accuracyRate < 0.85) {
    return "stable";
  }

  return "mastered";
}

function objectiveOptionsFor(point: string, type: QuestionType) {
  if (type === "judge") {
    return {
      A: "正确",
      B: "错误"
    };
  }

  return {
    A: `${point} 的核心口径需要结合题干条件判断。`,
    B: `${point} 的相关金额或指标应按题目给定资料计算。`,
    C: `${point} 的判断应回到定义、适用条件或公式口径。`,
    D: `${point} 的处理结果通常需要与其他相近考点区分。`
  };
}

function createFinancialAnalysisQuestion(params: {
  knowledgePoint?: string;
  difficulty: DifficultyLevel;
  chaseMode?: boolean;
}): QuestionPayload {
  if (/流动比率/.test(params.knowledgePoint ?? "")) {
    return {
      type: "single",
      question: params.chaseMode
        ? "下列各项比率中，分子与分母属于两个不同但相互关联项目，因而属于相关比率的是（ ）。"
        : "关于流动比率的性质，下列说法正确的是（ ）。",
      options: params.chaseMode
        ? {
            A: "流动资产 / 流动负债",
            B: "流动资产 / 资产总额",
            C: "本期营业收入 / 上期营业收入",
            D: "利润总额 / 营业收入"
          }
        : {
            A: "流动比率属于动态比率，用于反映不同时期指标变化",
            B: "流动比率属于构成比率，用于反映流动资产占资产总额的比例",
            C: "流动比率属于相关比率，用于反映流动资产与流动负债之间的关系",
            D: "流动比率属于效率比率，用于反映投入与产出的关系"
          },
      answer: params.chaseMode ? "A" : "C",
      analysis: params.chaseMode
        ? "流动资产与流动负债是不同但相互关联的项目，流动资产/流动负债属于相关比率。"
        : "流动比率=流动资产/流动负债，反映两个相关项目之间的关系，属于相关比率。",
      difficulty: params.difficulty,
      knowledgePoint: "流动比率",
      source: "ai",
      score: 2,
      examTips: ["先看分子分母关系", "流动比率属于相关比率"]
    };
  }

  if (params.difficulty === "easy") {
    return {
      type: "single",
      question: "企业所有者关注投入资本是否保值增值，进行财务分析时通常最重视的指标类别是（ ）。",
      options: {
        A: "偿债能力指标",
        B: "营运能力指标",
        C: "盈利能力指标",
        D: "发展能力指标"
      },
      answer: "C",
      analysis: "所有者作为投资人，最关心资本保值增值和投资回报，因此通常更重视盈利能力指标。",
      difficulty: params.difficulty,
      knowledgePoint: "财务分析与评价",
      source: "ai",
      score: 2,
      examTips: ["先判断分析主体", "所有者关注盈利能力"]
    };
  }

  return {
    type: "single",
    question: "甲公司本年营业收入为1 200万元，应收账款平均余额为300万元。反映其应收账款周转效率的指标是（ ）。",
    options: {
      A: "流动比率",
      B: "应收账款周转率",
      C: "销售净利率",
      D: "资本保值增值率"
    },
    answer: "B",
    analysis: "应收账款周转率反映应收账款变现速度和管理效率，属于营运能力分析指标。",
    difficulty: params.difficulty,
    knowledgePoint: "财务分析与评价",
    source: "ai",
    score: 2,
    examTips: params.chaseMode ? ["同点变式看指标归类", "营运能力看周转效率"] : ["先识别指标用途", "周转率多属营运能力"]
  };
}

function createInventoryQuestion(params: { difficulty: DifficultyLevel }): QuestionPayload {
  return {
    type: "single",
    question: "甲公司购入材料价款100万元，运输费2万元，途中合理损耗不另计价。该批材料入账成本为（ ）万元。",
    options: { A: "98", B: "100", C: "102", D: "104" },
    answer: "C",
    analysis: "外购存货成本包括购买价款、相关税费、运输费等，合理损耗计入存货成本，不从成本中扣除。",
    difficulty: params.difficulty,
    knowledgePoint: "存货",
    source: "ai",
    score: 2,
    examTips: ["合理损耗计入成本", "先列入账成本项目"]
  };
}

function createLongTermEquityQuestion(params: { difficulty: DifficultyLevel }): QuestionPayload {
  return {
    type: "single",
    question: "投资方能够对被投资单位施加重大影响但不构成控制，该长期股权投资后续计量通常采用（ ）。",
    options: { A: "成本法", B: "权益法", C: "公允价值模式", D: "摊余成本法" },
    answer: "B",
    analysis: "对联营企业投资具有重大影响，长期股权投资后续计量通常采用权益法。",
    difficulty: params.difficulty,
    knowledgePoint: "长期股权投资",
    source: "ai",
    score: 2,
    examTips: ["重大影响对应权益法", "先判断投资关系"]
  };
}

function createPartnershipQuestion(params: { difficulty: DifficultyLevel }): QuestionPayload {
  return {
    type: "single",
    question: "下列主体中，可以成为普通合伙企业普通合伙人的是（ ）。",
    options: { A: "上市公司", B: "国有独资公司", C: "普通有限责任公司", D: "公益性事业单位" },
    answer: "C",
    analysis: "上市公司、国有独资公司、国有企业及公益性事业单位、社会团体不得成为普通合伙人，普通有限责任公司可以成为普通合伙人。",
    difficulty: params.difficulty,
    knowledgePoint: "合伙企业法律制度",
    source: "ai",
    score: 2,
    examTips: ["普通合伙人看主体限制", "记住禁止主体清单"]
  };
}

function getDifficultyTips(difficulty: DifficultyLevel) {
  if (difficulty === "easy") {
    return ["先判断考点归属", "注意题干中的否定词和范围词"];
  }

  if (difficulty === "medium") {
    return ["留意易混淆分录", "先排除明显错误选项再做判断"];
  }

  return ["这是冲刺提升题，先识别关键条件", "先想准则边界，再看答案表达"];
}

function getRecommendedDifficultyLocal(params: {
  currentDifficulty: DifficultyLevel;
  correct: boolean;
  verdict: SubmissionVerdict;
}): DifficultyLevel {
  if (params.verdict === "confused") {
    return "easy";
  }

  if (!params.correct) {
    return params.currentDifficulty === "hard" ? "medium" : "easy";
  }

  if (params.currentDifficulty === "easy") {
    return "medium";
  }

  if (params.currentDifficulty === "medium") {
    return "hard";
  }

  return "hard";
}

export function createDemoQuestion(params: {
  subject?: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode?: PracticeMode;
  chaseMode?: boolean;
  lastWrongReason?: string;
}): QuestionPayload {
  const point = params.knowledgePoint.trim();
  if (params.questionType === "single" && /财务分析与评价|流动比率|速动比率|现金比率|偿债能力/.test(point)) {
    return createFinancialAnalysisQuestion({
      knowledgePoint: point,
      difficulty: params.difficulty,
      chaseMode: params.chaseMode
    });
  }
  if (params.questionType === "single" && /存货/.test(point)) {
    return createInventoryQuestion({ difficulty: params.difficulty });
  }
  if (params.questionType === "single" && /长期股权投资|长投/.test(point)) {
    return createLongTermEquityQuestion({ difficulty: params.difficulty });
  }
  if (params.questionType === "single" && /合伙企业/.test(point)) {
    return createPartnershipQuestion({ difficulty: params.difficulty });
  }

  const chaseLabel = params.chaseMode ? "强化变式题" : params.practiceMode === "mock-exam" ? "模拟考试题" : "首轮题";
  const difficultyText =
    params.difficulty === "easy" ? "基础梳理" : params.difficulty === "medium" ? "进阶巩固" : "冲刺提升";
  const focus = params.lastWrongReason ? `重点追打：${params.lastWrongReason}` : "重点考查会计实务中的易错点";
  const options = objectiveOptionsFor(point, params.questionType);

  if (params.questionType === "single") {
    return {
      type: "single",
      question: `【${chaseLabel} / ${difficultyText}】关于「${point}」，下列说法正确的是（ ）。`,
      options,
      answer: "C",
      analysis: `本题考查「${point}」的基础判断口径。作答时应先回到定义、适用条件或公式，再排除与题干条件不匹配的选项。`,
      difficulty: params.difficulty,
      knowledgePoint: point,
      source: "ai",
      score: 2,
      examTips: getDifficultyTips(params.difficulty)
    };
  }

  if (params.questionType === "multiple") {
    return {
      type: "multiple",
      question: `【${chaseLabel} / ${difficultyText}】关于「${point}」，下列哪些表述更符合准则要求？`,
      options,
      answer: ["A", "C"],
      analysis: `${focus}。多选题要先判断每个选项本身是否成立，再组合。`,
      difficulty: params.difficulty,
      knowledgePoint: point,
      source: "ai",
      score: 4,
      examTips: getDifficultyTips(params.difficulty)
    };
  }

  if (params.questionType === "judge") {
    return {
      type: "judge",
      question: `【${chaseLabel} / ${difficultyText}】判断：企业在处理「${point}」时，只要业务真实发生，就一定可以立即确认。`,
      options,
      answer: false,
      analysis: `${focus}。判断题的关键不是背“对/错”，而是抓住“是否一定”“是否同时满足条件”这类绝对表述。`,
      difficulty: params.difficulty,
      knowledgePoint: point,
      source: "ai",
      score: 1,
      examTips: getDifficultyTips(params.difficulty)
    };
  }

  if (params.questionType === "calculation") {
    return {
      type: "calculation",
      question: `【${chaseLabel} / ${difficultyText}】围绕「${point}」设计一题计算分析：请写出核心计算过程、关键会计处理步骤，并说明最终结论。`,
      options: null,
      answer: {
        keyPoints: ["列出已知条件并识别计算口径", "写出核心公式或分录逻辑", "给出最终金额或结论并校验合理性"],
        sampleSolution: `先识别 ${point} 的计量基础，再按题干条件计算关键金额，最后落到准则要求的确认与披露结论。`
      },
      analysis: `${focus}。计算分析题重点不是凑字数，而是“口径正确 + 过程完整 + 结论落地”。`,
      difficulty: params.difficulty,
      knowledgePoint: point,
      source: "ai",
      score: 10,
      examTips: getDifficultyTips(params.difficulty)
    };
  }

  return {
    type: "comprehensive",
    question: `【${chaseLabel} / ${difficultyText}】围绕「${point}」给出综合题：请从确认、计量、分录和披露四个维度组织答案。`,
    options: null,
    answer: {
      keyPoints: ["识别业务实质与准则范围", "拆分多个子步骤逐项处理", "补全关键分录或计算", "总结披露与风险点"],
      sampleSolution: `先判断 ${point} 所属准则，再分步骤完成确认、计量和会计处理，最后补充披露与考试易错提醒。`
    },
    analysis: `${focus}。综合题要像阅卷老师一样分点写，别把多个处理步骤糊成一段。`,
    difficulty: params.difficulty,
    knowledgePoint: point,
    source: "ai",
    score: 18,
    examTips: getDifficultyTips(params.difficulty)
  };
}

export function createDemoSession(params: {
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode: PracticeMode;
  questionPayload: QuestionPayload;
  chaseMode: boolean;
}): PracticeSession {
  const session: PracticeSession = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    knowledge_point: params.knowledgePoint,
    question_type: params.questionType,
    difficulty: params.difficulty,
    practice_mode: params.practiceMode,
    question_payload: params.questionPayload,
    chase_mode: params.chaseMode,
    status: "generated",
    selected_answer: null,
    self_assessment: null,
    is_correct: null,
    generated_at: new Date().toISOString(),
    answered_at: null
  };

  const store = getDemoStore();
  store.sessions.set(session.id, session);
  if (params.questionPayload.source === "ai") {
    recordDemoPractice(params.userId);
  }
  persistDemoStore(store);
  return session;
}

export function getDemoSession(sessionId: string, userId: string) {
  const session = getDemoStore().sessions.get(sessionId) ?? null;
  if (!session || session.user_id !== userId) {
    return null;
  }

  return session;
}

function serializeDemoAnswer(answer: QuestionPayload["answer"]) {
  if (typeof answer === "boolean") {
    return answer ? "A" : "B";
  }

  if (Array.isArray(answer)) {
    return answer.join(",");
  }

  if (typeof answer === "string") {
    return answer;
  }

  return answer.keyPoints.join(" / ");
}

function parseSelectedAnswer(answer: string | undefined) {
  if (!answer) {
    return [];
  }

  return answer
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

function evaluateDemoAnswer(params: {
  question: QuestionPayload;
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  markedConfused?: boolean;
}): { correct: boolean; verdict: SubmissionVerdict } {
  if (params.markedConfused || params.selfAssessment === "confused") {
    return {
      correct: false,
      verdict: "confused" as SubmissionVerdict
    };
  }

  const { question, selectedAnswer } = params;

  if (question.type === "single") {
    return {
      correct: selectedAnswer === question.answer,
      verdict: selectedAnswer === question.answer ? "correct" : "wrong"
    };
  }

  if (question.type === "multiple") {
    const actual = parseSelectedAnswer(selectedAnswer);
    const expected = [...(question.answer as string[])].sort();
    const correct = JSON.stringify(actual) === JSON.stringify(expected);
    return {
      correct,
      verdict: correct ? "correct" : "wrong"
    };
  }

  if (question.type === "judge") {
    const expected = question.answer ? "A" : "B";
    return {
      correct: selectedAnswer === expected,
      verdict: selectedAnswer === expected ? "correct" : "wrong"
    };
  }

  const verdict = params.selfAssessment ?? "wrong";
  return {
    correct: verdict === "correct",
    verdict
  };
}

function recordDemoLog(params: {
  userId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  verdict: SubmissionVerdict;
  correct: boolean;
  chaseMode: boolean;
}) {
  const store = getDemoStore();
  store.logs.unshift({
    id: crypto.randomUUID(),
    userId: params.userId,
    knowledgePoint: params.knowledgePoint,
    questionType: params.questionType,
    difficulty: params.difficulty,
    verdict: params.verdict,
    correct: params.correct,
    chaseMode: params.chaseMode,
    createdAt: new Date().toISOString()
  });
  persistDemoStore(store);
}

export function answerDemoSession(params: {
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
}): SubmitAnswerResponse | null {
  const session = getDemoSession(params.sessionId, params.userId);
  if (!session) {
    return null;
  }

  const question = session.question_payload;
  const evaluated = evaluateDemoAnswer({
    question,
    selectedAnswer: params.selectedAnswer,
    selfAssessment: params.selfAssessment,
    markedConfused: params.markedConfused
  });
  const correct = params.resolvedCorrect ?? evaluated.correct;
  const verdict = params.resolvedVerdict ?? evaluated.verdict;

  if (session.status === "generated") {
    const store = getDemoStore();
    session.status = "answered";
    session.selected_answer = params.selectedAnswer ?? null;
    session.self_assessment = verdict;
    session.is_correct = correct;
    session.answered_at = new Date().toISOString();
    if (params.analysisOverride) {
      session.question_payload = {
        ...session.question_payload,
        analysis: params.analysisOverride
      };
    }
    store.sessions.set(session.id, session);
    recordDemoLog({
      userId: params.userId,
      knowledgePoint: session.knowledge_point,
      questionType: session.question_type,
      difficulty: session.difficulty,
      verdict,
      correct,
      chaseMode: session.chase_mode
    });
    persistDemoStore(store);
  }

  const summary = getDemoKnowledgeSummary(params.userId)
    .find((item) => item.knowledgePoint === session.knowledge_point);
  const correctAnswer = serializeCorrectAnswer(question.answer);
  const correctOption =
    question.options && typeof question.answer === "string"
      ? `${question.answer}（${question.options[question.answer as keyof typeof question.options] ?? correctAnswer}）`
      : correctAnswer;
  const originalStem = question.question.replace(/\s+/g, " ").slice(0, 90);

  return {
    correct,
    correctAnswer: question.answer,
    analysis: params.analysisOverride ?? question.analysis,
    answerAnalysis: question.source !== "ai"
      ? undefined
      : buildAnswerAnalysis({
          question,
          selectedAnswer: params.selectedAnswer ?? session.selected_answer,
          analysis: params.analysisOverride ?? question.analysis
        }),
    shouldChase: !correct,
    nextPromptHint: correct
      ? "本轮已答对，可以继续提难度或切换题型。"
      : `用户在「${session.knowledge_point}」的 ${session.question_type} 题上还不够稳定。原题：${originalStem}；正确口径：${correctOption}。下一题必须保持同一微考点和同题型，只更换主体、数据、问法或干扰项。`,
    masteryLevel: summary?.mastery ?? "warning",
    verdict,
    gradingSource: params.gradingSource ?? "self",
    aiReview: params.aiReview ?? null,
    recommendedNextDifficulty: getRecommendedDifficultyLocal({
      currentDifficulty: session.difficulty,
      correct,
      verdict
    })
  };
}

export function createDemoOrder(userId: string, channel: PaymentChannel): CreateOrderResponse {
  const orderNo = createOrderNo();
  const targetPlan = "pro";
  const amount = PRO_PRICE_FEN;
  const order: PaymentOrder = {
    id: crypto.randomUUID(),
    user_id: userId,
    order_no: orderNo,
    channel,
    plan_target: targetPlan,
    amount_fen: amount,
    status: "pending",
    provider_trade_no: null,
    provider_payload: { mode: "demo" },
    created_at: new Date().toISOString(),
    paid_at: null
  };

  const store = getDemoStore();
  store.orders.set(orderNo, order);
  persistDemoStore(store);

  return {
    orderNo,
    channel,
    status: "pending",
    payUrl: `${publicEnv.APP_URL}/pay?orderNo=${orderNo}&demoPay=1`,
    qrPayload: `demo:${channel}:${orderNo}`,
    amountFen: amount
  };
}

export function getDemoOrder(orderNo: string, userId: string) {
  const order = getDemoStore().orders.get(orderNo) ?? null;
  if (!order || order.user_id !== userId) {
    return null;
  }

  return order;
}

export function markDemoOrderPaid(orderNo: string, userId: string) {
  const order = getDemoOrder(orderNo, userId);
  if (!order) {
    return null;
  }

  if (order.status !== "paid") {
    const store = getDemoStore();
    order.status = "paid";
    order.paid_at = new Date().toISOString();
    order.provider_trade_no = `demo_trade_${orderNo}`;
    store.orders.set(orderNo, order);
    store.planByUserId.set(userId, order.plan_target);
    persistDemoStore(store);
  }

  return order;
}

export function getDemoKnowledgeSummary(userId: string): UserKnowledgeSnapshot[] {
  const logs = getDemoStore().logs.filter((item) => item.userId === userId);
  const grouped = new Map<string, DemoPracticeLog[]>();

  for (const log of logs) {
    const current = grouped.get(log.knowledgePoint) ?? [];
    current.push(log);
    grouped.set(log.knowledgePoint, current);
  }

  return [...grouped.entries()]
    .map(([knowledgePoint, items]) => {
      const attempts = items.length;
      const wrongCount = items.filter((item) => !item.correct).length;
      const accuracyRate = attempts === 0 ? 0 : (attempts - wrongCount) / attempts;
      return {
        knowledgePoint,
        mastery: getMasteryLevel(wrongCount, accuracyRate),
        heat: clamp(wrongCount * 20 + Math.round((1 - accuracyRate) * 40), 10, 100),
        wrongCount,
        totalAttempts: attempts,
        accuracyRate,
        lastPracticedAt: items[0]?.createdAt ?? null,
        recommendedTypes: [...new Set(items.filter((item) => !item.correct).map((item) => item.questionType))]
      } satisfies UserKnowledgeSnapshot;
    })
    .sort((a, b) => b.heat - a.heat);
}

export function getDemoStats(userId: string): UserStatsSnapshot {
  const logs = getDemoStore().logs.filter((item) => item.userId === userId);
  const totalPractices = logs.length;
  const correctCount = logs.filter((item) => item.correct).length;
  const confusedCount = logs.filter((item) => item.verdict === "confused").length;
  const weakestKnowledge = getDemoKnowledgeSummary(userId).slice(0, 6);
  const dailyTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const dateKey = date.toISOString().slice(0, 10);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    const items = logs.filter((item) => item.createdAt.slice(0, 10) === dateKey);
    const attempts = items.length;
    const correct = items.filter((item) => item.correct).length;

    return {
      dateKey,
      label,
      attempts,
      correctRate: attempts === 0 ? 0 : correct / attempts
    };
  });
  const typeAccuracy = (["single", "multiple", "judge", "calculation", "comprehensive"] as QuestionType[])
    .map((type) => {
      const items = logs.filter((item) => item.questionType === type);
      const attempts = items.length;
      const correct = items.filter((item) => item.correct).length;
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
    streakDays: Math.min(new Set(logs.map((item) => item.createdAt.slice(0, 10))).size, 7),
    dailyTrend,
    weakestKnowledge,
    typeAccuracy,
    masteryHeatmap: weakestKnowledge
  };
}

export function getDemoRecentWrongQuestions(userId: string) {
  const logs = getDemoStore().logs.filter((item) => item.userId === userId && !item.correct);
  const sessions = [...getDemoStore().sessions.values()];
  const grouped = new Map<string, DemoPracticeLog[]>();

  for (const log of logs) {
    const key = `${log.knowledgePoint}::${log.questionType}::${log.difficulty}`;
    const current = grouped.get(key) ?? [];
    current.push(log);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const [knowledgePoint, questionType, difficulty] = key.split("::");
      const latest = items[0];
      const session = sessions.find(
        (item) =>
          item.user_id === userId &&
          item.knowledge_point === knowledgePoint &&
          item.question_type === questionType &&
          item.difficulty === difficulty &&
          item.generated_at <= latest.createdAt
      );
      const subject = findSubjectByKnowledgePoint(knowledgePoint) ?? "未分类科目";
      const daysSinceLastPractice = Math.max(
        0,
        Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      );
      const recencyBoost = Math.max(0, 14 - daysSinceLastPractice);
      const priorityScore = items.length * 10 + recencyBoost;
      const priorityLabel: WrongReviewItem["priorityLabel"] =
        items.length >= 3 || daysSinceLastPractice <= 2
          ? "高优先"
          : items.length >= 2 || daysSinceLastPractice <= 7
            ? "优先回补"
            : "安排巩固";

      return {
        id: latest.id,
        subject,
        knowledgePoint,
        questionType: questionType as WrongReviewItem["questionType"],
        difficulty: difficulty as WrongReviewItem["difficulty"],
        wrongCount: items.length,
        lastPracticedAt: latest.createdAt,
        promptHint: `${subject} · ${knowledgePoint} · ${questionType} · ${difficulty}`,
        question: session?.question_payload ?? null,
        priorityScore,
        priorityLabel
      } satisfies WrongReviewItem;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.wrongCount - a.wrongCount)
    .slice(0, 12);
}

export function getDemoTodayPracticeLogs(userId: string) {
  const startIso = startOfChinaDayIso();

  return getDemoStore().logs.filter((item) => item.userId === userId && item.createdAt >= startIso);
}

export function createDemoMockExamPaper(params: {
  userId: string;
  examName: string;
  config: MockExamConfig;
  generatedQuestions: MockExamGeneratedQuestion[];
}) {
  const paper: MockExamPaper = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    exam_name: params.examName,
    config: params.config,
    generated_questions: params.generatedQuestions,
    score: null,
    weakness_report: null,
    created_at: new Date().toISOString()
  };

  const store = getDemoStore();
  store.mockExamPapers.set(paper.id, paper);
  persistDemoStore(store);
  return paper;
}

export function getDemoMockExamPaper(paperId: string, userId: string) {
  const paper = getDemoStore().mockExamPapers.get(paperId) ?? null;

  if (!paper || paper.user_id !== userId) {
    return null;
  }

  return paper;
}

export function getLatestDemoMockExamPaper(userId: string) {
  return [...getDemoStore().mockExamPapers.values()]
    .filter((paper) => paper.user_id === userId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
}

export function saveDemoMockExamReport(params: {
  userId: string;
  paperId: string;
  report: MockExamReport;
}) {
  const paper = getDemoMockExamPaper(params.paperId, params.userId);

  if (!paper) {
    return null;
  }

  const store = getDemoStore();
  paper.score = params.report.earnedScore;
  paper.weakness_report = params.report;
  store.mockExamPapers.set(paper.id, paper);
  persistDemoStore(store);
  return paper;
}

export function getRecommendedDifficulty(params: {
  currentDifficulty: DifficultyLevel;
  correct: boolean;
  verdict: SubmissionVerdict;
}): DifficultyLevel {
  return getRecommendedDifficultyLocal(params);
}

export function serializeCorrectAnswer(answer: QuestionPayload["answer"]) {
  return serializeDemoAnswer(answer);
}

export function getDemoStudyPlan(userId: string) {
  return getDemoStore().studyPlansByUserId.get(userId) ?? null;
}

export function saveDemoStudyPlan(params: {
  userId: string;
  input: StudyPlanInput;
  payload: StudyPlanPayload;
}) {
  const now = new Date().toISOString();
  const current = getDemoStore().studyPlansByUserId.get(params.userId);
  const plan: UserStudyPlanRecord = {
    id: current?.id ?? crypto.randomUUID(),
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
    created_at: current?.created_at ?? now,
    updated_at: now
  };

  const store = getDemoStore();
  store.studyPlansByUserId.set(params.userId, plan);
  persistDemoStore(store);
  return plan;
}

export function createDemoStudyPlanPayload(params: {
  input: StudyPlanInput;
  weakestKnowledge: UserKnowledgeSnapshot[];
}) {
  const { input, weakestKnowledge } = params;
  const primarySelectedTopic = input.selectedTopics[0] ?? "收入 / 收入的确认和计量的步骤";
  const secondarySelectedTopic = input.selectedTopics[1] ?? primarySelectedTopic;
  const tertiarySelectedTopic = input.selectedTopics[2] ?? secondarySelectedTopic ?? primarySelectedTopic;
  const topWeakness = weakestKnowledge[0]?.knowledgePoint ?? primarySelectedTopic;
  const secondaryWeakness = weakestKnowledge[1]?.knowledgePoint ?? secondarySelectedTopic;
  const tertiaryWeakness = weakestKnowledge[2]?.knowledgePoint ?? tertiarySelectedTopic;
  const focusTopics = [topWeakness, secondaryWeakness, tertiaryWeakness].filter(Boolean);
  const firstSubject = input.selectedSubjects[0] ?? "中级会计实务";
  const styleLabels: Record<StudyStyle, string> = {
    "short-bursts": "高频短练",
    "weekend-intensive": "周末集中",
    "mistake-first": "错题优先"
  };

  const taskMinutes = Math.max(10, Math.round(input.dailyMinutes / 3));
  const dailyQuestionCount = input.dailyMinutes >= 60 ? 3 : input.dailyMinutes >= 40 ? 2 : 1;

  return {
    planName: `${input.daysToExam}天${input.targetScore}分冲刺计划`,
    strategy: `先围绕${focusTopics[0]}补齐高频错题，再逐步拉升计算分析与综合题占比，整体节奏采用${styleLabels[input.studyStyle]}。`,
    summary: `根据你当前的薄弱点、每日可投入 ${input.dailyMinutes} 分钟和目标分数 ${input.targetScore} 分，系统建议先做 2 周基础回补，再做 4 周错题强化，最后进入模考冲刺。`,
    targetExam: input.targetExam,
    targetScore: input.targetScore,
    daysToExam: input.daysToExam,
    dailyMinutes: input.dailyMinutes,
    studyStyle: input.studyStyle,
    selectedSubjects: input.selectedSubjects,
    selectedTopics: input.selectedTopics,
    phases: [
      {
        name: "基础回补",
        weeks: "第1-2周",
        focus: focusTopics.slice(0, 2),
        goal: "先把高频失分考点重新打到 60% 以上正确率。",
        recommendedQuestionTypes: ["single", "multiple"],
        recommendedDifficulty: "easy",
        taskNotes: ["优先做错题变式", "控制每次训练在 20 分钟内"]
      },
      {
        name: "错题强化",
        weeks: "第3-6周",
        focus: focusTopics,
        goal: "围绕薄弱点做追击训练，减少重复失分。",
        recommendedQuestionTypes: ["multiple", "calculation"],
        recommendedDifficulty: "medium",
        taskNotes: ["同一知识点连续做对 2 题再切换", "开始增加计算分析题占比"]
      },
      {
        name: "冲刺模考",
        weeks: "第7周起",
        focus: input.selectedSubjects.length > 0 ? input.selectedSubjects : [firstSubject],
        goal: "把重点题型串起来，提前适应考试压力和节奏。",
        recommendedQuestionTypes: ["calculation", "comprehensive"],
        recommendedDifficulty: "hard",
        taskNotes: ["每周至少做 1 次模拟卷", "错题当天回看，隔天再强化"]
      }
    ],
    todayTasks: [
      {
        title: `优先补 ${focusTopics[0]}`,
        subject: firstSubject,
        knowledgePoint: focusTopics[0],
        questionType: "multiple",
        difficulty: "easy",
        practiceMode: "chase",
        count: dailyQuestionCount,
        estimatedMinutes: taskMinutes,
        reason: "这个考点最近反复失分，适合先做一轮追击题。"
      },
      {
        title: `确认 ${focusTopics[1] || focusTopics[0]} 的稳定度`,
        subject: input.selectedSubjects[1] ?? firstSubject,
        knowledgePoint: focusTopics[1] || focusTopics[0],
        questionType: "single",
        difficulty: "medium",
        practiceMode: "review",
        count: 1,
        estimatedMinutes: Math.max(8, Math.round(taskMinutes * 0.8)),
        reason: "先补一题确认边界条件，再决定要不要继续追。"
      },
      {
        title: "保留 1 道计算分析题",
        subject: input.selectedSubjects[0] ?? firstSubject,
        knowledgePoint: focusTopics[2] || focusTopics[0],
        questionType: "calculation",
        difficulty: input.dailyMinutes >= 45 ? "medium" : "easy",
        practiceMode: "daily",
        count: 1,
        estimatedMinutes: Math.max(12, Math.round(taskMinutes * 1.2)),
        reason: "提前维持主观题手感，避免只刷客观题。"
      }
    ],
    weeklySchedule: [
      {
        dayLabel: "周一",
        focus: focusTopics[0],
        tasks: ["错题追击 2 题", "单选题 1 题"]
      },
      {
        dayLabel: "周二",
        focus: focusTopics[1] || focusTopics[0],
        tasks: ["多选题 2 题", "错题解析回看 10 分钟"]
      },
      {
        dayLabel: "周三",
        focus: focusTopics[2] || focusTopics[0],
        tasks: ["计算分析 1 题", "总结薄弱口径"]
      },
      {
        dayLabel: "周四",
        focus: focusTopics[0],
        tasks: ["同点强化 2 题", "错题复盘 1 次"]
      },
      {
        dayLabel: "周五",
        focus: secondaryWeakness,
        tasks: ["多选题 1 题", "判断题 2 题"]
      },
      {
        dayLabel: "周六",
        focus: "综合回顾",
        tasks:
          input.studyStyle === "weekend-intensive"
            ? ["集中刷题 45-60 分钟", "完成 1 轮专项巩固"]
            : ["整理本周错题", "补 1 道计算分析题"]
      },
      {
        dayLabel: "周日",
        focus: "轻量复盘",
        tasks: ["回看本周最容易错的 3 个口径", "准备下周强化点"]
      }
    ],
    adjustments: [
      "如果连续两次答错同一考点，第二天自动降到基础难度再练一轮。",
      "如果计算分析题连续三天正确率超过 70%，下周增加 1 道综合题。",
      "如果中断练习超过 2 天，优先恢复今日任务中的第一项，不重新铺太多新内容。"
    ]
  } satisfies StudyPlanPayload;
}
