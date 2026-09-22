// Financiamento de Campanha — consome data/financiamento.json (agregado, 2018/
// 2022/2026) e data/financiamento_timeline_2026.json (evolução, só 2026). Os
// dois arquivos já vêm com número absoluto em R$ (valor_total/valor_mulheres/
// valor_negros) e uma coluna `cargo` — o dashboard filtra e soma no navegador,
// nunca lê percentual pronto do arquivo. Trata-se de RECEITA (FEFC + Fundo
// Partidário), não de gasto/despesa de campanha.
window.DaraFigs = window.DaraFigs || {};

window.DaraFigs.figFinanciamento = (function () {
  const ANOS = [2018, 2022, 2026];
  const CARGOS_FINANCIAMENTO = ["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual/Distrital", "Todos"];
  const ANO_PISO_LEGAL = 2026;
  const ANO_COM_LINHA_DO_TEMPO = 2026;

  let subAbaAtual = "dinheiro"; // "dinheiro" | "partido" | "estado"

  let _financCache = null, _financTimelineCache = null;
  async function loadFinanciamento() {
    if (!_financCache) _financCache = (await loadJSON("data/financiamento.json")).dados;
    return _financCache;
  }
  async function loadFinanciamentoTimeline() {
    if (!_financTimelineCache) _financTimelineCache = (await loadJSON("data/financiamento_timeline_2026.json")).dados;
    return _financTimelineCache;
  }

  function formatMM(valor) {
    return "R$ " + (valor / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MM";
  }

  // Presidente é candidatura nacional — a base já vem com uf="BR" sempre, não
  // tem recorte por estado/região de verdade. UF_REGIAO não conhece "BR", então
  // sem esse aviso o filtro simplesmente não bateria nada e ficaria vazio sem
  // explicar por quê.
  function presidenteSemRecorte(cargo, filtros) {
    const uf = filtros && filtros.uf, regiao = filtros && filtros.regiao;
    return cargo === "Presidente" && ((uf && uf !== "Todos") || (regiao && regiao !== "Todos"));
  }

  // Filtra linhas de financiamento.json/timeline pelos filtros ativos — mesma
  // lógica de filtraBaseCompleta (uf/região/partido), mas incluindo `cargo`
  // (que agora é uma coluna normal, já que os 5 cargos vêm no mesmo arquivo) e
  // ignorando uf/região quando é Presidente (sempre "BR").
  function filtraFinanciamento(linhas, cargo, filtros) {
    const uf = filtros && filtros.uf, regiao = filtros && filtros.regiao, partido = filtros && filtros.partido;
    const ignoraGeo = presidenteSemRecorte(cargo, filtros) || cargo === "Presidente";
    return linhas.filter(l => {
      if (cargo !== "Todos" && l.cargo !== cargo) return false;
      if (partido && partido !== "Todos" && l.partido !== partido) return false;
      if (!ignoraGeo) {
        if (uf && uf !== "Todos" && l.uf !== uf) return false;
        if ((!uf || uf === "Todos") && regiao && regiao !== "Todos" && UF_REGIAO[l.uf] !== regiao) return false;
      }
      return true;
    });
  }

  function renderLegendaFinanciamento(container) {
    const leg = container.append("div").attr("class", "legend");
    const addItem = (label, fill, stroke) => {
      const item = leg.append("div").attr("class", "legend-item");
      const sw = item.append("svg").attr("width", 18).attr("height", 14);
      sw.append("rect").attr("width", 17).attr("height", 13).attr("fill", fill)
        .attr("stroke", stroke === "none" ? "none" : stroke).attr("stroke-width", stroke === "none" ? 0 : 1.5);
      item.append("span").text(label);
    };
    addItem("Mulheres", DARA.vinho, "none");
    addItem("Homens", DARA.offwhite, DARA.vinho);
    addItem("Negros", DARA.vermelho, "none");
    addItem("Brancos", DARA.offwhite, DARA.vermelho);
  }

  async function renderOndeVaiDinheiro(container, cargo, filtros) {
    const headerZone = container.append("div").attr("class", "fig-header-zone fig-header-zone-financ-dinheiro");
    headerZone.append("p").attr("class", "fig-note")
      .text("A visualização compara, para o recorte definido pelos filtros, a parcela dos recursos do Fundo Especial de Financiamento de Campanha (FEFC) e do Fundo Partidário destinada a mulheres e pessoas negras. O gráfico de linha apresenta a evolução dessa parcela ao longo do período de campanha, onde cada ponto mostra o percentual acumulado até aquela data, ou seja, a proporção do total de recursos recebidos até então que foi destinada a mulheres e a pessoas negras. Por ser uma proporção, o percentual pode subir ou descer ao longo da campanha mesmo que os valores em reais só aumentem: o resultado depende de para quem vai o dinheiro que chega a cada novo dia.");

    if (presidenteSemRecorte(cargo, filtros)) {
      container.append("p").attr("class", "fig-warning")
        .text("Presidente é eleição de circunscrição nacional (não por UF/Região) — os valores abaixo são sempre nacionais.");
    }

    const [todasLinhas, todasTimeline] = await Promise.all([loadFinanciamento(), loadFinanciamentoTimeline()]);
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

    renderLegendaFinanciamento(container);

    const painelBarras = container.append("div").attr("class", "financ-bloco financ-bloco-solo");
    const painelLinha = container.append("div").attr("class", "financ-bloco");

    function valorAgregado(ano) {
      const linhas = filtraFinanciamento(todasLinhas, cargo, filtros).filter(l => l.ano === ano);
      const total = d3.sum(linhas, l => l.valor_total);
      const valorM = d3.sum(linhas, l => l.valor_mulheres);
      const valorN = d3.sum(linhas, l => l.valor_negros);
      return { total, pctM: total > 0 ? valorM / total * 100 : 0, pctN: total > 0 ? valorN / total * 100 : 0, valorM, valorN };
    }

    function desenhaBarras() {
      painelBarras.html("");
      const { total, pctM, pctN, valorM, valorN } = valorAgregado(anoAtual);
      if (total <= 0) {
        painelBarras.append("div").attr("class", "sem-dado-placeholder").text(`Sem receita registrada para ${anoAtual} nesse recorte.`);
        return;
      }
      const W = 380, H = 220, M = { t: 26, r: 24, b: 26, l: 78 };
      const svg = painelBarras.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
        .attr("aria-label", "Receita de campanha por gênero e raça");
      const y = v => H - M.b - (v / 100) * (H - M.t - M.b);
      const util = W - M.l - M.r;
      const colW = util * 0.34;
      const gapEntre = util - colW * 2;
      const colunas = [
        { x: M.l, valor: pctM, valorRS: valorM, corBase: DARA.vinho, rotuloBaixo: "Mulheres", rotuloCima: "Homens" },
        { x: M.l + colW + gapEntre, valor: pctN, valorRS: valorN, corBase: DARA.vermelho, rotuloBaixo: "Negros", rotuloCima: "Brancos" },
      ];

      svg.append("line").attr("x1", M.l - 10).attr("x2", W - M.r + 10).attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke", DARA.vinho).attr("stroke-width", 1.4);

      if (anoAtual === ANO_PISO_LEGAL) {
        svg.append("line").attr("x1", M.l - 10).attr("x2", W - M.r + 10).attr("y1", y(30)).attr("y2", y(30))
          .attr("stroke", "#333").attr("stroke-width", 1.2).attr("stroke-dasharray", "6,4");
        svg.append("text").attr("x", M.l - 8).attr("y", y(30) - 4).attr("text-anchor", "end")
          .attr("font-size", 8).attr("font-weight", 700).attr("fill", "#333").text("Piso legal: 30%");
      }

      colunas.forEach(col => {
        const yBase = y(0), yTopo = y(100), ySplit = y(col.valor);
        svg.append("rect").attr("x", col.x).attr("y", yTopo).attr("width", colW).attr("height", yBase - yTopo)
          .attr("fill", DARA.offwhite).attr("stroke", col.corBase).attr("stroke-width", 1.4)
          .append("title").text(`${col.rotuloCima}: ${(100 - col.valor).toFixed(1)}% (${formatMM(total - col.valorRS)})`);
        const retanguloColorido = svg.append("rect").attr("x", col.x).attr("y", ySplit).attr("width", colW).attr("height", yBase - ySplit)
          .attr("fill", col.corBase);
        retanguloColorido.append("title").text(`${col.rotuloBaixo}: ${col.valor.toFixed(1)}% (${formatMM(col.valorRS)})`);
        svg.append("text").attr("x", col.x + colW / 2).attr("y", (ySplit + yBase) / 2 + 4).attr("text-anchor", "middle")
          .attr("font-size", 12).attr("font-weight", 800).attr("fill", "#fff").text(col.valor.toFixed(0) + "%");
        svg.append("text").attr("x", col.x + colW / 2).attr("y", (ySplit + yBase) / 2 + 15).attr("text-anchor", "middle")
          .attr("font-size", 8).attr("fill", "#fff").text(col.rotuloBaixo);
        svg.append("text").attr("x", col.x + colW / 2).attr("y", (yTopo + ySplit) / 2).attr("text-anchor", "middle")
          .attr("font-size", 12).attr("font-weight", 800).attr("fill", "#333").text((100 - col.valor).toFixed(0) + "%");
        svg.append("text").attr("x", col.x + colW / 2).attr("y", (yTopo + ySplit) / 2 + 13).attr("text-anchor", "middle")
          .attr("font-size", 8).attr("fill", "#666").text(col.rotuloCima);
      });
      painelBarras.append("p").attr("class", "financ-total-nota").text(`Receita total no recorte: ${formatMM(total)}`);
    }

    function desenhaLinha() {
      painelLinha.html("");
      if (anoAtual !== ANO_COM_LINHA_DO_TEMPO) {
        painelLinha.append("div").attr("class", "sem-dado-placeholder")
          .text(`A evolução ao longo da campanha está disponível só pra ${ANO_COM_LINHA_DO_TEMPO}.`);
        return;
      }
      const linhasTL = filtraFinanciamento(todasTimeline, cargo, filtros);
      const porData = d3.rollup(linhasTL,
        v => ({ total: d3.sum(v, l => l.valor_total), valorM: d3.sum(v, l => l.valor_mulheres), valorN: d3.sum(v, l => l.valor_negros) }),
        l => l.data);
      const datas = [...porData.keys()].sort();
      if (!datas.length) {
        painelLinha.append("div").attr("class", "sem-dado-placeholder").text("Sem dado de evolução pra esse recorte em 2026.");
        return;
      }
      const pontos = datas.map(d => {
        const { total, valorM, valorN } = porData.get(d);
        return {
          data: new Date(d + "T00:00:00"), total, valorM, valorN,
          pctM: total > 0 ? valorM / total * 100 : 0, pctN: total > 0 ? valorN / total * 100 : 0,
        };
      });

      const W = 640, H = 260, M = { t: 30, r: 90, b: 46, l: 50 };
      const svg = painelLinha.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
        .attr("aria-label", "Evolução da receita de campanha ao longo do tempo");
      const maxY = Math.max(35, ...pontos.map(p => p.pctM), ...pontos.map(p => p.pctN)) * 1.15;
      const x = d3.scaleLinear().domain([0, pontos.length - 1]).range([M.l, W - M.r]);
      const y = v => H - M.b - (v / maxY) * (H - M.t - M.b);

      svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke", DARA.vinho).attr("stroke-width", 1.2);

      if (anoAtual === ANO_PISO_LEGAL) {
        svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(30)).attr("y2", y(30))
          .attr("stroke", "#333").attr("stroke-width", 1.2).attr("stroke-dasharray", "6,4");
        // rótulo fixo no topo do gráfico, fora da área onde os dados são desenhados —
        // antes ficava colado na própria linha tracejada, e como a série pode cruzar
        // ali perto (ex.: bem no início da campanha), o texto ficava por cima do dado.
        svg.append("text").attr("x", M.l).attr("y", 12)
          .attr("font-size", 9).attr("font-weight", 700).attr("fill", "#333").text("Piso legal: 30%");
      }

      // até ~12 rótulos de data no eixo, senão fica ilegível quando tem muitas datas
      const passo = Math.max(1, Math.ceil(pontos.length / 12));
      svg.append("g").attr("transform", `translate(0,${H - M.b})`)
        .call(d3.axisBottom(x).tickValues(pontos.map((_, i) => i).filter(i => i % passo === 0 || i === pontos.length - 1))
          .tickFormat(i => { const d = pontos[i].data; return `${d.getDate()}/${d.getMonth() + 1}`; }))
        .selectAll("text").attr("font-size", 8.5).attr("transform", "rotate(-25)").style("text-anchor", "end");

      function linha(campoPct, campoValor, cor, nome) {
        const gen = d3.line().x((d, i) => x(i)).y(d => y(d[campoPct]));
        svg.append("path").attr("d", gen(pontos)).attr("fill", "none").attr("stroke", cor).attr("stroke-width", 2.4);
        pontos.forEach((p, i) => {
          svg.append("circle").attr("cx", x(i)).attr("cy", y(p[campoPct])).attr("r", 3).attr("fill", cor)
            .append("title").text(`${nome} · ${p.data.getDate()}/${p.data.getMonth() + 1}: ${p[campoPct].toFixed(1)}% acumulado (${formatMM(p[campoValor])})`);
        });
      }
      linha("pctM", "valorM", DARA.vinho, "Mulheres");
      linha("pctN", "valorN", DARA.vermelho, "Negros");

      // quando os dois valores finais ficam próximos, os rótulos colidem (texto de
      // um em cima do outro) — afasta os dois simetricamente, com uma linha fina
      // ligando ao ponto real quando o rótulo precisa se deslocar.
      const yFinalM = y(pontos[pontos.length - 1].pctM);
      const yFinalN = y(pontos[pontos.length - 1].pctN);
      const minGap = 13;
      let labelYM = yFinalM, labelYN = yFinalN;
      if (Math.abs(yFinalM - yFinalN) < minGap) {
        const meio = (yFinalM + yFinalN) / 2;
        if (yFinalM <= yFinalN) { labelYM = meio - minGap / 2; labelYN = meio + minGap / 2; }
        else { labelYM = meio + minGap / 2; labelYN = meio - minGap / 2; }
      }
      [{ yFinal: yFinalM, labelY: labelYM, cor: DARA.vinho, nome: "Mulheres" },
       { yFinal: yFinalN, labelY: labelYN, cor: DARA.vermelho, nome: "Negros" }].forEach(l => {
        if (Math.abs(l.labelY - l.yFinal) > 1) {
          svg.append("line").attr("x1", W - M.r + 2).attr("x2", W - M.r + 6).attr("y1", l.yFinal).attr("y2", l.labelY)
            .attr("stroke", "#ccc").attr("stroke-width", 0.8);
        }
        svg.append("text").attr("x", W - M.r + 8).attr("y", l.labelY + 3.5)
          .attr("font-size", 10).attr("font-weight", 700).attr("fill", l.cor).text(l.nome);
      });
    }

    function redraw() { desenhaBarras(); desenhaLinha(); }
    redraw();
  }

  async function renderBarraFinanciamento(container, cargo, filtros, agruparPor) {
    const headerZone = container.append("div").attr("class", "fig-header-zone fig-header-zone-curta");
    headerZone.append("p").attr("class", "fig-note")
      .text(agruparPor === "partido"
        ? "O gráfico abaixo mostra, por partido, a parcela dos recursos do Fundo Especial de Financiamento de Campanha (FEFC) e do Fundo Partidário destinada a mulheres e pessoas negras."
        : "O gráfico abaixo mostra, por estado, a parcela dos recursos do Fundo Especial de Financiamento de Campanha (FEFC) e do Fundo Partidário destinada a mulheres e pessoas negras.");

    if (agruparPor === "estado" && cargo === "Presidente") {
      container.append("p").attr("class", "fig-warning")
        .text("Presidente é eleição de circunscrição nacional — não tem recorte por estado, só o total nacional (BR).");
    } else if (presidenteSemRecorte(cargo, filtros)) {
      container.append("p").attr("class", "fig-warning")
        .text("Presidente é eleição de circunscrição nacional (não por UF/Região) — os valores abaixo são sempre nacionais.");
    }

    renderLegendaFinanciamento(container);

    const partidoFiltro = filtros && filtros.partido;
    const ufFiltro = filtros && filtros.uf, regiaoFiltro = filtros && filtros.regiao;
    const todasLinhas = await loadFinanciamento();
    const linhasDoCargo = todasLinhas.filter(l => cargo === "Todos" || l.cargo === cargo);
    let anoAtual = anoInicialDe(ANOS, filtros);
    let playing = false, timer = null;
    const partidosOrdem = agruparPor === "partido"
      ? [...new Set(linhasDoCargo.map(l => l.partido))].sort((a, b) => a.localeCompare(b, "pt-BR"))
      : null;

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

    const wrap = container.append("div").attr("class", "financ-duplo");
    const painelGenero = wrap.append("div").attr("class", "financ-bloco");
    const painelRaca = wrap.append("div").attr("class", "financ-bloco");

    function linhaAgregada(rotulo, linhasBrutas, destacado) {
      const total = d3.sum(linhasBrutas, l => l.valor_total);
      const valorM = d3.sum(linhasBrutas, l => l.valor_mulheres);
      const valorN = d3.sum(linhasBrutas, l => l.valor_negros);
      return {
        rotulo, destacado, total,
        mulheres: total > 0 ? valorM / total * 100 : 0, negros: total > 0 ? valorN / total * 100 : 0,
        valorM, valorN,
      };
    }

    function linhasDoAno() {
      const doAno = linhasDoCargo.filter(l => l.ano === anoAtual);
      if (agruparPor === "partido") {
        const geoFiltrado = doAno.filter(l => {
          if (cargo === "Presidente") return true;
          if (ufFiltro && ufFiltro !== "Todos") return l.uf === ufFiltro;
          if (regiaoFiltro && regiaoFiltro !== "Todos") return UF_REGIAO[l.uf] === regiaoFiltro;
          return true;
        });
        const destacar = partidoFiltro && partidoFiltro !== "Todos" ? partidoFiltro : null;
        return partidosOrdem.map(p => linhaAgregada(p, geoFiltrado.filter(l => l.partido === p), p === destacar));
      }
      if (cargo === "Presidente") {
        return [linhaAgregada("BR", doAno.filter(l => !partidoFiltro || partidoFiltro === "Todos" || l.partido === partidoFiltro), false)];
      }
      const ufs = (regiaoFiltro && regiaoFiltro !== "Todos") ? UF_ORDEM.filter(u => UF_REGIAO[u] === regiaoFiltro) : UF_ORDEM;
      const destacar = ufFiltro && ufFiltro !== "Todos" ? ufFiltro : null;
      const doPartido = partidoFiltro && partidoFiltro !== "Todos" ? doAno.filter(l => l.partido === partidoFiltro) : doAno;
      return ufs.map(u => linhaAgregada(u, doPartido.filter(l => l.uf === u), u === destacar));
    }

    function desenhaPainel(painel, linhas, campoPct, campoValor, corBase, titulo) {
      painel.html("");
      painel.append("h4").text(titulo);
      if (!linhas.length || !linhas.some(l => l.total > 0)) {
        painel.append("div").attr("class", "sem-dado-placeholder").text(`Sem receita registrada para ${anoAtual}.`);
        return;
      }
      const rowH = 20, gap = 6, M = { t: 24, r: 16, b: 10, l: 90 };
      const W = 420, H = M.t + M.b + linhas.length * (rowH + gap);
      const svg = painel.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", titulo);
      const x = v => M.l + (v / 100) * (W - M.l - M.r);

      if (anoAtual === ANO_PISO_LEGAL) {
        svg.append("line").attr("x1", x(30)).attr("x2", x(30)).attr("y1", M.t - 14).attr("y2", H - M.b)
          .attr("stroke", "#333").attr("stroke-width", 1.2).attr("stroke-dasharray", "5,3");
        svg.append("text").attr("x", x(30)).attr("y", M.t - 16).attr("text-anchor", "middle")
          .attr("font-size", 9).attr("font-weight", 700).attr("fill", "#333").text("Piso legal: 30%");
      }

      linhas.forEach((linha, i) => {
        const y = M.t + i * (rowH + gap);
        const opacidade = linhas.some(l => l.destacado) && !linha.destacado ? 0.25 : 1;
        const g = svg.append("g").attr("opacity", opacidade);
        g.append("text").attr("x", M.l - 8).attr("y", y + rowH / 2 + 4).attr("text-anchor", "end")
          .attr("font-size", 10).attr("font-weight", 700).attr("fill", DARA.vinho).text(linha.rotulo);
        if (linha.total <= 0) return; // sem receita nesse recorte — linha em branco
        const v = linha[campoPct];
        const wMin = (v / 100) * (W - M.l - M.r);
        const wResto = (W - M.l - M.r) - wMin;
        const valorResto = linha.total - linha[campoValor];
        const rotuloResto = campoPct === "mulheres" ? "Homens" : "Brancos";
        g.append("rect").attr("x", M.l).attr("y", y).attr("width", W - M.l - M.r).attr("height", rowH)
          .attr("fill", DARA.offwhite).attr("stroke", corBase).attr("stroke-width", 1.2)
          .append("title").text(`${linha.rotulo} · ${rotuloResto}: ${(100 - v).toFixed(1)}% (${formatMM(valorResto)})`);
        g.append("rect").attr("x", M.l).attr("y", y).attr("width", wMin).attr("height", rowH).attr("fill", corBase)
          .append("title").text(`${linha.rotulo}: ${v.toFixed(1)}% (${formatMM(linha[campoValor])})`);
        if (wMin > 22) {
          g.append("text").attr("x", M.l + wMin / 2).attr("y", y + rowH / 2 + 4).attr("text-anchor", "middle")
            .attr("font-size", 9.5).attr("font-weight", 700).attr("fill", "#fff").text(v.toFixed(0) + "%");
        }
        if (wResto > 22) {
          g.append("text").attr("x", M.l + wMin + wResto / 2).attr("y", y + rowH / 2 + 4).attr("text-anchor", "middle")
            .attr("font-size", 9.5).attr("font-weight", 700).attr("fill", "#666").text((100 - v).toFixed(0) + "%");
        }
      });
    }

    function redraw() {
      const linhas = linhasDoAno();
      desenhaPainel(painelGenero, linhas, "mulheres", "valorM", DARA.vinho, "Mulheres");
      desenhaPainel(painelRaca, linhas, "negros", "valorN", DARA.vermelho, "Negros");
    }
    redraw();
  }

  async function render(container, cargo, filtros) {
    container.html(""); resetPatternCache();

    const subTabs = container.append("div").attr("class", "subtabs");
    const definicoes = [
      { id: "dinheiro", label: "Onde vai o dinheiro" },
      { id: "partido", label: "Financiamento por Partido" },
      { id: "estado", label: "Financiamento por Estado" },
    ];
    subTabs.selectAll("button").data(definicoes).join("button")
      .attr("class", d => "subtab-btn" + (d.id === subAbaAtual ? " active" : ""))
      .text(d => d.label)
      .on("click", (ev, d) => { subAbaAtual = d.id; render(container, cargo, filtros); });

    const corpo = container.append("div").attr("class", "subtab-body");
    if (subAbaAtual === "dinheiro") await renderOndeVaiDinheiro(corpo, cargo, filtros);
    else if (subAbaAtual === "partido") await renderBarraFinanciamento(corpo, cargo, filtros, "partido");
    else await renderBarraFinanciamento(corpo, cargo, filtros, "estado");
  }

  return { render, CARGOS_FINANCIAMENTO, ANOS };
})();
