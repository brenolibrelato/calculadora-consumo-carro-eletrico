# ⚡ Calculadora de Consumo do Carro Elétrico

Site simples para registrar as leituras da conta de luz e separar quanto do consumo e do custo é do carro elétrico.

**Você informa:** data da leitura, kWh total da fatura, leitura acumulada do carregador do carro (como aparece no marcador) e valor total da conta. O consumo do carro em cada período é a diferença para a leitura anterior do carregador; a primeira leitura serve só de ponto de partida.

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
