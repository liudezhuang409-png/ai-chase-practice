create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  knowledge_point text not null,
  wrong_streak integer not null default 0,
  total_attempts integer not null default 0,
  total_wrong integer not null default 0,
  last_result text not null default 'wrong' check (last_result in ('correct', 'wrong')),
  updated_at timestamptz not null default now(),
  unique (user_id, knowledge_point)
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  knowledge_point text not null,
  question_payload jsonb not null,
  chase_mode boolean not null default false,
  status text not null default 'generated' check (status in ('generated', 'answered', 'expired')),
  selected_answer text check (selected_answer in ('A', 'B', 'C', 'D')),
  is_correct boolean,
  generated_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.practice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  practice_session_id uuid unique references public.practice_sessions(id) on delete set null,
  knowledge_point text not null,
  question text not null,
  options jsonb not null,
  selected_answer text not null check (selected_answer in ('A', 'B', 'C', 'D')),
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  is_correct boolean not null,
  chase_mode boolean not null default false,
  analysis text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_no text not null unique,
  channel text not null check (channel in ('alipay', 'wechat', 'mock')),
  plan_target text not null default 'pro' check (plan_target in ('pro')),
  amount_fen integer not null check (amount_fen > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'closed')),
  provider_trade_no text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.users
  add column if not exists plan_expires_at timestamptz;

alter table public.practice_logs
  add column if not exists practice_session_id uuid references public.practice_sessions(id) on delete set null;

create index if not exists idx_practice_logs_user_created_at
  on public.practice_logs (user_id, created_at desc);

create index if not exists idx_user_knowledge_user_id
  on public.user_knowledge (user_id);

create index if not exists idx_practice_sessions_user_generated_at
  on public.practice_sessions (user_id, generated_at desc);

create index if not exists idx_payment_orders_user_created_at
  on public.payment_orders (user_id, created_at desc);

alter table public.users enable row level security;
alter table public.user_knowledge enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_logs enable row level security;
alter table public.payment_orders enable row level security;

drop policy if exists "users can read own profile" on public.users;
drop policy if exists "users can update own profile" on public.users;
drop policy if exists "users can read own knowledge" on public.user_knowledge;
drop policy if exists "users can insert own knowledge" on public.user_knowledge;
drop policy if exists "users can update own knowledge" on public.user_knowledge;
drop policy if exists "users can read own practice sessions" on public.practice_sessions;
drop policy if exists "users can insert own practice sessions" on public.practice_sessions;
drop policy if exists "users can update own practice sessions" on public.practice_sessions;
drop policy if exists "users can read own practice logs" on public.practice_logs;
drop policy if exists "users can insert own practice logs" on public.practice_logs;
drop policy if exists "users can read own payment orders" on public.payment_orders;
drop policy if exists "users can insert own payment orders" on public.payment_orders;

create policy "users can read own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

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

create policy "users can read own payment orders"
on public.payment_orders
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
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
