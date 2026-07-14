create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  is_paid boolean not null default false,
  target_exam text default '中级会计师',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb,
  answer jsonb not null,
  analysis text not null,
  knowledge_point text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  type text not null check (type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  source text not null default 'ai' check (source in ('official', 'ai')),
  score integer not null default 2,
  exam_tips jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  knowledge_point text not null,
  wrong_streak integer not null default 0,
  total_attempts integer not null default 0,
  total_wrong integer not null default 0,
  correct_count integer not null default 0,
  confused_count integer not null default 0,
  mastery_score integer not null default 0,
  last_question_type text check (last_question_type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  last_result text not null default 'wrong' check (last_result in ('correct', 'wrong')),
  updated_at timestamptz not null default now(),
  unique (user_id, knowledge_point)
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  knowledge_point text not null,
  question_type text not null default 'single' check (question_type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'hard')),
  practice_mode text not null default 'daily' check (practice_mode in ('daily', 'chase', 'review', 'mock-exam')),
  question_payload jsonb not null,
  chase_mode boolean not null default false,
  status text not null default 'generated' check (status in ('generated', 'answered', 'expired')),
  selected_answer text,
  self_assessment text check (self_assessment in ('correct', 'wrong', 'confused')),
  is_correct boolean,
  generated_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.practice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  practice_session_id uuid unique references public.practice_sessions(id) on delete set null,
  question_bank_id uuid references public.question_bank(id) on delete set null,
  knowledge_point text not null,
  question_type text not null default 'single' check (question_type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'hard')),
  practice_mode text not null default 'daily' check (practice_mode in ('daily', 'chase', 'review', 'mock-exam')),
  question text not null,
  options jsonb,
  selected_answer text not null,
  correct_answer text not null,
  verdict text not null default 'wrong' check (verdict in ('correct', 'wrong', 'confused')),
  is_correct boolean not null,
  chase_mode boolean not null default false,
  analysis text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wrong_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_bank_id uuid references public.question_bank(id) on delete set null,
  practice_session_id uuid references public.practice_sessions(id) on delete set null,
  knowledge_point text not null,
  question_type text not null check (question_type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  wrong_count integer not null default 1,
  last_practiced_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'mastered')),
  unique (user_id, knowledge_point, question_type, difficulty)
);

create table if not exists public.mock_exam_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  exam_name text not null,
  config jsonb not null,
  generated_questions jsonb not null,
  score numeric(6,2),
  weakness_report jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_no text not null unique,
  channel text not null check (channel in ('alipay', 'wechat', 'mock')),
  plan_target text not null default 'pro' check (plan_target in ('pro', 'premium')),
  amount_fen integer not null check (amount_fen > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'closed')),
  provider_trade_no text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.user_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_name text not null,
  target_exam text not null default '中级会计师',
  target_score integer not null,
  days_to_exam integer not null check (days_to_exam > 0),
  daily_minutes integer not null check (daily_minutes > 0),
  study_style text not null check (study_style in ('short-bursts', 'weekend-intensive', 'mistake-first')),
  selected_subjects jsonb not null default '[]'::jsonb,
  selected_topics jsonb not null default '[]'::jsonb,
  plan_payload jsonb not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists is_paid boolean not null default false,
  add column if not exists target_exam text default '中级会计师',
  add column if not exists plan_expires_at timestamptz,
  add column if not exists is_pro_user boolean not null default false,
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists ai_analysis_enabled boolean not null default true,
  add column if not exists usage_limit integer not null default 3;

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject in ('中级会计实务', '财务管理', '经济法')),
  chapter_name text not null,
  mastery_score numeric(5,2) not null default 0 check (mastery_score between 0 and 100),
  manual_mastery_score numeric(5,2) check (manual_mastery_score between 0 and 100),
  wrong_count integer not null default 0,
  mastered_count integer not null default 0,
  review_count integer not null default 0,
  trend text not null default 'flat' check (trend in ('up', 'flat', 'down')),
  exam_weight numeric(5,2) not null default 50,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, subject, chapter_name)
);

create table if not exists public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject in ('中级会计实务', '财务管理', '经济法')),
  chapter text not null,
  question text not null,
  my_answer text not null,
  correct_answer text not null,
  wrong_reason text not null default '待分析',
  review_count integer not null default 0,
  is_mastered boolean not null default false,
  question_type text not null default 'single',
  difficulty text not null default 'easy',
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject in ('中级会计实务', '财务管理', '经济法')),
  chapter text not null,
  question_count integer not null,
  wrong_count integer not null,
  minutes integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  accounting_score numeric(5,2) not null,
  finance_score numeric(5,2) not null,
  law_score numeric(5,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.user_knowledge
  add column if not exists correct_count integer not null default 0,
  add column if not exists confused_count integer not null default 0,
  add column if not exists mastery_score integer not null default 0,
  add column if not exists last_question_type text;

alter table public.practice_sessions
  add column if not exists question_type text not null default 'single',
  add column if not exists difficulty text not null default 'easy',
  add column if not exists practice_mode text not null default 'daily',
  add column if not exists self_assessment text;

alter table public.practice_logs
  add column if not exists question_bank_id uuid references public.question_bank(id) on delete set null,
  add column if not exists question_type text not null default 'single',
  add column if not exists difficulty text not null default 'easy',
  add column if not exists practice_mode text not null default 'daily',
  add column if not exists verdict text not null default 'wrong';

alter table public.user_study_plans
  add column if not exists target_exam text not null default '中级会计师',
  add column if not exists target_score integer,
  add column if not exists days_to_exam integer,
  add column if not exists daily_minutes integer,
  add column if not exists study_style text,
  add column if not exists selected_subjects jsonb not null default '[]'::jsonb,
  add column if not exists selected_topics jsonb not null default '[]'::jsonb,
  add column if not exists plan_payload jsonb,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_question_bank_knowledge_type
  on public.question_bank (knowledge_point, type, difficulty);

create index if not exists idx_practice_logs_user_created_at
  on public.practice_logs (user_id, created_at desc);

create index if not exists idx_user_knowledge_user_id
  on public.user_knowledge (user_id);

create index if not exists idx_practice_sessions_user_generated_at
  on public.practice_sessions (user_id, generated_at desc);

create index if not exists idx_wrong_questions_user_status
  on public.wrong_questions (user_id, status, last_practiced_at desc);

create index if not exists idx_payment_orders_user_created_at
  on public.payment_orders (user_id, created_at desc);

create index if not exists idx_user_study_plans_user_status
  on public.user_study_plans (user_id, status, updated_at desc);

create index if not exists idx_chapters_user_mastery
  on public.chapters (user_id, mastery_score asc);

create index if not exists idx_mistakes_user_mastered
  on public.mistakes (user_id, is_mastered, created_at desc);

create index if not exists idx_study_logs_user_created
  on public.study_logs (user_id, created_at desc);

create index if not exists idx_mock_exams_user_date
  on public.mock_exams (user_id, date desc);

alter table public.users enable row level security;
alter table public.question_bank enable row level security;
alter table public.user_knowledge enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_logs enable row level security;
alter table public.wrong_questions enable row level security;
alter table public.mock_exam_papers enable row level security;
alter table public.payment_orders enable row level security;
alter table public.user_study_plans enable row level security;
alter table public.chapters enable row level security;
alter table public.mistakes enable row level security;
alter table public.study_logs enable row level security;
alter table public.mock_exams enable row level security;

drop policy if exists "users can read own profile" on public.users;
drop policy if exists "users can read own knowledge" on public.user_knowledge;
drop policy if exists "users can read own practice sessions" on public.practice_sessions;
drop policy if exists "users can read own practice logs" on public.practice_logs;
drop policy if exists "users can read own wrong questions" on public.wrong_questions;
drop policy if exists "users can read own mock papers" on public.mock_exam_papers;
drop policy if exists "users can read own payment orders" on public.payment_orders;
drop policy if exists "users can read own study plans" on public.user_study_plans;
drop policy if exists "users manage own chapters" on public.chapters;
drop policy if exists "users manage own mistakes" on public.mistakes;
drop policy if exists "users manage own study logs" on public.study_logs;
drop policy if exists "users manage own mock exams" on public.mock_exams;
drop policy if exists "authenticated can read question bank" on public.question_bank;

create policy "users can read own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

create policy "authenticated can read question bank"
on public.question_bank
for select
to authenticated
using (true);

create policy "users can read own knowledge"
on public.user_knowledge
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own practice sessions"
on public.practice_sessions
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own practice logs"
on public.practice_logs
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own wrong questions"
on public.wrong_questions
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own mock papers"
on public.mock_exam_papers
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own payment orders"
on public.payment_orders
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can read own study plans"
on public.user_study_plans
for select
to authenticated
using (auth.uid() = user_id);

create policy "users manage own chapters"
on public.chapters for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own mistakes"
on public.mistakes for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own study logs"
on public.study_logs for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own mock exams"
on public.mock_exams for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, is_paid)
  values (new.id, new.email, false)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
