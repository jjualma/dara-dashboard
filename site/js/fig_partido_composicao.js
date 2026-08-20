// Composição Partidária — barra empilhada horizontal, Y = sigla do partido,
// X = % de candidaturas/eleitos, composição por raça x gênero.
// Fonte: base_completa_{cargo}.json (ou municipio_partido/{id}.json quando uma
// cidade específica está selecionada) — tudo número absoluto real.
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.figPartidoComposicao = (function () {
  // Sem filtro de partido aqui: o gráfico já é organizado POR partido (eixo Y), então
  // selecionar um partido no filtro é só destacar/esmaecer a linha dele.
  function computePartidoStack(linhas, ano, etapa) {
    const rows = linhas.filter(l => l.ano === ano && l.etapa === etapa);
    if (!rows.length) return null;
    const out = {};
    rows.forEach(r => {
      out[r.partido] = out[r.partido] || {};
      const chave = r.raca + "|" + r.genero;
      out[r.partido][chave] = (out[r.partido][chave] || 0) + r.n;
    });
    const final = {};
    Object.entries(out).forEach(([partido, porGrupo]) => {
      const total = d3.sum(Object.values(porGrupo));
      final[partido] = {};
      Object.entries(porGrupo).forEach(([chave, n]) => {
        final[partido][chave] = { pct: total > 0 ? n / total * 100 : 0, n };
      });
    });
    return final;
  }

  function renderBarraEmpilhadaPorPartido(container, titulo, dadosPorPartido, partidosOrdem, partidoFiltro) {
    const bloco = container.append("div").attr("class", "stackbar-block");
    bloco.append("h4").attr("class", "stackbar-title").text(titulo);

    if (!dadosPorPartido) {
      bloco.append("div").attr("class", "sem-dado-placeholder").text("Sem dado carregado para este ano ainda.");
      return;
    }

    // usa sempre a mesma lista/ordem de partidos (calculada uma vez pra todos os anos
    // do cargo) — partido sem candidatura/eleito naquele ano específico fica em
    // branco na linha dele, não desaparece nem reordena o restante.
    const partidos = partidosOrdem;
    const W = 640, M = { t: 24, r: 16, b: 10, l: 130 };
    const rowH = 14, gap = 4;
    const H = M.t + M.b + partidos.length * (rowH + gap);
    const svg = bloco.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `${titulo} por partido, raça e gênero`);
    const defs = svg.append("defs");
    const x = v => M.l + (v / 100) * (W - M.l - M.r);
    const temFiltroPartido = partidoFiltro && partidoFiltro !== "Todos";

    [0, 25, 50, 75, 100].forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", M.t - 4).attr("y2", H - M.b)
        .attr("stroke", "#f2f2f2").attr("stroke-width", 1);
      svg.append("text").attr("x", x(t)).attr("y", M.t - 8).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#999").text(t + "%");
    });

    partidos.forEach((partido, i) => {
      const y = M.t + i * (rowH + gap);
      const opacidadeLinha = (temFiltroPartido && partido !== partidoFiltro) ? 0.2 : 1;
      const linhaG = svg.append("g").attr("opacity", opacidadeLinha);
      linhaG.append("text").attr("x", M.l - 8).attr("y", y + rowH / 2 + 4).attr("text-anchor", "end")
        .attr("font-size", 9).attr("font-weight", 700).attr("fill", DARA.vinho).text(partido);

      const dadosPartido = dadosPorPartido[partido];
      if (!dadosPartido) return; // partido sem candidatura/eleito nesse ano — linha em branco

      let cx = M.l;
      RACA_ORDEM.forEach(raca => GENERO_ORDEM.forEach(genero => {
        const info = dadosPartido[raca + "|" + genero];
        const v = info ? info.pct : 0;
        const w = (v / 100) * (W - M.l - M.r);
        if (w > 0.3) {
          const rect = linhaG.append("rect").attr("x", cx).attr("y", y).attr("width", Math.max(w - 0.5, 0)).attr("height", rowH)
            .attr("fill", fillFor(defs, raca, genero));
          const contagem = info && info.n != null ? ` (${info.n.toLocaleString("pt-BR")})` : "";
          rect.append("title").text(`${partido} · ${raca} (${GENERO_LABEL[genero]}): ${v.toFixed(1)}%${contagem}`);
          if (w > 16) {
            linhaG.append("text").attr("x", cx + w / 2).attr("y", y + rowH / 2 + 3).attr("text-anchor", "middle")
              .attr("font-size", 7.5).attr("font-weight", 700)
              .attr("fill", textColorFor(racaKey(RACA_COLOR[raca])))
              .text(v.toFixed(0) + "%");
          }
        }
        cx += w;
      }));
    });
  }

  async function render(container, cargo, filtros) {
    container.html(""); resetPatternCache();

    container.append("p").attr("class", "fig-note")
      .text("O gráfico abaixo mostra, por partido, a composição de candidaturas e de eleitos por raça e gênero. Passe o mouse sobre um segmento para ver o percentual e o total.");

    const partidoFiltro = filtros && filtros.partido;
    const municipioId = filtros && filtros.municipio && filtros.municipio !== "Todos" ? filtros.municipio : null;

    let linhas;
    if (municipioId) {
      const raw = await loadJSON(`data/municipio_partido/${municipioId}.json`);
      linhas = raw.dados.filter(l => l.cargo === cargo);
    } else {
      const base = await loadBaseCompleta(cargo);
      linhas = filtraBaseCompleta(base, { uf: filtros && filtros.uf, regiao: filtros && filtros.regiao, capital: filtros && filtros.capital });
    }

    const anosDisponiveis = [...new Set(linhas.map(l => l.ano))].sort();
    const partidosOrdem = [...new Set(linhas.map(l => l.partido))].sort((a, b) => a.localeCompare(b, "pt-BR"));

    renderLegendRacaGenero(container);

    if (!anosDisponiveis.length) {
      const wrapVazio = container.append("div").attr("class", "stackbar-wrap");
      renderBarraEmpilhadaPorPartido(wrapVazio, "Candidaturas por partido", null, partidosOrdem, partidoFiltro);
      renderBarraEmpilhadaPorPartido(wrapVazio, "Eleitos por partido", null, partidosOrdem, partidoFiltro);
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

    function stop() { playing = false; playBtn.text("▶ Reproduzir anos"); if (timer) { clearInterval(timer); timer = null; } }
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

    const wrap = container.append("div").attr("class", "stackbar-wrap");
    function redraw() {
      wrap.html("");
      renderBarraEmpilhadaPorPartido(wrap, "Candidaturas por partido", computePartidoStack(linhas, anoAtual, "Candidaturas"), partidosOrdem, partidoFiltro);
      renderBarraEmpilhadaPorPartido(wrap, "Eleitos por partido", computePartidoStack(linhas, anoAtual, "Eleitos"), partidosOrdem, partidoFiltro);
    }
    redraw();
  }

  return { render };
})();
