-- Adiciona o odômetro (km acumulado do carro), opcional em cada leitura.
-- Rode no Supabase (SQL Editor > New query > Run) ANTES de publicar a versão do site com odômetro.
alter table public.leituras
  add column if not exists odometro numeric check (odometro >= 0);
