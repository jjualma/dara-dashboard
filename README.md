# DARA — Dashboard Eleitoral (Dados e Análises do Racismo e do Antirracismo)

Dashboard interativo em D3.js sobre representação eleitoral por raça e gênero no
Brasil, com base em dados abertos do TSE e Censo IBGE. Publicado em
[daradados.com.br](https://daradados.com.br/).

> ⚠️ O ano **2026** aparece na base como dado ainda **fictício/simulado**, até que
> a base real do TSE para essa eleição seja publicada e substitua os arquivos em
> `site/data/`.

## Estrutura do repositório

```
site/               → tudo que vai pro servidor (HTML, JS, JSON, imagens)
  dashboard.html     → página única do dashboard
  js/                 → colors.js (paleta+loaders), fig1.js, fig2.js, fig9.js,
                        fig_partido_composicao.js
  assets/             → logos DARA/GIZ
  data/               → JSON gerado pelo pipeline em R (não editar manualmente)

pipeline/            → scripts R que geram o conteúdo de site/data/
  etl_dara_dashboard.R      → ETL de produção (fonte oficial dos JSON do site)
  exploratorio/
    Dashbord_candidaturas.Rmd → análise exploratória (Ju Marques) — preparação
                                 de dados anterior ao ETL atual, mantida como
                                 referência histórica, não é a fonte dos JSON
                                 publicados

docs/                 → documentação de referência
  contrato-schema-dara.md    → contrato de schema entre ETL (R) e frontend (D3)

schemas/              → JSON Schema formal por arquivo de dado (a preencher)

deploy/               → script de publicação manual no servidor Ubuntu/nginx
  deploy.sh
```

## Como rodar localmente

Sem build step — é HTML/JS estático. Basta servir a pasta `site/` com qualquer
servidor HTTP simples (não pode ser `file://` direto, porque `fetch()`/`d3.json()`
é bloqueado por CORS em arquivo local):

```bash
cd site
python3 -m http.server 8000
# abrir http://localhost:8000/dashboard.html
```

## Como os dados chegam no dashboard

`pipeline/etl_dara_dashboard.R` lê as bases brutas do TSE (`consulta_cand_*`) e do
Censo IBGE (tabela 9606) e gera os arquivos em `site/data/`. O contrato exato de
nomes de campo, tipos e granularidade está documentado em
`docs/contrato-schema-dara.md` — **qualquer mudança de nome de campo no R precisa
ser refletida lá e avisada no chat do frontend**, porque o D3.js quebra
silenciosamente (tela em branco, sem erro) se um campo não bater.

Arquivos gerados pelo ETL:

| Arquivo | Conteúdo | Consumido por |
|---|---|---|
| `data/base_completa_{cargo}.json` (×7) | candidaturas/eleitos por ano×UF×partido×raça×gênero×etapa | `fig1.js`, `fig9.js`, `fig_partido_composicao.js` |
| `data/fig2.json` | população por raça×gênero×UF (Censo) + razão de representação | `fig2.js` |
| `data/geo/brazil-states.geojson` | contorno dos estados | `fig2.js` |
| `data/geo/municipios/{UF}.json` | contorno dos municípios por UF | filtro de município |
| `data/geo/municipios-dados/{UF}.json` | dado por município | `fig2.js` (mapa) |
| `data/municipio_partido/{id_ibge}.json` | drill-down por município (só Prefeito/Vereador) | `fig1.js`, `fig9.js`, `fig_partido_composicao.js` |

## Publicação (daradados.com.br)

Deploy manual para servidor Ubuntu/nginx existente — ver `deploy/deploy.sh` e o
passo a passo no PR/issue de release. Resumo: só a pasta `site/` é publicada;
`pipeline/`, `docs/`, `schemas/` ficam só no repositório.

## Dados sensíveis — nunca commitar

- CSVs brutos de origem (`consulta_cand_*.csv`, `bd_cand_2014_2026*.csv`) — ficam
  fora do repositório (`.gitignore`), só o JSON agregado (`site/data/`) é versionado.
- Nenhum arquivo em `site/data/` contém CPF ou identificação individual — são
  contagens agregadas (`cargo, ano, uf, partido, raça, gênero, etapa, n`).

## Autoria e revisão

- Pesquisa e pipeline: Jualma
- Revisão acadêmica: Luiz Augusto Campos, Juliana Marques
- Referência teórica: *Raça e eleições no Brasil*
