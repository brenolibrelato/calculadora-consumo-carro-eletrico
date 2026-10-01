-- Dados visíveis só para quem está logado e autorizado.
-- Remove a leitura pública; a policy "escrita autorizada" (for all) já cobre o SELECT
-- para os e-mails autorizados. Rode no Supabase (SQL Editor > New query > Run).
drop policy if exists "leitura publica" on public.leituras;
drop policy if exists "leitura publica" on public.configuracao;
