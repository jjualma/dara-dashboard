// Perfil Geral — pequenos múltiplos de slope chart (Candidaturas -> Eleitos),
// um painel por ano eleitoral, por raça x gênero. Fonte: base_completa_{cargo}.json
// (número absoluto), com Região/UF/Partido/Capital todos reais.
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.fig1 = (function () {
  function agrega(linhasAno, etapa) {
    const doEtapa = linhasAno.filter(l => l.etapa === etapa);
    let itens = RACA_ORDEM.flatMap(r => GENERO_ORDEM.map(g => {
      const n = d3.sum(doEtapa.filter(l => l.raca === r && l.genero === g), l => l.n);
      return { raca: r, genero: g, n };
    }));
    const totalN = d3.sum(itens, d => d.n);
    return itens.map(d => ({ ...d, valor: totalN > 0 ? d.n / totalN * 100 : 0 }));
  }

  async function render(container, cargo, filtros) {
    container.html(""); resetPatternCache();

    const headerZone = container.append("div").attr("class", "fig-header-zone fig-header-zone-curta");
    headerZone.append("p").attr("class", "fig-note")
      .text("A visualização abaixo mostra, para cada ano eleitoral, como a composição por raça e gênero se altera entre o conjunto de candidaturas e o de pessoas eleitas. A posição e a direção das linhas permitem identificar quais grupos ampliaram ou reduziram sua participação entre esses dois momentos. Passe o mouse sobre os pontos para consultar o número absoluto de candidaturas e de eleitos de cada grupo.");

    renderLegendRacaGeneroLinha(container);

    const municipioId = filtros && filtros.municipio && filtros.municipio !== "Todos" ? filtros.municipio : null;
    let linhas;
    if (municipioId) {
      const raw = await loadJSON(`data/municipio_partido/${municipioId}.json`);
      linhas = raw.dados.filter(l => l.cargo === cargo);
      const partido = filtros && filtros.partido;
      if (partido && partido !== "Todos") linhas = linhas.filter(l => l.partido === partido);
    } else {
      const base = await loadBaseCompleta(cargo);
      linhas = filtraBaseCompleta(base, filtros);
    }

    const anos = CARGO_ANOS[cargo] || [2018, 2022, 2026];
    const wrap = container.append("div").attr("class", "panels-row")
      .style("display", "grid")
      .style("grid-template-columns", `repeat(auto-fit, minmax(170px, 1fr))`)
      .style("gap", "16px");

    const porAno = anos.map(ano => {
      const linhasAno = linhas.filter(l => l.ano === ano);
      if (!linhasAno.length) return { ano, semDado: true };
      return { ano, cand: agrega(linhasAno, "Candidaturas"), eleitos: agrega(linhasAno, "Eleitos") };
    });
    const maiorValor = d3.max(porAno.flatMap(p => p.semDado ? [] : [...p.cand, ...p.eleitos].map(d => d.valor))) || 45;
    const yMax = Math.max(45, maiorValor * 1.12);

    porAno.forEach(({ ano, semDado, cand, eleitos }) => {
      const panel = wrap.append("div").attr("class", "panel");
      panel.append("h4").text(`${ano}`);

      if (semDado) {
        panel.append("div").attr("class", "sem-dado-placeholder").text("Sem dado ainda");
        return;
      }

      const de = (lista, raca, genero) => lista.find(d => d.raca === raca && d.genero === genero) || { valor: 0, n: 0 };

      const W = 170, H = 300, M = { t: 20, b: 22, l: 34, r: 36 };
      const svg = panel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
        .attr("aria-label", `Candidaturas para eleitos por raça e gênero, ${cargo}, ${ano}`);

      const xL = M.l, xR = W - M.r;
      svg.append("text").attr("x", xL).attr("y", 10).attr("text-anchor", "middle")
        .attr("font-size", 9).attr("font-weight", 700).attr("fill", "#888").text("Candidaturas");
      svg.append("text").attr("x", xR).attr("y", 10).attr("text-anchor", "middle")
        .attr("font-size", 9).attr("font-weight", 700).attr("fill", DARA.vinho).text("Eleitos");

      const y = v => H - M.b - (v / yMax) * (H - M.t - M.b);

      const itens = RACA_ORDEM.flatMap(raca => GENERO_ORDEM.map(genero => {
        const c = de(cand, raca, genero), e = de(eleitos, raca, genero);
        return {
          raca, genero, nome: `${raca} (${GENERO_LABEL[genero]})`,
          v1: c.valor, n1: c.n, v2: e.valor, n2: e.n,
        };
      }));

      itens.forEach(it => { it.yFinalD = y(it.v2); });
      const dir = [...itens].sort((a, b) => a.yFinalD - b.yFinalD);
      const minGap = 10;
      dir[0].labelYD = dir[0].yFinalD;
      for (let i = 1; i < dir.length; i++) dir[i].labelYD = Math.max(dir[i].yFinalD, dir[i - 1].labelYD + minGap);
      for (let i = dir.length - 2; i >= 0; i--) if (dir[i + 1].labelYD - dir[i].labelYD < minGap) dir[i].labelYD = dir[i + 1].labelYD - minGap;

      itens.forEach(it => { it.yFinalE = y(it.v1); });
      const esq = [...itens].sort((a, b) => a.yFinalE - b.yFinalE);
      esq[0].labelYE = esq[0].yFinalE;
      for (let i = 1; i < esq.length; i++) esq[i].labelYE = Math.max(esq[i].yFinalE, esq[i - 1].labelYE + minGap);
      for (let i = esq.length - 2; i >= 0; i--) if (esq[i + 1].labelYE - esq[i].labelYE < minGap) esq[i].labelYE = esq[i + 1].labelYE - minGap;

      itens.forEach(it => {
        const y1 = y(it.v1), y2 = y(it.v2);
        const cor = RACA_COLOR[it.raca];
        const traco = it.genero === "Masculino" ? "4,2.5" : "0";

        const linha = svg.append("line").attr("x1", xL).attr("x2", xR).attr("y1", y1).attr("y2", y2)
          .attr("stroke", cor).attr("stroke-width", 2).attr("stroke-dasharray", traco).attr("stroke-linecap", "round");
        linha.append("title").text(`${it.nome}: ${it.v1.toFixed(1)}% das candidaturas (${it.n1.toLocaleString("pt-BR")}) → ${it.v2.toFixed(1)}% dos eleitos (${it.n2.toLocaleString("pt-BR")})`);

        svg.append("circle").attr("cx", xL).attr("cy", y1).attr("r", 3.2).attr("fill", cor).attr("stroke", "#fff").attr("stroke-width", 0.7)
          .append("title").text(`${it.nome} · Candidaturas · ${ano}: ${it.v1.toFixed(1)}% (${it.n1.toLocaleString("pt-BR")} candidaturas)`);
        svg.append("circle").attr("cx", xR).attr("cy", y2).attr("r", 3.2).attr("fill", cor).attr("stroke", "#fff").attr("stroke-width", 0.7)
          .append("title").text(`${it.nome} · Eleitos · ${ano}: ${it.v2.toFixed(1)}% (${it.n2.toLocaleString("pt-BR")} eleitos)`);

        if (Math.abs(it.labelYE - y1) > 1) {
          svg.append("line").attr("x1", xL - 6).attr("x2", xL - 3).attr("y1", y1).attr("y2", it.labelYE)
            .attr("stroke", "#ccc").attr("stroke-width", 0.8);
        }
        svg.append("text").attr("x", xL - 8).attr("y", it.labelYE + 2.5).attr("text-anchor", "end")
          .attr("font-size", 7.5).attr("font-weight", 700).attr("fill", "#888")
          .text(it.v1.toFixed(1) + "%");

        if (Math.abs(it.labelYD - y2) > 1) {
          svg.append("line").attr("x1", xR + 3).attr("x2", xR + 6).attr("y1", y2).attr("y2", it.labelYD)
            .attr("stroke", "#ccc").attr("stroke-width", 0.8);
        }
        svg.append("text").attr("x", xR + 8).attr("y", it.labelYD + 2.5)
          .attr("font-size", 7.5).attr("font-weight", 700).attr("fill", DARA.vinho)
          .text(it.v2.toFixed(1) + "%");
      });
    });
  }

  return { render };
})();
