import { serverEnv } from "@/lib/env";
import { questionSchema } from "@/lib/question-schema";
import type { QuestionPayload } from "@/lib/types";

type GenerateParams = {
  knowledgePoint: string;
  chaseMode?: boolean;
  lastWrongReason?: string;
};

function buildPrompt({
  knowledgePoint,
  chaseMode,
  lastWrongReason
}: GenerateParams) {
  return `
你是一个严厉但专业的会计考试出题助手。请围绕用户输入的会计知识点生成 1 道高质量单选题。

要求：
1. 必须使用中文。
2. 必须是单选题。
3. 难度贴近会计考试，题干清晰，选项有迷惑性但不能胡编。
4. 如果 chaseMode=true，请围绕同一个知识点生成变式题，不要重复上一题。
5. 如果提供了 lastWrongReason，请针对这个薄弱点继续追打。
6. 只输出 JSON，不要输出 Markdown，不要输出代码块，不要输出额外解释。
7. JSON 结构必须严格等于：
{
  "question": "",
  "options": {"A": "", "B": "", "C": "", "D": ""},
  "answer": "",
  "analysis": ""
}

知识点：${knowledgePoint}
chaseMode：${chaseMode ? "true" : "false"}
薄弱点提示：${lastWrongReason ?? "无"}
`.trim();
}

export async function generateQuestionWithAI(
  params: GenerateParams
): Promise<QuestionPayload> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: serverEnv.OPENAI_MODEL,
      input: buildPrompt(params),
      text: {
        format: {
          type: "json_schema",
          name: "accounting_question",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              question: { type: "string" },
              options: {
                type: "object",
                additionalProperties: false,
                properties: {
                  A: { type: "string" },
                  B: { type: "string" },
                  C: { type: "string" },
                  D: { type: "string" }
                },
                required: ["A", "B", "C", "D"]
              },
              answer: {
                type: "string",
                enum: ["A", "B", "C", "D"]
              },
              analysis: { type: "string" }
            },
            required: ["question", "options", "answer", "analysis"]
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
}
