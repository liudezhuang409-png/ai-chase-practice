import fs from "node:fs";
import path from "node:path";
import type { QuestionPayload, QuestionType, SubjectiveAnswer } from "@/lib/types";

type ReferenceQuestion = {
  id: string;
  subject: string;
  chapter: string | null;
  knowledgePoint: string;
  type: "single" | "multiple" | "judge" | "calculation" | "comprehensive";
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: Record<string, string> | null;
  answer: string | string[] | boolean | SubjectiveAnswer;
  analysis: string;
  source: "official";
  score: number;
  examTips: string[];
  sourceFile: string;
  sourceTitle: string;
};

type KnowledgeSnippet = {
  id: string;
  subject: string;
  chapter: string | null;
  knowledgePoint: string;
  sourceFile: string;
  sourceTitle: string;
  content: string;
};

type ReferenceBankPayload = {
  questions: ReferenceQuestion[];
  snippets: KnowledgeSnippet[];
};

let cache: ReferenceBankPayload | null = null;

const knowledgePointAliases: Record<string, string[]> = {
  "筹资管理": ["资本成本", "债务资本", "权益资本", "发行债券", "发行普通股", "外部融资"],
  "投资管理": ["净现值", "现金净流量", "投资项目", "年金净流量", "回收期"],
  "财务分析与评价": ["周转率", "偿债能力", "盈利能力", "杜邦分析", "净资产收益率"]
};

function getReferenceBankPath() {
  return path.join(process.cwd(), "data", "reference-bank", "reference-bank.json");
}

function normalizeValue(value: string) {
  return value.replace(/\s+/g, "").replace(/[／/·•、，,。；;（）()【】\-[\]]/g, "").toLowerCase();
}

function tokenizeKnowledgePoint(value: string) {
  const rawParts = value
    .split(/[／/|]/)
    .flatMap((part) => part.split(/[，,、]/))
    .map((item) => item.trim())
    .filter(Boolean);

  const aliases = Object.entries(knowledgePointAliases)
    .filter(([key]) => value.includes(key) || key.includes(value))
    .flatMap(([, items]) => items);

  return [...new Set([value.trim(), ...rawParts, ...aliases].filter(Boolean))];
}

function loadReferenceBank(): ReferenceBankPayload {
  if (cache) {
    return cache;
  }

  const filePath = getReferenceBankPath();
  if (!fs.existsSync(filePath)) {
    cache = {
      questions: [],
      snippets: []
    };
    return cache;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as ReferenceBankPayload;
  cache = {
    questions: raw.questions ?? [],
    snippets: raw.snippets ?? []
  };
  return cache;
}

function scoreKnowledgeMatch(targetKnowledgePoint: string, candidateKnowledgePoint: string) {
  const normalizedTarget = normalizeValue(targetKnowledgePoint);
  const normalizedCandidate = normalizeValue(candidateKnowledgePoint);

  if (normalizedTarget === normalizedCandidate) {
    return 120;
  }

  if (normalizedTarget.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedTarget)) {
    return 90;
  }

  const tokens = tokenizeKnowledgePoint(targetKnowledgePoint);
  let score = 0;

  for (const token of tokens) {
    const normalizedToken = normalizeValue(token);
    if (!normalizedToken) {
      continue;
    }

    if (normalizedCandidate.includes(normalizedToken)) {
      score += normalizedToken.length >= 6 ? 36 : 20;
    }
  }

  return score;
}

function formatReferenceQuestion(question: ReferenceQuestion) {
  const answerText = typeof question.answer === "object" && !Array.isArray(question.answer)
    ? question.answer.sampleSolution
    : Array.isArray(question.answer)
    ? question.answer.join("")
    : typeof question.answer === "boolean"
      ? question.answer
        ? "正确"
        : "错误"
      : question.answer;

  return [
    `知识点：${question.knowledgePoint}`,
    `题型：${question.type}`,
    `题干摘要：${question.question.slice(0, 120)}`,
    `答案：${answerText}`,
    `解析摘要：${question.analysis.slice(0, 140)}`
  ].join("\n");
}

function normalizeReferenceQuestion(question: ReferenceQuestion): QuestionPayload {
  return {
    referenceId: question.id,
    type: question.type,
    question: question.question,
    options: question.options,
    answer: question.answer as QuestionPayload["answer"],
    analysis: question.analysis || "请回到题干条件和对应考点口径，确认每个选项是否符合规定。",
    difficulty: question.difficulty,
    knowledgePoint: question.knowledgePoint,
    source: "official",
    score: question.score,
    examTips: question.examTips,
    sourceFile: question.sourceFile,
    sourceTitle: question.sourceTitle
  };
}

function scoreLocalQuestion(params: { knowledgePoint: string; questionType: QuestionType }, question: ReferenceQuestion) {
  const topicScore =
    scoreKnowledgeMatch(params.knowledgePoint, question.knowledgePoint) +
    (question.chapter ? scoreKnowledgeMatch(params.knowledgePoint, question.chapter) * 0.8 : 0) +
    scoreKnowledgeMatch(params.knowledgePoint, `${question.sourceTitle} ${question.sourceFile}`) * 0.8 +
    scoreKnowledgeMatch(params.knowledgePoint, `${question.question} ${question.analysis}`) * 0.6;

  return {
    topicScore,
    totalScore: topicScore + (question.type === params.questionType ? 28 : 0)
  };
}

function isUsableLocalQuestion(question: ReferenceQuestion) {
  if (question.type === "calculation" || question.type === "comprehensive") {
    const objectiveOptionCount = question.question
      .split("\n")
      .filter((line) => /^[A-D][.．、]/.test(line.trim())).length;
    const materialText = question.question
      .split(/\n要求[:：]/)[0]
      .replace(/^例题[^\n]*/, "")
      .trim();

    if (
      materialText.length < 50 ||
      question.question.startsWith("|") ||
      objectiveOptionCount >= 2 ||
      /综合题[·.]答题技巧/.test(question.question)
    ) {
      return false;
    }
  }

  return (
    !/^例题\d*[·.]?\d{4}年(?:（[^）]*）)?$/.test(question.question) &&
    !/^例题\d*[·.]?\d{4}年\s*不考虑其他因素.*(甲公司|乙公司|该|2×)/.test(question.question)
  );
}

export function getLocalReferenceQuestion(params: {
  subject?: string;
  knowledgePoint: string;
  questionType: QuestionType;
  excludeQuestionIds?: string[];
}) {
  const { questions } = loadReferenceBank();
  const excluded = new Set(params.excludeQuestionIds ?? []);
  const available = questions
    .filter((item) => item.type === params.questionType)
    .filter(isUsableLocalQuestion)
    .filter((item) => !excluded.has(item.id));
  const subjectMatched = params.subject
    ? available.filter((item) => item.subject === params.subject)
    : available;
  const pool = subjectMatched.length > 0
    ? subjectMatched
    : available.filter((item) => item.subject === "未识别科目");
  const matched = pool
    .map((item) => {
      const score = scoreLocalQuestion(params, item);
      return {
        item,
        score: score.totalScore,
        topicScore: score.topicScore
      };
    })
    .filter((entry) => entry.topicScore >= 20)
    .sort((a, b) => b.score - a.score);

  const best = matched[0]?.item;
  return best ? normalizeReferenceQuestion(best) : null;
}

export async function getReferencePromptContext(params: {
  knowledgePoint: string;
  questionType: QuestionType;
}) {
  const { questions, snippets } = loadReferenceBank();
  if (questions.length === 0 && snippets.length === 0) {
    return "";
  }

  const matchedQuestions = questions
    .map((item) => ({
      item,
      score:
        scoreKnowledgeMatch(params.knowledgePoint, item.knowledgePoint) +
        (item.type === params.questionType ? 18 : 0)
    }))
    .filter((entry) => entry.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map((entry, index) => `参考题${index + 1}\n${formatReferenceQuestion(entry.item)}`);

  const matchedSnippets = snippets
    .map((item) => ({
      item,
      score: scoreKnowledgeMatch(params.knowledgePoint, item.knowledgePoint)
    }))
    .filter((entry) => entry.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map(
      (entry, index) =>
        `讲义摘录${index + 1}\n知识点：${entry.item.knowledgePoint}\n摘要：${entry.item.content.slice(0, 160)}`
    );

  if (matchedQuestions.length === 0 && matchedSnippets.length === 0) {
    return "";
  }

  return [
    "本地参考摘要：只借鉴考法和易错口径，不得照抄。",
    matchedQuestions.length > 0 ? `\n[参考题库]\n${matchedQuestions.join("\n\n")}` : "",
    matchedSnippets.length > 0 ? `\n[讲义摘录]\n${matchedSnippets.join("\n\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
