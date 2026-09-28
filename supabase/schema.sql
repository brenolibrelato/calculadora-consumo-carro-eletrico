-- Rode este script no Supabase: SQL Editor > New query > Run

create table if not exists public.leituras (
  id           bigint generated always as identity primary key,
  data_leitura date    not null unique,
  kwh_total    numeric not null check (kwh_total > 0),
  kwh_carro    numeric not null check (kwh_carro >= 0),
  valor_total  numeric not null check (valor_total >= 0),
  created_at   timestamptz not null default now(),
  constraint kwh_carro_menor_que_total check (kwh_carro <= kwh_total)
);

alter table public.leituras enable row level security;

-- Qualquer pessoa com o link pode VER os dados
create policy "leitura publica"
  on public.leituras for select
  using (true);

-- Só e-mails autorizados podem inserir/editar/apagar.
-- Troque pelos e-mails de quem pode lançar leituras.
create policy "escrita autorizada"
  on public.leituras for all
  to authenticated
  using      ((auth.jwt() ->> 'email') in ('seu-email@exemplo.com'))
  with check ((auth.jwt() ->> 'email') in ('seu-email@exemplo.com'));
