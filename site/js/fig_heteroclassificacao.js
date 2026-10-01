// Heteroclassificação Racial de Candidaturas — Deputado Federal, 2026.
// Fonte: data/heteroclassificacao_2026.json (gerado por
// etl_dara_heteroclassificacao.R a partir de 3_base_cruzada.csv). Contagem
// absoluta granular (uf x partido x desc_cor_tse x desc_cor_maioria_4) — o
// dashboard soma conforme o filtro e calcula % depois, mesmo princípio de
// sempre. Cores extraídas por amostragem de pixel direto das imagens do
// Briefing - Heteroclassificação racial de candidaturas 2026 (decisão: usar
// as cores originais do briefing nessa aba, não a paleta DARA do resto do
// dashboard).
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.figHeteroclassificacao = (function () {
  const ANOS = [2026]; // só 2026 tem heteroclassificação feita até agora;
  // "Reproduzir anos" já fica pronto pra quando outro ano for classificado.
  const CARGO_FIXO = "Deputado Federal";

  // --- cores do briefing (amostradas das imagens, não são cores DARA) ---
  const COR = {
    blocoBranco: "#DCEBF7",
    blocoPPI: "#FBE3DC",
    fluxoBrancoBranco: "#BED6EF",
    fluxoPpiPpi: "#BCA28E",
    fluxoBranqueamento: "#F3C8B7", // PPI (auto) -> Branco (hetero)
    fluxoEscurecimento: "#AE733E", // Branco (auto) -> PPI (hetero)
    textoAzul: "#2C5E86",
    textoMarrom: "#7A4A2E",
    quartil1: "#E24B4A", // mais discrepante
    quartil2: "#EF9F27",
    quartil3: "#378ADD",
    quartil4: "#639922", // menos discrepante
  };

  // Retângulo com cantos arredondados só no topo (usado no bloco de cima de cada
  // coluna) ou só na base (bloco de baixo) — os dois blocos se tocam sem vão
  // entre eles, então arredondar os 4 cantos de cada um criaria um bico feio
  // bem na junção. Reto na borda que toca o vizinho, arredondado na externa.
  function pathCantoTopo(x, yTopo, w, h, r) {
    const rr = Math.min(r, h, w / 2);
    return `M${x},${yTopo + h} L${x},${yTopo + rr} A${rr},${rr} 0 0 1 ${x + rr},${yTopo} L${x + w - rr},${yTopo} A${rr},${rr} 0 0 1 ${x + w},${yTopo + rr} L${x + w},${yTopo + h} Z`;
  }
  function pathCantoBase(x, yTopo, w, h, r) {
    const rr = Math.min(r, h, w / 2);
    return `M${x},${yTopo} L${x + w},${yTopo} L${x + w},${yTopo + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${yTopo + h} L${x + rr},${yTopo + h} A${rr},${rr} 0 0 1 ${x},${yTopo + h - rr} Z`;
  }

  let _cache = null;
  async function loadHetero() {
    if (!_cache) _cache = await loadJSON("data/heteroclassificacao_2026.json");
    return _cache;
  }

  function filtraHetero(linhas, filtros) {
    const uf = filtros && filtros.uf, regiao = filtros && filtros.regiao, partido = filtros && filtros.partido;
    return linhas.filter(l => {
      if (partido && partido !== "Todos" && l.partido !== partido) return false;
      if (uf && uf !== "Todos") return l.uf === uf;
      if ((!uf || uf === "Todos") && regiao && regiao !== "Todos" && UF_REGIAO[l.uf] !== regiao) return false;
      return true;
    });
  }

  function computaMatriz(linhas) {
    const soma = (tse, maioria) => d3.sum(linhas.filter(l => l.desc_cor_tse === tse && l.desc_cor_maioria_4 === maioria), l => l.n);
    const brancoBranco = soma("Branco", "Branco");
    const ppiPpi = soma("PPI", "PPI");
    const ppiBranco = soma("PPI", "Branco");   // branqueamento
    const brancoPpi = soma("Branco", "PPI");   // escurecimento
    const total = brancoBranco + ppiPpi + ppiBranco + brancoPpi;
    return {
      brancoBranco, ppiPpi, ppiBranco, brancoPpi, total,
      autoBranco: brancoBranco + brancoPpi, autoPPI: ppiPpi + ppiBranco,
      heteroBranco: brancoBranco + ppiBranco, heteroPPI: ppiPpi + brancoPpi,
    };
  }

  // ===================== Gráfico 1: fluxo autoclassificação x heteroclassificação =====================
  function desenhaSankey(painel, m) {
    painel.html("");
    if (m.total <= 0) {
      painel.append("div").attr("class", "sem-dado-placeholder").text("Sem candidaturas nesse recorte.");
      return;
    }
    const W = 620, H = 380, M = { t: 40, r: 30, b: 10, l: 30 };
    const svg = painel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", "Fluxo entre autoclassificação e heteroclassificação racial");

    // proporção lateral:central:lateral ~1/3 cada, medida na imagem de
    // referência do briefing (~215:245:214) — antes estava 130:300:130,
    // com a central desproporcionalmente mais larga que cada lateral.
    const util = W - M.l - M.r;
    const colW = util / 3, gapMeio = util / 3;
    const xL0 = M.l, xL1 = M.l + colW;
    const xR0 = W - M.r - colW, xR1 = W - M.r;
    const yTopo = M.t, yBase = H - M.b;
    const alturaTotal = yBase - yTopo;
    const y = frac => yTopo + frac * alturaTotal; // frac acumulado de cima, 0-1 (0=topo, 1=base)

    svg.append("text").attr("x", (xL0 + xL1) / 2).attr("y", 18).attr("text-anchor", "middle")
      .attr("font-size", 14).attr("font-weight", 700).attr("fill", "#333").text("Autoclassificação (TSE)");
    svg.append("text").attr("x", (xR0 + xR1) / 2).attr("y", 18).attr("text-anchor", "middle")
      .attr("font-size", 14).attr("font-weight", 700).attr("fill", "#333").text("Heteroclassificação");

    // --- coluna esquerda: Branco (auto) em cima, PPI (auto) embaixo ---
    const acumL = { brancoTopo: 0, brancoBase: m.autoBranco / m.total, ppiBase: 1 };
    svg.append("path").attr("d", pathCantoTopo(xL0, y(acumL.brancoTopo), colW, y(acumL.brancoBase) - y(acumL.brancoTopo), 14))
      .attr("fill", COR.blocoBranco);
    svg.append("path").attr("d", pathCantoBase(xL0, y(acumL.brancoBase), colW, y(acumL.ppiBase) - y(acumL.brancoBase), 14))
      .attr("fill", COR.blocoPPI);
    svg.append("text").attr("x", xL0 + colW / 2).attr("y", (y(acumL.brancoTopo) + y(acumL.brancoBase)) / 2).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("fill", COR.textoAzul).text("Brancos");
    svg.append("text").attr("x", xL0 + colW / 2).attr("y", (y(acumL.brancoTopo) + y(acumL.brancoBase)) / 2 + 15).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("font-weight", 700).attr("fill", COR.textoAzul).text((m.autoBranco / m.total * 100).toFixed(1) + "%");
    svg.append("text").attr("x", xL0 + colW / 2).attr("y", (y(acumL.brancoBase) + y(acumL.ppiBase)) / 2).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("fill", COR.textoMarrom).text("PPI");
    svg.append("text").attr("x", xL0 + colW / 2).attr("y", (y(acumL.brancoBase) + y(acumL.ppiBase)) / 2 + 15).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("font-weight", 700).attr("fill", COR.textoMarrom).text((m.autoPPI / m.total * 100).toFixed(1) + "%");

    // --- coluna direita: Branco (hetero) em cima, PPI (hetero) embaixo ---
    const acumR = { brancoTopo: 0, brancoBase: m.heteroBranco / m.total, ppiBase: 1 };
    svg.append("path").attr("d", pathCantoTopo(xR0, y(acumR.brancoTopo), colW, y(acumR.brancoBase) - y(acumR.brancoTopo), 14))
      .attr("fill", COR.blocoBranco);
    svg.append("path").attr("d", pathCantoBase(xR0, y(acumR.brancoBase), colW, y(acumR.ppiBase) - y(acumR.brancoBase), 14))
      .attr("fill", COR.blocoPPI);
    svg.append("text").attr("x", xR0 + colW / 2).attr("y", (y(acumR.brancoTopo) + y(acumR.brancoBase)) / 2).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("fill", COR.textoAzul).text("Brancos");
    svg.append("text").attr("x", xR0 + colW / 2).attr("y", (y(acumR.brancoTopo) + y(acumR.brancoBase)) / 2 + 15).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("font-weight", 700).attr("fill", COR.textoAzul).text((m.heteroBranco / m.total * 100).toFixed(1) + "%");
    svg.append("text").attr("x", xR0 + colW / 2).attr("y", (y(acumR.brancoBase) + y(acumR.ppiBase)) / 2).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("fill", COR.textoMarrom).text("PPI");
    svg.append("text").attr("x", xR0 + colW / 2).attr("y", (y(acumR.brancoBase) + y(acumR.ppiBase)) / 2 + 15).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("font-weight", 700).attr("fill", COR.textoMarrom).text((m.heteroPPI / m.total * 100).toFixed(1) + "%");

    // --- 4 faixas de fluxo, cruzando no meio: dentro do bloco esquerdo Branco,
    // a fatia de baixo (brancoPpi) vai pro PPI da direita; dentro do bloco
    // esquerdo PPI, a fatia de cima (ppiBranco) vai pro Branco da direita ---
    function faixa(esqTopoFrac, esqBaseFrac, dirTopoFrac, dirBaseFrac, cor, tooltip, rotulo, corTexto) {
      const pontos = [
        [xL1, y(esqTopoFrac)], [xR0, y(dirTopoFrac)],
        [xR0, y(dirBaseFrac)], [xL1, y(esqBaseFrac)],
      ];
      svg.append("polygon").attr("points", pontos.map(pt => pt.join(",")).join(" "))
        .attr("fill", cor).attr("opacity", 0.9)
        .append("title").text(tooltip);
      if (rotulo) {
        const cx = pontos.reduce((s, p) => s + p[0], 0) / 4;
        const cy = pontos.reduce((s, p) => s + p[1], 0) / 4;
        svg.append("text").attr("x", cx).attr("y", cy + 4).attr("text-anchor", "middle")
          .attr("font-size", 12).attr("font-weight", 800).attr("fill", corTexto).text(rotulo);
      }
    }

    const fracBB_L_topo = 0, fracBB_L_base = m.brancoBranco / m.total;
    const fracBP_L_topo = fracBB_L_base, fracBP_L_base = acumL.brancoBase; // fatia de baixo do bloco Branco esq.
    const fracPB_L_topo = acumL.brancoBase, fracPB_L_base = acumL.brancoBase + m.ppiBranco / m.total; // topo do bloco PPI esq.
    const fracPP_L_topo = fracPB_L_base, fracPP_L_base = 1;

    const fracBB_R_topo = 0, fracBB_R_base = m.brancoBranco / m.total;
    const fracPB_R_topo = fracBB_R_base, fracPB_R_base = acumR.brancoBase; // parte de baixo do bloco Branco dir. (chegada do branqueamento)
    const fracBP_R_topo = acumR.brancoBase, fracBP_R_base = acumR.brancoBase + m.brancoPpi / m.total; // topo do bloco PPI dir. (chegada do escurecimento)
    const fracPP_R_topo = fracBP_R_base, fracPP_R_base = 1;

    const pctBB = (m.brancoBranco / m.total * 100).toFixed(1);
    const pctPP = (m.ppiPpi / m.total * 100).toFixed(1);
    const pctPB = (m.ppiBranco / m.total * 100).toFixed(1);
    const pctBP = (m.brancoPpi / m.total * 100).toFixed(1);

    faixa(fracBB_L_topo, fracBB_L_base, fracBB_R_topo, fracBB_R_base, COR.fluxoBrancoBranco,
      `Branco → Branco: ${pctBB}% (${m.brancoBranco.toLocaleString("pt-BR")} candidaturas)`, pctBB + "%", "#2C5E86");
    faixa(fracPP_L_topo, fracPP_L_base, fracPP_R_topo, fracPP_R_base, COR.fluxoPpiPpi,
      `PPI → PPI: ${pctPP}% (${m.ppiPpi.toLocaleString("pt-BR")} candidaturas)`, pctPP + "%", "#fff");
    faixa(fracPB_L_topo, fracPB_L_base, fracPB_R_topo, fracPB_R_base, COR.fluxoBranqueamento,
      `PPI → Branco ("branqueamento"): ${pctPB}% (${m.ppiBranco.toLocaleString("pt-BR")} candidaturas)`, pctPB + "%", COR.textoMarrom);
    // "escurecimento" vira uma curva suave (tipo Sankey) em vez de um polígono
    // reto — contorna visualmente a faixa de "branqueamento" ao lado em vez de
    // cruzar reto por cima. O rótulo fica emoldurado numa caixinha branca na
    // própria zona central (não mais empurrado pra dentro da coluna direita,
    // que foi um erro da vez passada).
    {
      const midX = (xL1 + xR0) / 2;
      const yT1 = y(fracBP_L_topo), yB1 = y(fracBP_L_base);
      const yT2 = y(fracBP_R_topo), yB2 = y(fracBP_R_base);
      const d = `M${xL1},${yT1} C${midX},${yT1} ${midX},${yT2} ${xR0},${yT2} L${xR0},${yB2} C${midX},${yB2} ${midX},${yB1} ${xL1},${yB1} Z`;
      svg.append("path").attr("d", d).attr("fill", COR.fluxoEscurecimento).attr("opacity", 0.9)
        .append("title").text(`Branco → PPI ("escurecimento"): ${pctBP}% (${m.brancoPpi.toLocaleString("pt-BR")} candidaturas)`);

      // caixinha com o valor, posicionada mais pra direita da faixa central
      // (onde a curva já desceu, longe do "17,5%" que fica mais à esquerda)
      const labelX = xL1 + (xR0 - xL1) * 0.72;
      const labelY = yT1 + (yB2 - yT1) * 0.72;
      const frameW = 34, frameH = 18;
      svg.append("rect").attr("x", labelX - frameW / 2).attr("y", labelY - frameH / 2)
        .attr("width", frameW).attr("height", frameH).attr("rx", 4)
        .attr("fill", "#fff").attr("stroke", COR.fluxoEscurecimento).attr("stroke-width", 1);
      svg.append("text").attr("x", labelX).attr("y", labelY + 4).attr("text-anchor", "middle")
        .attr("font-size", 10.5).attr("font-weight", 800).attr("fill", COR.fluxoEscurecimento).text(pctBP + "%");
    }

    // legenda em 2 linhas centradas (1ª: convergentes; 2ª: discrepantes),
    // igual ao modelo do briefing — não é o fluxo padrão de uma linha só.
    const legWrap = painel.append("div").style("display", "flex").style("flex-direction", "column")
      .style("align-items", "center").style("gap", "8px").style("margin-top", "14px");
    const addLinha = (itens) => {
      const linha = legWrap.append("div").style("display", "flex").style("justify-content", "center")
        .style("gap", "24px").style("flex-wrap", "wrap");
      itens.forEach(([label, cor]) => {
        const item = linha.append("div").attr("class", "legend-item");
        item.append("span").attr("class", "legend-swatch").style("background", cor);
        item.append("span").text(label);
      });
    };
    addLinha([["Branco → branco", COR.fluxoBrancoBranco], ["PPI → PPI", COR.fluxoPpiPpi]]);
    addLinha([['PPI → branco, "branqueamento"', COR.fluxoBranqueamento], ['Branco → PPI, "escurecimento"', COR.fluxoEscurecimento]]);
  }

  // ===================== Gráfico 2: % discrepância por partido =====================
  function desenhaBarraPartidos(painel, todasLinhas, quartilPartido, mediaNacional, filtros) {
    painel.html("");
    const partidoFiltro = filtros && filtros.partido;
    // o gráfico já é organizado POR partido — partido no filtro só destaca a
    // barra dele (como em Composição Partidária), nunca remove as demais.
    // Só Região/UF realmente estreitam quais candidaturas entram na conta.
    const linhasFiltradas = filtraHetero(todasLinhas, { uf: filtros && filtros.uf, regiao: filtros && filtros.regiao });
    const partidos = [...new Set(linhasFiltradas.map(l => l.partido))];

    const porPartido = partidos.map(p => {
      const doPartido = linhasFiltradas.filter(l => l.partido === p);
      const total = d3.sum(doPartido, l => l.n);
      const discrepantes = d3.sum(doPartido.filter(l => l.desc_cor_tse === "PPI" && l.desc_cor_maioria_4 === "Branco"), l => l.n);
      return { partido: p, total, discrepantes, pct: total > 0 ? discrepantes / total * 100 : 0, quartil: quartilPartido[p] || 4 };
    }).filter(d => d.total > 0).sort((a, b) => b.pct - a.pct);

    if (!porPartido.length) {
      painel.append("div").attr("class", "sem-dado-placeholder").text("Sem candidaturas nesse recorte.");
      return;
    }

    const leg = painel.append("div").attr("class", "legend");
    const addItem = (label, cor) => {
      const item = leg.append("div").attr("class", "legend-item");
      item.append("span").attr("class", "legend-swatch").style("background", cor);
      item.append("span").text(label);
    };
    addItem("1º quartil (mais discrepante)", COR.quartil1);
    addItem("2º quartil", COR.quartil2);
    addItem("3º quartil", COR.quartil3);
    addItem("4º quartil (menos discrepante)", COR.quartil4);

    const corQuartil = { 1: COR.quartil1, 2: COR.quartil2, 3: COR.quartil3, 4: COR.quartil4 };
    const rowH = 16, gap = 5, M = { t: 24, r: 50, b: 30, l: 115 };
    const W = 560, H = M.t + M.b + porPartido.length * (rowH + gap);
    const svg = painel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", "Percentual de candidaturas racialmente discrepantes por partido");
    const maxX = Math.max(30, ...porPartido.map(d => d.pct)) * 1.12;
    const x = d3.scaleLinear().domain([0, maxX]).range([M.l, W - M.r]);

    svg.append("g").attr("transform", `translate(0,${H - M.b})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => d + "%")).selectAll("text").attr("font-size", 9);

    const xMedia = x(mediaNacional);
    svg.append("line").attr("x1", xMedia).attr("x2", xMedia).attr("y1", M.t - 6).attr("y2", H - M.b)
      .attr("stroke", "#666").attr("stroke-width", 1.2).attr("stroke-dasharray", "5,3");
    svg.append("text").attr("x", xMedia).attr("y", M.t - 10).attr("text-anchor", "middle")
      .attr("font-size", 9).attr("font-weight", 700).attr("fill", "#666").text(`Média nacional (${mediaNacional}%)`);

    porPartido.forEach((d, i) => {
      const yy = M.t + i * (rowH + gap);
      const opacidade = partidoFiltro && partidoFiltro !== "Todos" && d.partido !== partidoFiltro ? 0.3 : 1;
      const g = svg.append("g").attr("opacity", opacidade);
      g.append("text").attr("x", M.l - 8).attr("y", yy + rowH / 2 + 3.5).attr("text-anchor", "end")
        .attr("font-size", 9).attr("font-weight", 700).attr("fill", "#333").text(d.partido);
      g.append("rect").attr("x", M.l).attr("y", yy).attr("width", x(d.pct) - M.l).attr("height", rowH)
        .attr("fill", corQuartil[d.quartil])
        .append("title").text(`${d.partido}: ${d.pct.toFixed(1)}% (${d.discrepantes.toLocaleString("pt-BR")} de ${d.total.toLocaleString("pt-BR")} candidaturas)`);
      g.append("text").attr("x", x(d.pct) + 4).attr("y", yy + rowH / 2 + 3.5)
        .attr("font-size", 8.5).attr("font-weight", 700).attr("fill", "#333").text(d.pct.toFixed(1) + "%");
    });
  }

  // ===================== render principal =====================
  async function render(container, cargo, filtros) {
    container.html(""); resetPatternCache();

    const headerZone1 = container.append("div").attr("class", "fig-header-zone fig-header-zone-hetero");
    headerZone1.append("p").attr("class", "fig-note")
      .text('A visualização compara a raça autodeclarada pelas candidaturas ao TSE com a raça atribuída por heteroclassificação, procedimento em que avaliadores independentes classificam racialmente cada candidatura a partir da foto de urna, sem acesso à autodeclaração. As faixas centrais mostram para onde vai cada grupo: quando uma candidatura autodeclarada preta, parda ou indígena (PPI) é heteroclassificada como branca ou amarela (BA), o caso é chamado de "branqueamento"; o caminho inverso é chamado de "escurecimento". Passe o mouse sobre cada faixa para consultar o percentual e o número absoluto de candidaturas.');

    const raw = await loadHetero();
    let anoAtual = anoInicialDe(ANOS, filtros);
    let playing = false, timer = null;

    const controls = container.append("div").attr("class", "map-controls");
    const playBtn = controls.append("button").attr("class", "play-btn").text("▶ Reproduzir anos");
    const yearWrap = controls.append("div").attr("class", "year-buttons");
    yearWrap.append("span").attr("class", "gender-toggle-label").text("Ano:");
    yearWrap.selectAll("button.year-btn").data(ANOS).join("button")
      .attr("class", d => "year-btn" + (d === anoAtual ? " active" : ""))
      .text(d => d)
      .on("click", (ev, d) => { stop(); anoAtual = d; avisaAnoMudou(filtros, anoAtual); redraw(); yearWrap.selectAll("button").classed("active", x => x === anoAtual); });

    function stop() { playing = false; playBtn.text("▶ Reproduzir anos"); if (timer) { clearInterval(timer); timer = null; } }
    playBtn.on("click", () => {
      if (playing) { stop(); return; }
      playing = true; playBtn.text("⏸ Pausar");
      timer = setInterval(() => {
        const idx = ANOS.indexOf(anoAtual);
        anoAtual = ANOS[(idx + 1) % ANOS.length];
        avisaAnoMudou(filtros, anoAtual);
        redraw();
        yearWrap.selectAll("button").classed("active", x => x === anoAtual);
      }, 2000);
    });

    const painelSankey = container.append("div").attr("class", "financ-bloco financ-bloco-solo");

    const headerZone2 = container.append("div").attr("class", "fig-header-zone fig-header-zone-hetero");
    headerZone2.append("p").attr("class", "fig-note")
      .text("O gráfico mostra, por partido, o percentual de candidaturas autodeclaradas pretas, pardas ou indígenas (PPI) que foram heteroclassificadas como brancas ou amarelas (BA). A linha tracejada marca a média nacional. As cores indicam o quartil de cada partido em relação à base nacional completa: vermelho é o quartil mais discrepante, verde o menos discrepante. As faixas de corte são sempre as mesmas, independentemente do filtro de Região, UF ou Partido selecionado. Passe o mouse sobre cada barra para consultar o percentual e o número absoluto de candidaturas.");

    const painelBarras = container.append("div").attr("class", "financ-bloco");

    function redraw() {
      // só existe dado de 2026 por enquanto — troca de "ano" (quando só há 1
      // ano na lista) não muda nada, mas a estrutura já fica pronta pro futuro
      const linhasFiltradas = filtraHetero(raw.dados, filtros);
      const matriz = computaMatriz(linhasFiltradas);
      desenhaSankey(painelSankey, matriz);
      desenhaBarraPartidos(painelBarras, raw.dados, raw.quartil_partido, raw.media_nacional_pct, filtros);
    }
    redraw();
  }

  return { render, CARGO_FIXO, ANOS };
})();
