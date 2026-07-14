import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import {
  createExamResource,
  deleteExamResource,
  listExamChapters,
  listExamMistakes,
  listExamMockExams,
  listExamStudyLogs,
  updateExamResource
} from "@/lib/exam-os";

const subjectSchema = z.enum(["中级会计实务", "财务管理", "经济法"]);
const resourceSchema = z.enum(["chapters", "mistakes", "study-logs", "mock-exams"]);

const schemas = {
  chapters: z.object({
    subject: subjectSchema,
    chapter_name: z.string().min(1).max(120),
    exam_weight: z.coerce.number().min(0).max(100).default(50),
    manual_mastery_score: z.coerce.number().min(0).max(100).nullable().optional()
  }),
  mistakes: z.object({
    subject: subjectSchema,
    chapter: z.string().min(1).max(120),
    question: z.string().min(1).max(4000),
    my_answer: z.string().min(1).max(4000),
    correct_answer: z.string().min(1).max(4000),
    wrong_reason: z.string().min(1).max(500).default("待分析"),
    review_count: z.coerce.number().int().min(0).optional(),
    is_mastered: z.boolean().optional(),
    question_type: z.enum(["single", "multiple", "judge", "calculation", "comprehensive"]).default("single"),
    difficulty: z.enum(["easy", "medium", "hard"]).default("easy")
  }),
  "study-logs": z.object({
    subject: subjectSchema,
    chapter: z.string().min(1).max(120),
    question_count: z.coerce.number().int().min(0).max(1000),
    wrong_count: z.coerce.number().int().min(0).max(1000),
    minutes: z.coerce.number().int().min(0).max(1440),
    created_at: z.string().datetime().optional()
  }),
  "mock-exams": z.object({
    date: z.string().date(),
    accounting_score: z.coerce.number().min(0).max(100),
    finance_score: z.coerce.number().min(0).max(100),
    law_score: z.coerce.number().min(0).max(100)
  })
} as const;

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "提交内容不正确。" }, { status: 400 });
  }
  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 400 });
}

export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const user = await getApiUser();
    const resource = resourceSchema.parse((await context.params).resource);
    const data = resource === "chapters"
      ? await listExamChapters(user.id)
      : resource === "mistakes"
        ? await listExamMistakes(user.id)
        : resource === "study-logs"
          ? await listExamStudyLogs(user.id)
          : await listExamMockExams(user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const user = await getApiUser();
    const resource = resourceSchema.parse((await context.params).resource);
    const body = await request.json();
    if (resource === "chapters") return NextResponse.json(await createExamResource(user.id, resource, schemas.chapters.parse(body)), { status: 201 });
    if (resource === "mistakes") return NextResponse.json(await createExamResource(user.id, resource, schemas.mistakes.parse(body)), { status: 201 });
    if (resource === "mock-exams") return NextResponse.json(await createExamResource(user.id, resource, schemas["mock-exams"].parse(body)), { status: 201 });
    const input = schemas["study-logs"].parse(body);
    if (input.wrong_count > input.question_count) return NextResponse.json({ error: "错题数不能超过做题数。" }, { status: 400 });
    return NextResponse.json(await createExamResource(user.id, resource, input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const user = await getApiUser();
    const resource = resourceSchema.parse((await context.params).resource);
    const body = await request.json();
    const resourceId = z.string().uuid().or(z.string().min(1)).parse(body.id);
    const input = resource === "chapters"
      ? schemas.chapters.partial().parse(body)
      : resource === "mistakes"
        ? schemas.mistakes.partial().parse(body)
        : resource === "study-logs"
          ? schemas["study-logs"].partial().parse(body)
          : schemas["mock-exams"].partial().parse(body);
    return NextResponse.json(await updateExamResource(user.id, resource, resourceId, input));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const user = await getApiUser();
    const resource = resourceSchema.parse((await context.params).resource);
    const resourceId = z.string().min(1).parse(new URL(request.url).searchParams.get("id"));
    return NextResponse.json(await deleteExamResource(user.id, resource, resourceId));
  } catch (error) {
    return errorResponse(error);
  }
}
