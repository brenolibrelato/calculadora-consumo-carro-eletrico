# ⚡ Calculadora de Consumo do Carro Elétrico

Site simples para registrar as leituras da conta de luz e separar quanto do consumo e do custo é do carro elétrico.

**Você informa:** data da leitura, kWh total, kWh do carro (consumo do período) e valor total da conta.

**O site calcula:**
- Tarifa efetiva (`valor ÷ kWh total`) e custo do carro (`kWh carro × tarifa`)
- Consumo médio por dia (entre uma leitura e a anterior)
- Consumo por mês, comparado com a média, com a opção de alternar entre **Total** e **Carro**

Os dados ficam no [Supabase](https://supabase.com) (Postgres). Qualquer pessoa com o link vê os dados, e só os e-mails autorizados podem lançar, editar ou apagar leituras.

> O custo do carro é proporcional ao consumo, então inclui uma parte das taxas fixas da conta (iluminação pública, disponibilidade etc.).

## Stack

- HTML + CSS + JavaScript puro (ES modules), sem build
- [Supabase](https://supabase.com) para o banco e o login por link mágico
- [Chart.js](https://www.chartjs.org/) para o gráfico
- GitHub Pages para a hospedagem

## Configuração

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito).
2. Em **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), **trocando `seu-email@exemplo.com`** pelo(s) e-mail(s) que podem lançar leituras.
3. Em **Authentication → URL Configuration**, coloque a URL do GitHub Pages em *Site URL* e em *Redirect URLs* (ex.: `https://brenolibrelato.github.io/calculadora-consumo-carro-eletrico/`).
4. Em **Project Settings → API**, copie a *Project URL* e a *anon public key* para [`js/config.js`](js/config.js).

A anon key pode ficar pública no front. Quem protege os dados são as políticas de RLS do `schema.sql`.

### 2. GitHub Pages
**Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.

### Rodar localmente
ES modules não funcionam via `file://`, então use um servidor local:
```bash
python3 -m http.server 8000
# abra http://localhost:8000
```
Para o login funcionar localmente, adicione `http://localhost:8000` em *Redirect URLs* no Supabase.

## Backup

O botão **Exportar CSV** baixa todas as leituras (separador `;`, abre direto no Excel).
No plano gratuito, o Supabase pausa projetos parados há ~7 dias. Os dados **não são apagados**, basta reativar o projeto pelo painel.

## Estrutura

```
index.html
css/style.css
js/config.js      # URL e chave do Supabase
js/calculos.js    # funções puras de cálculo
js/app.js         # tela, formulário, gráfico, login
supabase/schema.sql
```
