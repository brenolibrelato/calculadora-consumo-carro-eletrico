-- Rode este script no Supabase: SQL Editor > New query > Run

create table if not exists public.leituras (
  id           bigint generated always as identity primary key,
  data_leitura date    not null unique,
  kwh_total    numeric not null check (kwh_total >= 0),  -- consumo da casa informado na fatura
  kwh_carro    numeric not null check (kwh_carro >= 0),  -- leitura ACUMULADA do carregador
  valor_total  numeric check (valor_total >= 0),         -- vazio só na 1ª leitura (base)
  odometro     numeric check (odometro >= 0),            -- km ACUMULADO do carro (opcional)
  created_at   timestamptz not null default now()
);

alter table public.leituras enable row level security;

-- Só e-mails autorizados podem ver, inserir, editar e apagar (for all inclui o SELECT).
-- Sem login, nada aparece.
-- Troque pelos e-mails de quem pode lançar leituras.
create policy "escrita autorizada"
  on public.leituras for all
  to authenticated
  using      ((auth.jwt() ->> 'email') in ('seu-email@exemplo.com'))
  with check ((auth.jwt() ->> 'email') in ('seu-email@exemplo.com'));
