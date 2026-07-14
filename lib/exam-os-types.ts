import type { QuestionPayload, QuestionType } from "@/lib/types";

export type ExamSubject = "中级会计实务" | "财务管理" | "经济法";
export type ChapterTrend = "up" | "flat" | "down";

export type ExamChapter = {
  id: string;
  user_id: string;
  subject: ExamSubject;
  chapter_name: string;
  mastery_score: number;
  manual_mastery_score: number | null;
  wrong_count: number;
  mastered_count: number;
  review_count: number;
  trend: ChapterTrend;
  exam_weight: number;
  last_reviewed_at: string | null;
  updated_at: string;
};

export type ExamMistake = {
  id: string;
  user_id: string;
  subject: ExamSubject;
  chapter: string;
  question: string;
  my_answer: string;
  correct_answer: string;
  wrong_reason: string;
  review_count: number;
  is_mastered: boolean;
  question_type: QuestionType;
  difficulty: "easy" | "medium" | "hard";
  ai_analysis: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ExamStudyLog = {
  id: string;
  user_id: string;
  subject: ExamSubject;
  chapter: string;
  question_count: number;
  wrong_count: number;
  minutes: number;
  created_at: string;
};

export type ExamMockExam = {
  id: string;
  user_id: string;
  date: string;
  accounting_score: number;
  finance_score: number;
  law_score: number;
  created_at: string;
  updated_at: string;
};

export type DailyStudyTask = {
  rank: number;
  subject: ExamSubject;
  chapter: string;
  action: "错题复盘" | "基础训练" | "巩固练习";
  questionCount: number;
  priority: number;
};

export type SubjectMastery = {
  subject: ExamSubject;
  mastery: number;
  questionCount: number;
  wrongCount: number;
};

export type ExamDashboardSnapshot = {
  subjectMastery: SubjectMastery[];
  weakestChapters: ExamChapter[];
  todayPath: DailyStudyTask[];
  weeklyMinutes: Array<{ date: string; minutes: number }>;
  todayMinutes: number;
  todayQuestions: number;
  todayWrong: number;
  todayAccuracy: number;
};

export type PracticeRunState = {
  id: string;
  subject: ExamSubject;
  chapter: string;
  questionType: QuestionType;
  targetCount: number;
  currentIndex: number;
  answers: Array<{
    index: number;
    sessionId: string;
    correct: boolean;
    question: QuestionPayload;
  }>;
};
