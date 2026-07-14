import { serverEnv } from "@/lib/env";
import { z } from "zod";
import {
  createDemoQuestion,
  getRecommendedDifficulty,
  isPlaceholderAI
} from "@/lib/demo";
import { questionSchema } from "@/lib/question-schema";
import { getReferencePromptContext } from "@/lib/reference-bank";
import type {
  DifficultyLevel,
  MistakeCorrectionAnalysis,
  PracticeMode,
  QuestionPayload,
  QuestionType,
  SubjectiveAIReview,
  SubmissionVerdict
} from "@/lib/types";

type CompatibleChatProvider = "dashscope" | "deepseek";

type GenerateParams = {
  subject?: string;
  knowledgePoint: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  practiceMode?: PracticeMode;
  chaseMode?: boolean;
  lastWrongReason?: string;
  referenceContext?: string;
  latencyProfile?: "default" | "fast";
};

const subjectiveReviewSchema = z.object({
  verdict: z.enum(["correct", "wrong", "confused"]),
  feedback: z.string().min(1),
  strengths: z.array(z.string().min(1)).max(4),
  improvements: z.array(z.string().min(1)).max(4)
});

const mistakeCorrectionSchema = z.object({
  errorType: z.enum(["concept", "reading", "calculation", "rule", "entry", "method", "expression", "careless"]),
  errorTypeLabel: z.string().min(1),
  knowledgePoint: z.string().min(1),
  questionType: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]),
  diagnosis: z.string().min(1),
  correction: z.string().min(1),
  correctionSteps: z.array(z.string().min(1)).min(2).max(5),
  variantStrategy: z.string().min(1),
  drillPrompt: z.string().min(1)
});

function normalizeObjectiveKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.toUpperCase().match(/[ABCD]/);
  return match?.[0] ?? null;
}

function normalizeQuestionCandidate(candidate: unknown, params: GenerateParams) {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  const value = candidate as Record<string, unknown>;
  const type = params.questionType;
  const normalizedOptions =
    Array.isArray(value.options)
      ? Object.fromEntries(
          value.options
            .slice(0, 4)
            .map((option, index) => [
              ["A", "B", "C", "D"][index],
              String(option).replace(/^[A-D][.．、\s]+/i, "").trim()
            ])
            .filter(([, option]) => option)
        )
      : value.options && typeof value.options === "object"
      ? Object.fromEntries(
          Object.entries(value.options as Record<string, unknown>)
            .filter(([key, option]) => ["A", "B", "C", "D"].includes(key.toUpperCase()) && typeof option === "string")
            .map(([key, option]) => [key.toUpperCase(), option])
        )
      : value.options;
  let answer = value.answer;

  if (type === "single") {
    answer = normalizeObjectiveKey(answer) ?? answer;
  }

  if (type === "multiple") {
    answer = Array.isArray(answer)
      ? answer.map(normalizeObjectiveKey).filter((item): item is string => Boolean(item))
      : typeof answer === "string"
        ? answer.split(/[,，、\s]+/).map(normalizeObjectiveKey).filter((item): item is string => Boolean(item))
        : answer;
  }

  if (type === "judge" && typeof answer === "string") {
    answer = /正确|对|true/i.test(answer) ? true : /错误|错|false/i.test(answer) ? false : answer;
  }

  if ((type === "calculation" || type === "comprehensive") && typeof answer === "string") {
    answer = {
      keyPoints: [answer],
      sampleSolution: answer
    };
  }

  return {
    ...value,
    type,
    options: type === "calculation" || type === "comprehensive" ? null : normalizedOptions,
    answer,
    analysis: typeof value.analysis === "string" && value.analysis.trim() ? value.analysis : "围绕本题考点，先抓题干条件，再匹配对应准则口径。",
    difficulty: params.difficulty,
    knowledgePoint:
      typeof value.knowledgePoint === "string" && value.knowledgePoint.trim()
        ? value.knowledgePoint
        : params.knowledgePoint,
    source: "ai",
    score: Number.isInteger(value.score) && Number(value.score) > 0 ? value.score : 1,
    examTips: Array.isArray(value.examTips)
      ? value.examTips.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 2)
      : undefined
  };
}

function getQuestionTextForQuality(question: QuestionPayload) {
  return [
    question.question,
    question.analysis,
    question.options ? Object.values(question.options).join(" ") : "",
    question.examTips?.join(" ") ?? ""
  ].join(" ");
}

function assertQuestionQuality(question: QuestionPayload, params: GenerateParams) {
  const text = getQuestionTextForQuality(question);
  const bannedPatterns = [
    /重点追打/,
    /用户在/,
    /下一题必须/,
    /薄弱点提示/,
    /只要业务发生/,
    /完全由管理层自由裁量/,
    /做错只能记住答案/,
    /最符合考试口径/,
    /不能继续变式训练/
  ];

  if (bannedPatterns.some((pattern) => pattern.test(text))) {
    throw new Error("AI_QUESTION_QUALITY_FAILED");
  }

  if (question.source !== "ai" || question.type !== params.questionType || question.difficulty !== params.difficulty) {
    throw new Error("AI_QUESTION_SCHEMA_MISMATCH");
  }

  if (question.type === "single" || question.type === "multiple") {
    const optionText = Object.values(question.options ?? {}).join(" ");
    if (!question.options || Object.keys(question.options).length < 4 || optionText.length < 24) {
      throw new Error("AI_QUESTION_OPTIONS_WEAK");
    }
  }

  if (params.subject === "财务管理" && /流动比率|速动比率|现金比率|财务分析|偿债能力/.test(params.knowledgePoint)) {
    const hasFinanceSignal = /流动资产|流动负债|速动资产|现金资产|比率|指标|偿债|周转|营业收入|资产总额|所有者权益/.test(text);
    if (!hasFinanceSignal) {
      throw new Error("AI_QUESTION_NOT_FINANCE_LIKE");
    }
  }
}

export function isCompatibleChatProvider(provider = serverEnv.AI_PROVIDER): provider is CompatibleChatProvider {
  return provider === "dashscope" || provider === "deepseek";
}

export function getAiProviderLabel(provider = serverEnv.AI_PROVIDER) {
  switch (provider) {
    case "deepseek":
      return "DeepSeek";
    case "dashscope":
      return "百炼 Qwen";
    case "openai":
      return "OpenAI";
    default:
      return "AI";
  }
}

function getCompatibleChatProviderConfig(provider: CompatibleChatProvider) {
  if (provider === "deepseek") {
    return {
      apiKey: serverEnv.DEEPSEEK_API_KEY,
      baseUrl: serverEnv.DEEPSEEK_BASE_URL,
      model: serverEnv.DEEPSEEK_MODEL,
      fastModel: serverEnv.DEEPSEEK_MODEL
    };
  }

  return {
    apiKey: serverEnv.DASHSCOPE_API_KEY,
    baseUrl: serverEnv.DASHSCOPE_BASE_URL,
    model: serverEnv.DASHSCOPE_MODEL,
    fastModel: "qwen3.6-flash"
  };
}

export function getCompatibleChatCandidateModels(params?: {
  provider?: CompatibleChatProvider;
  latencyProfile?: "default" | "fast";
}) {
  const provider = params?.provider ?? serverEnv.AI_PROVIDER;
  if (!isCompatibleChatProvider(provider)) {
    return [];
  }

  const config = getCompatibleChatProviderConfig(provider);
  const preferred = params?.latencyProfile === "fast" ? [config.fastModel, config.model] : [config.model];

  return [...new Set(preferred.filter(Boolean))];
}

export async function requestJsonFromCompatibleChat(params: {
  provider?: CompatibleChatProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
}) {
  const provider = params.provider ?? serverEnv.AI_PROVIDER;
  if (!isCompatibleChatProvider(provider)) {
    throw new Error("UNSUPPORTED_COMPATIBLE_PROVIDER");
  }

  const config = getCompatibleChatProviderConfig(provider);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    signal: AbortSignal.timeout(params.timeoutMs),
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature ?? 0.3,
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      messages: [
        {
          role: "system",
          content: params.systemPrompt
        },
        {
          role: "user",
          content: params.userPrompt
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
  });

  if (!response.ok) {
    throw new Error("AI_GENERATION_FAILED");
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "{}";
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI_JSON_PARSE_FAILED");
  }
}

function buildPrompt({
  subject,
  knowledgePoint,
  questionType,
  difficulty,
  practiceMode,
  chaseMode,
  lastWrongReason,
  referenceContext
}: GenerateParams) {
  const isSubjective = questionType === "calculation" || questionType === "comprehensive";
  const answerSpec =
    questionType === "multiple"
      ? `"answer":["A","C"]`
      : questionType === "judge"
        ? `"answer":true`
        : isSubjective
          ? `"answer":{"keyPoints":["要点1","要点2"],"sampleSolution":"参考答案"}`
          : `"answer":"A"`;
  const optionsSpec = isSubjective ? `"options":null` : `"options":{"A":"","B":"","C":"","D":""}`;
  const subjectStyleInstruction = getSubjectStyleInstruction(subject);

  return `
你是中级会计师考试出题老师。围绕指定知识点生成 1 道题，只输出合法 JSON 对象，不要 Markdown。

固定字段和值：
{"type":"${questionType}","question":"",${optionsSpec},${answerSpec},"analysis":"","difficulty":"${difficulty}","knowledgePoint":"${knowledgePoint}","source":"ai","score":1,"examTips":["",""]}

命题要求：
1. 题型必须是 ${questionType}，难度必须是 ${difficulty}，source 必须是 ai。
2. ${isSubjective ? "主观题 options 必须为 null，answer 必须包含 keyPoints 和 sampleSolution。" : "客观题 options 必须是 A/B/C/D 对象，答案必须与选项匹配。"}
3. chaseMode=${chaseMode ? "true" : "false"} 时，保持同考点、同题型，只改案例条件、数据、问法或干扰项，不要重复原题。
4. 必须像中级会计师考试题：题干有具体业务、指标、金额、主体或判断条件；选项是专业干扰项。
5. 严禁输出泛泛表述，例如“完全由管理层自由裁量”“做错只能记住答案”“最符合考试口径”“只要业务发生”。
6. 如果知识点是“财务分析与评价”，优先围绕偿债能力、营运能力、盈利能力、发展能力、上市公司财务指标、比较分析法、比率分析法或因素分析法命题。
7. analysis 控制在 120 字以内，用一句话写清正确口径。
8. question、options、analysis、examTips 都不得复述“薄弱点提示”，不得出现“重点追打”“用户在”“下一题必须”等内部提示语。
9. ${subjectStyleInstruction}

科目：${subject ?? "未指定"}
知识点：${knowledgePoint}
题型：${questionType}
难度：${difficulty}
练习模式：${practiceMode ?? "daily"}
chaseMode：${chaseMode ? "true" : "false"}
薄弱点提示：${lastWrongReason ?? "无"}
${referenceContext ? `\n${referenceContext}` : ""}
`.trim();
}

function getSubjectStyleInstruction(subject?: string) {
  if (subject === "中级会计实务") {
    return "会计变式题按“刘阳式”实务训练取向：先判断准则适用场景，再考确认、计量、分录或报表列报；题干要有交易背景、金额或处理节点，干扰项围绕入账价值、损益/资本公积、成本/费用、时点/期间设置。不要模仿任何个人口头表达。";
  }

  if (subject === "财务管理") {
    return "财务管理变式题按“达江式”公式训练取向：先锁定公式和变量口径，再设置可计算数据、指标归类或因素分析陷阱；题干要有明确数据，干扰项围绕分子分母、平均数口径、指标方向、替代顺序设置。不要模仿任何个人口头表达。";
  }

  if (subject === "经济法") {
    return "经济法变式题按“杨光式”法条要件训练取向：先抓主体、行为、期限、比例、例外，再用小案例判断结论；题干要有具体主体关系或法律行为，干扰项围绕适用条件、禁止/允许、责任承担、期间比例设置。不要模仿任何个人口头表达。";
  }

  return "按中级会计师正式考试口径命题，题干具体、选项专业、解析直接，不使用个人化口头表达。";
}

export async function generateQuestionWithAI(
  params: GenerateParams
): Promise<QuestionPayload> {
  if (isPlaceholderAI()) {
    return createDemoQuestion(params);
  }

  const referenceContext = await getReferencePromptContext({
    knowledgePoint: params.knowledgePoint,
    questionType: params.questionType
  });

  const prompt = buildPrompt({
    ...params,
    referenceContext
  });

  try {
    if (isCompatibleChatProvider()) {
      const candidateModels = getCompatibleChatCandidateModels({
        latencyProfile: params.latencyProfile
      });

      let lastError: unknown = null;

      for (const [index, model] of candidateModels.entries()) {
        try {
          const parsed = await requestJsonFromCompatibleChat({
            model,
            systemPrompt: "你是一个专业的中级会计师考试出题助手。必须严格按要求输出合法 JSON。",
            userPrompt: prompt,
            timeoutMs: params.latencyProfile === "fast" && index === 0 ? 18000 : 28000,
            maxTokens: params.questionType === "calculation" || params.questionType === "comprehensive" ? 1400 : 1000,
            temperature: params.chaseMode ? 0.45 : 0.35
          });
          const question = questionSchema.parse(normalizeQuestionCandidate(parsed, params));
          assertQuestionQuality(question, params);
          return question;
        } catch (error) {
          console.error("[ai] question generation failed", {
            provider: serverEnv.AI_PROVIDER,
            model,
            questionType: params.questionType,
            chaseMode: Boolean(params.chaseMode),
            error: error instanceof Error ? error.message : String(error)
          });
          lastError = error;
        }
      }

      throw lastError ?? new Error("AI_GENERATION_FAILED");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: serverEnv.OPENAI_MODEL,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "accounting_question",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: {
                  type: "string",
                  enum: ["single", "multiple", "judge", "calculation", "comprehensive"]
                },
                question: { type: "string" },
                options: {
                  anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        A: { type: "string" },
                        B: { type: "string" },
                        C: { type: "string" },
                        D: { type: "string" }
                      }
                    },
                    { type: "null" }
                  ]
                },
                answer: {
                  anyOf: [
                    { type: "string", enum: ["A", "B", "C", "D"] },
                    {
                      type: "array",
                      items: { type: "string", enum: ["A", "B", "C", "D"] }
                    },
                    { type: "boolean" },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        keyPoints: {
                          type: "array",
                          items: { type: "string" }
                        },
                        sampleSolution: { type: "string" }
                      },
                      required: ["keyPoints", "sampleSolution"]
                    }
                  ]
                },
                analysis: { type: "string" },
                difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                knowledgePoint: { type: "string" },
                source: { type: "string", enum: ["official", "ai"] },
                score: { type: "number" },
                examTips: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: [
                "type",
                "question",
                "options",
                "answer",
                "analysis",
                "difficulty",
                "knowledgePoint",
                "source",
                "score"
              ]
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error("AI_GENERATION_FAILED");
    }

    const data = (await response.json()) as {
      output_text?: string;
    };

    const parsed = JSON.parse(data.output_text ?? "{}");
    return questionSchema.parse(parsed);
  } catch {
    return createDemoQuestion(params);
  }
}

function buildSubjectiveReviewPrompt(params: {
  question: QuestionPayload;
  userAnswer: string;
}) {
  return `
你是一个中级会计师主观题阅卷助手。请根据题目、参考答案和用户作答，给出一个尽量稳健的判定。

要求：
1. 只能输出 JSON，不要输出 Markdown 或额外解释。
2. verdict 只能是：
   - correct：核心步骤和关键结论基本到位，虽有小缺漏但整体可判为答对
   - wrong：关键步骤、核心口径或最终结论明显缺失或错误
   - confused：作答过短、明显卡住、内容失焦，无法认为已形成有效答案
3. feedback 用 1-2 句话总结整体评价。
4. strengths 最多 4 条，写用户已经做对或写顺的部分。
5. improvements 最多 4 条，写最值得继续补的缺口。

题目：
${params.question.question}

知识点：
${params.question.knowledgePoint}

参考答案要点：
${typeof params.question.answer === "object" && !Array.isArray(params.question.answer) && params.question.answer !== null
    ? `关键点：${params.question.answer.keyPoints.join("；")}\n示例答案：${params.question.answer.sampleSolution}`
    : String(params.question.answer)}

参考解析：
${params.question.analysis}

用户作答：
${params.userAnswer}
`.trim();
}

function buildMistakeCorrectionPrompt(params: {
  wrongQuestion: string;
  userAnswer?: string;
  correctAnswer?: string;
  userNote?: string;
  knowledgePoint?: string;
  questionType?: QuestionType;
}) {
  return `
你是一个中级会计师错题纠正教练。请只围绕用户这道错题做“错误类型纠正”，不要生成泛泛学习计划。

要求：
1. 必须输出合法 JSON，不要 Markdown，不要代码块，不要额外解释。
2. errorType 必须从以下枚举中选择：
   concept：概念理解错误
   reading：审题关键词错误
   calculation：计算过程错误
   rule：准则/法条/公式口径记混
   entry：会计分录或处理方向错误
   method：题型解法不会
   expression：主观题表达不完整
   careless：粗心或低级失误
3. diagnosis 要直接指出这道题为什么错。
4. correction 要给出正确理解或正确做法。
5. correctionSteps 给 2-5 条可执行纠正步骤。
6. variantStrategy 要说明下一题应该怎样变式，专门纠正这个错误类型。
7. drillPrompt 要能直接作为下一题生成提示。
8. knowledgePoint 如果用户没有明确提供，请根据题干推断一个中级会计师考点。
9. questionType 如果用户没有明确提供，请根据题干推断题型。

错题题干：
${params.wrongQuestion}

用户原答案：
${params.userAnswer?.trim() || "未提供"}

正确答案或参考答案：
${params.correctAnswer?.trim() || "未提供"}

用户补充说明：
${params.userNote?.trim() || "无"}

已知考点：
${params.knowledgePoint?.trim() || "未指定"}

已知题型：
${params.questionType ?? "未指定"}

输出 JSON 字段：
{
  "errorType": "concept|reading|calculation|rule|entry|method|expression|careless",
  "errorTypeLabel": "",
  "knowledgePoint": "",
  "questionType": "single|multiple|judge|calculation|comprehensive",
  "diagnosis": "",
  "correction": "",
  "correctionSteps": ["", ""],
  "variantStrategy": "",
  "drillPrompt": ""
}
`.trim();
}

function fallbackMistakeCorrection(params: {
  wrongQuestion: string;
  correctAnswer?: string;
  knowledgePoint?: string;
  questionType?: QuestionType;
}): MistakeCorrectionAnalysis {
  const text = `${params.wrongQuestion}\n${params.correctAnswer ?? ""}`;
  const hasCalculation = /计算|金额|公式|分摊|折现|摊销|万元|元/.test(text);
  const hasEntry = /分录|借[:：]|贷[:：]|会计处理/.test(text);
  const hasLaw = /公司法|合同|法律|法条|规定|准则/.test(text);
  const errorType = hasCalculation ? "calculation" : hasEntry ? "entry" : hasLaw ? "rule" : "concept";
  const labelMap = {
    concept: "概念理解错误",
    reading: "审题关键词错误",
    calculation: "计算过程错误",
    rule: "准则/法条/公式口径记混",
    entry: "会计分录或处理方向错误",
    method: "题型解法不会",
    expression: "主观题表达不完整",
    careless: "粗心或低级失误"
  } as const;

  return {
    errorType,
    errorTypeLabel: labelMap[errorType],
    knowledgePoint: params.knowledgePoint?.trim() || "错题核心考点",
    questionType: params.questionType ?? "single",
    diagnosis: "这道题的错误集中在核心判断口径没有先锁定，导致答案选择或作答步骤偏离参考答案。",
    correction: params.correctAnswer
      ? `先把参考答案中的关键口径固定下来：${params.correctAnswer}`
      : "先回到题干关键词和考点定义，确认适用条件后再作答。",
    correctionSteps: [
      "先圈出题干中的限制条件和关键动词。",
      "把这道题对应的考点口径写成一句判断规则。",
      "再用同类变式题验证自己是否还会犯同一种错误。"
    ],
    variantStrategy: "下一题保留同一考点，但更换题干条件和干扰项，专门测试这类错误是否已经纠正。",
    drillPrompt: "围绕同一考点生成一道变式题，重点加入容易误判的限制条件。"
  };
}

export async function analyzeMistakeWithAI(params: {
  wrongQuestion: string;
  userAnswer?: string;
  correctAnswer?: string;
  userNote?: string;
  knowledgePoint?: string;
  questionType?: QuestionType;
}): Promise<MistakeCorrectionAnalysis> {
  if (isPlaceholderAI()) {
    return fallbackMistakeCorrection(params);
  }

  const prompt = buildMistakeCorrectionPrompt(params);

  try {
    if (isCompatibleChatProvider()) {
      const candidateModels = getCompatibleChatCandidateModels({
        latencyProfile: "default"
      });
      let lastError: unknown = null;

      for (const [index, model] of candidateModels.entries()) {
        try {
          const parsed = await requestJsonFromCompatibleChat({
            model,
            systemPrompt: "你是一个严谨的中级会计师错题纠正教练，必须输出合法 JSON。",
            userPrompt: prompt,
            timeoutMs: index === 0 ? 22000 : 30000,
            maxTokens: 850,
            temperature: 0.2
          });
          return mistakeCorrectionSchema.parse(parsed);
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError ?? new Error("MISTAKE_ANALYSIS_FAILED");
    }
  } catch {
    return fallbackMistakeCorrection(params);
  }

  return fallbackMistakeCorrection(params);
}

export async function gradeSubjectiveAnswerWithAI(params: {
  question: QuestionPayload;
  userAnswer: string;
}): Promise<SubjectiveAIReview | null> {
  if (isPlaceholderAI()) {
    return null;
  }

  const prompt = buildSubjectiveReviewPrompt(params);

  if (isCompatibleChatProvider()) {
    const candidateModels = getCompatibleChatCandidateModels({
      latencyProfile: "fast"
    });
    let lastError: unknown = null;

    for (const [index, model] of candidateModels.entries()) {
      try {
        const parsed = await requestJsonFromCompatibleChat({
          model,
          systemPrompt: "你是一个严谨的中级会计师主观题阅卷助手，必须输出合法 JSON。",
          userPrompt: prompt,
          timeoutMs: index === 0 ? 18000 : 26000,
          maxTokens: 650,
          temperature: 0.2
        });
        return subjectiveReviewSchema.parse(parsed);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      return null;
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "subjective_review",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              verdict: { type: "string", enum: ["correct", "wrong", "confused"] },
              feedback: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } }
            },
            required: ["verdict", "feedback", "strengths", "improvements"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    output_text?: string;
  };

  return subjectiveReviewSchema.parse(JSON.parse(data.output_text ?? "{}"));
}

export function buildSubjectiveAnalysisText(params: {
  question: QuestionPayload;
  aiReview?: SubjectiveAIReview | null;
}) {
  if (!params.aiReview) {
    return params.question.analysis;
  }

  const parts = [
    `AI 判卷结论：${params.aiReview.feedback}`,
    params.aiReview.strengths.length > 0
      ? `你已经写到位的部分：${params.aiReview.strengths.join("；")}`
      : "",
    params.aiReview.improvements.length > 0
      ? `下一步优先补：${params.aiReview.improvements.join("；")}`
      : "",
    `参考口径：${params.question.analysis}`
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function parseSubjectiveReviewFromAnalysis(analysis?: string | null): SubjectiveAIReview | null {
  if (!analysis || !analysis.startsWith("AI 判卷结论：")) {
    return null;
  }

  const lines = analysis
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const feedback = lines.find((line) => line.startsWith("AI 判卷结论："))?.replace("AI 判卷结论：", "").trim() ?? "";
  const strengthsRaw =
    lines.find((line) => line.startsWith("你已经写到位的部分："))?.replace("你已经写到位的部分：", "").trim() ?? "";
  const improvementsRaw =
    lines.find((line) => line.startsWith("下一步优先补："))?.replace("下一步优先补：", "").trim() ?? "";

  if (!feedback) {
    return null;
  }

  const lowerFeedback = feedback.toLowerCase();
  const verdict: SubmissionVerdict = lowerFeedback.includes("卡住") || lowerFeedback.includes("失焦")
    ? "confused"
    : lowerFeedback.includes("不到位") ||
        lowerFeedback.includes("缺失") ||
        lowerFeedback.includes("错误") ||
        lowerFeedback.includes("不够") ||
        lowerFeedback.includes("偏差")
      ? "wrong"
      : "correct";

  return {
    verdict,
    feedback,
    strengths: strengthsRaw ? strengthsRaw.split("；").map((item) => item.trim()).filter(Boolean) : [],
    improvements: improvementsRaw ? improvementsRaw.split("；").map((item) => item.trim()).filter(Boolean) : []
  };
}

export function getNextDifficultyAfterSubmit(params: {
  currentDifficulty: DifficultyLevel;
  correct: boolean;
  verdict: SubmissionVerdict;
}) {
  return getRecommendedDifficulty(params);
}
