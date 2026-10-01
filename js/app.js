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
let editandoId = null; // id da leitura em edição (null = nova leitura)

// ---------- Autenticação ----------
function aplicarSessao(session) {
  logado = !!session;
  $("area-login").hidden = logado;
  $("area-lancar").hidden = !logado;
  $("usuario").textContent = logado ? session.user.email : "";
  renderTabela();
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
  const { data, error } = await supabase.from("leituras").select("*").order("data_leitura");
  if (error) {
    $("status").textContent = `Erro ao carregar: ${error.message}`;
    return;
  }
  $("status").textContent = "";
  leituras = data;
  render();
}

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
      ? "<p>Leitura inicial registrada. Lance a próxima para ver os cálculos.</p>"
      : "<p>Nenhuma leitura ainda.</p>";
    return;
  }
  $("resumo").innerHTML = `
    <div class="card"><span>Última conta — carro</span><strong>${brl.format(ultima.custoCarro)}</strong>
      <small>${num(ultima.percCarro * 100, 0)}% de ${brl.format(ultima.valorTotal)}</small></div>
    <div class="card"><span>Média/dia (última)</span><strong>${num(ultima.mediaDiaTotal)} kWh</strong>
      <small>carro: ${num(ultima.mediaDiaCarro)} kWh/dia</small></div>
    <div class="card"><span>Média/mês total</span><strong>${num(r.mediaKwhTotal, 0)} kWh</strong>
      <small>${brl.format(r.mediaValorTotal)}</small></div>
    <div class="card"><span>Média/mês carro</span><strong>${num(r.mediaKwhCarro, 0)} kWh</strong>
      <small>${brl.format(r.mediaCustoCarro)}</small></div>`;

  const g = compararGasolina(proc, GASOLINA);
  if (g) {
    $("resumo").innerHTML += `
    <div class="card" title="Gasolina a ${brl.format(GASOLINA.precoLitro)}/L e ${num(GASOLINA.kmPorLitro)} km/L (js/config.js). Considera só a recarga em casa.">
      <span>Economia vs gasolina</span><strong>${brl.format(g.economia)}</strong>
      <small>${num(g.km, 0)} km · ${num(g.kwh100km)} kWh/100 km · ${brl.format(g.custoKm)}/km</small></div>`;
  }
}

// Cores do tema atual (claro/escuro) lidas do CSS, para eixos, grade e legenda.
const corCss = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderGrafico());

function renderGrafico() {
  Chart.defaults.color = corCss("--suave");
  Chart.defaults.borderColor = corCss("--borda");
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
        { type: "bar", label: "Casa", data: casa, backgroundColor: "#3b82f6", stack: "consumo" },
        { type: "bar", label: "Carro", data: carro, backgroundColor: "#10b981", stack: "consumo", borderRadius: 4 },
        {
          type: "line",
          label: "Média do total",
          data: meses.map(() => media),
          borderColor: "#9ca3af",
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

carregar();
