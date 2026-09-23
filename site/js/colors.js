// ---------------------------------------------------------------
// Paleta de marca DARA — fonte: TEMPLATEdara.pptx (hex validados WCAG AA)
// ---------------------------------------------------------------
const DARA = {
  vermelho: "#E44027",
  vinho: "#2A0008",
  amarelo: "#EDE14A", // reservado — não usar puro para categoria racial "Amarela"
  ciano: "#98D8E0",
  preto: "#000000",
  offwhite: "#F0F0F0",
  mostarda: "#B29E36",  // Indígena (mistura Amarelo+Vinho)
  terracota: "#902319", // Parda (mistura Vermelho+Vinho, mesma lógica da Mostarda)
  verde: "#3B7A3B",     // Amarela
};

// Raça -> cor (hue = canal primário). Categorias tratadas separadamente
// (Preta e Parda não são agregadas em "Negra").
const RACA_COLOR = {
  "Preta": DARA.vermelho,
  "Parda": DARA.terracota,
  "Branca": DARA.ciano,
  "Indígena": DARA.mostarda,
  "Amarela": DARA.verde,
};

const RACA_ORDEM = ["Preta", "Parda", "Branca", "Indígena", "Amarela"];
const GENERO_ORDEM = ["Feminino", "Masculino"];
// Rótulo de exibição (a chave interna do dado continua Feminino/Masculino)
const GENERO_LABEL = { "Feminino": "Mulheres", "Masculino": "Homens" };

// Indicadores normativos (piso de 30%)
const COMPLIANCE_COLOR = { cumpre: DARA.ciano, naoCumpre: DARA.vermelho };

// Regra de contraste (WCAG AA calculado previamente para esta paleta)
function textColorFor(bgKey) {
  const escuroTexto = new Set(["vermelho", "amarelo", "mostarda", "ciano"]);
  const claroTexto = new Set(["vinho", "preto", "terracota", "verde"]);
  if (escuroTexto.has(bgKey)) return DARA.vinho;
  if (claroTexto.has(bgKey)) return DARA.offwhite;
  return DARA.preto;
}

function racaKey(hex) {
  return Object.entries(DARA).find(([, v]) => v === hex)?.[0] || "preto";
}

// ---------------------------------------------------------------
// Padrão de preenchimento por gênero (canal secundário — nunca só cor)
// Feminino = sólido | Masculino = hachurado (listras diagonais na cor base)
// ---------------------------------------------------------------
let _patternSeq = 0;
const _patternCache = new Map();

function fillFor(svgDefs, raca, genero) {
  const cor = RACA_COLOR[raca] || DARA.preto;
  if (genero === "Feminino") return cor;

  const cacheKey = raca + "|hatch";
  if (_patternCache.has(cacheKey)) return `url(#${_patternCache.get(cacheKey)})`;

  const id = `hatch-${_patternSeq++}`;
  const pattern = svgDefs.append("pattern")
    .attr("id", id)
    .attr("width", 6).attr("height", 6)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)");
  pattern.append("rect").attr("width", 6).attr("height", 6).attr("fill", cor);
  pattern.append("rect").attr("width", 2.4).attr("height", 6).attr("fill", DARA.offwhite).attr("opacity", 0.55);

  _patternCache.set(cacheKey, id);
  return `url(#${id})`;
}

function resetPatternCache() { _patternCache.clear(); }

function dashFor(genero) {
  return genero === "Masculino" ? "6,3" : "0";
}

// ---------------------------------------------------------------
// Tabela cargo x anos aplicáveis
// ---------------------------------------------------------------
const CARGO_ANOS = {
  "Presidente": [2014, 2018, 2022, 2026],
  "Governador": [2014, 2018, 2022, 2026],
  "Senador": [2014, 2018, 2022, 2026],
  "Deputado Federal": [2014, 2018, 2022, 2026],
  "Deputado Estadual/Distrital": [2014, 2018, 2022, 2026],
  "Prefeito": [2016, 2020, 2024],
  "Vereador": [2016, 2020, 2024],
  "Todos": [2014, 2016, 2018, 2020, 2022, 2024, 2026],
};

const CARGOS_ORDEM = ["Deputado Federal", "Deputado Estadual/Distrital", "Senador",
  "Governador", "Presidente", "Prefeito", "Vereador", "Todos"];

// Cargos com circunscrição municipal (para habilitar o filtro de Município)
const CARGOS_MUNICIPAIS = new Set(["Prefeito", "Vereador"]);

// Nome de arquivo base_completa_{...}.json de cada cargo (slugificado pelo ETL).
const CARGO_ARQUIVO = {
  "Presidente": "presidente",
  "Governador": "governador",
  "Senador": "senador",
  "Deputado Federal": "deputado_federal",
  "Deputado Estadual/Distrital": "deputado_estadual_distrital",
  "Prefeito": "prefeito",
  "Vereador": "vereador",
};

const _baseCompletaCache = {};
// Carrega data/base_completa_{cargo}.json (com cache). Se cargo === "Todos", carrega
// e junta os 7 arquivos, marcando cada linha com o campo `cargo` (que os arquivos
// individuais não têm, já que cada um já é 1 cargo só).
async function loadBaseCompleta(cargo) {
  if (cargo === "Todos") {
    const cargos = Object.keys(CARGO_ARQUIVO);
    const partes = await Promise.all(cargos.map(c => loadBaseCompleta(c)));
    return partes.flatMap((linhas, i) => linhas.map(l => ({ ...l, cargo: cargos[i] })));
  }
  if (_baseCompletaCache[cargo]) return _baseCompletaCache[cargo];
  const arquivo = CARGO_ARQUIVO[cargo];
  if (!arquivo) return [];
  const raw = await loadJSON(`data/base_completa_${arquivo}.json`);
  const linhas = raw.dados.map(l => ({ ...l, cargo }));
  _baseCompletaCache[cargo] = linhas;
  return linhas;
}

// Filtra linhas de base_completa pelos filtros simples que já são reais nesse arquivo
// (ano, uf/região, partido, capital). Município é tratado à parte (arquivo próprio).
function filtraBaseCompleta(linhas, { ano, uf, regiao, partido, capital } = {}) {
  return linhas.filter(l => {
    if (ano != null && l.ano !== ano) return false;
    if (uf && uf !== "Todos" && l.uf !== uf) return false;
    if (!uf || uf === "Todos") { if (regiao && regiao !== "Todos" && UF_REGIAO[l.uf] !== regiao) return false; }
    if (partido && partido !== "Todos" && l.partido !== partido) return false;
    if (capital && capital !== "Todos") {
      const querCapital = capital === "Sim";
      if (Boolean(l.capital) !== querCapital) return false;
    }
    return true;
  });
}

// Soma `n` agrupando pelas chaves pedidas — ex.: somaAgrupada(linhas, ["raca","genero"]).
function somaAgrupada(linhas, chaves) {
  const out = new Map();
  linhas.forEach(l => {
    const chave = chaves.map(k => l[k]).join("|");
    out.set(chave, (out.get(chave) || 0) + l.n);
  });
  return out;
}


// Regiões (coluna REGIAO na base real) — filtro disponível pra todos os cargos,
// já que todo cargo tem UF e toda UF pertence a uma região.
const REGIAO_ORDEM = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];

const UF_REGIAO = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste",
  PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

// Código IBGE (7 dígitos) do município-capital de cada UF — usado pro filtro de
// Capital no mapa por município (destacar/esmaecer a capital de verdade).
const UF_CAPITAL_ID = {
  AC: "1200401", AL: "2704302", AP: "1600303", AM: "1302603", BA: "2927408",
  CE: "2304400", DF: "5300108", ES: "3205309", GO: "5208707", MA: "2111300",
  MT: "5103403", MS: "5002704", MG: "3106200", PA: "1501402", PB: "2507507",
  PR: "4106902", PE: "2611606", PI: "2211001", RJ: "3304557", RN: "2408102",
  RS: "4314902", RO: "1100205", RR: "1400100", SC: "4205407", SP: "3550308",
  SE: "2800308", TO: "1721000",
};

// Carrega e faz parse de um JSON tratando a string "NA" como null — proteção contra
// jsonlite (R) serializando NA_real_/NA_integer_ como a string "NA" em vez de null
// quando o argumento na="null" não é passado no write_json(). Usar isto em vez de
// d3.json() direto em qualquer fetch de data/*.json.
async function loadJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  return JSON.parse(text, (key, value) => (value === "NA" ? null : value));
}

// Escolhe o ano inicial de uma figura: usa o ano compartilhado (filtros.anoInicial)
// se ele existir na lista de anos disponíveis; senão cai pro primeiro ano da lista.
function anoInicialDe(anosDisponiveis, filtros) {
  const preferido = filtros && filtros.anoInicial;
  if (preferido != null && anosDisponiveis.includes(preferido)) return preferido;
  return anosDisponiveis[anosDisponiveis.length - 1];
}

function avisaAnoMudou(filtros, ano) {
  if (filtros && typeof filtros.onAnoChange === "function") filtros.onAnoChange(ano);
}

function paineisAnos(cargo) {
  const anos = CARGO_ANOS[cargo] || [2018, 2022, 2026];
  return anos.slice(-3);
}

// ---------------------------------------------------------------
// UFs (siglas reais — os valores associados a cada uma continuam sintéticos até o
// pipeline em R substituir por dado real). A lista de partidos NÃO fica fixa aqui —
// é lida dinamicamente de data/fig9.json (ver popularPartidos() em dashboard.html e
// desenhaPainel() em fig9.js), porque a lista de partidos cresce a cada atualização.
// ---------------------------------------------------------------
const UF_ORDEM = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA",
  "PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// ---------------------------------------------------------------
// Legenda compartilhada: 5 raças (cor) x 2 gêneros (padrão)
// ---------------------------------------------------------------
function renderLegendRacaGenero(container) {
  const leg = container.append("div").attr("class", "legend");
  RACA_ORDEM.forEach(raca => {
    const item = leg.append("div").attr("class", "legend-item");
    const sw = item.append("svg").attr("width", 34).attr("height", 16);
    const d2 = sw.append("defs");
    sw.append("rect").attr("width", 15).attr("height", 14).attr("y", 1).attr("fill", fillFor(d2, raca, "Feminino"));
    sw.append("rect").attr("x", 18).attr("width", 15).attr("height", 14).attr("y", 1).attr("fill", fillFor(d2, raca, "Masculino"));
    item.append("span").text(raca);
  });

  // ícone de verdade em vez de caractere Unicode ◧/◨ (que não diferencia visualmente
  // sólido de hachurado em texto corrido) — mesma cor vinho neutra pros dois, só pra
  // mostrar o padrão (a cor de verdade já está nos swatches de raça acima).
  const itemF = leg.append("div").attr("class", "legend-item legend-gender-note");
  const swF = itemF.append("svg").attr("width", 15).attr("height", 14);
  swF.append("rect").attr("width", 15).attr("height", 14).attr("fill", DARA.vinho);
  itemF.append("span").text("sólido = Mulheres");

  const itemM = leg.append("div").attr("class", "legend-item legend-gender-note");
  const swM = itemM.append("svg").attr("width", 15).attr("height", 14);
  const dM = swM.append("defs");
  const patternId = `hatch-legenda-${_patternSeq++}`;
  const pattern = dM.append("pattern").attr("id", patternId).attr("width", 6).attr("height", 6)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
  pattern.append("rect").attr("width", 6).attr("height", 6).attr("fill", DARA.vinho);
  pattern.append("rect").attr("width", 2.4).attr("height", 6).attr("fill", DARA.offwhite).attr("opacity", 0.55);
  swM.append("rect").attr("width", 15).attr("height", 14).attr("fill", `url(#${patternId})`);
  itemM.append("span").text("hachurado = Homens");
}

// Variante da legenda pra gráficos que codificam gênero por TRAÇO de linha (sólida x
// tracejada), não por preenchimento — ex.: Perfil Geral, que usa stroke-dasharray
// "4,2.5" pra Masculino. O ícone é uma linha de verdade, com o mesmo dasharray do
// gráfico, não um retângulo com hachura (que representaria preenchimento, não traço).
function renderLegendRacaGeneroLinha(container) {
  const leg = container.append("div").attr("class", "legend");
  RACA_ORDEM.forEach(raca => {
    const item = leg.append("div").attr("class", "legend-item");
    const sw = item.append("svg").attr("width", 34).attr("height", 16);
    sw.append("line").attr("x1", 1).attr("x2", 33).attr("y1", 8).attr("y2", 8)
      .attr("stroke", RACA_COLOR[raca]).attr("stroke-width", 3.5).attr("stroke-linecap", "round");
    item.append("span").text(raca);
  });

  const itemF = leg.append("div").attr("class", "legend-item legend-gender-note");
  const swF = itemF.append("svg").attr("width", 22).attr("height", 14);
  swF.append("line").attr("x1", 1).attr("x2", 21).attr("y1", 7).attr("y2", 7)
    .attr("stroke", DARA.vinho).attr("stroke-width", 3.5).attr("stroke-linecap", "round");
  itemF.append("span").text("sólido = Mulheres");

  const itemM = leg.append("div").attr("class", "legend-item legend-gender-note");
  const swM = itemM.append("svg").attr("width", 22).attr("height", 14);
  swM.append("line").attr("x1", 1).attr("x2", 21).attr("y1", 7).attr("y2", 7)
    .attr("stroke", DARA.vinho).attr("stroke-width", 3.5).attr("stroke-dasharray", "5,3.5").attr("stroke-linecap", "round");
  itemM.append("span").text("tracejado = Homens");
}
