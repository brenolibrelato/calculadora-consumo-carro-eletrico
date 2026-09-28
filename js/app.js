import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { processar, agruparPorMes, resumo, paraCsv } from "./calculos.js";

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
let visao = "total"; // "total" | "carro"
let grafico = null;
let logado = false;

// ---------- Autenticação ----------
async function atualizarSessao() {
  const { data } = await supabase.auth.getSession();
  logado = !!data.session;
  $("area-login").hidden = logado;
  $("area-lancar").hidden = !logado;
  $("usuario").textContent = logado ? data.session.user.email : "";
  renderTabela();
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("#")[0] },
  });
  $("msg-login").textContent = error
    ? `Erro: ${error.message}`
    : "Link enviado! Abra o e-mail neste aparelho para entrar.";
});

$("sair").addEventListener("click", async () => {
  await supabase.auth.signOut();
  atualizarSessao();
});

supabase.auth.onAuthStateChange(() => atualizarSessao());

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
    valor_total: Number($("valor").value),
  };
  if (nova.kwh_carro > nova.kwh_total) {
    $("msg-leitura").textContent = "O kWh do carro não pode ser maior que o total.";
    return;
  }
  const { error } = await supabase.from("leituras").upsert(nova, { onConflict: "data_leitura" });
  if (error) {
    $("msg-leitura").textContent = `Erro ao salvar: ${error.message}`;
    return;
  }
  $("msg-leitura").textContent = "Leitura salva.";
  e.target.reset();
  carregar();
});

async function apagar(id) {
  if (!confirm("Apagar esta leitura?")) return;
  const { error } = await supabase.from("leituras").delete().eq("id", id);
  if (error) alert(`Erro ao apagar: ${error.message}`);
  carregar();
}

function editar(l) {
  $("data").value = l.data_leitura;
  $("kwh-total").value = l.kwhTotal;
  $("kwh-carro").value = l.kwhCarro;
  $("valor").value = l.valorTotal;
  $("area-lancar").scrollIntoView({ behavior: "smooth" });
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
    $("resumo").innerHTML = "<p>Nenhuma leitura ainda.</p>";
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
}

function renderGrafico() {
  const meses = agruparPorMes(processar(leituras));
  const r = resumo(meses);
  const campo = visao === "total" ? "kwhTotal" : "kwhCarro";
  const media = r ? (visao === "total" ? r.mediaKwhTotal : r.mediaKwhCarro) : 0;
  const cor = visao === "total" ? "#3b82f6" : "#10b981";

  const config = {
    data: {
      labels: meses.map((m) => mesBr(m.mes)),
      datasets: [
        {
          type: "bar",
          label: visao === "total" ? "kWh total" : "kWh carro",
          data: meses.map((m) => m[campo]),
          backgroundColor: cor,
          borderRadius: 4,
        },
        {
          type: "line",
          label: "Média",
          data: meses.map(() => media),
          borderColor: "#9ca3af",
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            afterBody: (itens) => {
              const m = meses[itens[0].dataIndex];
              return visao === "total"
                ? `Conta: ${brl.format(m.valorTotal)}`
                : `Custo carro: ${brl.format(m.custoCarro)}`;
            },
          },
        },
      },
      scales: { y: { beginAtZero: true, title: { display: true, text: "kWh" } } },
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
      <td>${num(l.kwhTotal, 0)}</td>
      <td>${num(l.kwhCarro, 0)}</td>
      <td>${brl.format(l.valorTotal)}</td>
      <td>${brl.format(l.custoCarro)}</td>
      <td>${l.dias ?? "—"}</td>
      <td>${num(l.mediaDiaTotal)} / ${num(l.mediaDiaCarro)}</td>
      <td class="acoes"></td>`;
    if (logado) {
      const bEd = document.createElement("button");
      bEd.textContent = "Editar";
      bEd.onclick = () => editar(l);
      const bAp = document.createElement("button");
      bAp.textContent = "Apagar";
      bAp.className = "perigo";
      bAp.onclick = () => apagar(l.id);
      tr.querySelector(".acoes").append(bEd, bAp);
    }
    corpo.append(tr);
  }
}

atualizarSessao();
carregar();
