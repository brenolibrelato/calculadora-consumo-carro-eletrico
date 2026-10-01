# ⚡ Calculadora de Consumo do Carro Elétrico

Site simples para registrar as leituras da conta de luz e separar quanto do consumo e do custo é do carro elétrico.

**Você informa:** data da leitura, kWh total da fatura, leitura acumulada do carregador do carro (como aparece no marcador), valor total da conta e, se quiser, o odômetro do carro. O consumo do carro em cada período é a diferença para a leitura anterior do carregador; a primeira leitura serve só de ponto de partida.

**O site calcula:**
- Tarifa efetiva (`valor ÷ kWh total`) e custo do carro (`kWh carro × tarifa`)
- Consumo médio por dia (entre uma leitura e a anterior)
- Com o odômetro: km rodados, kWh/100 km, R$/km e a economia em relação a um carro a gasolina (preço do litro e km/L editáveis no site, na área logada). Considera só a recarga feita em casa.
- Consumo por mês em barras empilhadas (casa + carro), comparado com a média, com a opção de ver em **kWh/mês** ou **kWh/dia** (a visão por dia compara meses com ciclos de leitura de tamanhos diferentes)

Os dados ficam no [Supabase](https://supabase.com) (Postgres). Os dados só aparecem depois do login, e só para os e-mails autorizados, que também são os únicos que podem lançar, editar ou apagar leituras.

> O custo do carro é proporcional ao consumo, então inclui uma parte das taxas fixas da conta (iluminação pública, disponibilidade etc.).

## Stack

- HTML + CSS + JavaScript puro (ES modules), sem build
- [Supabase](https://supabase.com) para o banco e o login por link mágico
- [Chart.js](https://www.chartjs.org/) para o gráfico
- GitHub Pages para a hospedagem

## Backup

O botão **Exportar CSV** baixa todas as leituras (separador `;`, abre direto no Excel).
No plano gratuito, o Supabase pausa projetos parados há ~7 dias. Os dados **não são apagados**, basta reativar o projeto pelo painel.

## Testes

As funções de cálculo têm testes com o test runner nativo do Node (sem instalar nada):

```
node --test
```

## Estrutura

```
index.html
css/style.css
js/config.js      # URL e chave do Supabase
js/calculos.js    # funções puras de cálculo
js/app.js         # tela, formulário, gráfico, login
supabase/schema.sql       # tabela e RLS (instalação nova)
supabase/002-odometro.sql # migração: coluna odometro
supabase/003-configuracao.sql # migração: tabela configuracao (gasolina)
supabase/004-leitura-so-logado.sql # migração: remove a leitura pública
tests/calculos.test.js
```
