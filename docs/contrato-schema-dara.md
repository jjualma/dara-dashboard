# Contrato de dados — DARA Dashboard (para o chat ETL)

Este documento descreve exatamente o formato de JSON que cada arquivo precisa ter
para substituir os dados sintéticos do dashboard sem precisar mexer no código D3.js.
Leve este arquivo (e os JSONs sintéticos atuais como referência de formato) para o
chat ETL.

**Regra de ouro:** o D3.js só lê os campos abaixo, pelos nomes exatos. Se o pipeline
gerar um campo com nome diferente (ex.: `PCT_ELEITOS` maiúsculo, ou `municipio` em
vez de `municipio_nome`), o gráfico quebra silenciosamente (mostra tudo em branco,
sem erro visível).

**Sobre valores ausentes (NA):** ao exportar com `jsonlite::write_json()`, sempre
passe `na = "null"` explicitamente:
```r
write_json(fig9_json, "fig9.json", auto_unbox = TRUE, digits = 2, na = "null")
```
Sem isso, `NA_real_`/`NA_integer_` pode virar a string `"NA"` em vez de `null` no JSON
— o dashboard já trata esse caso como proteção (`js/colors.js`, função `loadJSON`),
mas o correto é sair certo do R desde o início.

---

## ⚠️ Regra confirmada — candidatos/eleitos com `DSC_COR_RACA == "NAOINF"`

**Decisão (confirmada 18/08):** excluir do denominador, não só do numerador —
`filter(DSC_COR_RACA %in% names(RACA_LABEL))` **antes** de qualquer `group_by`/soma,
em todos os 4 arquivos. As 10 categorias válidas somam 100% de quem **declarou** raça,
não de todo mundo.

**Por que isso importa e não é só um detalhe:** cerca de 0,48% dos eleitos no Brasil
(942 de 195.542, concentrado em Vereador) não declararam raça. Isso é pequeno demais
pra notar na maioria dos grupos — mas quando o denominador de um grupo é minúsculo
(ex.: 1 senador só, 1 vaga), pode zerar o grupo inteiro. Foi assim que achamos o bug:
Sergipe elegeu 1 só senador em 2022, e ele é o único caso `NAOINF` — como consequência
**correta** da regra, `fig2.json`/`fig1.json` mostram esse grupo específico como sem
dado (denominador = 0 depois de excluir quem não declarou), não como um erro.

Se algum dia quiserem trocar pra Opção B (manter NAOINF no denominador, sem contar em
nenhuma categoria), essa nota deixa registrado o motivo da escolha atual — não é
esquecimento, foi decisão deliberada.

---

## Mapeamento das bases reais → schema do dashboard

Baseado nas amostras `head_bd_cand_2014_2026.csv`, `head_pop_2010.csv` e `head_pop_2022.csv`.

### Candidaturas (`head_bd_cand_2014_2026.csv`)

| Coluna real | Campo no schema | Observação |
|---|---|---|
| `ANO_ELEICAO` | `ano` | direto |
| `DS_CARGO` | `cargo` | ver tabela de mapeamento abaixo — **nomes diferentes** |
| `SG_UF` | `uf` | direto |
| `SG_PARTIDO` | `partido` | direto |
| `DSC_GENERO` | `genero` | vem como `"MASC"`/`"FEM"` — mapear pra `"Masculino"`/`"Feminino"` |
| `DSC_COR_RACA` | `raca` | vem em CAIXA ALTA (`"BRANCA"`, `"PRETA"`...) — mapear pra Title Case (`"Branca"`, `"Preta"`...). Existe também `DSC_COR_RACA2` e `DSC_GENERO_RACA` na base — não usar essas duas, ficar só com `DSC_COR_RACA` |
| `DSC_RESULTADO` | `etapa` | ver regra de conversão abaixo — **não é mapeamento direto** |
| `REGIAO` | usado pro filtro de Região | já vem pronto, não precisa recalcular |
| `DSC_capital` | usado pro filtro de Capital | já vem pronto (`NA` pra município não-capital, aparentemente — confirmar quando a base completa chegar) |
| `CD_MUNICIPIO_IBGE` | chave de junção pro filtro de Município (cargos municipais) | **na amostra, sempre `NA`** — é porque a amostra só tem eleição geral (2014, cargos estaduais). Confirmar que fica preenchido nas linhas de Prefeito/Vereador da base completa |

**Cargo — mapeamento de nomes (`DS_CARGO` → `cargo`):**
```
"PRESIDENTE"          → "Presidente"
"GOVERNADOR"          → "Governador"
"SENADOR"             → "Senador"
"DEPUTADO FEDERAL"    → "Deputado Federal"
"DEPUTADO ESTADUAL"   → "Deputado Estadual/Distrital"
"DEPUTADO DISTRITAL"  → "Deputado Estadual/Distrital"   (mesma categoria, já era assim antes)
"PREFEITO"            → "Prefeito"
"VEREADOR"            → "Vereador"
```

**⚠️ Ponto em aberto — vice e suplência:** a amostra tem `"VICE-GOVERNADOR"`, `"VICE-PRESIDENTE"` e `"1º SUPLENTE"` como valores de `DS_CARGO`. Nenhum desses tem categoria correspondente no dashboard. **Minha recomendação: excluir essas linhas** da contagem de candidaturas/eleitos (não são o cargo majoritário da chapa) — mas confirma comigo ou ajusta direto no ETL se preferir outra regra (ex.: contar vice junto com o titular).

**⚠️ Ponto em aberto — `DSC_RESULTADO` tem 3 valores, não 2:** `"ELEITO"`, `"NÃO ELEITO"`, `"SUPLENTE"`. O schema do dashboard só tem duas etapas (`Candidaturas`, `Eleitos`). Regra que estou assumindo — **me avise se for diferente**:
```
etapa = "Candidaturas"  → TODA linha entra aqui (não filtra por resultado)
etapa = "Eleitos"       → só linhas com DSC_RESULTADO == "ELEITO"
                          ("SUPLENTE" NÃO conta como eleito — fica de fora da etapa Eleitos)
```

### População (`head_pop_2010.csv` / `head_pop_2022.csv`)

Já vem exatamente nas 5 categorias de raça × 2 gêneros, por município — ótimo, dá pra somar direto:

| Coluna real | Uso |
|---|---|
| `CD_MUNICIPIO_IBGE` | chave de junção com a base de candidaturas |
| `SG_UF` | pra agregar população por estado (soma dos municípios da UF) |
| `MASC BRANCA`, `FEM BRANCA`, `MASC PRETA`, `FEM PRETA`, `MASC AMARELA`, `FEM AMARELA`, `MASC PARDA`, `FEM PARDA`, `MASC INDIGENA`, `FEM INDIGENA` | população absoluta — somar por UF (ou por região, ou nacional) conforme a agregação de cada figura |
| `REGIAO`, `DSC_capital` | mesma lógica da base de candidaturas |

### Qual Censo usar em cada ano (item 7 combinado em chat)

```
Eleições de 2014, 2016, 2018, 2020  →  usar head_pop_2010.csv (Censo 2010)
Eleições de 2022, 2024, 2026        →  usar head_pop_2022.csv (Censo 2022)
```
Isso significa que o `pct_populacao` de `fig2.json` (e dos arquivos de `municipios-dados/`) muda de base em 2022 — é esperado, é o Censo novo entrando. Não precisa (nem deve) interpolar entre os dois.

---


```
RACA:    "Preta" | "Parda" | "Branca" | "Indígena" | "Amarela"
         (NÃO agregar Preta+Parda em "Negra" — são categorias separadas em todo o dashboard)

GENERO:  "Feminino" | "Masculino"
         (a interface exibe "Mulheres"/"Homens", mas o campo no JSON continua Feminino/Masculino)

CARGO:   "Presidente" | "Governador" | "Senador" | "Deputado Federal" |
         "Deputado Estadual/Distrital" | "Prefeito" | "Vereador"
         (NÃO incluir "Todos" — isso é um agregado calculado no navegador)

UF:      sigla de 2 letras (AC, AL, AM, ..., TO) — 27 UFs

PARTIDO: sigla oficial do partido (ex.: PT, PL, UNIÃO, PSOL...) — a lista NÃO é mais
         fixa no código: o dashboard lê os partidos direto de fig9.json e monta o
         filtro sozinho. Pode aparecer qualquer partido novo sem precisar mexer no
         código — só incluir a sigla nas linhas do JSON.
```

### Tabela cargo × anos válidos (o pipeline deve respeitar isso — não gerar linha de
### Deputado Federal em 2016, por exemplo)

| Cargo | Anos |
|---|---|
| Presidente, Governador, Senador, Deputado Federal, Deputado Estadual/Distrital | 2014, 2018, 2022, 2026 |
| Prefeito, Vereador | 2016, 2020, 2024 |

**Atualização parcial é normal.** Se 2026 ainda não tem dado fechado, é só não incluir
nenhuma linha com `"ano": 2026` — o dashboard detecta a ausência sozinho e mostra
"Sem dado carregado ainda" no lugar do gráfico daquele ano, em vez de mostrar um
gráfico vazio/zerado que pareceria erro. Quando 2026 sair, é só acrescentar as linhas
correspondentes nos JSONs existentes — não precisa reestruturar nada.

---

## `data/fig1.json` — Funil (Candidaturas → Eleitos)

```json
{
  "etapas": ["Candidaturas", "Eleitos"],
  "dados": [
    {
      "cargo": "Deputado Federal",
      "ano": 2022,
      "raca": "Preta",
      "genero": "Feminino",
      "etapa": "Candidaturas",
      "valor_pct": 3.88,
      "n": 522
    }
  ]
}
```
- **Granularidade:** 1 linha por (cargo, ano, raça, gênero, etapa).
- **`valor_pct`**: percentual daquele grupo (raça×gênero) dentro daquela etapa —
  **as 10 combinações de raça×gênero devem somar 100% dentro de cada (cargo, ano, etapa)**.
- **`n`** *(campo novo)*: número absoluto de candidaturas/eleitos daquele grupo — soma
  simples de `COUNT(*)` filtrando por cargo/ano/raça/gênero/etapa. Usado no hover da
  Fig. 1 (Perfil Geral) e no cálculo direto da taxa de sucesso eleitoral (Fig. 10):
  `taxa_sucesso = n(Eleitos) / n(Candidaturas) * 100`. **Sem esse campo, a Fig. 10 não
  funciona** (ela lê `n` direto de `fig1.json`, não recalcula de outro lugar).
- **`etapas`**: mantenha `["Candidaturas", "Eleitos"]` (removemos "Mandatos Ativos" numa rodada anterior).

---

## `data/fig2.json` — Razão de representação por UF

```json
{
  "dados": [
    {
      "cargo": "Deputado Federal",
      "ano": 2022,
      "uf": "BA",
      "raca": "Preta",
      "genero": "Feminino",
      "pct_eleitos": 4.51,
      "pct_populacao": 7.97,
      "razao": 0.56
    }
  ]
}
```
- **Granularidade:** 1 linha por (cargo, ano, UF, raça, gênero).
- **`pct_eleitos`**: % de eleitos daquela UF/cargo/ano que pertence a esse grupo —
  as 10 combinações de raça×gênero devem somar 100% dentro de cada (cargo, ano, uf).
- **`pct_populacao`**: % da população da UF que é desse grupo (raça × gênero), calculado
  a partir da soma dos municípios daquela UF em `head_pop_2010.csv`/`head_pop_2022.csv`
  — **usar o Censo certo pro ano** (ver tabela de mapeamento Censo×ano acima). Isso é
  dado real agora, não mais estimativa.
- **`razao`**: `pct_eleitos / pct_populacao`, arredondado a 2 casas. Se `pct_populacao` for 0,
  usar `null` (o gráfico já trata `null` como "sem dado", pinta em cinza-claro).

---

## `data/geo/municipios-dados/{UF}.json` — mesma lógica do fig2, por município

Mesmos campos de `fig2.json`, trocando `uf` por `municipio_id`/`municipio_nome` — ver
schema completo mais abaixo. `pct_populacao` aqui vem direto da linha do município em
`head_pop_2010.csv`/`head_pop_2022.csv` (sem precisar somar nada, é 1 linha = 1 município).

---

## `data/fig9.json` — Dispersão por partido (Candidaturas/Eleitos)

```json
{
  "dados": [
    {
      "cargo": "Deputado Federal",
      "ano": 2022,
      "partido": "PT",
      "tipo": "Candidaturas",
      "pct_mulheres": 26.3,
      "pct_negros": 32.4,
      "pct_mulheres_negras_entre_mulheres": 43.5,
      "n": 33
    }
  ]
}
```
- **Granularidade:** 1 linha por (cargo, ano, partido, tipo), onde `tipo` é `"Candidaturas"` ou `"Eleitos"`.
- **`pct_mulheres`**: % de mulheres entre as candidaturas/eleitos do partido naquele cargo/ano.
- **`pct_negros`**: % de candidaturas/eleitos Pretos+Pardos somados (aqui sim é uma métrica agregada
  Preta+Parda — é a única figura do dashboard que soma essas duas categorias, de propósito).
- **`pct_mulheres_negras_entre_mulheres`**: dentro do grupo de mulheres do partido, quantos % são
  mulheres pretas ou pardas (denominador = total de mulheres, não total geral). É essa métrica que
  decide a forma do marcador (losango ≥50%, círculo <50%).
- **`n`**: número absoluto de candidaturas/eleitos naquele partido/tipo — controla o tamanho do marcador.

---

## `data/geo/municipios-dados/{UF}.json` — Razão de representação por Município

Um arquivo por UF (27 arquivos), só usado quando cargo = Prefeito/Vereador.

```json
{
  "dados": [
    {
      "cargo": "Prefeito",
      "ano": 2024,
      "municipio_id": "2927408",
      "municipio_nome": "Salvador",
      "raca": "Preta",
      "genero": "Feminino",
      "pct_eleitos": 5.1,
      "pct_populacao": 8.3,
      "razao": 0.61
    }
  ]
}
```
- **`municipio_id`**: código IBGE de 7 dígitos, como string (mesma chave usada no geojson —
  ver seção seguinte). **É a chave de junção entre dado e mapa — se não bater, o município
  fica em branco no mapa sem erro nenhum.**
- Mesma lógica de `pct_eleitos`/`pct_populacao`/`razao` do `fig2.json`, mas por município em
  vez de por UF.
- Nome do arquivo = sigla da UF (`data/geo/municipios-dados/BA.json`, `data/geo/municipios-dados/SP.json` etc.)

---

## Geometria (não deveria precisar mudar)

- `data/geo/brazil-states.geojson` — 27 estados, `properties.sigla` (2 letras) e `properties.name`.
- `data/geo/municipios/{UF}.json` — municípios daquela UF, `properties.id` (código IBGE 7 dígitos,
  **precisa bater exatamente** com `municipio_id` do arquivo de dados) e `properties.name`.
- Esses arquivos já têm dado real do IBGE (nomes e códigos) — só os *valores* associados são
  sintéticos. Não deveria ser necessário regenerar a geometria, só o `municipios-dados/`.

---

## Checklist antes de substituir os arquivos

- [ ] Nenhum registro com `raca: "Negra"` ou `raca: "Não Informada"` (schema atual não usa)
- [ ] Nenhum registro com `cargo: "Todos"`
- [ ] Nenhum registro de Deputado Federal em ano ímpar de calendário municipal (2016/2020/2024) e vice-versa
- [ ] Linhas de `"VICE-GOVERNADOR"`, `"VICE-PRESIDENTE"`, `"1º/2º SUPLENTE"` **excluídas** (ver ponto em aberto acima)
- [ ] Linhas com `DSC_RESULTADO == "SUPLENTE"` contam como não-eleito, não aparecem em `etapa: "Eleitos"`
- [ ] `genero` convertido de `"MASC"/"FEM"` pra `"Masculino"/"Feminino"`
- [ ] `raca` convertido de CAIXA ALTA pra Title Case (`"BRANCA"` → `"Branca"`)
- [ ] Para cada (cargo, ano, etapa) em `fig1.json`, as 10 linhas de raça×gênero somam ~100% em `valor_pct`
- [ ] `fig1.json` tem o campo `n` (número absoluto) em toda linha — sem ele a Fig. 10 não funciona
- [ ] Para cada (cargo, ano, uf) em `fig2.json`, as 10 linhas de raça×gênero somam ~100% em `pct_eleitos`
- [ ] `pct_populacao` de `fig2.json` usa o Censo certo pro ano (2010 até 2020, 2022 em diante)
- [ ] `municipio_id` em `municipios-dados/{UF}.json` bate com `properties.id` de `geo/municipios/{UF}.json`
- [ ] Nomes de campo em minúsculas com underscore, exatamente como nos exemplos acima (case-sensitive)

---

---

## ✅ Schema pendente — RESOLVIDO em 18/08 (script `etl_dara_dashboard_18_8.R`)

Os 4 pontos abaixo foram entregues e integrados. Cada um foi validado antes de trocar
o arquivo no dashboard: soma de raça×gênero fechando ~100% em todos os grupos exceto
os casos esperados (2026 sem eleição ainda; grupos com denominador zerado depois da
exclusão de NAOINF — ver seção "Regra do NAOINF" abaixo), join de município 100%
consistente com o geojson existente (testado em RJ: 92/92).

Essas quatro coisas já têm a visualização implementada e testada no dashboard, mas
mostram "sem dado ainda" porque a granularidade não existe nos arquivos atuais.
Quando o ETL entregar, é só substituir o arquivo — nenhum código muda.

### 1. `fig1.json` precisa de UF (e idealmente partido)

Hoje `fig1.json` (aba Perfil Geral) só tem `cargo, ano, raça, gênero, etapa, valor_pct, n`
— sem UF nem partido. Os filtros de Região/UF/Partido nessa aba continuam ativos (não
desabilitei, por pedido explícito), mas o ajuste que eles fazem é uma aproximação
determinística, não o dado real filtrado — foi conferido contra o TSE e não bate.
Schema proposto (mesma estrutura de hoje, só acrescentando `uf`):
```json
{ "cargo": "Deputado Federal", "ano": 2022, "uf": "SP", "raca": "Preta", "genero": "Feminino",
  "etapa": "Candidaturas", "valor_pct": 4.2, "n": 87 }
```

### 2. `fig2.json` precisa de Candidaturas por UF (hoje só tem Eleitos)

A aba Visão por Estado ganhou duas barras empilhadas novas por UF (uma de Candidaturas,
uma de Eleitos) — a de Eleitos já usa dado real (`pct_eleitos` já existe). A de
Candidaturas mostra "sem dado" porque `fig2.json` não tem essa métrica — só
`pct_eleitos`, `pct_populacao` e `razao`. Precisa de um campo novo, ex.: `pct_candidaturas`
(mesma granularidade de UF × raça × gênero × ano × cargo que já existe hoje).

### 3. `fig9.json` precisa de `pct_homens_brancos` (ou equivalente)

A aba Diversidade Partidária ganhou 2 painéis novos (Candidaturas e Eleitos) cruzando
% de homens brancos (eixo X) com % de mulheres negras (eixo Y) por partido. O eixo Y é
derivável do que já existe (`pct_mulheres × pct_mulheres_negras_entre_mulheres`), mas o
eixo X não — `fig9.json` só rastreia `pct_negros` agregado, não `pct_brancos` nem
recorte por gênero dentro de Branca. Precisa de um campo novo, ex.: `pct_homens_brancos`
(% de homens brancos sobre o total de candidaturas/eleitos do partido).

### 4. Novo arquivo `data/fig_partido_composicao.json` (schema do zero)

Aba nova "Composição Partidária" — duas barras empilhadas (Candidaturas e Eleitos),
Y = sigla do partido, X = % composta por raça × gênero. Hoje é um arquivo stub vazio
(`{"dados": []}`). Schema proposto, mesma lógica de `fig1.json` só trocando a dimensão
nacional por partido:
```json
{
  "dados": [
    { "cargo": "Deputado Federal", "ano": 2022, "partido": "PT", "raca": "Preta",
      "genero": "Feminino", "etapa": "Candidaturas", "valor_pct": 8.1, "n": 42 }
  ]
}
```
- Granularidade: 1 linha por (cargo, ano, partido, raça, gênero, etapa)
- `etapa`: `"Candidaturas"` ou `"Eleitos"` (mesmos dois valores de sempre)
- As 10 combinações de raça×gênero devem somar 100% dentro de cada (cargo, ano, partido, etapa)

---

## ✅ Schema v4 — IMPLEMENTADO em 19/08 (script `etl_dara_dashboard_19_8.R`)

Contexto: depois da rodada anterior, ainda restava simulação (jitter, não dado real)
em 3 pontos — Partido em `fig1.json`/`fig2.json` (que só têm UF), e Região/UF/Capital
em `fig9.json`/`fig_partido_composicao.json` (que só têm Partido). **Já removi essa
simulação do dashboard** (não finge mais nada — quando o recorte não existe no dado
atual, mostra aviso e não mexe em nenhum valor). Esta seção documenta o schema que
elimina esses avisos de vez, trazendo Região + UF + Partido + Capital + Município
como dado real em toda aba.

### 1. Arquivo-base por cargo — substitui o miolo de fig1/fig9/fig_partido_composicao

```
data/base_completa_{cargo}.json   — um arquivo por cargo (7 arquivos), carregado
                                     só quando aquele cargo é selecionado no filtro
```
```json
{
  "dados": [
    { "cargo": "Deputado Federal", "ano": 2022, "uf": "SP", "partido": "PT",
      "raca": "Preta", "genero": "Feminino", "etapa": "Candidaturas",
      "capital": false, "n": 42 }
  ]
}
```
- **Granularidade:** 1 linha por (cargo, ano, uf, partido, raça, gênero, etapa, capital)
- **Só número absoluto (`n`)** — sem percentual pré-calculado. O dashboard soma/filtra
  no navegador e calcula o `%` depois de aplicar qualquer combinação de filtro
  (Região é só uma soma de UFs, calculada a partir de `uf` — não precisa de coluna própria)
- **`capital`**: booleano — a linha é de um candidato de município-capital ou não.
  Já vem pronto na base bruta (`DSC_capital`), só precisa entrar nesse arquivo
- **Tamanho estimado**: o maior cargo (Deputado Federal, 4 eleições) fica em torno de
  49 mil linhas / ~5,4MB sem compressão / **~0,8MB com gzip** — carrega rápido.
  Cargos menores (Senador, Governador) ficam bem menores ainda
- **Requisito de servidor:** nginx precisa servir `.json` com gzip ligado — sem isso,
  o arquivo carrega ~7x mais pesado. Confirmar antes de publicar

Esse arquivo único substitui inteiramente `fig1.json`, `fig9.json` e
`fig_partido_composicao.json` — os três passam a ser **calculados no navegador** a
partir dele (candidaturas×eleitos por raça/gênero pro Perfil Geral, composição por
partido pra Diversidade Partidária e Composição Partidária), sempre com dado real,
não importa a combinação de Região/UF/Partido/Capital escolhida.

### 2. `fig2.json` (Visão por Estado) ganha `partido`

Mesma lógica — adicionar `partido` ao schema atual do `fig2.json`, granularidade
cargo×ano×uf×partido×raça×gênero. População (`pct_populacao`) não precisa de partido
(Censo não é partidário), continua como está, só a parte de candidaturas/eleitos
ganha a coluna nova.

### 3. Município com lista de cidade de verdade (só Vereador/Prefeito)

```
data/municipio_partido/{municipio_id}.json   — um arquivo por município (~5.570 no
                                                total), carregado só quando a pessoa
                                                escolhe aquela cidade específica
```
```json
{
  "dados": [
    { "cargo": "Vereador", "ano": 2024, "partido": "PT",
      "raca": "Preta", "genero": "Feminino", "etapa": "Candidaturas", "n": 8 }
  ]
}
```
- Granularidade: 1 linha por (cargo, ano, partido, raça, gênero, etapa) — `municipio_id`
  já está implícito no nome do arquivo, não precisa repetir dentro dele
- **Tamanho por arquivo:** no máximo ~270KB (município grande, todos os anos/partidos);
  a maioria das ~5.570 cidades vai ficar bem menor que isso
- **Fluxo de UX combinado:**
  1. Cargo = Prefeito/Vereador **+** UF específica escolhida → dropdown de Município
     habilita com a lista real de cidades daquela UF (hoje só mostra "Todos" — muda)
  2. Pessoa escolhe uma cidade → dropdown de Capital desabilita (não faz sentido mais,
     já é uma cidade só) → carrega `municipio_partido/{id}.json` → Partido passa a
     filtrar de verdade
  3. Qualquer outro cargo → Município/Capital continuam nem aparecendo, como já é hoje
- **Lista de nomes de cidade:** reaproveita os arquivos `geo/municipios/{UF}.json` que
  já existem (usados no mapa) — não precisa de nada novo do ETL só pra popular o
  dropdown, só que o `municipio_id` dos dois arquivos bata certinho

### O que fica de fora dessa rodada (avaliar depois)

Partido cruzado com o **mapa coroplético por município** (todos os municípios de um
estado ao mesmo tempo, não um de cada vez) — isso multiplicaria os arquivos
`geo/municipios-dados/{UF}.json` por ~35 partidos, e em estados grandes (SP, MG)
passa de 300MB por arquivo. Continua com aviso de "recorte por partido indisponível"
nesse caso específico — o resto (Região/UF/Partido/Capital/Município em todo o resto
do dashboard) fica 100% real com o schema acima.

---
## Status atual (19/08) — Schema v4 implementado, zero simulação no dashboard

Todos os 4 arquivos principais (`base_completa_{cargo}.json` × 7, `fig2.json` com
`partido`+`n_eleitos`+`n_candidaturas`, e os 5.568 `municipio_partido/{id}.json`) são
**dado real**, gerados por `etl_dara_dashboard_19_8.R`. As 4 abas do dashboard foram
reescritas pra consumir esses arquivos diretamente — nenhuma delas usa mais
`seededJitter`/simulação em lugar nenhum (confirmado via busca no código, zero
ocorrências). Único ponto que continua fora do schema real: Partido cruzado com o
mapa coroplético por município — nesse caso específico o mapa mostra o aviso
"Não existe recorte por partido nesta visão" em vez de dado aproximado (decisão
confirmada: melhor avisar do que fingir).

**Validado contra `2022_2024.csv`** (base bruta): MG/Deputado Federal/2022/Parda =
17,0% batendo exatamente entre o cálculo manual da base bruta e o dashboard.

**Bug real encontrado e corrigido nessa rodada:** o `fig2.json` anterior guardava só
percentual por partido, sem número absoluto nem linha agregada — matematicamente
impossível reconstruir o total da UF sem saber o peso de cada partido. Corrigido
direto no `.R` (seção 4) — `n_eleitos`/`n_candidaturas` agora ficam no arquivo final,
não são mais descartados no `select()`.

`fig1.json`, `fig9.json` e `fig_partido_composicao.json` **não são mais gerados nem
lidos** — o `base_completa_{cargo}.json` os substituiu por completo, o dashboard
calcula tudo no navegador a partir do número absoluto.

## O que leva pro chat ETL (da próxima vez que precisar gerar de novo)

1. Este arquivo (`contrato-schema-dara.md`) — já inclui a regra do NAOINF confirmada,
   o schema v4 completo (Região/UF/Partido/Capital/Município todos reais), e a
   correção do `fig2.json` (número absoluto, não só percentual)
2. Os JSONs de produção atuais como referência de formato
3. A base de candidaturas atualizada + as duas bases de população (Censo 2010 e 2022)
4. `etl_dara_dashboard_19_8.R` como ponto de partida — já corrigido, só precisa
   trocar o caminho do CSV de entrada se a base mudar de nome
5. Instrução sugerida pro ETL:

   > Gere os arquivos JSON conforme o contrato de schema anexo (e o script de
   > referência `etl_dara_dashboard_19_8.R`), usando [base de candidaturas atualizada]
   > e as bases de população do Censo 2010/2022 como fonte. Preserve exatamente os
   > nomes de campo e valores categóricos documentados. `DSC_COR_RACA == "NAOINF"` e
   > gênero não informado são excluídos do denominador (não só do numerador). Exclua
   > candidaturas de vice/suplência do `DS_CARGO`. `DSC_RESULTADO == "SUPLENTE"` conta
   > como não-eleito. Use Censo 2010 pra eleições até 2020 e Censo 2022 pra eleições
   > de 2022 em diante. Todo arquivo de candidaturas/eleitos guarda número absoluto
   > (`n`), nunca só percentual — o dashboard calcula o `%` no navegador depois de
   > aplicar os filtros.

Quando os arquivos novos estiverem prontos, é só substituir os arquivos correspondentes dentro
de `data/` mantendo os mesmos nomes — o `dashboard.html` não precisa de nenhuma alteração.
