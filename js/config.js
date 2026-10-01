// Preencha com os dados do seu projeto Supabase:
// Project Settings > API > Project URL e anon public key.
// A anon key PODE ficar no front: quem protege os dados é o RLS (supabase/schema.sql).
export const SUPABASE_URL = "https://uhrmxtzosytnnkwbtzfv.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_jx5elv4lxPYFG6tr2bQiqg_9BkMpRW5";

// Valores padrão da comparação com gasolina. Os valores usados de verdade ficam
// na tabela configuracao do Supabase e são editados pelo site (área logada).
export const GASOLINA = {
  precoLitro: 6.3, // R$ por litro
  kmPorLitro: 11,  // consumo médio do carro a gasolina
};
