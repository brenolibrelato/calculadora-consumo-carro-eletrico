-- Configurações editáveis pelo site (por enquanto: dados da gasolina para a comparação).
-- Rode no Supabase (SQL Editor > New query > Run).
create table if not exists public.configuracao (
  id                    int primary key default 1 check (id = 1), -- só existe uma linha
  gasolina_preco_litro  numeric not null check (gasolina_preco_litro > 0),
  gasolina_km_por_litro numeric not null check (gasolina_km_por_litro > 0),
  atualizado_em         timestamptz not null default now()
);

insert into public.configuracao (id, gasolina_preco_litro, gasolina_km_por_litro)
values (1, 6.3, 11)
on conflict (id) do nothing;

alter table public.configuracao enable row level security;

drop policy if exists "leitura publica" on public.configuracao;
create policy "leitura publica"
  on public.configuracao for select
  using (true);

-- Escrita: copia a mesma regra (lista de e-mails) da policy "escrita autorizada" da tabela leituras.
do $$
declare regra text;
begin
  select qual into strict regra
    from pg_policies
   where schemaname = 'public' and tablename = 'leituras' and policyname = 'escrita autorizada';
  execute 'drop policy if exists "escrita autorizada" on public.configuracao';
  execute format(
    'create policy "escrita autorizada" on public.configuracao for all to authenticated using (%s) with check (%s)',
    regra, regra);
end $$;
