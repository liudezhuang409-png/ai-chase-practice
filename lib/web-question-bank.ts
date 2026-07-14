import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { QuestionPayload, QuestionType } from "@/lib/types";

type WebQuestionRecord = Omit<QuestionPayload, "source"> & {
  id: string;
  subject: string;
  chapter: string;
  source: "web";
  contentHash: string;
  sourceName: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: string;
  fetchedAt: string;
};

type WebQuestionBankPayload = {
  builtAt: string;
  version: 1;
  questions: WebQuestionRecord[];
};

let cache: WebQuestionBankPayload | null = null;
let cacheMtimeMs = -1;
let refreshRequested = false;

function getWebQuestionBankPath() {
  return path.join(process.cwd(), "data", "web-question-bank", "web-question-bank.json");
}

function normalize(value: string) {
  return value.replace(/\s+/g, "").replace(/[／/·•、，,。；;：:（）()【】〖〗\-[\]]/g, "").toLowerCase();
}

function scoreMatch(target: string, candidate: string) {
  const normalizedTarget = normalize(target);
  const normalizedCandidate = normalize(candidate);

  if (!normalizedTarget || !normalizedCandidate) return 0;
  if (normalizedTarget === normalizedCandidate) return 120;
  if (normalizedCandidate.includes(normalizedTarget)) return 90;
  if (normalizedTarget.includes(normalizedCandidate) && normalizedCandidate.length >= 4) return 60;

  return target
    .split(/[／/|、，,]/)
    .map((item) => normalize(item))
    .filter((item) => item.length >= 2 && normalizedCandidate.includes(item))
    .reduce((score, item) => score + Math.min(item.length * 4, 28), 0);
}

function loadWebQuestionBank() {
  const filePath = getWebQuestionBankPath();

  if (!fs.existsSync(filePath)) {
    cache = { builtAt: "", version: 1, questions: [] };
    cacheMtimeMs = -1;
    return cache;
  }

  const mtimeMs = fs.statSync(filePath).mtimeMs;
  if (cache && cacheMtimeMs === mtimeMs) return cache;

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as WebQuestionBankPayload;
  cache = {
    builtAt: parsed.builtAt ?? "",
    version: 1,
    questions: Array.isArray(parsed.questions) ? parsed.questions : []
  };
  cacheMtimeMs = mtimeMs;
  return cache;
}

function isStale(payload: WebQuestionBankPayload) {
  const builtAt = Date.parse(payload.builtAt);
  return !Number.isFinite(builtAt) || Date.now() - builtAt > 24 * 60 * 60 * 1000;
}

function triggerRefreshIfNeeded(payload: WebQuestionBankPayload) {
  if (refreshRequested || !isStale(payload)) return;
  const apiKey = process.env.TAVILY_API_KEY ?? "";
  if (!apiKey || apiKey.startsWith("placeholder") || apiKey === "your-tavily-api-key") return;

  refreshRequested = true;
  const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "sync-web-question-bank.mjs")], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
}

function toQuestionPayload(question: WebQuestionRecord): QuestionPayload {
  return {
    referenceId: question.id,
    type: question.type,
    question: question.question,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    difficulty: question.difficulty,
    knowledgePoint: question.knowledgePoint,
    source: "web",
    score: question.score,
    examTips: question.examTips,
    sourceTitle: question.sourceTitle,
    sourceName: question.sourceName,
    sourceUrl: question.sourceUrl,
    publishedAt: question.publishedAt,
    fetchedAt: question.fetchedAt
  };
}

export function getWebReferenceQuestion(params: {
  subject?: string;
  knowledgePoint: string;
  questionType: QuestionType;
  excludeQuestionIds?: string[];
}) {
  const bank = loadWebQuestionBank();
  triggerRefreshIfNeeded(bank);
  const excluded = new Set(params.excludeQuestionIds ?? []);
  const candidates = bank.questions
    .filter((item) => item.publishedAt.startsWith("2026-"))
    .filter((item) => item.type === params.questionType)
    .filter((item) => !params.subject || item.subject === params.subject)
    .filter((item) => !excluded.has(item.id))
    .map((item) => {
      const exactScore = scoreMatch(params.knowledgePoint, `${item.knowledgePoint} ${item.question} ${item.analysis}`);
      const chapterScore = scoreMatch(params.knowledgePoint, item.chapter);
      return { item, exactScore, chapterScore };
    });

  const exact = candidates
    .filter((entry) => entry.exactScore >= 20)
    .sort((left, right) => right.exactScore - left.exactScore)[0];
  if (exact) return toQuestionPayload(exact.item);

  const sameChapter = candidates
    .filter((entry) => entry.chapterScore >= 60)
    .sort((left, right) => right.chapterScore - left.chapterScore)[0];
  return sameChapter ? toQuestionPayload(sameChapter.item) : null;
}
