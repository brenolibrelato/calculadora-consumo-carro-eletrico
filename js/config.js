// Preencha com os dados do seu projeto Supabase:
// Project Settings > API > Project URL e anon public key.
// A anon key PODE ficar no front: quem protege os dados é o RLS (supabase/schema.sql).
export const SUPABASE_URL = "https://uhrmxtzosytnnkwbtzfv.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_jx5elv4lxPYFG6tr2bQiqg_9BkMpRW5";

// Comparação com um carro a gasolina (card "Economia vs gasolina").
// Ajuste para o preço atual e o consumo do carro que você usaria no lugar.
export const GASOLINA = {
  precoLitro: 6.3, // R$ por litro
  kmPorLitro: 11,  // consumo médio do carro a gasolina
};
