import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, GASOLINA } from "./config.js";
import { processar, agruparPorMes, resumo, paraCsv, compararGasolina } from "./calculos.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, casas = 1) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataBr = (iso) => iso.split("-").reverse().join("/");
const mesBr = (mes) => {
  const [a, m] = mes.split("-");
  return new Date(a, m - 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

let leituras = [];
let visao = "mes"; // "mes" (kWh do mês) | "dia" (kWh/dia, compara ciclos de tamanhos diferentes)
let grafico = null;
let logado = false;
let gasolina = { ...GASOLINA, atualizadoEm: null }; // vem da tabela configuracao
let editandoId = null; // id da leitura em edição (null = nova leitura)

// ---------- Autenticação ----------
// Os dados só aparecem (e só são buscados) com login. Quem protege de verdade é o
// RLS no Supabase: sem login, a consulta volta vazia.
function aplicarSessao(session) {
  logado = !!session;
  document.body.classList.toggle("deslogado", !logado); // esconde o cabeçalho na tela de login
  $("area-login").hidden = logado;
  $("area-lancar").hidden = !logado;
  document.querySelectorAll(".dados").forEach((el) => (el.hidden = !logado));
  $("usuario").textContent = logado ? session.user.email : "";
  if (logado) {
    $("status").textContent = "Carregando…";
    setTimeout(carregar, 0); // fora do callback de auth, como recomenda o supabase-js
  } else {
    leituras = [];
    sairDaEdicao();
    $("status").textContent = "";
    render(); // limpa cards, gráfico e tabela da página
  }
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const botao = e.submitter;
  botao.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("senha").value,
  });
  botao.disabled = false;
  $("msg-login").textContent = !error
    ? ""
    : error.code === "invalid_credentials"
      ? "E-mail ou senha incorretos."
      : `Não foi possível entrar agora (${error.message}). Verifique a conexão e tente de novo.`;
  if (!error) $("senha").value = "";
});

$("sair").addEventListener("click", () => supabase.auth.signOut());

// Dispara já no carregamento (INITIAL_SESSION) e a cada login/logout.
supabase.auth.onAuthStateChange((_evento, session) => aplicarSessao(session));

// ---------- Dados ----------
async function carregar() {
  const [resLeituras, resConfig] = await Promise.all([
    supabase.from("leituras").select("*").order("data_leitura"),
    supabase.from("configuracao").select("*").eq("id", 1).maybeSingle(),
  ]);
  const { data, error } = resLeituras;
  if (error) {
    $("status").textContent = `Erro ao carregar: ${error.message}`;
    return;
  }
  $("status").textContent = "";
  leituras = data;
  // Sem a tabela configuracao (ou sem a linha), segue com os padrões do config.js.
  if (resConfig.error) console.warn("configuracao:", resConfig.error.message);
  if (resConfig.data) {
    gasolina = {
      precoLitro: Number(resConfig.data.gasolina_preco_litro),
      kmPorLitro: Number(resConfig.data.gasolina_km_por_litro),
      atualizadoEm: resConfig.data.atualizado_em,
    };
  }
  preencherGasolina();
  render();
}

function preencherGasolina() {
  $("gas-preco").value = gasolina.precoLitro;
  $("gas-km-l").value = gasolina.kmPorLitro;
  $("msg-gasolina").textContent = gasolina.atualizadoEm
    ? `Atualizado em ${new Date(gasolina.atualizadoEm).toLocaleDateString("pt-BR")}.`
    : "";
}

$("form-gasolina").addEventListener("submit", async (e) => {
  e.preventDefault();
  const linha = {
    id: 1,
    gasolina_preco_litro: Number($("gas-preco").value),
    gasolina_km_por_litro: Number($("gas-km-l").value),
    atualizado_em: new Date().toISOString(),
  };
  $("salvar-gasolina").disabled = true;
  const { error } = await supabase.from("configuracao").upsert(linha);
  $("salvar-gasolina").disabled = false;
  if (error) {
    $("msg-gasolina").textContent = `Erro ao salvar: ${error.message}`;
    return;
  }
  carregar();
});

$("form-leitura").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nova = {
    data_leitura: $("data").value,
    kwh_total: Number($("kwh-total").value),
    kwh_carro: Number($("kwh-carro").value),
    valor_total: $("valor").value === "" ? null : Number($("valor").value),
    odometro: $("odometro").value === "" ? null : Number($("odometro").value),
  };
  const erro = validar(nova);
  if (erro) {
    $("msg-leitura").textContent = erro;
    return;
  }
  // Em edição, atualiza pelo id: assim trocar a data não cria uma leitura nova.
  $("salvar").disabled = true;
  const { error } = editandoId
    ? await supabase.from("leituras").update(nova).eq("id", editandoId)
    : await supabase.from("leituras").upsert(nova, { onConflict: "data_leitura" });
  $("salvar").disabled = false;
  if (error) {
    $("msg-leitura").textContent = `Erro ao salvar: ${error.message}`;
    return;
  }
  sairDaEdicao();
  $("msg-leitura").textContent = "Leitura salva.";
  carregar();
});

$("cancelar-edicao").addEventListener("click", () => {
  sairDaEdicao();
  $("msg-leitura").textContent = "";
});

// A leitura do carregador é acumulada: tem que ficar entre a anterior e a próxima.
function validar(nova) {
  if (editandoId && leituras.some((l) => l.id !== editandoId && l.data_leitura === nova.data_leitura))
    return `Já existe uma leitura em ${dataBr(nova.data_leitura)}.`;

  const outras = leituras.filter((l) => l.id !== editandoId && l.data_leitura !== nova.data_leitura);
  const ant = outras.filter((l) => l.data_leitura < nova.data_leitura).at(-1);
  const prox = outras.find((l) => l.data_leitura > nova.data_leitura);
  const fmt = (l) => `${dataBr(l.data_leitura)}: ${num(Number(l.kwh_carro), 0)} kWh`;

  if (ant && nova.kwh_carro < Number(ant.kwh_carro))
    return `A leitura do carregador não pode ser menor que a anterior (${fmt(ant)}).`;
  if (prox && nova.kwh_carro > Number(prox.kwh_carro))
    return `A leitura do carregador não pode ser maior que a seguinte (${fmt(prox)}).`;
  if (ant && nova.kwh_carro - Number(ant.kwh_carro) > nova.kwh_total)
    return "O consumo do carro no período ficou maior que o consumo total. Confira os números.";
  if (prox && Number(prox.kwh_carro) - nova.kwh_carro > Number(prox.kwh_total))
    return `Com esse valor, o consumo do carro no período seguinte (até ${dataBr(prox.data_leitura)}) ficaria maior que o consumo total dele.`;
  if (nova.odometro != null) {
    const antOdo = outras.filter((l) => l.data_leitura < nova.data_leitura && l.odometro != null).at(-1);
    const proxOdo = outras.find((l) => l.data_leitura > nova.data_leitura && l.odometro != null);
    if (antOdo && nova.odometro < Number(antOdo.odometro))
      return `O odômetro não pode ser menor que o anterior (${dataBr(antOdo.data_leitura)}: ${num(Number(antOdo.odometro), 0)} km).`;
    if (proxOdo && nova.odometro > Number(proxOdo.odometro))
      return `O odômetro não pode ser maior que o seguinte (${dataBr(proxOdo.data_leitura)}: ${num(Number(proxOdo.odometro), 0)} km).`;
  }
  if (ant && nova.valor_total == null)
    return "Informe o valor da conta (só a primeira leitura pode ficar sem valor).";
  return null;
}

async function apagar(l) {
  // A leitura mais antiga é a base do carregador: apagá-la faz a seguinte virar base
  // e o período dela sair dos cálculos.
  const seguinte = l.base ? leituras.find((x) => x.data_leitura > l.data_leitura) : null;
  const pergunta = seguinte
    ? `Esta é a leitura mais antiga (base do carregador).\n\n` +
      `Se apagar, a leitura de ${dataBr(seguinte.data_leitura)} vira a base e o consumo e o custo ` +
      `desse período saem dos cálculos.\n\nApagar mesmo assim?`
    : `Apagar a leitura de ${dataBr(l.data_leitura)}?`;
  if (!confirm(pergunta)) return;
  const { error } = await supabase.from("leituras").delete().eq("id", l.id);
  if (error) alert(`Erro ao apagar: ${error.message}`);
  if (l.id === editandoId) sairDaEdicao();
  carregar();
}

function editar(l) {
  editandoId = l.id;
  $("data").value = l.data_leitura;
  $("kwh-total").value = l.kwh_total;
  $("kwh-carro").value = l.kwh_carro;
  $("valor").value = l.valor_total ?? "";
  $("odometro").value = l.odometro ?? "";
  $("salvar").textContent = "Salvar alteração";
  $("cancelar-edicao").hidden = false;
  $("msg-leitura").textContent = `Editando a leitura de ${dataBr(l.data_leitura)}.`;
  $("area-lancar").scrollIntoView({ behavior: "smooth" });
}

function sairDaEdicao() {
  editandoId = null;
  $("form-leitura").reset();
  $("salvar").textContent = "Salvar";
  $("cancelar-edicao").hidden = true;
}

$("exportar").addEventListener("click", () => {
  const blob = new Blob([paraCsv(leituras)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leituras-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.querySelectorAll("[data-visao]").forEach((btn) =>
  btn.addEventListener("click", () => {
    visao = btn.dataset.visao;
    document.querySelectorAll("[data-visao]").forEach((b) =>
      b.setAttribute("aria-pressed", b === btn)
    );
    renderGrafico();
  })
);

// ---------- Renderização ----------
function render() {
  renderResumo();
  renderGrafico();
  renderTabela();
}

function renderResumo() {
  const proc = processar(leituras);
  const r = resumo(agruparPorMes(proc));
  const ultima = proc.at(-1);
  if (!r) {
    $("resumo").innerHTML = leituras.length
      ? '<p class="vazio">Leitura inicial registrada. Lance a próxima para ver quanto o carro custou.</p>'
      : '<p class="vazio">Nenhuma leitura ainda. Lance a primeira em "Lançar leitura".</p>';
    return;
  }
  // Destaque: a última conta dividida entre carro e casa.
  const perc = Math.min(Math.max(ultima.percCarro * 100, 0), 100);
  const dataLonga = new Date(paraData(ultima.data_leitura)).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const g = compararGasolina(proc, gasolina);
  $("resumo").innerHTML = `
    <p class="destaque-titulo">Na conta de ${dataLonga}, o carro custou</p>
    <p class="destaque-valor">${brl.format(ultima.custoCarro)}</p>
    <div class="divisao" role="img" aria-label="Carro ${num(perc, 0)}% da conta, casa ${num(100 - perc, 0)}%">
      <span class="parte-carro"></span>
    </div>
    <div class="divisao-legenda">
      <span><span class="ponto carro"></span><b>Carro</b> ${num(ultima.kwhCarro, 0)} kWh, ${num(perc, 0)}%</span>
      <span><span class="ponto casa"></span><b>Casa</b> ${num(ultima.kwhTotal - ultima.kwhCarro, 0)} kWh, ${brl.format(ultima.custoSemCarro)}</span>
      <span>Conta de ${brl.format(ultima.valorTotal)} em ${ultima.dias} dias</span>
    </div>
    <dl class="numeros">
      <div><dt>Consumo por dia na última conta</dt><dd>${num(ultima.mediaDiaTotal)} kWh</dd>
        <dd class="sub">${num(ultima.mediaDiaCarro)} kWh por dia do carro</dd></div>
      <div><dt>Média por mês da casa toda</dt><dd>${num(r.mediaKwhTotal, 0)} kWh</dd>
        <dd class="sub">${brl.format(r.mediaValorTotal)} por conta</dd></div>
      <div><dt>Média por mês do carro</dt><dd>${num(r.mediaKwhCarro, 0)} kWh</dd>
        <dd class="sub">${brl.format(r.mediaCustoCarro)} por conta</dd></div>
      ${g ? `<div class="economia" title="Gasolina a ${brl.format(gasolina.precoLitro)}/L e ${num(gasolina.kmPorLitro)} km/L. Considera só a recarga em casa.">
        <dt>Economia em relação à gasolina</dt><dd>${brl.format(g.economia)}</dd>
        <dd class="sub">${num(g.km, 0)} km rodados, ${num(g.kwh100km)} kWh/100 km, ${brl.format(g.custoKm)} por km</dd></div>` : ""}
    </dl>`;
  // A barra cresce até a parte do carro uma vez, ao carregar.
  requestAnimationFrame(() => requestAnimationFrame(() =>
    $("resumo").querySelector(".parte-carro")?.style.setProperty("--parte", `${perc}%`)));
}

// "2026-09-17" -> data local ao meio-dia (evita cair no dia anterior por fuso)
const paraData = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d, 12); };

// Cores do tema atual (claro/escuro) lidas do CSS, para eixos, grade e legenda.
const corCss = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderGrafico());

function renderGrafico() {
  Chart.defaults.color = corCss("--suave");
  Chart.defaults.borderColor = corCss("--borda");
  Chart.defaults.font.family = "Barlow, system-ui, sans-serif";
  Chart.defaults.font.size = 13;
  const meses = agruparPorMes(processar(leituras));
  const r = resumo(meses);
  const porDia = visao === "dia";
  const unidade = porDia ? "kWh/dia" : "kWh";
  // Barras empilhadas: casa + carro = total da fatura
  const casa = meses.map((m) => (porDia ? m.mediaDiaTotal - m.mediaDiaCarro : m.kwhCasa));
  const carro = meses.map((m) => (porDia ? m.mediaDiaCarro : m.kwhCarro));
  const media = r ? (porDia ? r.mediaDiaTotal : r.mediaKwhTotal) : 0;

  const config = {
    data: {
      labels: meses.map((m) => mesBr(m.mes)),
      datasets: [
        // carro embaixo (é o foco), casa por cima
        { type: "bar", label: "Carro", data: carro, backgroundColor: corCss("--carro"), stack: "consumo" },
        { type: "bar", label: "Casa", data: casa, backgroundColor: corCss("--casa"), stack: "consumo", borderRadius: 3 },
        {
          type: "line",
          label: "Média do total",
          data: meses.map(() => media),
          borderColor: corCss("--tinta"),
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          stack: "media",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${num(ctx.parsed.y)} ${unidade}`,
            footer: (itens) => {
              const m = meses[itens[0].dataIndex];
              const total = porDia ? m.mediaDiaTotal : m.kwhTotal;
              const perc = m.kwhTotal ? (m.kwhCarro / m.kwhTotal) * 100 : 0;
              return [
                `Total: ${num(total)} ${unidade} (${m.dias} dias)`,
                `Conta: ${brl.format(m.valorTotal)}`,
                `Carro: ${brl.format(m.custoCarro)} (${num(perc, 0)}%)`,
              ];
            },
          },
        },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: unidade } },
      },
    },
  };

  if (grafico) grafico.destroy();
  grafico = new Chart($("grafico"), config);
}

function renderTabela() {
  const proc = processar(leituras).reverse();
  const corpo = $("tabela-corpo");
  corpo.innerHTML = "";
  for (const l of proc) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dataBr(l.data_leitura)}</td>
      <td>${l.base ? "—" : num(l.kwhTotal, 0)}</td>
      <td>${num(Number(l.kwh_carro), 0)}</td>
      <td>${l.base ? "base" : num(l.kwhCarro, 0)}</td>
      <td>${l.base ? "—" : brl.format(l.valorTotal)}</td>
      <td>${l.base ? "—" : brl.format(l.custoCarro)}</td>
      <td>${l.dias ?? "—"}</td>
      <td>${num(l.mediaDiaTotal)} / ${num(l.mediaDiaCarro)}</td>
      <td>${l.odometro == null ? "—" : num(Number(l.odometro), 0)}</td>
      <td>${num(l.km, 0)}</td>
      <td>${num(l.kwh100km)}</td>
      <td class="acoes"></td>`;
    if (logado) {
      const bEd = document.createElement("button");
      bEd.textContent = "Editar";
      bEd.onclick = () => editar(l);
      const bAp = document.createElement("button");
      bAp.textContent = "Apagar";
      bAp.className = "perigo";
      bAp.onclick = () => apagar(l);
      tr.querySelector(".acoes").append(bEd, bAp);
    }
    corpo.append(tr);
  }
}
