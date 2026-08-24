// Diversidade Partidária — dispersão por partido, 4 painéis: (mulheres x negros) e
// (homens brancos x mulheres negras), cada um com Candidaturas e Eleitos.
// Eixos sempre fixos em 0-100% (sem escala dinâmica) e com linhas de grade.
// Fonte: base_completa_{cargo}.json (ou municipio_partido/{id}.json quando uma
// cidade específica está selecionada) — tudo número absoluto real.
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.fig9 = (function () {
  // Agrupa por partido a partir de linhas já filtradas (região/UF/capital/município
  // aplicados antes de chegar aqui — NUNCA filtra por partido aqui, porque cada
  // ponto do gráfico É um partido; partido vira só destaque visual, não filtro de valor).
  function montaBase(linhas, ano, etapa) {
    const brutos = linhas.filter(l => l.ano === ano && l.etapa === etapa);
    if (!brutos.length) return null;
    const partidos = [...new Set(brutos.map(l => l.partido))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return partidos.map(p => {
      const doPartido = brutos.filter(l => l.partido === p);
      const total = d3.sum(doPartido, l => l.n);
      const nMulheres = d3.sum(doPartido.filter(l => l.genero === "Feminino"), l => l.n);
      const nNegros = d3.sum(doPartido.filter(l => l.raca === "Preta" || l.raca === "Parda"), l => l.n);
      const nMulheresNegras = d3.sum(doPartido.filter(l => l.genero === "Feminino" && (l.raca === "Preta" || l.raca === "Parda")), l => l.n);
      const nHomensBrancos = d3.sum(doPartido.filter(l => l.genero === "Masculino" && l.raca === "Branca"), l => l.n);
      return {
        partido: p,
        pct_mulheres: total > 0 ? nMulheres / total * 100 : 0,
        pct_negros: total > 0 ? nNegros / total * 100 : 0,
        pct_mn_entre_mulheres: nMulheres > 0 ? nMulheresNegras / nMulheres * 100 : null,
        pct_homens_brancos: total > 0 ? nHomensBrancos / total * 100 : 0,
        n: total,
      };
    });
  }

  async function render(container, cargo, filtros) {
    container.html(""); resetPatternCache();

    const headerZone = container.append("div").attr("class", "fig-header-zone fig-header-zone-longa");
    headerZone.append("p").attr("class", "fig-note")
      .text("Os gráficos mostram onde os partidos se posicionam em relação ao perfil de diferentes grupos entre suas candidaturas e eleição. Nos dois gráficos superiores, o eixo horizontal mostra a porcentagem de mulheres e o eixo vertical, a porcentagem de pessoas pretas e pardas. Nos dois gráficos inferiores, são comparadas a porcentagem de homens brancos e a de mulheres pretas e pardas.");

    const partidoFiltro = filtros && filtros.partido;
    const municipioId = filtros && filtros.municipio && filtros.municipio !== "Todos" ? filtros.municipio : null;

    let linhas;
    if (municipioId) {
      const raw = await loadJSON(`data/municipio_partido/${municipioId}.json`);
      linhas = raw.dados.filter(l => l.cargo === cargo);
    } else {
      const base = await loadBaseCompleta(cargo);
      // filtra por região/UF/capital, mas NUNCA por partido (ver montaBase)
      linhas = filtraBaseCompleta(base, { uf: filtros && filtros.uf, regiao: filtros && filtros.regiao, capital: filtros && filtros.capital });
    }

    const anosDisponiveis = [...new Set(linhas.map(l => l.ano))].sort();
    if (!anosDisponiveis.length) {
      container.append("div").attr("class", "sem-dado-placeholder").text("Sem dado carregado ainda para este cargo");
      return;
    }
    let anoAtual = anoInicialDe(anosDisponiveis, filtros);
    let playing = false, timer = null;

    const controls = container.append("div").attr("class", "map-controls");
    const playBtn = controls.append("button").attr("class", "play-btn").text("▶ Reproduzir anos");
    const yearWrap = controls.append("div").attr("class", "year-buttons");
    yearWrap.append("span").attr("class", "gender-toggle-label").text("Ano:");
    yearWrap.selectAll("button.year-btn").data(anosDisponiveis).join("button")
      .attr("class", d => "year-btn" + (d === anoAtual ? " active" : ""))
      .text(d => d)
      .on("click", (ev, d) => { stop(); anoAtual = d; avisaAnoMudou(filtros, anoAtual); redraw(); yearWrap.selectAll("button").classed("active", x => x === anoAtual); });

    function stop() {
      playing = false; playBtn.text("▶ Reproduzir anos");
      if (timer) { clearInterval(timer); timer = null; }
    }
    playBtn.on("click", () => {
      if (playing) { stop(); return; }
      playing = true; playBtn.text("⏸ Pausar");
      timer = setInterval(() => {
        const idx = anosDisponiveis.indexOf(anoAtual);
        anoAtual = anosDisponiveis[(idx + 1) % anosDisponiveis.length];
        avisaAnoMudou(filtros, anoAtual);
        redraw();
        yearWrap.selectAll("button").classed("active", x => x === anoAtual);
      }, 2000);
    });

    container.append("h4").attr("class", "stackbar-title").text("Mulheres × candidaturas negras");
    const linha1 = container.append("div").attr("class", "panels-row panels-row-wide");
    const painelCand1 = linha1.append("div").attr("class", "panel panel-wide");
    painelCand1.append("h4").text("Candidaturas");
    const painelEl1 = linha1.append("div").attr("class", "panel panel-wide");
    painelEl1.append("h4").text("Eleitos");

    container.append("h4").attr("class", "stackbar-title").style("margin-top", "20px").text("Homens brancos × mulheres negras");
    const linha2 = container.append("div").attr("class", "panels-row panels-row-wide");
    const painelCand2 = linha2.append("div").attr("class", "panel panel-wide");
    painelCand2.append("h4").text("Candidaturas");
    const painelEl2 = linha2.append("div").attr("class", "panel panel-wide");
    painelEl2.append("h4").text("Eleitos");

    // painel base: sempre 0-100% fixo nos dois eixos, com grade
    function montaEixos(svg, W, H, M, xLabel, yLabel) {
      const x = d3.scaleLinear().domain([0, 100]).range([M.l, W - M.r]);
      const y = d3.scaleLinear().domain([0, 100]).range([H - M.b, M.t]);

      [0, 20, 40, 60, 80, 100].forEach(t => {
        svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", M.t).attr("y2", H - M.b)
          .attr("stroke", "#f0f0f0").attr("stroke-width", 1);
        svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(t)).attr("y2", y(t))
          .attr("stroke", "#f0f0f0").attr("stroke-width", 1);
      });

      svg.append("g").attr("transform", `translate(0,${H - M.b})`)
        .call(d3.axisBottom(x).tickValues([0, 20, 40, 60, 80, 100]).tickFormat(d => d + "%")).selectAll("text").attr("font-size", 11);
      svg.append("g").attr("transform", `translate(${M.l},0)`)
        .call(d3.axisLeft(y).tickValues([0, 20, 40, 60, 80, 100]).tickFormat(d => d + "%")).selectAll("text").attr("font-size", 11);

      svg.append("text").attr("x", (M.l + W - M.r) / 2).attr("y", H - 4).attr("text-anchor", "middle")
        .attr("font-size", 11).attr("fill", "#8D787C").text(xLabel);
      svg.append("text").attr("transform", `translate(12, ${(M.t + H - M.b) / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#8D787C").text(yLabel);

      return { x, y };
    }

    function desenhaPontos(svg, x, y, dados, getX, getY, getTooltip) {
      const nMax = d3.max(dados, d => d.n) || 1;
      const r = d3.scaleSqrt().domain([0, nMax]).range([4, 15]);

      const posicionados = [];
      const ordemPrioridade = [...dados].sort((a, b) => {
        const destA = partidoFiltro && a.partido === partidoFiltro ? 1 : 0;
        const destB = partidoFiltro && b.partido === partidoFiltro ? 1 : 0;
        if (destA !== destB) return destB - destA;
        return b.n - a.n;
      });
      const mostrarRotulo = new Set();
      ordemPrioridade.forEach(d => {
        const cx = x(getX(d)), cy = y(getY(d));
        const largura = d.partido.length * 6 + 6;
        const bbox = { x1: cx - largura / 2, x2: cx + largura / 2, y1: cy - 20, y2: cy - 6 };
        const colide = posicionados.some(p => !(bbox.x2 < p.x1 || bbox.x1 > p.x2 || bbox.y2 < p.y1 || bbox.y1 > p.y2));
        if (!colide) { posicionados.push(bbox); mostrarRotulo.add(d.partido); }
      });

      dados.forEach(d => {
        const destacado = partidoFiltro && partidoFiltro !== "Todos" && d.partido === partidoFiltro;
        const opaco = partidoFiltro && partidoFiltro !== "Todos" && !destacado;
        const grp = svg.append("g").style("opacity", opaco ? 0.28 : 1);
        const raio = destacado ? r(d.n) * 1.25 : r(d.n);

        grp.append("circle")
          .attr("cx", x(getX(d))).attr("cy", y(getY(d))).attr("r", raio)
          .attr("fill", DARA.vinho).attr("fill-opacity", 0.78)
          .attr("stroke", destacado ? DARA.vermelho : "#fff").attr("stroke-width", destacado ? 2.4 : 1)
          .append("title").text(getTooltip(d));

        if (mostrarRotulo.has(d.partido)) {
          grp.append("text")
            .attr("x", x(getX(d))).attr("y", y(getY(d)) - raio - 5)
            .attr("text-anchor", "middle").attr("font-size", destacado ? 12 : 10)
            .attr("font-weight", destacado ? 800 : 600).attr("fill", DARA.vinho)
            .text(d.partido);
        }
      });
    }

    function desenhaPainelMulheresNegros(painel, tipo) {
      painel.selectAll("svg, .sem-dado-placeholder").remove();
      const dados = montaBase(linhas, anoAtual, tipo);
      if (!dados) {
        painel.append("div").attr("class", "sem-dado-placeholder").text(`Sem dado carregado para ${anoAtual} ainda`);
        return;
      }
      const W = 420, H = 380, M = { t: 14, r: 16, b: 36, l: 44 };
      const svg = painel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
        .attr("aria-label", `Dispersão de mulheres e candidaturas negras por partido — ${tipo}, ${cargo}, ${anoAtual}`);
      const { x, y } = montaEixos(svg, W, H, M, "% de mulheres", "% de candidaturas negras");

      if (tipo === "Candidaturas") {
        svg.append("line").attr("x1", x(30)).attr("x2", x(30)).attr("y1", M.t).attr("y2", H - M.b)
          .attr("stroke", DARA.vermelho).attr("stroke-width", 1.4).attr("stroke-dasharray", "5,3");
        svg.append("text").attr("x", x(30)).attr("y", M.t - 3).attr("text-anchor", "middle")
          .attr("font-size", 10).attr("font-weight", 700).attr("fill", DARA.vermelho).text("30% mulheres (piso legal)");
      }

      desenhaPontos(svg, x, y, dados, d => d.pct_mulheres, d => d.pct_negros, d =>
        `${d.partido} · ${tipo} · ${anoAtual}: ${d.pct_mulheres.toFixed(1)}% mulheres, ${d.pct_negros.toFixed(1)}% candidaturas negras (n≈${d.n})`);
    }

    function desenhaPainelBrancosMulheresNegras(painel, tipo) {
      painel.selectAll("svg, .sem-dado-placeholder").remove();
      const dadosBase = montaBase(linhas, anoAtual, tipo);
      if (!dadosBase) {
        painel.append("div").attr("class", "sem-dado-placeholder").text(`Sem dado carregado para ${anoAtual} ainda`);
        return;
      }
      // mulheres negras = % de mulheres do partido × % dessas mulheres que são pretas/pardas
      const dados = dadosBase
        .filter(d => d.pct_mn_entre_mulheres != null)
        .map(d => ({ ...d, pct_mulheres_negras: d.pct_mulheres * d.pct_mn_entre_mulheres / 100 }));
      if (!dados.length) {
        painel.append("div").attr("class", "sem-dado-placeholder").text(`Sem dado suficiente para ${anoAtual}`);
        return;
      }

      const W = 420, H = 380, M = { t: 14, r: 16, b: 36, l: 44 };
      const svg = painel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
        .attr("aria-label", `Dispersão de homens brancos e mulheres negras por partido — ${tipo}, ${cargo}, ${anoAtual}`);
      const { x, y } = montaEixos(svg, W, H, M, "% de candidaturas de homens brancos", "% de candidaturas de mulheres negras");

      desenhaPontos(svg, x, y, dados, d => d.pct_homens_brancos, d => d.pct_mulheres_negras, d =>
        `${d.partido} · ${tipo} · ${anoAtual}: ${d.pct_homens_brancos.toFixed(1)}% homens brancos, ${d.pct_mulheres_negras.toFixed(1)}% mulheres negras (n≈${d.n})`);
    }

    function redraw() {
      desenhaPainelMulheresNegros(painelCand1, "Candidaturas");
      desenhaPainelMulheresNegros(painelEl1, "Eleitos");
      desenhaPainelBrancosMulheresNegras(painelCand2, "Candidaturas");
      desenhaPainelBrancosMulheresNegras(painelEl2, "Eleitos");
    }

    redraw();

    const leg = container.append("div").attr("class", "legend");
    const item = leg.append("div").attr("class", "legend-item");
    item.append("span").attr("class", "legend-swatch").style("background", DARA.vinho).style("border-radius", "50%");
    item.append("span").text("tamanho do marcador = número de candidaturas/eleitos");
  }

  return { render };
})();
