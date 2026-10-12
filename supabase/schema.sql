-- こそだてポケット: Supabase の SQL Editor に丸ごと貼り付けて Run する(何度実行しても安全)

-- ========== テーブル ==========
create table if not exists public.allowed_users (
  email text primary key
);

create table if not exists public.checks (
  item_id text primary key,
  done boolean not null default false,
  done_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  item_type text not null,
  item_id text not null,
  note text,
  rank int,
  created_by text,
  updated_at timestamptz not null default now(),
  primary key (item_type, item_id)
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'line',
  title text not null,
  body text,
  url text,
  received_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- ========== 許可判定 ==========
-- ログイン中のメールが allowed_users にあるか。RLS を回避して読むため SECURITY DEFINER。
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.is_allowed() from public;
grant execute on function public.is_allowed() to authenticated;

-- ========== updated_at 自動更新 ==========
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_checks_updated_at on public.checks;
create trigger trg_checks_updated_at before update on public.checks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_favorites_updated_at on public.favorites;
create trigger trg_favorites_updated_at before update on public.favorites
  for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ========== RLS(行単位のアクセス制御) ==========
alter table public.allowed_users enable row level security;
alter table public.checks        enable row level security;
alter table public.favorites     enable row level security;
alter table public.notices       enable row level security;
alter table public.settings      enable row level security;

-- allowed_users: 読めるのは自分の行だけ(または許可済みの人)。書き込みはクライアントから不可。
drop policy if exists allowed_users_select on public.allowed_users;
create policy allowed_users_select on public.allowed_users
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_allowed());

-- checks / favorites / notices / settings: 許可済みの人だけ全操作
do $$
declare t text;
begin
  foreach t in array array['checks','favorites','notices','settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed())',
      t || '_all', t);
  end loop;
end $$;

-- ========== Realtime(相手の画面にすぐ反映) ==========
do $$
declare t text;
begin
  foreach t in array array['checks','favorites','notices','settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ========== 最後に、2人のメールアドレスを登録(# を外して書き換えて Run) ==========
-- insert into public.allowed_users values ('YOUR_EMAIL'), ('PARTNER_EMAIL') on conflict do nothing;
