import { z } from "zod";

export const questionSchema = z.object({
  question: z.string().min(1),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1)
  }),
  answer: z.enum(["A", "B", "C", "D"]),
  analysis: z.string().min(1)
});
