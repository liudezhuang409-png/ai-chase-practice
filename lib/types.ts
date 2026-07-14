export type UserPlan = "free" | "pro" | "premium";
export type AppUser = {
  id: string;
  email: string | null;
  source: "supabase" | "demo";
};

export type PaymentChannel = "alipay" | "wechat" | "mock";
export type PaymentOrderStatus = "pending" | "paid" | "failed" | "closed";
export type PracticeSessionStatus = "generated" | "answered" | "expired";
export type QuestionType = "single" | "multiple" | "judge" | "calculation" | "comprehensive";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type PracticeMode = "daily" | "chase" | "review" | "mock-exam";
export type SubmissionVerdict = "correct" | "wrong" | "confused";
export type MasteryLevel = "warning" | "shaky" | "stable" | "mastered";
export type StudyStyle = "short-bursts" | "weekend-intensive" | "mistake-first";
export type StudyPlanStatus = "active" | "archived";
export type MistakeErrorType =
  | "concept"
  | "reading"
  | "calculation"
  | "rule"
  | "entry"
  | "method"
  | "expression"
  | "careless";

export type ObjectiveAnswer = "A" | "B" | "C" | "D";
export type MultiAnswer = ObjectiveAnswer[];
export type SubjectiveAnswer = {
  keyPoints: string[];
  sampleSolution: string;
};
export type QuestionAnswer = ObjectiveAnswer | MultiAnswer | boolean | SubjectiveAnswer;

export type QuestionPayload = {
  referenceId?: string;
  type: QuestionType;
  question: string;
  options: Partial<Record<ObjectiveAnswer, string>> | null;
  answer: QuestionAnswer;
  analysis: string;
  difficulty: DifficultyLevel;
  knowledgePoint: string;
  source: "official" | "ai" | "web";
  score: number;
  examTips?: string[];
  sourceFile?: string;
  sourceTitle?: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  fetchedAt?: string;
};

export type PracticeSession = {
  id: string;
  user_id: string;
  knowledge_point: string;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  practice_mode: PracticeMode;
  question_payload: QuestionPayload;
  chase_mode: boolean;
  status: PracticeSessionStatus;
  selected_answer: string | null;
  self_assessment: SubmissionVerdict | null;
  is_correct: boolean | null;
  generated_at: string;
  answered_at: string | null;
};

export type PaymentOrder = {
  id: string;
  user_id: string;
  order_no: string;
  channel: PaymentChannel;
  plan_target: "pro" | "premium";
  amount_fen: number;
  status: PaymentOrderStatus;
  provider_trade_no: string | null;
  provider_payload: Record<string, unknown> | null;
  created_at: string;
  paid_at: string | null;
};

export type UserKnowledgeSnapshot = {
  knowledgePoint: string;
  mastery: MasteryLevel;
  heat: number;
  wrongCount: number;
  totalAttempts: number;
  accuracyRate: number;
  lastPracticedAt: string | null;
  recommendedTypes: QuestionType[];
};

export type UserStatsSnapshot = {
  totalPractices: number;
  correctRate: number;
  confusedCount: number;
  streakDays: number;
  dailyTrend: Array<{
    dateKey: string;
    label: string;
    attempts: number;
    correctRate: number;
  }>;
  weakestKnowledge: UserKnowledgeSnapshot[];
  typeAccuracy: Array<{
    type: QuestionType;
    correctRate: number;
    attempts: number;
  }>;
  masteryHeatmap: UserKnowledgeSnapshot[];
};

export type WrongReviewItem = {
  id: string;
  subject: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  wrongCount: number;
  lastPracticedAt: string | null;
  promptHint: string;
  question: QuestionPayload | null;
  priorityScore: number;
  priorityLabel: "高优先" | "优先回补" | "安排巩固";
};

export type GenerateQuestionRequest = {
  subject?: "中级会计实务" | "财务管理" | "经济法";
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode?: PracticeMode;
  chaseMode?: boolean;
  lastWrongReason?: string;
  sourceMode?: "local-first" | "ai-only" | "web-2026";
  excludeQuestionIds?: string[];
};

export type SubmitAnswerRequest = {
  sessionId: string;
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  markedConfused?: boolean;
};

export type SubjectiveAIReview = {
  verdict: SubmissionVerdict;
  feedback: string;
  strengths: string[];
  improvements: string[];
};

export type AnswerAnalysisItem = {
  optionKey: string;
  optionText: string;
  isCorrect: boolean;
  isSelected: boolean;
  explanation: string;
};

export type GenerateQuestionResponse = {
  sessionId: string;
  question: QuestionPayload;
  remainingFreeQuota: number | null;
  plan: UserPlan;
  chaseMode: boolean;
  recommendedNextDifficulty: DifficultyLevel;
};

export type MistakeCorrectionAnalysis = {
  errorType: MistakeErrorType;
  errorTypeLabel: string;
  knowledgePoint: string;
  questionType: QuestionType;
  diagnosis: string;
  correction: string;
  correctionSteps: string[];
  variantStrategy: string;
  drillPrompt: string;
};

export type AnalyzeMistakeResponse = {
  analysis: MistakeCorrectionAnalysis;
  sessionId: string;
  question: QuestionPayload;
  remainingFreeQuota: number | null;
  plan: UserPlan;
};

export type SubmitAnswerResponse = {
  correct: boolean;
  correctAnswer: QuestionPayload["answer"];
  analysis: string;
  answerAnalysis?: AnswerAnalysisItem[];
  shouldChase: boolean;
  nextPromptHint: string;
  masteryLevel: MasteryLevel;
  verdict: SubmissionVerdict;
  recommendedNextDifficulty: DifficultyLevel;
  gradingSource?: "ai" | "self";
  aiReview?: SubjectiveAIReview | null;
  studyPlanProgress?: StudyPlanTodayProgress | null;
  studyPlanTask?: StudyPlanTaskContext | null;
  nextStudyPlanTask?: StudyPlanTaskContext | null;
};

export type CreateOrderResponse = {
  orderNo: string;
  channel: PaymentChannel;
  status: PaymentOrderStatus;
  payUrl: string | null;
  qrPayload: string | null;
  amountFen: number;
};

export type MockExamConfig = {
  subject: string;
  paperMode: "mini";
  totalQuestions: number;
  estimatedMinutes: number;
};

export type MockExamGeneratedQuestion = {
  sessionId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  score: number;
  question: QuestionPayload;
};

export type MockExamQuestionAnswer = {
  sessionId: string;
  selectedAnswer?: string;
  selfAssessment?: SubmissionVerdict;
  markedConfused?: boolean;
};

export type MockExamQuestionResult = {
  sessionId: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  correct: boolean;
  verdict: SubmissionVerdict;
  scoreEarned: number;
  scorePossible: number;
  correctAnswer: QuestionPayload["answer"];
  analysis: string;
  gradingSource?: "ai" | "self";
  aiReview?: SubjectiveAIReview | null;
};

export type MockExamWeaknessInsight = {
  knowledgePoint: string;
  subject: string;
  wrongCount: number;
  questionTypes: QuestionType[];
  recommendation: string;
};

export type MockExamReport = {
  totalScore: number;
  earnedScore: number;
  accuracyRate: number;
  correctCount: number;
  totalQuestions: number;
  masterySummary: string;
  weakestPoints: MockExamWeaknessInsight[];
  results: MockExamQuestionResult[];
  submittedAt: string;
};

export type MockExamPaper = {
  id: string;
  user_id: string;
  exam_name: string;
  config: MockExamConfig;
  generated_questions: MockExamGeneratedQuestion[];
  score: number | null;
  weakness_report: MockExamReport | null;
  created_at: string;
};

export type GenerateMockExamResponse = {
  paper: MockExamPaper;
  recommendedFocus: string;
  plan: UserPlan;
};

export type SubmitMockExamResponse = {
  paperId: string;
  examName: string;
  subject: string;
  report: MockExamReport;
};

export type StudyPlanPhase = {
  name: string;
  weeks: string;
  focus: string[];
  goal: string;
  recommendedQuestionTypes: QuestionType[];
  recommendedDifficulty: DifficultyLevel;
  taskNotes: string[];
};

export type StudyPlanTask = {
  title: string;
  subject: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode: PracticeMode;
  count: number;
  estimatedMinutes: number;
  reason: string;
};

export type StudyPlanScheduleDay = {
  dayLabel: string;
  focus: string;
  tasks: string[];
};

export type StudyPlanPayload = {
  planName: string;
  strategy: string;
  summary: string;
  targetExam: string;
  targetScore: number;
  daysToExam: number;
  dailyMinutes: number;
  studyStyle: StudyStyle;
  selectedSubjects: string[];
  selectedTopics: string[];
  phases: StudyPlanPhase[];
  todayTasks: StudyPlanTask[];
  weeklySchedule: StudyPlanScheduleDay[];
  adjustments: string[];
};

export type StudyPlanTaskProgress = {
  taskIndex: number;
  completedQuestions: number;
  targetQuestions: number;
  completed: boolean;
  correctCount: number;
  lastPracticedAt: string | null;
};

export type StudyPlanTodayProgress = {
  totalTasks: number;
  completedTasks: number;
  startedTasks: number;
  totalQuestions: number;
  completedQuestions: number;
  correctQuestions: number;
  tasks: StudyPlanTaskProgress[];
};

export type StudyPlanTaskContext = {
  index: number;
  title: string;
  subject: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode: PracticeMode;
  count: number;
  estimatedMinutes: number;
  completed: boolean;
  completedQuestions: number;
  targetQuestions: number;
  correctCount: number;
};

export type StudyPlanInput = {
  targetExam: string;
  targetScore: number;
  daysToExam: number;
  dailyMinutes: number;
  studyStyle: StudyStyle;
  selectedSubjects: string[];
  selectedTopics: string[];
};

export type UserStudyPlanRecord = {
  id: string;
  user_id: string;
  plan_name: string;
  target_exam: string;
  target_score: number;
  days_to_exam: number;
  daily_minutes: number;
  study_style: StudyStyle;
  selected_subjects: string[];
  selected_topics: string[];
  plan_payload: StudyPlanPayload;
  status: StudyPlanStatus;
  created_at: string;
  updated_at: string;
};

export type GenerateStudyPlanRequest = StudyPlanInput;

export type GenerateStudyPlanResponse = {
  plan: UserStudyPlanRecord;
};
