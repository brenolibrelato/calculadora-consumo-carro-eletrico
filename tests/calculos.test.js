// Rode na raiz do projeto com: node --test   (ou npm test) — não precisa instalar nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { processar, agruparPorMes, resumo, compararGasolina, paraCsv } from "../js/calculos.js";

const leituras = [
  // fora de ordem de propósito: processar() deve ordenar por data
  { id: 3, data_leitura: "2026-09-02", kwh_total: 500, kwh_carro: 1350, valor_total: 450, odometro: 11200 },
  { id: 1, data_leitura: "2026-07-01", kwh_total: 300, kwh_carro: 1000, valor_total: null, odometro: 10000 },
  { id: 2, data_leitura: "2026-07-31", kwh_total: 450, kwh_carro: 1150, valor_total: 400, odometro: null },
];

test("processar ordena por data e trata a 1ª leitura como base", () => {
  const p = processar(leituras);
  assert.deepEqual(p.map((l) => l.id), [1, 2, 3]);
  assert.equal(p[0].base, true);
  assert.equal(p[0].kwhTotal, 0);
  assert.equal(p[0].kwhCarro, 0);
  assert.equal(p[0].dias, null);
});

test("consumo do carro é a diferença do carregador acumulado", () => {
  const [, a, b] = processar(leituras);
  assert.equal(a.kwhCarro, 150);
  assert.equal(b.kwhCarro, 200);
});

test("tarifa, custo do carro e percentual", () => {
  const [, a] = processar(leituras);
  assert.equal(a.tarifa, 400 / 450);
  assert.ok(Math.abs(a.custoCarro - (150 * 400) / 450) < 1e-9);
  assert.ok(Math.abs(a.custoSemCarro + a.custoCarro - 400) < 1e-9);
  assert.equal(a.percCarro, 150 / 450);
});

test("dias reais entre leituras, sem erro de fuso (atravessa o horário de verão)", () => {
  const [, a, b] = processar(leituras);
  assert.equal(a.dias, 30);
  assert.equal(b.dias, 33);
  assert.equal(a.mediaDiaTotal, 15);
  assert.equal(a.mediaDiaCarro, 5);
});

test("km só existe com odômetro nas duas pontas", () => {
  const [, a, b] = processar(leituras);
  assert.equal(a.km, null); // esta não tem odômetro
  assert.equal(b.km, null); // a anterior não tem odômetro
  const p = processar([
    { data_leitura: "2026-07-01", kwh_total: 0, kwh_carro: 1000, odometro: 10000 },
    { data_leitura: "2026-07-31", kwh_total: 450, kwh_carro: 1150, valor_total: 450, odometro: 11000 },
  ]);
  assert.equal(p[1].km, 1000);
  assert.equal(p[1].kwh100km, 15);
  assert.equal(p[1].custoKm, 0.15);
});

test("agruparPorMes soma por mês e calcula casa e médias por dia", () => {
  const meses = agruparPorMes(processar(leituras));
  assert.deepEqual(meses.map((m) => m.mes), ["2026-07", "2026-09"]);
  const [jul] = meses;
  assert.equal(jul.kwhCasa, 300);
  assert.equal(jul.dias, 30);
  assert.equal(jul.mediaDiaTotal, 15);
});

test("agruparPorMes junta duas leituras no mesmo mês", () => {
  const meses = agruparPorMes(processar([
    { data_leitura: "2026-08-01", kwh_total: 0, kwh_carro: 0 },
    { data_leitura: "2026-08-03", kwh_total: 20, kwh_carro: 5, valor_total: 20 },
    { data_leitura: "2026-08-31", kwh_total: 400, kwh_carro: 105, valor_total: 400 },
  ]));
  assert.equal(meses.length, 1);
  assert.equal(meses[0].kwhTotal, 420);
  assert.equal(meses[0].kwhCarro, 105);
  assert.equal(meses[0].dias, 30);
});

test("resumo: médias mensais e média por dia ponderada pelos dias", () => {
  const r = resumo(agruparPorMes(processar(leituras)));
  assert.equal(r.meses, 2);
  assert.equal(r.mediaKwhTotal, 475);
  assert.equal(r.mediaKwhCarro, 175);
  assert.equal(r.mediaDiaTotal, 950 / 63);
  assert.equal(resumo([]), null);
});

test("compararGasolina usa só os períodos com km", () => {
  const p = processar([
    { data_leitura: "2026-07-01", kwh_total: 0, kwh_carro: 1000, odometro: 10000 },
    { data_leitura: "2026-07-31", kwh_total: 450, kwh_carro: 1150, valor_total: 450, odometro: 11000 },
    { data_leitura: "2026-08-30", kwh_total: 450, kwh_carro: 1300, valor_total: 450 }, // sem odômetro
  ]);
  const g = compararGasolina(p, { precoLitro: 6, kmPorLitro: 10 });
  assert.equal(g.km, 1000);
  assert.equal(g.custoEletrico, 150);
  assert.equal(g.custoGasolina, 600);
  assert.equal(g.economia, 450);
  assert.equal(compararGasolina(processar(leituras), { precoLitro: 6, kmPorLitro: 10 }), null);
});

test("paraCsv usa ; e vírgula decimal, em ordem de data", () => {
  const csv = paraCsv([
    { data_leitura: "2026-07-31", kwh_total: 450.5, kwh_carro: 1150, valor_total: 400.25, odometro: 11000 },
    { data_leitura: "2026-07-01", kwh_total: 0, kwh_carro: 1000, valor_total: null, odometro: null },
  ]).split("\n");
  assert.equal(csv[0], "data_leitura;kwh_total;kwh_carro_acumulado;valor_total;odometro");
  assert.equal(csv[1], "2026-07-01;0;1000;;");
  assert.equal(csv[2], "2026-07-31;450,5;1150;400,25;11000");
});
