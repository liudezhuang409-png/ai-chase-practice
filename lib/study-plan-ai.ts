import { z } from "zod";
import { getCompatibleChatCandidateModels, isCompatibleChatProvider, requestJsonFromCompatibleChat } from "@/lib/ai";
import { serverEnv } from "@/lib/env";
import { createDemoStudyPlanPayload, isPlaceholderAI } from "@/lib/demo";
import { SUBJECT_CATALOG, findSubjectByKnowledgePoint } from "@/lib/knowledge-catalog";
import type {
  DifficultyLevel,
  PracticeMode,
  QuestionType,
  StudyPlanInput,
  StudyPlanPayload,
  StudyStyle,
  UserKnowledgeSnapshot,
  UserStatsSnapshot
} from "@/lib/types";

const phaseSchema = z.object({
  name: z.string().min(1),
  weeks: z.string().min(1),
  focus: z.array(z.string().min(1)).min(1).max(4),
  goal: z.string().min(1),
  recommendedQuestionTypes: z
    .array(z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]))
    .min(1)
    .max(3),
  recommendedDifficulty: z.enum(["easy", "medium", "hard"]),
  taskNotes: z.array(z.string().min(1)).min(1).max(4)
});

const taskSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  knowledgePoint: z.string().min(1),
  questionType: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  practiceMode: z.enum(["daily", "chase", "review", "mock-exam"]),
  count: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().min(5).max(120),
  reason: z.string().min(1)
});

const scheduleSchema = z.object({
  dayLabel: z.string().min(1),
  focus: z.string().min(1),
  tasks: z.array(z.string().min(1)).min(1).max(4)
});

const studyPlanSchema = z.object({
  planName: z.string().min(1),
  strategy: z.string().min(1),
  summary: z.string().min(1),
  targetExam: z.string().min(1),
  targetScore: z.number().int().min(1).max(100),
  daysToExam: z.number().int().min(1),
  dailyMinutes: z.number().int().min(10),
  studyStyle: z.enum(["short-bursts", "weekend-intensive", "mistake-first"]),
  selectedSubjects: z.array(z.string().min(1)).max(3),
  selectedTopics: z.array(z.string().min(1)).max(6),
  phases: z.array(phaseSchema).min(2).max(4),
  todayTasks: z.array(taskSchema).min(2).max(4),
  weeklySchedule: z.array(scheduleSchema).length(7),
  adjustments: z.array(z.string().min(1)).min(2).max(5)
});

type GenerateStudyPlanParams = {
  input: StudyPlanInput;
  weakestKnowledge: UserKnowledgeSnapshot[];
  typeAccuracy: UserStatsSnapshot["typeAccuracy"];
};

function styleLabel(style: StudyStyle) {
  switch (style) {
    case "short-bursts":
      return "高频短练";
    case "weekend-intensive":
      return "周末集中";
    case "mistake-first":
      return "错题优先";
    default:
      return style;
  }
}

function buildPrompt(params: GenerateStudyPlanParams) {
  const weakestText =
    params.weakestKnowledge.length > 0
      ? params.weakestKnowledge
          .slice(0, 5)
          .map(
            (item, index) =>
              `${index + 1}. ${item.knowledgePoint}｜错题 ${item.wrongCount} 次｜正确率 ${Math.round(
                item.accuracyRate * 100
              )}%｜掌握 ${item.mastery}`
          )
          .join("\n")
      : "暂无练习数据，请结合用户输入的科目与考点先给出首版计划。";

  const typeAccuracyText = params.typeAccuracy
    .map((item) => `${item.type}：${item.attempts}题 / 正确率 ${Math.round(item.correctRate * 100)}%`)
    .join("\n");

  return `
你是一个面向中级会计师备考用户的学习规划助手。请根据用户的备考时间、目标分数、当前薄弱点和题型表现，生成一份“AI 定制练题计划”。

要求：
1. 必须使用中文。
2. 输出必须是合法 JSON，不能有 Markdown、代码块或多余说明。
3. 计划必须服务于刷题与错题强化，不要写泛泛的励志建议。
4. todayTasks 必须是今天就能执行的具体任务，且每个任务都要包含 knowledgePoint、questionType、difficulty、practiceMode、count、estimatedMinutes、reason。
5. weeklySchedule 必须覆盖周一到周日，共 7 天。
6. phases 建议按“基础回补 / 错题强化 / 冲刺模考”组织，但名称可以微调。
7. 如果用户已经有薄弱点数据，优先围绕这些知识点排计划。
8. 如果题型表现显示主观题较弱，应适当增加 calculation 或 comprehensive。
9. studyStyle 必须原样回填：${params.input.studyStyle}。
10. selectedSubjects 和 selectedTopics 必须原样回填。

用户输入：
- 目标考试：${params.input.targetExam}
- 目标分数：${params.input.targetScore}
- 距考试天数：${params.input.daysToExam}
- 每天可投入时长：${params.input.dailyMinutes} 分钟
- 学习风格：${styleLabel(params.input.studyStyle)}
- 选择的科目：${params.input.selectedSubjects.join("、") || "未指定"}
- 选择的重点考点：${params.input.selectedTopics.join("、") || "未指定"}

当前薄弱点摘要：
${weakestText}

当前题型表现：
${typeAccuracyText}

输出 JSON 字段：
{
  "planName": "",
  "strategy": "",
  "summary": "",
  "targetExam": "",
  "targetScore": 85,
  "daysToExam": 68,
  "dailyMinutes": 45,
  "studyStyle": "short-bursts|weekend-intensive|mistake-first",
  "selectedSubjects": [],
  "selectedTopics": [],
  "phases": [
    {
      "name": "",
      "weeks": "",
      "focus": [""],
      "goal": "",
      "recommendedQuestionTypes": ["single"],
      "recommendedDifficulty": "easy|medium|hard",
      "taskNotes": [""]
    }
  ],
  "todayTasks": [
    {
      "title": "",
      "subject": "",
      "knowledgePoint": "",
      "questionType": "single|multiple|judge|calculation|comprehensive",
      "difficulty": "easy|medium|hard",
      "practiceMode": "daily|chase|review|mock-exam",
      "count": 2,
      "estimatedMinutes": 15,
      "reason": ""
    }
  ],
  "weeklySchedule": [
    {
      "dayLabel": "周一",
      "focus": "",
      "tasks": [""]
    }
  ],
  "adjustments": [""]
}
`.trim();
}

function buildKnownTopics(params: GenerateStudyPlanParams) {
  const subjectTopics = params.input.selectedSubjects.flatMap((subject) =>
    (SUBJECT_CATALOG.find((item) => item.subject === subject)?.topics ?? []).filter((topic) => topic.includes(" / "))
  );

  return [
    ...new Set(
      [...params.input.selectedTopics, ...params.weakestKnowledge.map((item) => item.knowledgePoint), ...subjectTopics].filter(Boolean)
    )
  ];
}

function compactText(value: string) {
  return value.replace(/\s+/g, "").replace(/[：:，,。；;（）()]/g, "");
}

function resolveKnowledgePoint(candidate: string, knownTopics: string[]) {
  const normalizedCandidate = compactText(candidate);
  if (!normalizedCandidate) {
    return candidate;
  }

  const exactMatch = knownTopics.find((topic) => compactText(topic) === normalizedCandidate);
  if (exactMatch) {
    return exactMatch;
  }

  const fuzzyMatch = knownTopics.find((topic) => {
    const normalizedTopic = compactText(topic);
    const leaf = topic.includes(" / ") ? topic.split(" / ").slice(-1)[0] : topic;
    const normalizedLeaf = compactText(leaf);

    return (
      normalizedTopic.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedTopic) ||
      normalizedLeaf.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedLeaf)
    );
  });

  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  const sectionMatch = knownTopics.find((topic) => topic.startsWith(`${candidate.trim()} / `));
  return sectionMatch ?? candidate;
}

function repairPayload(payload: StudyPlanPayload, params: GenerateStudyPlanParams): StudyPlanPayload {
  const fallback = createDemoStudyPlanPayload(params);
  const knownTopics = buildKnownTopics(params);
  const selectedSubjectSet = new Set(params.input.selectedSubjects);
  const primarySelectedSubject = params.input.selectedSubjects[0] ?? "";
  const primarySelectedTopic =
    params.input.selectedTopics[0] ??
    knownTopics.find((topic) => findSubjectByKnowledgePoint(topic) === primarySelectedSubject) ??
    fallback.todayTasks[0]?.knowledgePoint ??
    "收入 / 收入的确认和计量的步骤";

  const fixedTasks = payload.todayTasks.map((task, index) => {
    let resolvedKnowledgePoint = resolveKnowledgePoint(
      task.knowledgePoint ||
        params.input.selectedTopics[index] ||
        params.weakestKnowledge[index]?.knowledgePoint ||
        fallback.todayTasks[index]?.knowledgePoint ||
        "收入 / 收入的确认和计量的步骤",
      knownTopics
    );
    const matchesKnownTopic = knownTopics.some((topic) => {
      const normalizedTopic = compactText(topic);
      const normalizedPoint = compactText(resolvedKnowledgePoint);
      return (
        normalizedTopic === normalizedPoint ||
        normalizedTopic.includes(normalizedPoint) ||
        normalizedPoint.includes(normalizedTopic)
      );
    });
    const pointSubject = findSubjectByKnowledgePoint(resolvedKnowledgePoint);
    let resolvedSubject =
      pointSubject ||
      task.subject ||
      params.input.selectedSubjects[0] ||
      fallback.todayTasks[index]?.subject ||
      "中级会计实务";

    if (
      selectedSubjectSet.size > 0 &&
      (!matchesKnownTopic || (pointSubject && !selectedSubjectSet.has(pointSubject)) || !selectedSubjectSet.has(resolvedSubject))
    ) {
      resolvedKnowledgePoint = resolveKnowledgePoint(
        params.input.selectedTopics[index] ||
          primarySelectedTopic ||
          fallback.todayTasks[index]?.knowledgePoint ||
          "收入 / 收入的确认和计量的步骤",
        knownTopics
      );
      resolvedSubject =
        findSubjectByKnowledgePoint(resolvedKnowledgePoint) || primarySelectedSubject || fallback.todayTasks[index]?.subject || "中级会计实务";
    }

    return {
      ...task,
      subject: resolvedSubject,
      knowledgePoint: resolvedKnowledgePoint,
      estimatedMinutes: Math.max(5, Math.min(task.estimatedMinutes, params.input.dailyMinutes)),
      count: Math.max(1, Math.min(task.count, 5)),
      practiceMode: task.practiceMode as PracticeMode,
      questionType: task.questionType as QuestionType,
      difficulty: task.difficulty as DifficultyLevel,
      title: task.title || `练习任务 ${index + 1}`,
      reason: task.reason || "这是系统为你安排的当前优先练习任务。"
    };
  });

  const normalizedSchedule = payload.weeklySchedule.length === 7 ? payload.weeklySchedule : fallback.weeklySchedule;

  return {
    ...payload,
    selectedSubjects: params.input.selectedSubjects,
    selectedTopics: params.input.selectedTopics,
    targetExam: params.input.targetExam,
    targetScore: params.input.targetScore,
    daysToExam: params.input.daysToExam,
    dailyMinutes: params.input.dailyMinutes,
    studyStyle: params.input.studyStyle,
    phases:
      payload.phases.length > 0
        ? payload.phases.map((phase) => ({
            ...phase,
            focus: phase.focus.map((item) => resolveKnowledgePoint(item, knownTopics))
          }))
        : fallback.phases,
    todayTasks: fixedTasks.length > 0 ? fixedTasks : fallback.todayTasks,
    weeklySchedule: normalizedSchedule.map((day) => ({
      ...day,
      focus: resolveKnowledgePoint(day.focus, knownTopics)
    })),
    adjustments: payload.adjustments.length > 0 ? payload.adjustments : fallback.adjustments,
    summary: payload.summary || fallback.summary,
    strategy: payload.strategy || fallback.strategy,
    planName: payload.planName || fallback.planName
  };
}

async function requestFromDashScope(prompt: string, model: string, timeoutMs: number) {
  return requestJsonFromCompatibleChat({
    model,
    systemPrompt: "你是一个严谨的学习规划助手，必须输出合法 JSON。",
    userPrompt: prompt,
    timeoutMs
  });
}

async function requestFromOpenAI(prompt: string, timeoutMs: number) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: serverEnv.OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "study_plan",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              planName: { type: "string" },
              strategy: { type: "string" },
              summary: { type: "string" },
              targetExam: { type: "string" },
              targetScore: { type: "number" },
              daysToExam: { type: "number" },
              dailyMinutes: { type: "number" },
              studyStyle: { type: "string", enum: ["short-bursts", "weekend-intensive", "mistake-first"] },
              selectedSubjects: { type: "array", items: { type: "string" } },
              selectedTopics: { type: "array", items: { type: "string" } },
              phases: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    weeks: { type: "string" },
                    focus: { type: "array", items: { type: "string" } },
                    goal: { type: "string" },
                    recommendedQuestionTypes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["single", "multiple", "judge", "calculation", "comprehensive"]
                      }
                    },
                    recommendedDifficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    taskNotes: { type: "array", items: { type: "string" } }
                  },
                  required: ["name", "weeks", "focus", "goal", "recommendedQuestionTypes", "recommendedDifficulty", "taskNotes"]
                }
              },
              todayTasks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    subject: { type: "string" },
                    knowledgePoint: { type: "string" },
                    questionType: {
                      type: "string",
                      enum: ["single", "multiple", "judge", "calculation", "comprehensive"]
                    },
                    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    practiceMode: { type: "string", enum: ["daily", "chase", "review", "mock-exam"] },
                    count: { type: "number" },
                    estimatedMinutes: { type: "number" },
                    reason: { type: "string" }
                  },
                  required: [
                    "title",
                    "subject",
                    "knowledgePoint",
                    "questionType",
                    "difficulty",
                    "practiceMode",
                    "count",
                    "estimatedMinutes",
                    "reason"
                  ]
                }
              },
              weeklySchedule: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    dayLabel: { type: "string" },
                    focus: { type: "string" },
                    tasks: { type: "array", items: { type: "string" } }
                  },
                  required: ["dayLabel", "focus", "tasks"]
                }
              },
              adjustments: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: [
              "planName",
              "strategy",
              "summary",
              "targetExam",
              "targetScore",
              "daysToExam",
              "dailyMinutes",
              "studyStyle",
              "selectedSubjects",
              "selectedTopics",
              "phases",
              "todayTasks",
              "weeklySchedule",
              "adjustments"
            ]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error("STUDY_PLAN_AI_FAILED");
  }

  const data = (await response.json()) as {
    output_text?: string;
  };

  return JSON.parse(data.output_text ?? "{}");
}

export async function generateStudyPlanWithAI(params: GenerateStudyPlanParams): Promise<StudyPlanPayload> {
  const fallback = createDemoStudyPlanPayload(params);
  if (isPlaceholderAI()) {
    return fallback;
  }

  const prompt = buildPrompt(params);

  try {
    let raw: unknown;

    if (isCompatibleChatProvider()) {
      const candidateModels = getCompatibleChatCandidateModels({
        latencyProfile: "fast"
      });

      let lastError: unknown = null;

      for (const [index, model] of candidateModels.entries()) {
        try {
          raw = await requestFromDashScope(prompt, model, index === 0 ? 15000 : 8000);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!raw) {
        throw lastError ?? new Error("STUDY_PLAN_AI_FAILED");
      }
    } else {
      raw = await requestFromOpenAI(prompt, 25000);
    }

    const parsed = studyPlanSchema.parse(raw);
    return repairPayload(parsed, params);
  } catch {
    return fallback;
  }
}
