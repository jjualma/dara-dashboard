// Razão de representação: nível padrão = por estado (Brasil inteiro). Quando o cargo
// é municipal (Prefeito/Vereador) e uma UF está selecionada, o mapa dá zoom no estado
// e passa a mostrar município a município — respeitando que a circunscrição de
// disputas municipais é o município, não o estado.
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.fig2 = (function () {
  let _populacaoCache = null; // {ano: {uf: {raca: {genero: pct_populacao}}}}
  let _geoUF = null;
  const _municipioCache = new Map(); // uf -> {geo, dados}

  // População não depende de partido — extrai só isso do fig2.json (que ainda traz
  // partido pra manter compatibilidade, mas repete o mesmo valor de população em
  // toda linha de partido daquela combinação ano×uf×raça×gênero).
  async function loadPopulacao() {
    if (_populacaoCache) return _populacaoCache;
    const raw = await loadJSON("data/fig2.json");
    const out = {};
    raw.dados.forEach(r => {
      out[r.ano] = out[r.ano] || {};
      out[r.ano][r.uf] = out[r.ano][r.uf] || {};
      out[r.ano][r.uf][r.raca] = out[r.ano][r.uf][r.raca] || {};
      out[r.ano][r.uf][r.raca][r.genero] = r.pct_populacao;
    });
    _populacaoCache = out;
    return out;
  }

  async function loadGeoUF() {
    if (!_geoUF) _geoUF = await loadJSON("data/geo/brazil-states.geojson");
    return _geoUF;
  }

  async function loadMunicipio(uf) {
    if (!_municipioCache.has(uf)) {
      const [geo, dados] = await Promise.all([
        loadJSON(`data/geo/municipios/${uf}.json`),
        loadJSON(`data/geo/municipios-dados/${uf}.json`),
      ]);
      _municipioCache.set(uf, { geo, dados });
    }
    return _municipioCache.get(uf);
  }

  // Eleitos/candidaturas por UF, a partir do base_completa (número absoluto real) —
  // já filtrado por Região/UF/Partido/Capital antes de chegar aqui.
  function aggregateUFReal(linhasFiltradas, populacaoDoAno, genero) {
    const generosAlvo = genero === "Ambos" ? GENERO_ORDEM : [genero];
    const doGenero = linhasFiltradas.filter(l => generosAlvo.includes(l.genero));
    const ufs = new Set(doGenero.map(l => l.uf));
    const out = {};
    ufs.forEach(uf => {
      const doUF = doGenero.filter(l => l.uf === uf);
      const totalEleitosUF = d3.sum(doUF.filter(l => l.etapa === "Eleitos"), l => l.n);
      out[uf] = {};
      RACA_ORDEM.forEach(raca => {
        const nEleitos = d3.sum(doUF.filter(l => l.raca === raca && l.etapa === "Eleitos"), l => l.n);
        const pct_eleitos = totalEleitosUF > 0 ? nEleitos / totalEleitosUF * 100 : 0;
        let pop = 0;
        generosAlvo.forEach(g => {
          pop += (populacaoDoAno[uf] && populacaoDoAno[uf][raca] && populacaoDoAno[uf][raca][g]) || 0;
        });
        out[uf][raca] = { pct_eleitos, pct_populacao: pop, razao: pop > 0 ? +(pct_eleitos / pop).toFixed(2) : null };
      });
    });
    return out;
  }

  function aggregateMunicipio(dadosMun, cargo, ano, genero) {
    const rows = dadosMun.dados.filter(d => d.cargo === cargo && d.ano === ano);
    const out = {};
    rows.forEach(r => {
      if (genero !== "Ambos" && r.genero !== genero) return;
      out[r.municipio_id] = out[r.municipio_id] || {};
      out[r.municipio_id][r.raca] = out[r.municipio_id][r.raca] || { pct_eleitos: 0, pct_populacao: 0 };
      out[r.municipio_id][r.raca].pct_eleitos += r.pct_eleitos;
      out[r.municipio_id][r.raca].pct_populacao += r.pct_populacao;
    });
    Object.values(out).forEach(porRaca => {
      Object.values(porRaca).forEach(v => { v.razao = v.pct_populacao > 0 ? +(v.pct_eleitos / v.pct_populacao).toFixed(2) : null; });
    });
    return out;
  }

  // Cria um mapa pequeno (uma raça) e retorna referências para atualização posterior
  function criarMapaRaca(grid, raca, features, projection) {
    const path = d3.geoPath(projection);
    const cell = grid.append("div").attr("class", "map-cell");
    cell.append("h4").style("color", RACA_COLOR[raca]).text(raca);
    const svg = cell.append("svg").attr("viewBox", "0 0 200 210").attr("role", "img")
      .attr("aria-label", `Mapa de razão de representação — ${raca}`);
    const g = svg.append("g");
    const tooltip = cell.append("div").attr("class", "map-tooltip");
    const scale = t => d3.interpolateRgb(DARA.offwhite, RACA_COLOR[raca])(Math.max(0, Math.min(1, t)));

    const paths = g.selectAll("path").data(features).join("path")
      .attr("d", path)
      .attr("stroke", "#fff").attr("stroke-width", 0.4)
      .attr("fill", DARA.offwhite);

    const legSvg = cell.append("svg").attr("class", "map-legend-svg").attr("viewBox", "0 0 160 14");
    const gradId = "grad-" + raca.replace(/[^a-zA-Z]/g, "") + "-" + Math.random().toString(36).slice(2, 7);
    const defs = legSvg.append("defs");
    const grad = defs.append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%");
    d3.range(0, 1.01, 0.1).forEach(t => grad.append("stop").attr("offset", (t * 100) + "%").attr("stop-color", scale(t)));
    legSvg.append("rect").attr("x", 5).attr("y", 2).attr("width", 150).attr("height", 10).attr("rx", 2).attr("fill", `url(#${gradId})`);
    legSvg.append("line").attr("x1", 5 + 150 / 2).attr("x2", 5 + 150 / 2).attr("y1", 1).attr("y2", 13)
      .attr("stroke", DARA.preto).attr("stroke-width", 1.4);

    return { raca, paths, scale, tooltip };
  }

  async function render(container, cargo, filtros) {
    const ufFiltro = filtros && filtros.uf;
    const regiaoFiltro = filtros && filtros.regiao;
    const partidoFiltroGlobal = filtros && filtros.partido;
    container.html(""); resetPatternCache();

    const municipal = CARGOS_MUNICIPAIS.has(cargo);

    container.append("h3").attr("class", "fig-subtitulo").text("Razão de Representação Racial");
    container.append("p").attr("class", "fig-note")
      .text(municipal
        ? "O gráfico abaixo compara, município a município, a proporção de eleitos de cada grupo racial com a proporção desse mesmo grupo na população local — quanto mais escuro o município, mais perto ou acima do equilíbrio proporcional (razão 1,0); tons claros indicam sub-representação. Selecione uma UF para ver o detalhamento por município daquele estado."
        : "O gráfico abaixo compara, estado a estado, a proporção de eleitos de cada grupo racial com a proporção desse mesmo grupo na população local — quanto mais escuro o estado, mais perto ou acima do equilíbrio proporcional (razão 1,0); tons claros indicam sub-representação.");
    if (cargo === "Presidente") {
      container.append("p").attr("class", "fig-warning")
        .text("Presidente é eleição de circunscrição nacional (não por UF) — o recorte por estado aqui aproxima o local de origem/candidatura.");
    }

    if (partidoFiltroGlobal && partidoFiltroGlobal !== "Todos") {
      container.append("p").attr("class", "fig-warning").text("Não existe recorte por partido nesta visão.");
      return;
    }

    if (municipal && (!ufFiltro || ufFiltro === "Todos")) {
      container.append("p").attr("class", "fig-warning")
        .text("Selecione uma UF no filtro acima para ver o mapa por município — disputas municipais não têm uma leitura nacional única, cada município é sua própria circunscrição.");
      return;
    }

    if (municipal) {
      await renderMunicipio(container, cargo, ufFiltro, filtros && filtros.capital, filtros && filtros.partido, filtros);
    } else {
      await renderUF(container, cargo, ufFiltro, regiaoFiltro, filtros);
    }
  }

  async function renderUF(container, cargo, ufFiltro, regiaoFiltro, filtrosCompletos) {
    const [linhasBase, populacao, geo] = await Promise.all([
      loadBaseCompleta(cargo), loadPopulacao(), loadGeoUF(),
    ]);
    const linhasFiltradas = filtraBaseCompleta(linhasBase, filtrosCompletos);
    const anos = CARGO_ANOS[cargo] || [2018, 2022, 2026];
    let anoAtual = anoInicialDe(anos, filtrosCompletos);
    let genero = "Ambos", playing = false, timer = null, current = {};

    const controls = container.append("div").attr("class", "map-controls");
    const playBtn = controls.append("button").attr("class", "play-btn").text("▶ Reproduzir anos");
    const yearLabel = controls.append("span").attr("class", "map-year-label").text(anoAtual);
    const yearButtons = controls.append("div").attr("class", "year-buttons");
    yearButtons.selectAll("button").data(anos).join("button")
      .attr("class", d => "year-btn" + (d === anoAtual ? " active" : ""))
      .text(d => d)
      .on("click", (ev, d) => { stop(); anoAtual = d; avisaAnoMudou(filtrosCompletos, anoAtual); update(true); });

    const genWrap = controls.append("div").attr("class", "gender-toggle");
    genWrap.append("span").attr("class", "gender-toggle-label").text("Gênero:");
    genWrap.selectAll("button").data(["Ambos", "Feminino", "Masculino"]).join("button")
      .attr("class", d => "gender-btn" + (d === genero ? " active" : ""))
      .text(d => d === "Ambos" ? "Ambos" : GENERO_LABEL[d])
      .on("click", function (ev, d) { genero = d; genWrap.selectAll("button").classed("active", g => g === genero); update(true); });

    const semDadoMsg = container.append("p").attr("class", "fig-warning sem-dado-msg").style("display", "none")
      .text(`Sem dado carregado para ${anoAtual} ainda — os mapas abaixo ficam em branco até a atualização.`);

    const grid = container.append("div").attr("class", "map-grid");
    const projection = d3.geoMercator().fitSize([200, 200], geo);
    const maps = RACA_ORDEM.map(raca => criarMapaRaca(grid, raca, geo.features, projection));
    maps.forEach(({ paths, raca }) => {
      paths.on("mousemove", function (ev, d) {
        const sigla = d.properties.sigla;
        const info = current[sigla] && current[sigla][raca];
        const tooltip = d3.select(this.parentNode.parentNode.parentNode).select(".map-tooltip");
        if (!info) return;
        tooltip.style("display", "block")
          .style("left", (ev.offsetX + 10) + "px").style("top", (ev.offsetY + 10) + "px")
          .html(`<strong>${d.properties.name}</strong><br><span style="font-size:1.15em;font-weight:800;color:#98D8E0">Razão: ${info.razao ?? "—"}</span><br>% eleitos${genero === "Ambos" ? " (homens+mulheres)" : ` (só ${GENERO_LABEL[genero].toLowerCase()})`}: ${info.pct_eleitos.toFixed(1)}%<br>% população: ${info.pct_populacao.toFixed(1)}%`);
      }).on("mouseleave", function () {
        d3.select(this.parentNode.parentNode.parentNode).select(".map-tooltip").style("display", "none");
      });
    });

    function update(transition) {
      const linhasAno = linhasFiltradas.filter(l => l.ano === anoAtual);
      const populacaoAno = populacao[anoAtual] || {};
      current = aggregateUFReal(linhasAno, populacaoAno, genero);
      yearLabel.text(anoAtual);
      yearButtons.selectAll("button").classed("active", d => d === anoAtual);
      const semDado = linhasAno.length === 0;
      semDadoMsg.style("display", semDado ? "block" : "none")
        .text(`Sem dado carregado para ${anoAtual} ainda — os mapas abaixo ficam em branco até a atualização.`);
      maps.forEach(({ raca, paths, scale }) => {
        const sel = transition ? paths.transition().duration(600) : paths;
        const temFiltroGeo = (ufFiltro && ufFiltro !== "Todos") || (regiaoFiltro && regiaoFiltro !== "Todos");
        const destacada = d => {
          if (ufFiltro && ufFiltro !== "Todos") return d.properties.sigla === ufFiltro;
          if (regiaoFiltro && regiaoFiltro !== "Todos") return UF_REGIAO[d.properties.sigla] === regiaoFiltro;
          return false;
        };
        sel.attr("fill", d => {
          const info = current[d.properties.sigla] && current[d.properties.sigla][raca];
          return (!info || info.razao == null) ? DARA.offwhite : scale(info.razao / 2);
        })
        .attr("stroke", d => destacada(d) ? DARA.preto : "#fff")
        .attr("stroke-width", d => destacada(d) ? 2.2 : 0.4)
        .attr("opacity", d => (temFiltroGeo && !destacada(d)) ? 0.25 : 1);
      });

      barsWrap.html("");
      const dadosEleitos = computeUFStackReal(linhasAno, "Eleitos");
      const dadosCand = computeUFStackReal(linhasAno, "Candidaturas");
      renderBarraEmpilhadaPorUF(barsWrap, "Candidaturas por UF", dadosCand, ufFiltro, regiaoFiltro);
      renderBarraEmpilhadaPorUF(barsWrap, "Eleitos por UF", dadosEleitos, ufFiltro, regiaoFiltro);
    }
    function stop() { playing = false; playBtn.text("▶ Reproduzir anos"); if (timer) { clearInterval(timer); timer = null; } }
    playBtn.on("click", () => {
      if (playing) { stop(); return; }
      playing = true; playBtn.text("⏸ Pausar");
      timer = setInterval(() => {
        const idx = anos.indexOf(anoAtual);
        anoAtual = anos[(idx + 1) % anos.length];
        avisaAnoMudou(filtrosCompletos, anoAtual);
        update(true);
      }, 2000);
    });

    const sharedLeg = container.append("div").attr("class", "map-shared-legend");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>0</strong> sub-representado");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>1,0</strong> equilíbrio proporcional");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>2,0+</strong> sobrerrepresentado");
    if (ufFiltro && ufFiltro !== "Todos") {
      sharedLeg.append("span").attr("class", "map-shared-legend-item").html(`<strong>Contorno preto</strong> = ${ufFiltro} em destaque`);
    } else if (regiaoFiltro && regiaoFiltro !== "Todos") {
      sharedLeg.append("span").attr("class", "map-shared-legend-item").html(`<strong>Contorno preto</strong> = estados da região ${regiaoFiltro} em destaque`);
    }

    container.append("h3").attr("class", "fig-subtitulo").text("Visão por Estado: composição racial e de gênero");
    renderLegendRacaGenero(container);
    const barsWrap = container.append("div").attr("class", "stackbar-wrap");
    update(false);
  }

  // Monta {uf: {"raca|genero": {pct, n}}} a partir das linhas já filtradas do
  // base_completa — % dentro do total daquela UF/etapa, com n absoluto de verdade.
  function computeUFStackReal(linhasFiltradas, etapa) {
    const doEtapa = linhasFiltradas.filter(l => l.etapa === etapa);
    if (!doEtapa.length) return null;
    const ufs = new Set(doEtapa.map(l => l.uf));
    const out = {};
    ufs.forEach(uf => {
      const doUF = doEtapa.filter(l => l.uf === uf);
      const total = d3.sum(doUF, l => l.n);
      out[uf] = {};
      RACA_ORDEM.forEach(raca => GENERO_ORDEM.forEach(genero => {
        const n = d3.sum(doUF.filter(l => l.raca === raca && l.genero === genero), l => l.n);
        out[uf][raca + "|" + genero] = { pct: total > 0 ? n / total * 100 : 0, n };
      }));
    });
    return out;
  }

  // Barra empilhada horizontal, uma linha por UF, composição por raça x gênero.
  // dadosPorUF = null quando ainda não existe esse dado (mostra placeholder).
  function renderBarraEmpilhadaPorUF(container, titulo, dadosPorUF, ufFiltro, regiaoFiltro) {
    const bloco = container.append("div").attr("class", "stackbar-block");
    bloco.append("h4").attr("class", "stackbar-title").text(titulo);

    if (!dadosPorUF || Object.keys(dadosPorUF).length === 0) {
      bloco.append("div").attr("class", "sem-dado-placeholder")
        .text(dadosPorUF ? "Sem dado carregado para este ano ainda." : "Sem dado ainda — precisa de candidaturas por UF no schema do ETL.");
      return;
    }

    const ufs = UF_ORDEM.filter(uf => dadosPorUF[uf]);
    const W = 640, M = { t: 24, r: 16, b: 10, l: 44 };
    const rowH = 14, gap = 4;
    const H = M.t + M.b + ufs.length * (rowH + gap);
    const svg = bloco.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `${titulo} por UF, raça e gênero`);
    const defs = svg.append("defs");
    const x = v => M.l + (v / 100) * (W - M.l - M.r);
    const temFiltroGeo = (ufFiltro && ufFiltro !== "Todos") || (regiaoFiltro && regiaoFiltro !== "Todos");
    const ufEmDestaque = uf => {
      if (ufFiltro && ufFiltro !== "Todos") return uf === ufFiltro;
      if (regiaoFiltro && regiaoFiltro !== "Todos") return UF_REGIAO[uf] === regiaoFiltro;
      return true;
    };

    [0, 25, 50, 75, 100].forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", M.t - 4).attr("y2", H - M.b)
        .attr("stroke", "#f2f2f2").attr("stroke-width", 1);
      svg.append("text").attr("x", x(t)).attr("y", M.t - 8).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#999").text(t + "%");
    });

    ufs.forEach((uf, i) => {
      const y = M.t + i * (rowH + gap);
      const opacidadeLinha = (temFiltroGeo && !ufEmDestaque(uf)) ? 0.2 : 1;
      const linhaG = svg.append("g").attr("opacity", opacidadeLinha);
      linhaG.append("text").attr("x", M.l - 8).attr("y", y + rowH / 2 + 4).attr("text-anchor", "end")
        .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", DARA.vinho).text(uf);
      let cx = M.l;
      RACA_ORDEM.forEach(raca => GENERO_ORDEM.forEach(genero => {
        const info = dadosPorUF[uf][raca + "|" + genero];
        const v = info ? info.pct : 0;
        const w = (v / 100) * (W - M.l - M.r);
        if (w > 0.3) {
          const rect = linhaG.append("rect").attr("x", cx).attr("y", y).attr("width", Math.max(w - 0.5, 0)).attr("height", rowH)
            .attr("fill", fillFor(defs, raca, genero));
          const contagem = info && info.n != null ? ` (${info.n.toLocaleString("pt-BR")})` : "";
          rect.append("title").text(`${uf} · ${raca} (${GENERO_LABEL[genero]}): ${v.toFixed(1)}%${contagem}`);
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

  async function renderMunicipio(container, cargo, uf, capitalFiltro, partidoFiltro, filtrosCompletos) {
    const loading = container.append("p").attr("class", "fig-note").text(`Carregando municípios de ${uf}...`);
    let geo, dados;
    try {
      ({ geo, dados } = await loadMunicipio(uf));
    } catch (e) {
      loading.remove();
      container.append("div").attr("class", "sem-dado-placeholder")
        .text(`${uf} não tem dado de município disponível — Distrito Federal, por exemplo, não é dividido em municípios (não elege Prefeito/Vereador).`);
      return;
    }
    loading.remove();

    const anos = [2016, 2020, 2024];
    let anoAtual = anoInicialDe(anos, filtrosCompletos);
    let genero = "Ambos", playing = false, timer = null, current = {};

    const controls = container.append("div").attr("class", "map-controls");
    const playBtn = controls.append("button").attr("class", "play-btn").text("▶ Reproduzir anos");
    const yearLabel = controls.append("span").attr("class", "map-year-label").text(anoAtual);
    const yearButtons = controls.append("div").attr("class", "year-buttons");
    yearButtons.selectAll("button").data(anos).join("button")
      .attr("class", d => "year-btn" + (d === anoAtual ? " active" : ""))
      .text(d => d)
      .on("click", (ev, d) => { stop(); anoAtual = d; avisaAnoMudou(filtrosCompletos, anoAtual); update(true); });

    const genWrap = controls.append("div").attr("class", "gender-toggle");
    genWrap.append("span").attr("class", "gender-toggle-label").text("Gênero:");
    genWrap.selectAll("button").data(["Ambos", "Feminino", "Masculino"]).join("button")
      .attr("class", d => "gender-btn" + (d === genero ? " active" : ""))
      .text(d => d === "Ambos" ? "Ambos" : GENERO_LABEL[d])
      .on("click", function (ev, d) { genero = d; genWrap.selectAll("button").classed("active", g => g === genero); update(true); });

    container.append("p").attr("class", "fig-warning")
      .text(`Zoom em ${uf} — ${geo.features.length} municípios. Contorno de cada polígono = limite municipal.`);

    const semDadoMsgMun = container.append("p").attr("class", "fig-warning sem-dado-msg").style("display", "none")
      .text(`Sem dado carregado para ${anoAtual} ainda — os mapas abaixo ficam em branco até a atualização.`);

    const grid = container.append("div").attr("class", "map-grid");
    const projection = d3.geoMercator().fitSize([200, 200], geo);
    const maps = RACA_ORDEM.map(raca => criarMapaRaca(grid, raca, geo.features, projection));
    maps.forEach(({ paths, raca }) => {
      paths.on("mousemove", function (ev, d) {
        const info = current[d.properties.id] && current[d.properties.id][raca];
        const tooltip = d3.select(this.parentNode.parentNode.parentNode).select(".map-tooltip");
        if (!info) return;
        tooltip.style("display", "block")
          .style("left", (ev.offsetX + 10) + "px").style("top", (ev.offsetY + 10) + "px")
          .html(`<strong>${d.properties.name}</strong><br><span style="font-size:1.15em;font-weight:800;color:#98D8E0">Razão: ${info.razao ?? "—"}</span><br>% eleitos${genero === "Ambos" ? " (homens+mulheres)" : ` (só ${GENERO_LABEL[genero].toLowerCase()})`}: ${info.pct_eleitos.toFixed(1)}%<br>% população: ${info.pct_populacao.toFixed(1)}%`);
      }).on("mouseleave", function () {
        d3.select(this.parentNode.parentNode.parentNode).select(".map-tooltip").style("display", "none");
      });
    });

    function update(transition) {
      current = aggregateMunicipio(dados, cargo, anoAtual, genero);
      yearLabel.text(anoAtual);
      yearButtons.selectAll("button").classed("active", d => d === anoAtual);
      const semDado = Object.keys(current).length === 0;
      semDadoMsgMun.style("display", semDado ? "block" : "none")
        .text(`Sem dado carregado para ${anoAtual} ainda — os mapas abaixo ficam em branco até a atualização.`);
      maps.forEach(({ raca, paths, scale }) => {
        const sel = transition ? paths.transition().duration(600) : paths;
        const capitalId = UF_CAPITAL_ID[uf];
        const ehCapital = d => d.properties.id === capitalId;
        // "Sim" isola a capital (esmaece o resto); "Não" esmaece só a capital;
        // sem filtro (Todos/vazio), mostra tudo igual — sem distinção.
        const opacidade = d => {
          if (capitalFiltro === "Sim") return ehCapital(d) ? 1 : 0.25;
          if (capitalFiltro === "Não") return ehCapital(d) ? 0.25 : 1;
          return 1;
        };
        sel.attr("fill", d => {
          const info = current[d.properties.id] && current[d.properties.id][raca];
          return (!info || info.razao == null) ? DARA.offwhite : scale(info.razao / 2);
        })
        .attr("stroke", d => (capitalFiltro && capitalFiltro !== "Todos" && ehCapital(d)) ? DARA.preto : "#fff")
        .attr("stroke-width", d => (capitalFiltro && capitalFiltro !== "Todos" && ehCapital(d)) ? 1.6 : 0.4)
        .attr("opacity", opacidade);
      });
    }
    function stop() { playing = false; playBtn.text("▶ Reproduzir anos"); if (timer) { clearInterval(timer); timer = null; } }
    playBtn.on("click", () => {
      if (playing) { stop(); return; }
      playing = true; playBtn.text("⏸ Pausar");
      timer = setInterval(() => {
        const idx = anos.indexOf(anoAtual);
        anoAtual = anos[(idx + 1) % anos.length];
        avisaAnoMudou(filtrosCompletos, anoAtual);
        update(true);
      }, 2000);
    });
    update(false);

    const sharedLeg = container.append("div").attr("class", "map-shared-legend");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>0</strong> sub-representado");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>1,0</strong> equilíbrio proporcional");
    sharedLeg.append("span").attr("class", "map-shared-legend-item").html("<strong>2,0+</strong> sobrerrepresentado");
    if (capitalFiltro === "Sim") {
      sharedLeg.append("span").attr("class", "map-shared-legend-item").html(`<strong>Contorno preto</strong> = capital (${geo.features.find(f => f.properties.id === UF_CAPITAL_ID[uf])?.properties.name || uf}) isolada`);
    } else if (capitalFiltro === "Não") {
      sharedLeg.append("span").attr("class", "map-shared-legend-item").html(`<strong>Contorno preto</strong> = capital esmaecida (mostrando só o interior)`);
    }
    if (partidoFiltro && partidoFiltro !== "Todos") {
      container.append("p").attr("class", "fig-warning")
        .text("O recorte por partido neste mapa é aproximado: o dado de razão de representação por município ainda não é aberto por partido — o ajuste aplicado é uma simulação, não um recorte exato.");
    }
  }

  return { render };
})();
