create extension if not exists "pgcrypto";

alter table public.users
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
  wrong_count integer not null default 0 check (wrong_count >= 0),
  mastered_count integer not null default 0 check (mastered_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  trend text not null default 'flat' check (trend in ('up', 'flat', 'down')),
  exam_weight numeric(5,2) not null default 50 check (exam_weight between 0 and 100),
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
  review_count integer not null default 0 check (review_count >= 0),
  is_mastered boolean not null default false,
  question_type text not null default 'single' check (question_type in ('single', 'multiple', 'judge', 'calculation', 'comprehensive')),
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'hard')),
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null check (subject in ('中级会计实务', '财务管理', '经济法')),
  chapter text not null,
  question_count integer not null check (question_count >= 0),
  wrong_count integer not null check (wrong_count >= 0 and wrong_count <= question_count),
  minutes integer not null check (minutes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  accounting_score numeric(5,2) not null check (accounting_score between 0 and 100),
  finance_score numeric(5,2) not null check (finance_score between 0 and 100),
  law_score numeric(5,2) not null check (law_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_chapters_user_mastery on public.chapters (user_id, mastery_score asc);
create index if not exists idx_mistakes_user_mastered on public.mistakes (user_id, is_mastered, created_at desc);
create index if not exists idx_study_logs_user_created on public.study_logs (user_id, created_at desc);
create index if not exists idx_mock_exams_user_date on public.mock_exams (user_id, date desc);

alter table public.chapters enable row level security;
alter table public.mistakes enable row level security;
alter table public.study_logs enable row level security;
alter table public.mock_exams enable row level security;

drop policy if exists "users manage own chapters" on public.chapters;
drop policy if exists "users manage own mistakes" on public.mistakes;
drop policy if exists "users manage own study logs" on public.study_logs;
drop policy if exists "users manage own mock exams" on public.mock_exams;

create policy "users manage own chapters" on public.chapters for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own mistakes" on public.mistakes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own study logs" on public.study_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own mock exams" on public.mock_exams for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
