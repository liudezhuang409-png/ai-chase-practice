import { z } from "zod";

const objectiveKeySchema = z.enum(["A", "B", "C", "D"]);

const subjectiveAnswerSchema = z.object({
  keyPoints: z.array(z.string().min(1)).min(2),
  sampleSolution: z.string().min(1)
});

export const questionSchema = z.object({
  referenceId: z.string().optional(),
  type: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]),
  question: z.string().min(1),
  options: z
    .object({
      A: z.string().min(1).optional(),
      B: z.string().min(1).optional(),
      C: z.string().min(1).optional(),
      D: z.string().min(1).optional()
    })
    .nullable(),
  answer: z.union([
    objectiveKeySchema,
    z.array(objectiveKeySchema).min(1),
    z.boolean(),
    subjectiveAnswerSchema
  ]),
  analysis: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  knowledgePoint: z.string().min(1),
  source: z.enum(["official", "ai", "web"]),
  score: z.number().int().positive(),
  examTips: z.array(z.string().min(1)).optional(),
  sourceFile: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  publishedAt: z.string().optional(),
  fetchedAt: z.string().optional()
});
