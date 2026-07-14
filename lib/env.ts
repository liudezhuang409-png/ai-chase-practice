import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).default("placeholder-anon-key"),
  APP_URL: z.string().url().default("http://localhost:3000")
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("placeholder-service-role-key"),
  AI_PROVIDER: z.enum(["dashscope", "openai", "deepseek"]).default("deepseek"),
  DASHSCOPE_API_KEY: z.string().min(1).default("placeholder-dashscope-api-key"),
  DASHSCOPE_BASE_URL: z.string().url().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  DASHSCOPE_MODEL: z.string().min(1).default("qwen3.6-plus"),
  DEEPSEEK_API_KEY: z.string().min(1).default("placeholder-deepseek-api-key"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-pro"),
  TAVILY_API_KEY: z.string().min(1).default("placeholder-tavily-api-key"),
  OPENAI_API_KEY: z.string().min(1).default("placeholder-openai-api-key"),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini")
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  APP_URL: process.env.APP_URL
});

export const serverEnv = serverEnvSchema.parse({
  ...publicEnv,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL,
  DASHSCOPE_MODEL: process.env.DASHSCOPE_MODEL,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL
});
