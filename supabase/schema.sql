-- Rode este script no Supabase: SQL Editor > New query > Run

create table if not exists public.leituras (
  id           bigint generated always as identity primary key,
  data_leitura date    not null unique,
  kwh_total    numeric not null check (kwh_total >= 0),  -- leitura ACUMULADA do medidor
  kwh_carro    numeric not null check (kwh_carro >= 0),  -- leitura ACUMULADA do carregador
  valor_total  numeric check (valor_total >= 0),         -- vazio só na 1ª leitura (base)
  created_at   timestamptz not null default now()
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
