create table if not exists public.eval_runtime (
    id integer primary key default 1,
    target_sample_size integer not null default 120,
    sampled_task_ids jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now(),
    constraint eval_runtime_singleton check (id = 1)
);

insert into public.eval_runtime (id, target_sample_size, sampled_task_ids)
values (1, 120, '[]'::jsonb)
on conflict (id) do nothing;

create table if not exists public.eval_responses (
    id bigserial primary key,
    task_id text not null,
    session_id text not null,
    verdict text not null check (verdict in ('true', 'false', 'unsure')),
    note text not null default '',
    created_at timestamptz not null default now(),
    unique (task_id, session_id)
);

create table if not exists public.eval_skipped (
    id bigserial primary key,
    task_id text not null,
    session_id text not null,
    created_at timestamptz not null default now(),
    unique (task_id, session_id)
);

create index if not exists eval_responses_session_idx on public.eval_responses (session_id);
create index if not exists eval_skipped_session_idx on public.eval_skipped (session_id);
