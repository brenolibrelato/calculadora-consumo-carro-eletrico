// Funções puras de cálculo — sem DOM, sem rede. Fáceis de testar.

const DIA_MS = 24 * 60 * 60 * 1000;

// "2026-09-28" -> timestamp UTC (evita erro de fuso horário)
function paraUtc(dataIso) {
  const [a, m, d] = dataIso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/**
 * Recebe as leituras cruas do banco e devolve em ordem de data,
 * com os valores derivados de cada período.
 * O período de uma leitura vai da leitura anterior até ela;
 * por isso a primeira leitura não tem média/dia.
 */
export function processar(leituras) {
  const ordenadas = [...leituras].sort(
    (a, b) => paraUtc(a.data_leitura) - paraUtc(b.data_leitura)
  );

  return ordenadas.map((l, i) => {
    const kwhTotal = Number(l.kwh_total);
    const kwhCarro = Number(l.kwh_carro);
    const valorTotal = Number(l.valor_total);

    const tarifa = kwhTotal > 0 ? valorTotal / kwhTotal : 0;
    const custoCarro = kwhCarro * tarifa;

    const anterior = ordenadas[i - 1];
    const dias = anterior
      ? Math.round((paraUtc(l.data_leitura) - paraUtc(anterior.data_leitura)) / DIA_MS)
      : null;

    return {
      ...l,
      kwhTotal,
      kwhCarro,
      valorTotal,
      tarifa,
      custoCarro,
      custoSemCarro: valorTotal - custoCarro,
      percCarro: kwhTotal > 0 ? kwhCarro / kwhTotal : 0,
      dias,
      mediaDiaTotal: dias ? kwhTotal / dias : null,
      mediaDiaCarro: dias ? kwhCarro / dias : null,
    };
  });
}

/** Agrupa por mês da leitura ("2026-09"). Várias leituras no mesmo mês são somadas. */
export function agruparPorMes(processadas) {
  const mapa = new Map();
  for (const p of processadas) {
    const mes = p.data_leitura.slice(0, 7);
    const m = mapa.get(mes) ?? { mes, kwhTotal: 0, kwhCarro: 0, valorTotal: 0, custoCarro: 0 };
    m.kwhTotal += p.kwhTotal;
    m.kwhCarro += p.kwhCarro;
    m.valorTotal += p.valorTotal;
    m.custoCarro += p.custoCarro;
    mapa.set(mes, m);
  }
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Médias mensais gerais, para comparar cada mês com a média. */
export function resumo(meses) {
  const n = meses.length;
  if (n === 0) return null;
  const soma = (campo) => meses.reduce((s, m) => s + m[campo], 0);
  return {
    meses: n,
    mediaKwhTotal: soma("kwhTotal") / n,
    mediaKwhCarro: soma("kwhCarro") / n,
    mediaValorTotal: soma("valorTotal") / n,
    mediaCustoCarro: soma("custoCarro") / n,
  };
}

/** CSV simples para backup (separador ; para abrir direto no Excel pt-BR). */
export function paraCsv(leituras) {
  const cab = "data_leitura;kwh_total;kwh_carro;valor_total";
  const linhas = processar(leituras).map((l) =>
    [l.data_leitura, l.kwhTotal, l.kwhCarro, l.valorTotal]
      .map((v) => String(v).replace(".", ","))
      .join(";")
  );
  return [cab, ...linhas].join("\n");
}
