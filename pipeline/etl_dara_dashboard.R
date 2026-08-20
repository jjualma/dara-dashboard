# =============================================================================
# DARA — ETL Dashboard Eleitoral (v4 — elimina toda simulação restante)
# Gera:
#   data/base_completa_{cargo_slug}.json   (7 arquivos, NOVO — substitui
#                                            fig1.json, fig9.json e
#                                            fig_partido_composicao.json)
#   data/fig2.json                         (agora com `partido`)
#   data/geo/municipios-dados/{UF}.json    (sem mudança de schema)
#   data/municipio_partido/{municipio_id}.json  (NOVO, ~5.569 arquivos,
#                                                 só Prefeito/Vereador)
#
# ⚠️ MUDANÇA DE COMPORTAMENTO IMPORTANTE: este script NÃO gera mais
# fig1.json, fig9.json nem fig_partido_composicao.json -- o contrato diz
# explicitamente que o arquivo-base por cargo os substitui inteiramente
# (o navegador passa a somar/filtrar e calcular o % sozinho). Se o D3.js
# do dashboard ainda não foi atualizado pra consumir base_completa_*.json,
# publicar esta saída SEM atualizar o frontend junto vai quebrar as abas
# Perfil Geral, Diversidade Partidária e Composição Partidária (elas vão
# tentar carregar arquivos que não existem mais). Confirme que o lado
# D3.js já está pronto antes de substituir os arquivos em produção.
#
# Fontes:
#   - bd_cand_2014_2026_V2.csv  (candidaturas, TSE)
#   - pop_2010.csv / pop_2022.csv (população por município, raça x gênero,
#     Censo IBGE)
#
# Mudanças desta rodada (seção "Schema v4" do contrato):
#   A. NOVO data/base_completa_{cargo}.json -- um arquivo por cargo (7),
#      granularidade (ano,uf,partido,raça,gênero,etapa,capital), só `n`
#      absoluto (sem percentual pré-calculado -- o navegador soma/filtra
#      e calcula % depois de aplicar Região/UF/Partido/Capital). Nomes de
#      arquivo usam um slug ASCII sem espaço/acento/barra (ver
#      CARGO_SLUG abaixo) -- ISSO PRECISA BATER com o que o D3.js espera
#      carregar; combine esse slug com quem mexe no frontend.
#   B. fig2.json ganha `partido` -- granularidade
#      cargo×ano×uf×partido×raça×gênero para pct_eleitos/pct_candidaturas
#      (cada um somando 100% dentro de cargo×ano×uf×partido). pct_populacao
#      e razao continuam no nível de UF (Censo não é partidário) -- o
#      mesmo pct_populacao se repete em todas as linhas de partido daquela
#      combinação cargo×ano×uf×raça×gênero.
#   C. NOVO data/municipio_partido/{municipio_id}.json -- só
#      Prefeito/Vereador, granularidade (cargo,ano,partido,raça,gênero,
#      etapa), só `n` absoluto. Um arquivo por município que tem
#      candidatura municipal (~5.569).
#   D. Partido cruzado com o mapa coroplético por município (todos os
#      municípios de um estado ao mesmo tempo) fica de fora desta rodada
#      -- explodiria municipios-dados/{UF}.json (~35x maior, >300MB em
#      estados grandes). municipios-dados/{UF}.json continua exatamente
#      como estava.
#
# Decisões confirmadas em rodadas anteriores (sem mudança):
#   1. DS_CARGO já não contém VICE-*/SUPLENTE nesta base, mas o filtro
#      por names(CARGO_LABEL) protege mesmo assim.
#   2. Eleito = DSC_RESULTADO == "ELEITO". "SUPLENTE" conta como
#      candidatura mas NÃO como eleito. "Não respondeu" é excluído.
#   3. Censo por ano de eleição: 2014/2016/2018/2020 -> Censo 2010;
#      2022/2024/2026 -> Censo 2022.
#   4. NAOINF (gênero ou raça) é excluído ANTES de qualquer group_by --
#      do denominador, não só do numerador (regra confirmada 18/08;
#      ver exemplo real: SE/Senador/2022 tem 1 único eleito e ele é
#      NAOINF, então esse grupo fica com denominador 0 depois do filtro
#      -- comportamento esperado, não bug).
#   5. Deputado Distrital + Deputado Estadual somados em
#      "Deputado Estadual/Distrital".
#   6. Presidente fica de fora de fig2.json (SG_UF="BR" na base, não é
#      UF de verdade) e de municipios-dados//municipio_partido (não é
#      cargo municipal). Aparece normalmente em base_completa_presidente.json
#      (com uf="BR" uniforme -- ver nota na seção 1).
#   7. Junção com município via SG_UF+SG_UE (não via CD_MUNICIPIO_IBGE da
#      base de candidaturas, que só vem preenchida em ~4% das linhas de
#      Prefeito/Vereador) contra pop_2010.csv/pop_2022.csv.
# =============================================================================

library(tidyverse)
library(jsonlite)

# --- Caminhos (ajuste conforme sua máquina) ---------------------------------
PATH_CAND     <- "bd_cand_2014_2026_V2.csv"
PATH_POP_2010 <- "pop_2010.csv"
PATH_POP_2022 <- "pop_2022.csv"
OUT_DIR       <- "data"
dir.create(file.path(OUT_DIR, "geo", "municipios-dados"), recursive = TRUE, showWarnings = FALSE)
dir.create(file.path(OUT_DIR, "municipio_partido"), recursive = TRUE, showWarnings = FALSE)

# --- Dicionários de rótulo (bruto TSE/base -> valor exigido pelo contrato) --
CARGO_LABEL <- c(
  "PRESIDENTE"         = "Presidente",
  "GOVERNADOR"         = "Governador",
  "SENADOR"            = "Senador",
  "DEPUTADO FEDERAL"   = "Deputado Federal",
  "DEPUTADO ESTADUAL"  = "Deputado Estadual/Distrital",
  "DEPUTADO DISTRITAL" = "Deputado Estadual/Distrital",
  "PREFEITO"           = "Prefeito",
  "VEREADOR"           = "Vereador"
)
RACA_LABEL   <- c("PRETA" = "Preta", "PARDA" = "Parda", "BRANCA" = "Branca",
                   "INDIGENA" = "Indígena", "AMARELA" = "Amarela")
GENERO_LABEL <- c("MASC" = "Masculino", "FEM" = "Feminino")

RACA_ORDEM        <- c("Preta", "Parda", "Branca", "Indígena", "Amarela")
GENERO_ORDEM      <- c("Feminino", "Masculino")
CARGOS_MUNICIPAIS <- c("Prefeito", "Vereador")
CARGO_ORDEM       <- c("Presidente", "Governador", "Senador", "Deputado Federal",
                        "Deputado Estadual/Distrital", "Prefeito", "Vereador")

# Slug ASCII pro nome de arquivo (sem espaço/acento/barra) -- CONFIRME com
# quem mexe no D3.js que esses nomes batem com o que o dashboard vai buscar.
CARGO_SLUG <- c(
  "Presidente"                   = "presidente",
  "Governador"                   = "governador",
  "Senador"                      = "senador",
  "Deputado Federal"             = "deputado_federal",
  "Deputado Estadual/Distrital"  = "deputado_estadual_distrital",
  "Prefeito"                     = "prefeito",
  "Vereador"                     = "vereador"
)

# Ano de eleição -> qual Censo usar (2010 até 2020, 2022 em diante)
censo_do_ano <- function(ano) if_else(ano <= 2020, "2010", "2022")

# =============================================================================
# 1. LEITURA E LIMPEZA — CANDIDATURAS
# =============================================================================
cand_raw <- read_delim(
  PATH_CAND, delim = ";",
  locale = locale(encoding = "UTF-8"),
  col_types = cols(.default = "c"),
  na = c("", "#NULO#", "#NULO", "#NE", "NA")
)

cand <- cand_raw %>%
  filter(DS_CARGO %in% names(CARGO_LABEL)) %>%              # exclui vice/suplência (se aparecerem)
  filter(DSC_GENERO %in% names(GENERO_LABEL)) %>%           # exclui NAOINF (do denominador, ver nota acima)
  filter(DSC_COR_RACA %in% names(RACA_LABEL)) %>%           # exclui NAOINF (do denominador, ver nota acima)
  filter(DSC_RESULTADO %in% c("ELEITO", "NÃO ELEITO", "SUPLENTE")) %>% # exclui "Não respondeu"
  distinct(ANO_ELEICAO, DS_CARGO, SQ_CANDIDATO, .keep_all = TRUE) %>%  # rede de segurança
  transmute(
    ano     = as.integer(ANO_ELEICAO),
    cargo   = CARGO_LABEL[DS_CARGO],
    uf      = SG_UF,
    sg_ue   = SG_UE,
    partido = SG_PARTIDO,
    raca    = RACA_LABEL[DSC_COR_RACA],
    genero  = GENERO_LABEL[DSC_GENERO],
    eleito  = DSC_RESULTADO == "ELEITO",
    capital = coalesce(DSC_capital == "sim", FALSE)
  )

cat("Candidaturas após limpeza:", nrow(cand), "\n")
cat("Distribuição cargo x ano:\n")
print(count(cand, cargo, ano))

# =============================================================================
# 2. LEITURA E LIMPEZA — POPULAÇÃO (Censo 2010 e 2022, por município)
# =============================================================================
ler_pop <- function(path, censo_label) {
  read_delim(path, delim = ";", locale = locale(encoding = "UTF-8"),
             col_types = cols(.default = "c")) %>%
    transmute(
      censo         = censo_label,
      uf            = SG_UF,
      sg_ue         = SG_UE,                       # código TSE 5 dígitos -- chave de junção com `cand`
      municipio_id  = CD_MUNICIPIO_IBGE,            # código IBGE 7 dígitos -- usado no output final
      municipio_nome = NM_MUNICIPIO_IBGE,
      `Preta_Masculino`   = as.numeric(coalesce(`MASC PRETA`, "0")),
      `Preta_Feminino`    = as.numeric(coalesce(`FEM PRETA`, "0")),
      `Parda_Masculino`   = as.numeric(coalesce(`MASC PARDA`, "0")),
      `Parda_Feminino`    = as.numeric(coalesce(`FEM PARDA`, "0")),
      `Branca_Masculino`  = as.numeric(coalesce(`MASC BRANCA`, "0")),
      `Branca_Feminino`   = as.numeric(coalesce(`FEM BRANCA`, "0")),
      `Indígena_Masculino` = as.numeric(coalesce(`MASC INDIGENA`, "0")),
      `Indígena_Feminino`  = as.numeric(coalesce(`FEM INDIGENA`, "0")),
      `Amarela_Masculino` = as.numeric(coalesce(`MASC AMARELA`, "0")),
      `Amarela_Feminino`  = as.numeric(coalesce(`FEM AMARELA`, "0"))
    ) %>%
    pivot_longer(
      cols = matches("_(Masculino|Feminino)$"),
      names_to = c("raca", "genero"), names_sep = "_",
      values_to = "pop"
    ) %>%
    mutate(pop = coalesce(pop, 0)) # células suprimidas pelo IBGE (comuns no Censo 2010) viram 0
}

pop_2010 <- ler_pop(PATH_POP_2010, "2010")
pop_2022 <- ler_pop(PATH_POP_2022, "2022")
pop_mun  <- bind_rows(pop_2010, pop_2022)

# Chave de município (id + nome) -- usada tanto em municipios-dados/ quanto
# em municipio_partido/. CD_MUNICIPIO_IBGE da base de candidaturas só vem
# preenchida em ~4% das linhas de Prefeito/Vereador, então a chave vem da
# base de população (que tem SG_UE/TSE E o código IBGE prontos).
mun_chave <- pop_mun %>% distinct(uf, sg_ue, municipio_id, municipio_nome)

cat("\nPopulação lida — municípios distintos 2010:", n_distinct(paste(pop_2010$uf, pop_2010$sg_ue)),
    "| 2022:", n_distinct(paste(pop_2022$uf, pop_2022$sg_ue)), "\n")

# =============================================================================
# 3. data/base_completa_{cargo}.json — NOVO, substitui fig1/fig9/fig_partido_composicao
# =============================================================================
# Granularidade (ano,uf,partido,raça,gênero,etapa,capital), só `n` absoluto.
# Presidente entra com uf="BR" uniforme -- não é uma UF de verdade, então o
# filtro de Região não vai funcionar para esse cargo especificamente (fica
# documentado aqui, não escondido); UF/Partido/Capital funcionam normalmente
# porque não dependem de uf ser uma sigla real.
base_completa <- cand %>%
  group_by(cargo, ano, uf, partido, raca, genero, capital) %>%
  summarise(candidaturas = n(), eleitos = sum(eleito), .groups = "drop") %>%
  pivot_longer(cols = c(candidaturas, eleitos), names_to = "etapa_raw", values_to = "n") %>%
  mutate(etapa = if_else(etapa_raw == "candidaturas", "Candidaturas", "Eleitos")) %>%
  filter(n > 0) %>%  # linhas com n=0 são só peso morto -- ausência = 0 implicitamente
  select(cargo, ano, uf, partido, raca, genero, etapa, capital, n) %>%
  arrange(ano, uf, partido, etapa, factor(raca, levels = RACA_ORDEM), factor(genero, levels = GENERO_ORDEM))

for (cg in CARGO_ORDEM) {
  dados_cg <- base_completa %>% filter(cargo == cg) %>% select(-cargo)
  write_json(list(dados = dados_cg),
             file.path(OUT_DIR, paste0("base_completa_", CARGO_SLUG[cg], ".json")),
             auto_unbox = TRUE, dataframe = "rows", pretty = TRUE, na = "null")
  cat("base_completa_", CARGO_SLUG[cg], ".json escrito — ", nrow(dados_cg), " linhas\n", sep = "")
}

# =============================================================================
# 4. fig2.json — Razão de representação por UF, agora com `partido`
# CORREÇÃO 19/08: n_eleitos/n_candidaturas (número absoluto) agora ficam no
# arquivo final, não só o percentual. Sem isso, o dashboard não tinha como
# reconstruir o agregado "todos os partidos" a partir de 30+ percentuais
# por partido sem um peso pra cada um -- resultava em soma errada quando
# nenhum partido estava filtrado (bug real, achado em MG/Deputado Federal/2022).
# =============================================================================
# Presidente fica de fora -- candidatura nacional (SG_UF = "BR" na base),
# não cabe num mapa por UF.
eleitos_uf_partido <- cand %>%
  filter(eleito, cargo != "Presidente") %>%
  group_by(cargo, ano, uf, partido, raca, genero) %>%
  summarise(n_eleitos = n(), .groups = "drop") %>%
  group_by(cargo, ano, uf, partido) %>%
  mutate(pct_eleitos = round(n_eleitos / sum(n_eleitos) * 100, 2)) %>%
  ungroup() %>%
  select(cargo, ano, uf, partido, raca, genero, n_eleitos, pct_eleitos)

candidaturas_uf_partido <- cand %>%
  filter(cargo != "Presidente") %>%
  group_by(cargo, ano, uf, partido, raca, genero) %>%
  summarise(n_candidaturas = n(), .groups = "drop") %>%
  group_by(cargo, ano, uf, partido) %>%
  mutate(pct_candidaturas = round(n_candidaturas / sum(n_candidaturas) * 100, 2)) %>%
  ungroup() %>%
  select(cargo, ano, uf, partido, raca, genero, n_candidaturas, pct_candidaturas)

# Garante as 10 combinações raça x gênero mesmo quando um grupo teve 0
# eleitos/candidaturas, agora também cruzando por partido.
grade_fig2 <- bind_rows(
    eleitos_uf_partido %>% distinct(cargo, ano, uf, partido),
    candidaturas_uf_partido %>% distinct(cargo, ano, uf, partido)
  ) %>% distinct() %>%
  crossing(raca = RACA_ORDEM, genero = GENERO_ORDEM)

eleitos_uf_partido_full <- grade_fig2 %>%
  left_join(eleitos_uf_partido, by = c("cargo", "ano", "uf", "partido", "raca", "genero")) %>%
  left_join(candidaturas_uf_partido, by = c("cargo", "ano", "uf", "partido", "raca", "genero")) %>%
  mutate(n_eleitos = coalesce(n_eleitos, 0L),
         n_candidaturas = coalesce(n_candidaturas, 0L),
         pct_eleitos = coalesce(pct_eleitos, 0),
         pct_candidaturas = coalesce(pct_candidaturas, 0))

# População por UF/raça/gênero: soma direta dos municípios daquela UF, no
# Censo certo pro ano. NÃO depende de partido -- mesmo valor se repete em
# toda linha de partido da mesma combinação cargo x ano x uf x raça x gênero.
pop_uf_raca_genero <- pop_mun %>%
  group_by(censo, uf, raca, genero) %>%
  summarise(pop = sum(pop), .groups = "drop") %>%
  group_by(censo, uf) %>%
  mutate(pct_populacao = round(pop / sum(pop) * 100, 2)) %>%
  ungroup() %>%
  select(censo, uf, raca, genero, pct_populacao)

fig2_dados <- eleitos_uf_partido_full %>%
  mutate(censo = censo_do_ano(ano)) %>%
  left_join(pop_uf_raca_genero, by = c("censo", "uf", "raca", "genero")) %>%
  mutate(razao = if_else(!is.na(pct_populacao) & pct_populacao > 0,
                          round(pct_eleitos / pct_populacao, 2), NA_real_)) %>%
  select(cargo, ano, uf, partido, raca, genero, n_eleitos, n_candidaturas, pct_eleitos, pct_candidaturas, pct_populacao, razao) %>%
  arrange(cargo, ano, uf, partido, factor(raca, levels = RACA_ORDEM), factor(genero, levels = GENERO_ORDEM))

fig2_json <- list(dados = fig2_dados)
write_json(fig2_json, file.path(OUT_DIR, "fig2.json"), auto_unbox = TRUE, dataframe = "rows",
           pretty = TRUE, na = "null")
cat("fig2.json escrito —", nrow(fig2_dados), "linhas\n")

# =============================================================================
# 5. data/geo/municipios-dados/{UF}.json — SEM mudança de schema (partido
#    por município cruzado com mapa fica de fora desta rodada -- ver nota
#    no cabeçalho)
# =============================================================================
eleitos_mun <- cand %>%
  filter(cargo %in% CARGOS_MUNICIPAIS, eleito) %>%
  group_by(cargo, ano, uf, sg_ue, raca, genero) %>%
  summarise(n_eleitos = n(), .groups = "drop") %>%
  group_by(cargo, ano, uf, sg_ue) %>%
  mutate(pct_eleitos = round(n_eleitos / sum(n_eleitos) * 100, 2)) %>%
  ungroup()

grade_mun <- eleitos_mun %>% distinct(cargo, ano, uf, sg_ue) %>%
  crossing(raca = RACA_ORDEM, genero = GENERO_ORDEM)

eleitos_mun_full <- grade_mun %>%
  left_join(eleitos_mun %>% select(cargo, ano, uf, sg_ue, raca, genero, pct_eleitos),
            by = c("cargo", "ano", "uf", "sg_ue", "raca", "genero")) %>%
  mutate(pct_eleitos = coalesce(pct_eleitos, 0)) %>%
  inner_join(mun_chave, by = c("uf", "sg_ue")) # inner_join: sem chave de município, não dá pra gerar a linha

pop_mun_pct <- pop_mun %>%
  group_by(censo, uf, sg_ue) %>%
  mutate(pct_populacao = round(pop / sum(pop) * 100, 2)) %>%
  ungroup() %>%
  select(censo, uf, sg_ue, raca, genero, pct_populacao)

fig_mun_dados <- eleitos_mun_full %>%
  mutate(censo = censo_do_ano(ano)) %>%
  left_join(pop_mun_pct, by = c("censo", "uf", "sg_ue", "raca", "genero")) %>%
  mutate(razao = if_else(!is.na(pct_populacao) & pct_populacao > 0,
                          round(pct_eleitos / pct_populacao, 2), NA_real_)) %>%
  transmute(cargo, ano, municipio_id, municipio_nome, raca, genero,
            pct_eleitos, pct_populacao, razao, uf)

for (uf_sigla in sort(unique(fig_mun_dados$uf))) {
  dados_uf <- fig_mun_dados %>% filter(uf == uf_sigla) %>% select(-uf) %>%
    arrange(municipio_id, cargo, ano, factor(raca, levels = RACA_ORDEM), factor(genero, levels = GENERO_ORDEM))
  write_json(list(dados = dados_uf),
             file.path(OUT_DIR, "geo", "municipios-dados", paste0(uf_sigla, ".json")),
             auto_unbox = TRUE, dataframe = "rows", pretty = TRUE, na = "null")
}
cat("municipios-dados/{UF}.json escritos para", length(unique(fig_mun_dados$uf)), "UFs\n")

# =============================================================================
# 6. data/municipio_partido/{municipio_id}.json — NOVO, só Prefeito/Vereador
# =============================================================================
# Granularidade (cargo,ano,partido,raça,gênero,etapa), só `n` absoluto.
# municipio_id fica implícito no nome do arquivo (não repete dentro dele).
base_mun_partido <- cand %>%
  filter(cargo %in% CARGOS_MUNICIPAIS) %>%
  inner_join(mun_chave, by = c("uf", "sg_ue")) %>% # descarta o único município sem chave de população (ver rodada anterior)
  group_by(municipio_id, cargo, ano, partido, raca, genero) %>%
  summarise(candidaturas = n(), eleitos = sum(eleito), .groups = "drop") %>%
  pivot_longer(cols = c(candidaturas, eleitos), names_to = "etapa_raw", values_to = "n") %>%
  mutate(etapa = if_else(etapa_raw == "candidaturas", "Candidaturas", "Eleitos")) %>%
  filter(n > 0) %>%
  select(municipio_id, cargo, ano, partido, raca, genero, etapa, n)

municipios_com_dado <- unique(base_mun_partido$municipio_id)
for (mid in municipios_com_dado) {
  dados_mid <- base_mun_partido %>% filter(municipio_id == mid) %>% select(-municipio_id) %>%
    arrange(cargo, ano, partido, etapa, factor(raca, levels = RACA_ORDEM), factor(genero, levels = GENERO_ORDEM))
  write_json(list(dados = dados_mid),
             file.path(OUT_DIR, "municipio_partido", paste0(mid, ".json")),
             auto_unbox = TRUE, dataframe = "rows", pretty = TRUE, na = "null")
}
cat("municipio_partido/{municipio_id}.json escritos para", length(municipios_com_dado), "municípios\n")

# =============================================================================
# 7. Checklist de validação
# =============================================================================
cat("\n--- VALIDAÇÃO ---\n")
cat("Raça 'Negra' ou 'Não Informada' em algum arquivo (base_completa)? ",
    any(base_completa$raca %in% c("Negra", "Não Informada")), "\n")
cat("Cargo 'Todos' em algum arquivo? ",
    any(base_completa$cargo == "Todos", fig2_dados$cargo == "Todos"), "\n")
cat("Presidente em fig2.json (deveria ser FALSE)? ", "Presidente" %in% fig2_dados$cargo, "\n")
cat("Presidente em base_completa (deveria ser TRUE, com uf='BR')? ",
    "Presidente" %in% base_completa$cargo, "\n")
cat("Todas as 7 slugs de cargo usadas (base_completa_*.json)? ",
    all(file.exists(file.path(OUT_DIR, paste0("base_completa_", CARGO_SLUG, ".json")))), "\n")
cat("fig2.json tem coluna partido? ", "partido" %in% names(fig2_dados), "\n")
cat("fig2.json tem coluna n_eleitos? ", "n_eleitos" %in% names(fig2_dados), "\n")
cat("fig2.json tem coluna n_candidaturas? ", "n_candidaturas" %in% names(fig2_dados), "\n")

soma_fig2_eleitos <- fig2_dados %>% group_by(cargo, ano, uf, partido) %>%
  summarise(soma = sum(pct_eleitos), .groups = "drop")
cat("fig2 (pct_eleitos): (cargo,ano,uf,partido) fora de 99-101%:",
    sum(soma_fig2_eleitos$soma < 99 | soma_fig2_eleitos$soma > 101), "de", nrow(soma_fig2_eleitos), "\n")
# Cada linha fora do range é esperada quando o(s) único(s) eleito(s) daquele
# grupo tinha(m) DSC_COR_RACA == "NAOINF" (excluído do denominador -- ver
# contrato). Lista pra inspeção visual, não assume automaticamente o motivo:
soma_fig2_eleitos %>% filter(soma < 99 | soma > 101) %>% print(n = Inf)

soma_fig2_cand <- fig2_dados %>% group_by(cargo, ano, uf, partido) %>%
  summarise(soma = sum(pct_candidaturas), .groups = "drop")
cat("fig2 (pct_candidaturas): (cargo,ano,uf,partido) fora de 99-101%:",
    sum(soma_fig2_cand$soma < 99 | soma_fig2_cand$soma > 101), "de", nrow(soma_fig2_cand), "\n")

cat("Municípios de candidatura sem chave de população (descartados em municipios-dados/municipio_partido): ",
    nrow(anti_join(grade_mun, mun_chave, by = c("uf", "sg_ue")) %>% distinct(uf, sg_ue)), "\n")

cat("\nTamanho aproximado de base_completa_deputado_federal.json (maior cargo esperado): ",
    round(file.info(file.path(OUT_DIR, "base_completa_deputado_federal.json"))$size / 1024 / 1024, 2),
    " MB (contrato estimou ~5,4MB sem gzip)\n", sep = "")
