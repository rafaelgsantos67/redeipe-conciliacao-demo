/* ============================================================
   Rede Ipê · Conciliação Bancária — DEMO
   js/app.js — interface, filtros globais, abas e interações
   ============================================================ */
(function () {
  'use strict';

  const DB = window.DB;

  /* ================= Utilidades ================= */
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (v) => fmtBRL.format(v);
  const brlCompacto = (v) => 'R$ ' + v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtData = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const fmtDataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const fmtPct = (v) => v.toFixed(2).replace('.', ',') + '%';
  const fmtNum = (v) => v.toLocaleString('pt-BR');
  const r2 = (v) => Math.round(v * 100) / 100;
  const byId = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const UNIDADE_POR_ID = {};
  DB.unidades.forEach((u) => { UNIDADE_POR_ID[u.id] = u; });
  const nomeUnidade = (id) => (UNIDADE_POR_ID[id] ? UNIDADE_POR_ID[id].nome : id);

  const PRODUTO_POR_ID = {};
  DB.produtos.forEach((p) => { PRODUTO_POR_ID[p.id] = p; });

  const TURNO_POR_N = {};
  DB.turnos.forEach((t) => { TURNO_POR_N[t.n] = t; });

  const FORMA_POR_ID = {};
  DB.taxas.forEach((f) => { FORMA_POR_ID[f.id] = f; });

  // Índice extrato bancário → lote (o id do lote está na descrição do lançamento)
  const EXTRATO_POR_LOTE = {};
  DB.extrato.forEach((e) => {
    const m = e.descricao.match(/L-[A-Z]{3}-\d{8}-T\d-[A-Z_]+/);
    if (m) (EXTRATO_POR_LOTE[m[0]] = EXTRATO_POR_LOTE[m[0]] || []).push(e);
  });

  const TIPOS_DIVERGENCIA = [
    ['taxa_maior', 'Taxa maior que a contratada'],
    ['nao_localizada', 'Venda não localizada'],
    ['chargeback', 'Chargeback'],
    ['duplicidade', 'Lançamento em duplicidade'],
    ['aluguel_pos', 'Aluguel de POS não previsto']
  ];

  const CORES_FORMAS = {
    dinheiro: '#5C6B70', pix: '#2F855A', debito: '#1F4A54',
    credito: '#F5A623', credito_parc: '#B7791F', frota: '#7FB3BF'
  };

  function isoMais(iso, dias) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }
  const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

  /* ================= Persistência (localStorage) ================= */
  const CHAVE_LS = 'redeipe_demo_v1';

  function carregarPersistencia() {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_LS) || 'null'); } catch (e) { salvo = null; }
    return Object.assign(
      { conciliados: [], resolvidas: [], manualChecks: {}, manualResp: {}, boasVindasVista: false },
      salvo || {}
    );
  }
  const persist = carregarPersistencia();

  function salvarPersistencia() {
    try { localStorage.setItem(CHAVE_LS, JSON.stringify(persist)); } catch (e) { /* modo restrito: segue sem salvar */ }
  }

  /* ================= Estado da sessão ================= */
  const estado = {
    tab: 'dashboard',
    unidade: 'all',
    periodo: 30,
    conc: { status: 'todos', tipoDiv: 'todos', forma: 'todas', adquirente: 'todas', busca: '', dia: '', ordCampo: 'data', ordDir: 'desc', pagina: 1 },
    fechDia: null,
    antecipacao: {},
    antecAdq: 'todas'
  };

  /* ================= Filtros globais ================= */
  function diasDoPeriodo() { return DB.dias.slice(-estado.periodo); }

  function dentroPeriodo(data) {
    const ds = diasDoPeriodo();
    return data >= ds[0] && data <= ds[ds.length - 1];
  }

  const daUnidade = (item) => estado.unidade === 'all' || item.unidadeId === estado.unidade;
  const lotesFiltrados = () => DB.lotes.filter((l) => daUnidade(l) && dentroPeriodo(l.data));
  const vendasFiltradas = () => DB.vendas.filter((v) => daUnidade(v) && dentroPeriodo(v.data));
  const fechamentosFiltrados = () => DB.fechamentos.filter((f) => daUnidade(f) && dentroPeriodo(f.data));

  function rotuloPeriodo() {
    const ds = diasDoPeriodo();
    if (estado.periodo === 1) return 'Hoje (' + fmtData(ds[0]) + ')';
    return fmtData(ds[0]) + ' a ' + fmtData(ds[ds.length - 1]);
  }

  /* ================= Status efetivo (com ações da demo) ================= */
  function statusEfetivo(l) {
    if (persist.resolvidas.indexOf(l.id) !== -1) return 'resolvida';
    if (persist.conciliados.indexOf(l.id) !== -1) return 'manual';
    return l.status;
  }
  const estaVerde = (l) => ['conciliado', 'manual', 'resolvida'].indexOf(statusEfetivo(l)) !== -1;
  const divergenciaAberta = (l) => l.divergencia && statusEfetivo(l) === 'divergencia';

  function chipStatus(l) {
    const s = statusEfetivo(l);
    if (s === 'conciliado') return '<span class="chip chip-ok">Conciliado</span>';
    if (s === 'manual') return '<span class="chip chip-ok">Conciliado (manual)</span>';
    if (s === 'resolvida') return '<span class="chip chip-ok">Divergência resolvida</span>';
    if (s === 'pendente') return '<span class="chip chip-atencao">Pendente D+' + l.dias + '</span>';
    return '<span class="chip chip-erro">Divergência</span>';
  }

  function classeLinha(l) {
    const s = statusEfetivo(l);
    if (s === 'pendente') return 'linha-status linha-atencao';
    if (s === 'divergencia') return 'linha-status linha-erro';
    return 'linha-status linha-ok';
  }

  /* ================= Gráficos SVG (sem bibliotecas) ================= */
  function tetoBonito(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return f * p;
  }

  function graficoBarras(dados, opcoes) {
    const o = Object.assign({ altura: 250, formato: brlCompacto, cor: '#1F4A54' }, opcoes || {});
    const W = 900, H = o.altura, mE = 70, mD = 12, mT = 14, mB = 30;
    const teto = tetoBonito(Math.max.apply(null, dados.map((d) => d.valor).concat([1])));
    const areaW = W - mE - mD, areaH = H - mT - mB;
    const passo = areaW / Math.max(dados.length, 1);
    const bw = Math.min(passo * 0.72, 48);

    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras">';
    for (let g = 0; g <= 4; g++) {
      const y = mT + areaH - (areaH * g / 4);
      const val = teto * g / 4;
      s += '<line x1="' + mE + '" y1="' + y + '" x2="' + (W - mD) + '" y2="' + y + '" stroke="#E1E5E2" stroke-width="1"/>';
      s += '<text x="' + (mE - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#5C6B70">' + esc(o.formato(val)) + '</text>';
    }
    const saltoRotulo = Math.ceil(dados.length / 8);
    dados.forEach((d, i) => {
      const h = Math.max(teto > 0 ? areaH * d.valor / teto : 0, d.valor > 0 ? 2 : 0);
      const x = mE + passo * i + (passo - bw) / 2;
      const y = mT + areaH - h;
      const clicavel = o.aoClicar && d.chave != null;
      const attrs = clicavel
        ? ' class="barra-clicavel" tabindex="0" role="button" data-chave="' + esc(d.chave) + '" aria-label="' + esc(d.titulo || d.rotulo) + '"'
        : '';
      if (clicavel) {
        // área de clique de coluna inteira, transparente, facilita acertar barras baixas
        s += '<rect' + attrs + ' x="' + (mE + passo * i).toFixed(1) + '" y="' + mT + '" width="' + passo.toFixed(1) +
          '" height="' + areaH + '" fill="transparent"><title>' + esc(d.titulo || (d.rotulo + ': ' + o.formato(d.valor))) + '</title></rect>';
      }
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="3" fill="' + (d.cor || o.cor) + '" pointer-events="none">' +
        (clicavel ? '' : '<title>' + esc(d.titulo || (d.rotulo + ': ' + o.formato(d.valor))) + '</title>') + '</rect>';
      if (i % saltoRotulo === 0) {
        s += '<text x="' + (mE + passo * i + passo / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#5C6B70" pointer-events="none">' + esc(d.rotulo) + '</text>';
      }
    });
    s += '<line x1="' + mE + '" y1="' + (mT + areaH) + '" x2="' + (W - mD) + '" y2="' + (mT + areaH) + '" stroke="#B9C2BD" stroke-width="1.5"/>';
    return s + '</svg>';
  }

  function graficoDonut(fatias) {
    const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
    const R = 70, C = 2 * Math.PI * R, cx = 110, cy = 110;
    let off = 0;
    let s = '<svg viewBox="0 0 220 220" role="img" aria-label="Gráfico de mix por forma de pagamento" style="max-width:260px;margin:0 auto">';
    fatias.forEach((f) => {
      const len = C * f.valor / total;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + f.cor + '" stroke-width="36" ' +
        'stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
        '<title>' + esc(f.rotulo + ': ' + brl(f.valor) + ' (' + (100 * f.valor / total).toFixed(1).replace('.', ',') + '%)') + '</title></circle>';
      off += len;
    });
    s += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="19" font-weight="800" fill="#16353C" font-style="italic">' + esc(brlCompacto(total)) + '</text>';
    s += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="11" fill="#5C6B70">no período</text>';
    s += '</svg>';
    const legenda = fatias.map((f) =>
      '<span class="legenda-item"><span class="legenda-cor" style="background:' + f.cor + '"></span>' +
      esc(f.rotulo) + ' · ' + (100 * f.valor / total).toFixed(1).replace('.', ',') + '%</span>').join('');
    return s + '<div class="legenda">' + legenda + '</div>';
  }

  function graficoBarrasH(dados) {
    const W = 620, linhaH = 36, rotuloW = 160, valorW = 116;
    const H = dados.length * linhaH + 8;
    const max = Math.max.apply(null, dados.map((d) => d.valor).concat([1]));
    const areaW = W - rotuloW - valorW;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de barras horizontais">';
    dados.forEach((d, i) => {
      const y = i * linhaH + 6;
      const bw = Math.max(areaW * d.valor / max, d.valor > 0 ? 3 : 0);
      s += '<text x="' + (rotuloW - 10) + '" y="' + (y + 16) + '" text-anchor="end" font-size="12.5" fill="#223034">' + esc(d.rotulo) + '</text>';
      s += '<rect x="' + rotuloW + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="22" rx="4" fill="' + (d.cor || '#1F4A54') + '">' +
        '<title>' + esc(d.rotulo + ': ' + brl(d.valor)) + '</title></rect>';
      s += '<text x="' + (rotuloW + bw + 8) + '" y="' + (y + 16) + '" font-size="12" font-weight="700" fill="#16353C" font-variant="tabular-nums">' + esc(brlCompacto(d.valor)) + '</text>';
    });
    return s + '</svg>';
  }

  /* ================= Toast ================= */
  function toast(msg) {
    const area = byId('toast-area');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    area.appendChild(t);
    setTimeout(() => {
      t.classList.add('saindo');
      setTimeout(() => t.remove(), 320);
    }, 3200);
  }

  /* ================= Modal de detalhes ================= */
  let focoAnterior = null;

  function abrirModal(lote) {
    const l = typeof lote === 'string' ? DB.lotes.find((x) => x.id === lote) : lote;
    if (!l) return;
    focoAnterior = document.activeElement;
    byId('modal-titulo').textContent = 'Lote ' + l.id;
    byId('modal-corpo').innerHTML = htmlModal(l);

    const btnConc = byId('acao-conciliar');
    const btnResolv = byId('acao-resolver');
    if (btnConc) btnConc.addEventListener('click', () => acaoLote(l, 'conciliar'));
    if (btnResolv) btnResolv.addEventListener('click', () => acaoLote(l, 'resolver'));

    byId('modal-fundo').hidden = false;
    document.body.style.overflow = 'hidden';
    byId('modal-fechar').focus();
  }

  function fecharModal() {
    byId('modal-fundo').hidden = true;
    document.body.style.overflow = '';
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
    focoAnterior = null;
  }

  function htmlModal(l) {
    const s = statusEfetivo(l);
    const liquidada = l.dataLiquidacao <= DB.hoje;
    const capturaFalhou = l.divergencia && l.divergencia.tipo === 'nao_localizada';

    let passo3Classe = 'lt-pend', passo3Titulo = 'Liquidação prevista (D+' + l.dias + ')', passo3Data = fmtData(l.dataLiquidacao);
    if (capturaFalhou) { passo3Classe = 'lt-erro'; passo3Titulo = 'Liquidação não prevista'; passo3Data = '—'; }
    else if (l.divergencia) { passo3Classe = 'lt-erro'; passo3Titulo = liquidada ? 'Liquidada com divergência' : 'Prevista com divergência'; }
    else if (liquidada) { passo3Classe = 'lt-feito'; passo3Titulo = 'Liquidada'; }

    const linhaTempo =
      '<div class="linha-tempo">' +
      '<div class="lt-passo lt-feito"><div class="lt-bola"></div><div class="lt-titulo">Venda (PDV)</div><div class="lt-data">' + fmtData(l.data) + ' · Turno ' + l.turno + '</div></div>' +
      '<div class="lt-passo ' + (capturaFalhou ? 'lt-erro' : 'lt-feito') + '"><div class="lt-bola"></div><div class="lt-titulo">' + (capturaFalhou ? 'Captura não localizada' : 'Captura na adquirente') + '</div><div class="lt-data">' + (capturaFalhou ? '—' : fmtData(l.data)) + '</div></div>' +
      '<div class="lt-passo ' + passo3Classe + '"><div class="lt-bola"></div><div class="lt-titulo">' + passo3Titulo + '</div><div class="lt-data">' + passo3Data + '</div></div>' +
      '</div>';

    const dado = (t, v) => '<dl class="modal-dado"><dt>' + t + '</dt><dd>' + v + '</dd></dl>';
    const grade =
      '<div class="modal-grade">' +
      dado('Data da venda', fmtData(l.data)) +
      dado('Unidade', esc(nomeUnidade(l.unidadeId))) +
      dado('Turno', l.turno + ' · ' + TURNO_POR_N[l.turno].label) +
      dado('Forma de pagamento', esc(l.formaLabel)) +
      dado('Adquirente', esc(l.adquirente)) +
      dado('Status', chipStatus(l)) +
      dado('Valor bruto', brl(l.bruto)) +
      dado('Taxa contratada', fmtPct(l.taxaContratadaPct) + ' (' + brl(l.taxaContratadaValor) + ')') +
      dado('Taxa cobrada', (l.taxaCobradaPct > l.taxaContratadaPct ? '<span class="texto-erro">' + fmtPct(l.taxaCobradaPct) + '</span>' : fmtPct(l.taxaCobradaPct))) +
      dado('Líquido esperado', brl(l.liquidoEsperado)) +
      dado(liquidada ? 'Líquido recebido' : 'Líquido informado (agenda)', brl(l.liquidoInformado)) +
      dado('Liquidação (D+' + l.dias + ')', fmtData(l.dataLiquidacao)) +
      '</div>';

    let blocoDiverg = '';
    if (l.divergencia) {
      const d = l.divergencia;
      blocoDiverg =
        '<div class="caixa-diverg"><strong>' + esc(d.titulo) + '</strong> · ' +
        '<span class="selo-sev sev-' + d.severidade + '">' + d.severidade + '</span><br>' +
        esc(d.descricao) + '<br><strong>Impacto: ' +
        (d.impacto >= 0 ? brl(d.impacto) + ' a recuperar' : brl(-d.impacto) + ' a devolver') + '</strong></div>';
    }

    // Lançamentos do extrato bancário vinculados ao lote
    const lancamentos = EXTRATO_POR_LOTE[l.id] || [];
    let blocoExtrato = '<h4 class="modal-sec">Extrato bancário</h4>';
    if (lancamentos.length > 0) {
      blocoExtrato += '<table class="mini-tabela"><thead><tr><th>Data</th><th>Lançamento</th><th class="num">Valor</th></tr></thead><tbody>' +
        lancamentos.map((e) =>
          '<tr><td>' + fmtData(e.data) + '</td>' +
          '<td>' + esc(e.descricao.replace(/ — (ref\. )?L-.*$/, '')) + '</td>' +
          '<td class="num ' + (e.tipo === 'credito' ? 'texto-ok' : 'texto-erro') + '"><strong>' +
          (e.tipo === 'credito' ? '+' : '−') + brl(e.valor) + '</strong></td></tr>').join('') +
        '</tbody></table>';
    } else if (l.dataLiquidacao > DB.hoje && !capturaFalhou) {
      blocoExtrato += '<p class="modal-sec-vazio">Sem lançamentos até ' + fmtData(DB.hoje) + ' — liquidação prevista para ' + fmtData(l.dataLiquidacao) + '.</p>';
    } else {
      blocoExtrato += '<p class="modal-sec-vazio">Nenhum crédito localizado no extrato para este lote' + (capturaFalhou ? ' — reflexo da captura não localizada' : '') + '.</p>';
    }

    let blocoTratado = '';
    if (s === 'manual') blocoTratado = '<div class="caixa-resolvida">✔ Este lote foi <strong>conciliado manualmente</strong> nesta demonstração.</div>';
    if (s === 'resolvida') blocoTratado = '<div class="caixa-resolvida">✔ Esta divergência foi <strong>marcada como resolvida</strong> nesta demonstração.</div>';

    let acoes = '';
    if (s === 'pendente') {
      acoes = '<button type="button" class="btn" id="acao-conciliar">Conciliar manualmente</button>';
    } else if (s === 'divergencia') {
      acoes = '<button type="button" class="btn btn-ambar" id="acao-resolver">Marcar divergência como resolvida</button>' +
        '<button type="button" class="btn" id="acao-conciliar">Conciliar manualmente</button>';
    } else if (s === 'conciliado') {
      acoes = '<span class="chip chip-ok">Lote conciliado automaticamente — nenhuma ação necessária.</span>';
    }

    return grade + linhaTempo + blocoDiverg + blocoExtrato + blocoTratado +
      '<div class="modal-acoes">' + acoes + '</div>';
  }

  function acaoLote(l, acao) {
    if (acao === 'conciliar' && persist.conciliados.indexOf(l.id) === -1) {
      persist.conciliados.push(l.id);
      toast('Lote ' + l.id + ' conciliado manualmente.');
    }
    if (acao === 'resolver' && persist.resolvidas.indexOf(l.id) === -1) {
      persist.resolvidas.push(l.id);
      toast('Divergência do lote ' + l.id + ' marcada como resolvida.');
    }
    salvarPersistencia();
    fecharModal();
    renderTabAtiva();
  }

  /* ================= Aba 1 · Painel (Dashboard) ================= */
  function renderDashboard(sec) {
    const lotes = lotesFiltrados();
    const vendas = vendasFiltradas();
    const dias = diasDoPeriodo();

    const totalVendido = r2(lotes.reduce((s, l) => s + l.bruto, 0));
    const totalRecebido = r2(lotes.reduce((s, l) => s + (l.liquidoRecebido || 0), 0));
    const divergAbertas = lotes.filter(divergenciaAberta);
    const valorDiverg = r2(divergAbertas.reduce((s, l) => s + Math.abs(l.divergencia.impacto), 0));
    const taxasPagas = r2(lotes.reduce((s, l) => s + (l.dataLiquidacao <= DB.hoje ? l.taxaCobradaValor : 0), 0));
    const aReceber = r2(lotes.reduce((s, l) => s + (l.dataLiquidacao > DB.hoje ? l.liquidoInformado : 0), 0));
    const litros = vendas.reduce((s, v) => s + (v.litros || 0), 0);

    const porDia = dias.map((d) => {
      const v = r2(lotes.filter((l) => l.data === d).reduce((s, l) => s + l.bruto, 0));
      return { rotulo: fmtDataCurta(d), valor: v, chave: d, titulo: fmtData(d) + ': ' + brl(v) + ' — clique para ver a conciliação do dia' };
    });

    const mix = DB.taxas.map((f) => ({
      rotulo: f.label,
      valor: r2(lotes.filter((l) => l.forma === f.id).reduce((s, l) => s + l.bruto, 0)),
      cor: CORES_FORMAS[f.id]
    })).filter((f) => f.valor > 0);

    const porProduto = DB.produtos.map((p) => ({
      rotulo: p.nome,
      valor: r2(vendas.filter((v) => v.produtoId === p.id).reduce((s, v) => s + v.valor, 0)),
      cor: p.id === 'CONV' ? '#F5A623' : '#1F4A54'
    })).filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor);

    const alertas = lotes.filter(divergenciaAberta)
      .sort((a, b) => Math.abs(b.divergencia.impacto) - Math.abs(a.divergencia.impacto))
      .slice(0, 5);

    const fechs = fechamentosFiltrados()
      .sort((a, b) => (b.data + b.turno) > (a.data + a.turno) ? 1 : -1)
      .slice(0, 8);

    sec.innerHTML =
      '<h2 class="titulo-aba">Painel geral</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) + ' · ' + rotuloPeriodo() + ' · valores ilustrativos</p>' +

      '<div class="kpis">' +
      kpi('Total vendido', brl(totalVendido), fmtNum(litros) + ' L + conveniência', '') +
      kpi('Total recebido (líquido)', brl(totalRecebido), 'creditado até ' + fmtData(DB.hoje), 'kpi-ok') +
      kpi('Divergências', brl(valorDiverg), divergAbertas.length + ' ocorrência' + (divergAbertas.length === 1 ? '' : 's') + ' em aberto', 'kpi-erro') +
      kpi('Taxas pagas', brl(taxasPagas), totalVendido > 0 ? fmtPct(100 * taxasPagas / totalVendido) + ' do bruto' : '—', 'kpi-ambar') +
      kpi('A receber', brl(aReceber), 'agenda futura das adquirentes', 'kpi-atencao') +
      '</div>' +

      '<div class="grade-2">' +
      '<div class="card"><h3>Vendas por dia</h3><div class="grafico">' + graficoBarras(porDia, { aoClicar: true }) + '</div>' +
      '<p class="pequeno texto-suave">Clique em um dia para abrir sua conciliação.</p></div>' +
      '<div class="card"><h3>Mix por forma de pagamento</h3><div class="grafico">' + graficoDonut(mix) + '</div></div>' +
      '</div>' +

      '<div class="grade-2">' +
      '<div class="card"><h3>Vendas por produto</h3><div class="grafico">' + graficoBarrasH(porProduto) + '</div>' +
      '<p class="pequeno texto-suave">Preços médios por litro ilustrativos (referência Campo Grande/MS).</p></div>' +

      '<div class="card"><h3>Alertas — principais divergências</h3>' +
      (alertas.length === 0
        ? '<p class="sem-resultado">Nenhuma divergência em aberto para o filtro atual.</p>'
        : '<div class="rolagem"><table class="tabela"><thead><tr><th>Severidade</th><th>Ocorrência</th><th class="num">Impacto</th></tr></thead><tbody>' +
          alertas.map((l) =>
            '<tr class="tr-clicavel ' + classeLinha(l) + '" data-lote="' + l.id + '" tabindex="0">' +
            '<td><span class="selo-sev sev-' + l.divergencia.severidade + '">' + l.divergencia.severidade + '</span></td>' +
            '<td>' + esc(l.divergencia.titulo) + '<br><span class="pequeno texto-suave">' + fmtData(l.data) + ' · ' + esc(nomeUnidade(l.unidadeId)) + ' · ' + esc(l.formaLabel) + ' · ' + esc(l.adquirente) + '</span></td>' +
            '<td class="num texto-erro"><strong>' + brl(Math.abs(l.divergencia.impacto)) + '</strong></td></tr>').join('') +
          '</tbody></table></div><p class="pequeno texto-suave">Clique em um alerta para abrir os detalhes do lote.</p>') +
      '</div></div>' +

      '<div class="card"><h3>Últimos fechamentos de turno</h3><div class="rolagem">' +
      '<table class="tabela"><thead><tr><th>Data</th><th>Unidade</th><th>Turno</th><th>Frentista</th>' +
      '<th class="num">Litros</th><th class="num">Esperado</th><th class="num">Apurado</th><th class="num">Quebra de caixa</th></tr></thead><tbody>' +
      fechs.map((f) =>
        '<tr><td>' + fmtData(f.data) + '</td><td>' + esc(nomeUnidade(f.unidadeId)) + '</td>' +
        '<td>' + f.turno + ' · ' + f.turnoLabel + '</td><td>' + esc(f.frentista) + '</td>' +
        '<td class="num">' + fmtNum(f.litros) + '</td>' +
        '<td class="num">' + brl(f.valorEsperado) + '</td>' +
        '<td class="num">' + brl(f.valorApurado) + '</td>' +
        '<td class="num ' + (f.quebra < 0 ? 'texto-erro' : 'texto-ok') + '">' + (f.quebra >= 0 ? '+' : '−') + brl(Math.abs(f.quebra)) + '</td></tr>').join('') +
      '</tbody></table></div></div>';

    sec.querySelectorAll('[data-lote]').forEach((tr) => {
      tr.addEventListener('click', () => abrirModal(tr.getAttribute('data-lote')));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirModal(tr.getAttribute('data-lote')); } });
    });

    sec.querySelectorAll('.barra-clicavel').forEach((b) => {
      const irParaDia = () => abrirConciliacaoDoDia(b.getAttribute('data-chave'));
      b.addEventListener('click', irParaDia);
      b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); irParaDia(); } });
    });
  }

  function abrirConciliacaoDoDia(dia) {
    estado.conc = Object.assign(estado.conc, { dia: dia, status: 'todos', tipoDiv: 'todos', forma: 'todas', adquirente: 'todas', busca: '', pagina: 1 });
    ativarTab('conciliacao');
    toast('Conciliação filtrada por ' + fmtData(dia) + '.');
  }

  function kpi(rotulo, valor, extra, classe) {
    return '<div class="kpi ' + classe + '"><div class="kpi-rotulo">' + rotulo + '</div>' +
      '<div class="kpi-valor">' + valor + '</div><div class="kpi-extra">' + extra + '</div></div>';
  }

  function nomeUnidadeFiltro() {
    return estado.unidade === 'all' ? 'Todas as unidades' : 'Unidade ' + nomeUnidade(estado.unidade);
  }

  /* ================= Aba 2 · Conciliação ================= */
  const POR_PAGINA = 50;

  function renderConciliacao(sec) {
    const adquirentes = Array.from(new Set(DB.lotes.map((l) => l.adquirente))).sort();

    sec.innerHTML =
      '<h2 class="titulo-aba">Conciliação venda × recebível</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) +
        (estado.conc.dia ? ' · <strong>dia ' + fmtData(estado.conc.dia) + '</strong>' : ' · ' + rotuloPeriodo()) +
        ' · clique em uma linha para ver os detalhes e tratar o lote</p>' +
      '<div class="progresso-caixa" id="conc-progresso"></div>' +
      '<div class="card">' +
      '<div class="filtros-locais">' +
      campoSelect('conc-f-status', 'Status', [['todos', 'Todos'], ['conciliado', 'Conciliado'], ['pendente', 'Pendente'], ['divergencia', 'Divergência']], estado.conc.status) +
      campoSelect('conc-f-tipodiv', 'Tipo de divergência', [['todos', 'Todos']].concat(TIPOS_DIVERGENCIA), estado.conc.tipoDiv) +
      campoSelect('conc-f-forma', 'Forma de pagamento', [['todas', 'Todas']].concat(DB.taxas.map((f) => [f.id, f.label])), estado.conc.forma) +
      campoSelect('conc-f-adq', 'Adquirente', [['todas', 'Todas']].concat(adquirentes.map((a) => [a, a])), estado.conc.adquirente) +
      '<label class="campo"><span>Buscar</span><input type="search" id="conc-f-busca" placeholder="Unidade, adquirente, lote…" value="' + esc(estado.conc.busca) + '"></label>' +
      (estado.conc.dia
        ? '<button type="button" class="btn btn-contorno btn-limpar-dia" id="conc-limpar-dia">Dia ' + fmtData(estado.conc.dia) + ' ✕</button>'
        : '') +
      '</div>' +
      '<div class="rolagem"><table class="tabela" id="conc-tabela"><thead><tr>' +
      thOrd('data', 'Data') + thOrd('unidade', 'Unidade') + thOrd('turno', 'Turno') +
      thOrd('forma', 'Forma') + thOrd('adquirente', 'Adquirente') +
      thOrd('bruto', 'Bruto', true) + thOrd('taxaContratadaPct', 'Taxa contr.', true) +
      thOrd('taxaCobradaPct', 'Taxa cobr.', true) + thOrd('liquidoEsperado', 'Líq. esperado', true) +
      thOrd('liquidoRecebido', 'Líq. recebido', true) + thOrd('status', 'Status') +
      '</tr></thead><tbody id="conc-corpo"></tbody></table></div>' +
      '<div class="paginacao" id="conc-paginacao"></div>' +
      '</div>';

    byId('conc-f-status').addEventListener('change', (e) => { estado.conc.status = e.target.value; estado.conc.pagina = 1; renderConcTabela(); });
    byId('conc-f-tipodiv').addEventListener('change', (e) => {
      estado.conc.tipoDiv = e.target.value;
      if (e.target.value !== 'todos') { estado.conc.status = 'divergencia'; byId('conc-f-status').value = 'divergencia'; }
      estado.conc.pagina = 1; renderConcTabela();
    });
    byId('conc-f-forma').addEventListener('change', (e) => { estado.conc.forma = e.target.value; estado.conc.pagina = 1; renderConcTabela(); });
    byId('conc-f-adq').addEventListener('change', (e) => { estado.conc.adquirente = e.target.value; estado.conc.pagina = 1; renderConcTabela(); });
    byId('conc-f-busca').addEventListener('input', (e) => { estado.conc.busca = e.target.value; estado.conc.pagina = 1; renderConcTabela(); });
    if (byId('conc-limpar-dia')) {
      byId('conc-limpar-dia').addEventListener('click', () => { estado.conc.dia = ''; estado.conc.pagina = 1; renderConciliacao(byId('tab-conciliacao')); });
    }

    sec.querySelectorAll('.th-ord').forEach((btn) => {
      btn.addEventListener('click', () => {
        const campo = btn.getAttribute('data-ord');
        if (estado.conc.ordCampo === campo) {
          estado.conc.ordDir = estado.conc.ordDir === 'asc' ? 'desc' : 'asc';
        } else {
          estado.conc.ordCampo = campo;
          estado.conc.ordDir = 'asc';
        }
        renderConcTabela();
      });
    });

    renderConcTabela();
  }

  function campoSelect(id, rotulo, opcoes, valorAtual) {
    return '<label class="campo"><span>' + rotulo + '</span><select id="' + id + '">' +
      opcoes.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valorAtual) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') +
      '</select></label>';
  }

  function thOrd(campo, rotulo, numerico) {
    return '<th' + (numerico ? ' class="num"' : '') + '><button type="button" class="th-ord" data-ord="' + campo + '">' + rotulo + '<span class="ord-seta" data-seta="' + campo + '"></span></button></th>';
  }

  function valorOrdenacao(l, campo) {
    switch (campo) {
      case 'unidade': return nomeUnidade(l.unidadeId);
      case 'forma': return l.formaLabel;
      case 'liquidoRecebido': return l.liquidoRecebido === null ? -1 : l.liquidoRecebido;
      case 'status': return { divergencia: 0, pendente: 1, manual: 2, resolvida: 3, conciliado: 4 }[statusEfetivo(l)];
      default: return l[campo];
    }
  }

  function lotesDaConciliacao() {
    const c = estado.conc;
    const busca = c.busca.trim().toLowerCase();
    let itens = lotesFiltrados().filter((l) => {
      if (c.dia && l.data !== c.dia) return false;
      if (c.forma !== 'todas' && l.forma !== c.forma) return false;
      if (c.adquirente !== 'todas' && l.adquirente !== c.adquirente) return false;
      if (c.tipoDiv !== 'todos' && (!l.divergencia || l.divergencia.tipo !== c.tipoDiv)) return false;
      if (c.status !== 'todos') {
        const s = statusEfetivo(l);
        const grupo = s === 'manual' || s === 'resolvida' ? 'conciliado' : s;
        if (grupo !== c.status) return false;
      }
      if (busca) {
        const alvo = (l.id + ' ' + fmtData(l.data) + ' ' + nomeUnidade(l.unidadeId) + ' ' + l.formaLabel + ' ' + l.adquirente).toLowerCase();
        if (alvo.indexOf(busca) === -1) return false;
      }
      return true;
    });
    const dir = c.ordDir === 'asc' ? 1 : -1;
    itens.sort((a, b) => {
      const va = valorOrdenacao(a, c.ordCampo), vb = valorOrdenacao(b, c.ordCampo);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.id < b.id ? -dir : dir;
    });
    return itens;
  }

  function renderConcTabela() {
    const todos = lotesFiltrados();
    const verdes = todos.filter(estaVerde).length;
    const pctConc = todos.length ? Math.round(100 * verdes / todos.length) : 0;
    byId('conc-progresso').innerHTML =
      '<div class="progresso-rotulo"><span>' + pctConc + '% do período conciliado</span>' +
      '<span class="texto-suave">' + verdes + ' de ' + todos.length + ' lotes</span></div>' +
      '<div class="progresso-trilho"><div class="progresso-preenchido" style="width:' + pctConc + '%"></div></div>';

    document.querySelectorAll('#conc-tabela .ord-seta').forEach((sp) => {
      sp.textContent = sp.getAttribute('data-seta') === estado.conc.ordCampo ? (estado.conc.ordDir === 'asc' ? '▲' : '▼') : '';
    });

    const itens = lotesDaConciliacao();
    const totalPag = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
    if (estado.conc.pagina > totalPag) estado.conc.pagina = totalPag;
    const ini = (estado.conc.pagina - 1) * POR_PAGINA;
    const pagina = itens.slice(ini, ini + POR_PAGINA);

    const corpo = byId('conc-corpo');
    corpo.innerHTML = pagina.length === 0
      ? '<tr><td colspan="11" class="sem-resultado">Nenhum lote encontrado com os filtros atuais.</td></tr>'
      : pagina.map((l) =>
        '<tr class="tr-clicavel ' + classeLinha(l) + '" data-lote="' + l.id + '" tabindex="0" aria-label="Abrir detalhes do lote ' + l.id + '">' +
        '<td>' + fmtData(l.data) + '</td>' +
        '<td>' + esc(nomeUnidade(l.unidadeId)) + '</td>' +
        '<td>' + l.turno + '</td>' +
        '<td>' + esc(l.formaLabel) + '</td>' +
        '<td>' + esc(l.adquirente) + '</td>' +
        '<td class="num">' + brl(l.bruto) + '</td>' +
        '<td class="num">' + fmtPct(l.taxaContratadaPct) + '</td>' +
        '<td class="num' + (l.taxaCobradaPct > l.taxaContratadaPct ? ' delta-mais' : '') + '">' + fmtPct(l.taxaCobradaPct) + '</td>' +
        '<td class="num">' + brl(l.liquidoEsperado) + '</td>' +
        '<td class="num">' + (l.liquidoRecebido === null ? '<span class="texto-suave">— (D+' + l.dias + ')</span>' : brl(l.liquidoRecebido)) + '</td>' +
        '<td>' + chipStatus(l) + '</td></tr>').join('');

    corpo.querySelectorAll('[data-lote]').forEach((tr) => {
      tr.addEventListener('click', () => abrirModal(tr.getAttribute('data-lote')));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirModal(tr.getAttribute('data-lote')); } });
    });

    byId('conc-paginacao').innerHTML =
      '<span>' + (itens.length === 0 ? '0' : (ini + 1) + '–' + (ini + pagina.length)) + ' de ' + itens.length + ' lotes</span>' +
      '<button type="button" id="conc-pag-ant"' + (estado.conc.pagina <= 1 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span>Página ' + estado.conc.pagina + ' de ' + totalPag + '</span>' +
      '<button type="button" id="conc-pag-prox"' + (estado.conc.pagina >= totalPag ? ' disabled' : '') + '>Próxima ›</button>';

    byId('conc-pag-ant').addEventListener('click', () => { estado.conc.pagina--; renderConcTabela(); });
    byId('conc-pag-prox').addEventListener('click', () => { estado.conc.pagina++; renderConcTabela(); });
  }

  /* ================= Aba 3 · Fechamento de Caixa (Pista) ================= */
  function renderFechamento(sec) {
    const dias = diasDoPeriodo().slice().reverse();
    if (!estado.fechDia || dias.indexOf(estado.fechDia) === -1) estado.fechDia = dias[0];

    sec.innerHTML =
      '<h2 class="titulo-aba">Fechamento de caixa — pista</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) + ' · encerrantes, apuração por turno, sangrias e quebra de caixa</p>' +
      '<div class="card">' +
      '<div class="filtros-locais">' +
      campoSelect('fech-dia', 'Dia do fechamento', dias.map((d) => [d, fmtData(d)]), estado.fechDia) +
      '<div class="dica"><button type="button" class="dica-botao" aria-label="O que são encerrante e LMC?">?</button>' +
      '<div class="dica-texto" role="tooltip"><strong>Encerrante</strong> é o totalizador acumulado de litros de cada bico da bomba: o volume vendido no turno é a diferença entre o encerrante final e o inicial. Esses volumes alimentam o <strong>LMC — Livro de Movimentação de Combustíveis</strong>, registro diário obrigatório do posto. A <strong>Resolução ANP nº 884/2022</strong> admite variação de estoque de até <strong>0,6%</strong>; acima disso, a diferença deve ser investigada (perdas, aferição ou desvio).</div></div>' +
      '</div>' +
      '<div class="rolagem"><table class="tabela"><thead><tr><th></th><th>Unidade</th><th>Turno</th><th>Frentista</th>' +
      '<th class="num">Litros</th><th class="num">Valor esperado</th><th class="num">Valor apurado</th><th class="num">Quebra</th><th class="num">Sangrias</th></tr></thead>' +
      '<tbody id="fech-corpo"></tbody></table></div>' +
      '<p class="pequeno texto-suave">Valor esperado = litros vendidos × preço por produto (combustíveis da pista). Clique na linha para ver encerrantes por bomba e sangrias.</p>' +
      '</div>';

    byId('fech-dia').addEventListener('change', (e) => { estado.fechDia = e.target.value; renderFechCorpo(); });
    renderFechCorpo();
  }

  function renderFechCorpo() {
    const fechs = DB.fechamentos
      .filter((f) => f.data === estado.fechDia && daUnidade(f))
      .sort((a, b) => (nomeUnidade(a.unidadeId) + a.turno).localeCompare(nomeUnidade(b.unidadeId) + b.turno));

    const corpo = byId('fech-corpo');
    corpo.innerHTML = fechs.map((f, i) =>
      '<tr class="tr-clicavel linha-status ' + (Math.abs(f.quebra) > 30 ? 'linha-atencao' : 'linha-ok') + '" data-fech="' + i + '" tabindex="0" aria-expanded="false" aria-label="Expandir detalhes do turno">' +
      '<td>▸</td>' +
      '<td>' + esc(nomeUnidade(f.unidadeId)) + '</td>' +
      '<td>' + f.turno + ' · ' + f.turnoLabel + '</td>' +
      '<td>' + esc(f.frentista) + '</td>' +
      '<td class="num">' + fmtNum(f.litros) + '</td>' +
      '<td class="num">' + brl(f.valorEsperado) + '</td>' +
      '<td class="num">' + brl(f.valorApurado) + '</td>' +
      '<td class="num ' + (f.quebra < 0 ? 'texto-erro' : 'texto-ok') + '"><strong>' + (f.quebra >= 0 ? '+' : '−') + brl(Math.abs(f.quebra)) + '</strong></td>' +
      '<td class="num">' + brl(f.sangriaTotal) + '</td></tr>' +
      '<tr class="detalhe-fech" data-detalhe="' + i + '" hidden><td colspan="9"><div class="detalhe-grade">' +
      '<div><h4>Encerrantes por bomba</h4><table class="mini-tabela"><thead><tr><th>Bomba</th><th>Produto</th><th class="num">Enc. inicial</th><th class="num">Enc. final</th><th class="num">Litros</th></tr></thead><tbody>' +
      f.bombas.map((b) =>
        '<tr><td>' + b.bomba + '</td><td>' + esc(PRODUTO_POR_ID[b.produtoId].nome) + '</td>' +
        '<td class="num">' + fmtNum(b.encIni) + '</td><td class="num">' + fmtNum(b.encFim) + '</td>' +
        '<td class="num"><strong>' + fmtNum(b.litros) + '</strong></td></tr>').join('') +
      '</tbody></table></div>' +
      '<div><h4>Sangrias do turno</h4><table class="mini-tabela"><thead><tr><th>Hora</th><th class="num">Valor</th></tr></thead><tbody>' +
      f.sangrias.map((s) => '<tr><td>' + s.hora + '</td><td class="num">' + brl(s.valor) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>' + brl(f.sangriaTotal) + '</strong></td></tr></tfoot></table></div>' +
      '</div></td></tr>').join('');

    corpo.querySelectorAll('[data-fech]').forEach((tr) => {
      const alternar = () => {
        const det = corpo.querySelector('[data-detalhe="' + tr.getAttribute('data-fech') + '"]');
        det.hidden = !det.hidden;
        tr.setAttribute('aria-expanded', String(!det.hidden));
        tr.querySelector('td').textContent = det.hidden ? '▸' : '▾';
      };
      tr.addEventListener('click', alternar);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } });
    });
  }

  /* ================= Aba 4 · Recebíveis ================= */
  const TAXA_ANTECIPACAO_MES = 1.49; // % a.m. (ilustrativa)

  function recebiveisFiltrados() {
    return lotesFiltrados()
      .filter((l) => l.dataLiquidacao > DB.hoje)
      .map((l) => ({ data: l.dataLiquidacao, adquirente: l.adquirente, valor: l.liquidoInformado }));
  }

  function renderRecebiveis(sec) {
    const recs = recebiveisFiltrados();
    const fim40 = isoMais(DB.hoje, 40);

    const porDia = {};
    const porDiaAdq = {};
    recs.forEach((rr) => {
      if (rr.data > fim40) return;
      porDia[rr.data] = r2((porDia[rr.data] || 0) + rr.valor);
      if (!porDiaAdq[rr.data]) porDiaAdq[rr.data] = {};
      porDiaAdq[rr.data][rr.adquirente] = r2((porDiaAdq[rr.data][rr.adquirente] || 0) + rr.valor);
    });

    const diasAgenda = Object.keys(porDia).sort();
    const adquirentes = ['Cielo', 'Stone', 'Rede', 'Taurus Card', 'Ticket Log']
      .filter((a) => recs.some((rr) => rr.adquirente === a));
    const totalAgenda = r2(diasAgenda.reduce((s, d) => s + porDia[d], 0));

    const barras = [];
    for (let d = isoMais(DB.hoje, 1); d <= fim40; d = isoMais(d, 1)) {
      barras.push({ rotulo: fmtDataCurta(d), valor: porDia[d] || 0, titulo: fmtData(d) + ': ' + brl(porDia[d] || 0) });
    }

    sec.innerHTML =
      '<h2 class="titulo-aba">Recebíveis — agenda dos próximos 40 dias</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) + ' · vendas do período filtrado com liquidação de ' + fmtData(isoMais(DB.hoje, 1)) + ' a ' + fmtData(fim40) + '</p>' +

      '<div class="card"><h3>Quanto cai por dia · total ' + brl(totalAgenda) + '</h3>' +
      '<div class="grafico">' + graficoBarras(barras, { altura: 190 }) + '</div></div>' +

      '<div class="grade-2">' +
      '<div class="card"><h3>Agenda por adquirente</h3>' +
      (diasAgenda.length === 0
        ? '<p class="sem-resultado">Nenhum recebível futuro para o filtro atual.</p>'
        : '<div class="rolagem"><table class="tabela"><thead><tr><th>Antecipar</th><th>Data</th>' +
          adquirentes.map((a) => '<th class="num">' + esc(a) + '</th>').join('') +
          '<th class="num">Total do dia</th></tr></thead><tbody>' +
          diasAgenda.map((d) =>
            '<tr><td><input type="checkbox" class="antec-check" name="antecipar-' + d + '" data-dia="' + d + '" aria-label="Antecipar recebíveis de ' + fmtData(d) + '"' + (estado.antecipacao[d] ? ' checked' : '') + '></td>' +
            '<td>' + fmtData(d) + '</td>' +
            adquirentes.map((a) => '<td class="num">' + (porDiaAdq[d][a] ? brl(porDiaAdq[d][a]) : '<span class="texto-suave">—</span>') + '</td>').join('') +
            '<td class="num"><strong>' + brl(porDia[d]) + '</strong></td></tr>').join('') +
          '</tbody></table></div>') +
      '</div>' +

      '<div class="card"><h3>Simulador de antecipação</h3>' +
      '<p class="pequeno texto-suave">Selecione os dias na agenda ao lado. Custo estimado de <strong>' + fmtPct(TAXA_ANTECIPACAO_MES) + ' a.m.</strong> (ilustrativo), proporcional aos dias de antecipação.</p>' +
      '<div class="filtros-locais" style="margin:10px 0 4px">' +
      campoSelect('antec-adq', 'Antecipar apenas a adquirente', [['todas', 'Todas as adquirentes']].concat(adquirentes.map((a) => [a, a])), estado.antecAdq) +
      '</div>' +
      '<div class="acoes-linha" style="margin:6px 0 14px">' +
      '<button type="button" class="btn btn-contorno" id="antec-tudo">Selecionar tudo</button>' +
      '<button type="button" class="btn btn-contorno" id="antec-limpar">Limpar seleção</button></div>' +
      '<dl class="painel-resultado" id="antec-resultado"></dl>' +
      '</div></div>';

    sec.querySelectorAll('.antec-check').forEach((ch) => {
      ch.addEventListener('change', () => {
        if (ch.checked) estado.antecipacao[ch.getAttribute('data-dia')] = true;
        else delete estado.antecipacao[ch.getAttribute('data-dia')];
        renderAntecipacao();
      });
    });
    byId('antec-tudo').addEventListener('click', () => {
      diasAgenda.forEach((d) => { estado.antecipacao[d] = true; });
      sec.querySelectorAll('.antec-check').forEach((ch) => { ch.checked = true; });
      renderAntecipacao();
    });
    byId('antec-limpar').addEventListener('click', () => {
      estado.antecipacao = {};
      sec.querySelectorAll('.antec-check').forEach((ch) => { ch.checked = false; });
      renderAntecipacao();
    });
    byId('antec-adq').addEventListener('change', (e) => { estado.antecAdq = e.target.value; renderAntecipacao(); });

    renderAntecipacao();
  }

  function renderAntecipacao() {
    const alvo = byId('antec-resultado');
    if (!alvo) return;
    const recs = recebiveisFiltrados();
    const fim40 = isoMais(DB.hoje, 40);
    const adq = estado.antecAdq;
    let bruto = 0, custo = 0;
    const diasComValor = {};
    recs.forEach((rr) => {
      if (rr.data > fim40 || !estado.antecipacao[rr.data]) return;
      if (adq !== 'todas' && rr.adquirente !== adq) return;
      bruto = r2(bruto + rr.valor);
      custo = r2(custo + rr.valor * (TAXA_ANTECIPACAO_MES / 100 / 30) * diasEntre(DB.hoje, rr.data));
      diasComValor[rr.data] = true;
    });
    const dias = Object.keys(diasComValor).length;
    alvo.innerHTML =
      (adq !== 'todas' ? '<dt>Adquirente</dt><dd>' + esc(adq) + '</dd>' : '') +
      '<dt>Dias com recebíveis selecionados</dt><dd>' + dias + '</dd>' +
      '<dt>Valor a antecipar</dt><dd>' + brl(bruto) + '</dd>' +
      '<dt>Custo estimado da antecipação</dt><dd class="texto-erro">− ' + brl(custo) + '</dd>' +
      '<dt>Valor líquido hoje</dt><dd class="destaque-liquido">' + brl(r2(bruto - custo)) + '</dd>';
  }

  /* ================= Aba 5 · Taxas & Simulador ================= */
  function renderTaxas(sec) {
    const lotes = lotesFiltrados().filter((l) => l.forma !== 'dinheiro');
    const grupos = {};
    lotes.forEach((l) => {
      const k = l.forma + '|' + l.adquirente;
      if (!grupos[k]) grupos[k] = { forma: l.forma, formaLabel: l.formaLabel, adquirente: l.adquirente, contratada: l.taxaContratadaPct, bruto: 0, ponderado: 0, qtd: 0 };
      grupos[k].bruto = r2(grupos[k].bruto + l.bruto);
      grupos[k].ponderado += l.bruto * l.taxaCobradaPct;
      grupos[k].qtd++;
    });
    const linhas = Object.values(grupos).sort((a, b) =>
      (a.formaLabel + a.adquirente).localeCompare(b.formaLabel + b.adquirente));

    sec.innerHTML =
      '<h2 class="titulo-aba">Taxas &amp; simulador</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) + ' · ' + rotuloPeriodo() + ' · taxas contratadas ilustrativas</p>' +

      '<div class="card"><h3>Taxa contratada × taxa média cobrada</h3><div class="rolagem">' +
      '<table class="tabela"><thead><tr><th>Modalidade</th><th>Adquirente</th>' +
      '<th class="num">Taxa contratada</th><th class="num">Taxa média cobrada</th><th class="num">Δ (p.p.)</th>' +
      '<th class="num">Lotes</th><th class="num">Volume bruto</th></tr></thead><tbody>' +
      linhas.map((g) => {
        const media = g.bruto > 0 ? g.ponderado / g.bruto : g.contratada;
        const delta = media - g.contratada;
        const deltaTxt = delta > 0.004
          ? '<span class="delta-mais">+' + delta.toFixed(2).replace('.', ',') + '</span>'
          : '<span class="delta-ok">0,00</span>';
        return '<tr class="linha-status ' + (delta > 0.004 ? 'linha-erro' : 'linha-ok') + '">' +
          '<td>' + esc(g.formaLabel) + '</td><td>' + esc(g.adquirente) + '</td>' +
          '<td class="num">' + fmtPct(g.contratada) + '</td>' +
          '<td class="num' + (delta > 0.004 ? ' delta-mais' : '') + '">' + fmtPct(media) + '</td>' +
          '<td class="num">' + deltaTxt + '</td>' +
          '<td class="num">' + g.qtd + '</td>' +
          '<td class="num">' + brl(g.bruto) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<p class="pequeno texto-suave">Δ em vermelho indica taxa média cobrada acima da contratada no período — casos a contestar junto à adquirente.</p></div>' +

      '<div class="grade-2b">' +
      '<div class="card"><h3>Calculadora de recebimento</h3>' +
      '<div class="filtros-locais">' +
      '<label class="campo"><span>Valor da venda (R$)</span><input type="number" id="calc-valor" min="0" step="0.01" value="500"></label>' +
      campoSelect('calc-forma', 'Modalidade', DB.taxas.map((f) => [f.id, f.label]), 'credito') +
      '</div><dl class="painel-resultado" id="calc-resultado"></dl></div>' +

      '<div class="card"><h3>Condições contratadas (ilustrativas)</h3><div class="rolagem">' +
      '<table class="tabela"><thead><tr><th>Modalidade</th><th class="num">Taxa</th><th class="num">Prazo</th></tr></thead><tbody>' +
      DB.taxas.map((f) =>
        '<tr><td>' + esc(f.label) + '</td><td class="num">' + fmtPct(f.taxaPct) + '</td><td class="num">D+' + f.dias + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<p class="pequeno texto-suave">Cartão-frota: Taurus Card e Ticket Log. Débito e crédito distribuídos entre Cielo, Stone e Rede.</p></div>' +
      '</div>';

    const recalc = () => {
      const valor = parseFloat(byId('calc-valor').value);
      const f = FORMA_POR_ID[byId('calc-forma').value];
      const alvo = byId('calc-resultado');
      if (!valor || valor <= 0 || !f) {
        alvo.innerHTML = '<dt>Resultado</dt><dd class="texto-suave" style="font-size:.95rem">Informe um valor de venda válido.</dd>';
        return;
      }
      const taxa = r2(valor * f.taxaPct / 100);
      alvo.innerHTML =
        '<dt>Taxa aplicada (' + fmtPct(f.taxaPct) + ')</dt><dd class="texto-erro">− ' + brl(taxa) + '</dd>' +
        '<dt>Valor líquido</dt><dd class="destaque-liquido">' + brl(r2(valor - taxa)) + '</dd>' +
        '<dt>Recebimento previsto (D+' + f.dias + ')</dt><dd>' + fmtData(isoMais(DB.hoje, f.dias)) + '</dd>';
    };
    byId('calc-valor').addEventListener('input', recalc);
    byId('calc-forma').addEventListener('change', recalc);
    recalc();
  }

  /* ================= Aba 6 · Relatórios ================= */
  const CUSTO_COMBUSTIVEL = 0.87; // % da receita de combustíveis (estimado, ilustrativo)
  const CUSTO_CONVENIENCIA = 0.65;

  function renderRelatorios(sec) {
    const vendas = vendasFiltradas();
    const lotes = lotesFiltrados();

    const recCombustivel = r2(vendas.filter((v) => v.produtoId !== 'CONV').reduce((s, v) => s + v.valor, 0));
    const recConveniencia = r2(vendas.filter((v) => v.produtoId === 'CONV').reduce((s, v) => s + v.valor, 0));
    const receitaTotal = r2(recCombustivel + recConveniencia);
    const taxas = r2(lotes.reduce((s, l) => s + l.taxaCobradaValor, 0));
    const custoComb = r2(recCombustivel * CUSTO_COMBUSTIVEL);
    const custoConv = r2(recConveniencia * CUSTO_CONVENIENCIA);
    const margem = r2(receitaTotal - taxas - custoComb - custoConv);
    const margemPct = receitaTotal > 0 ? 100 * margem / receitaTotal : 0;

    sec.innerHTML =
      '<h2 class="titulo-aba">Relatórios</h2>' +
      '<p class="subtitulo-aba">' + esc(nomeUnidadeFiltro()) + ' · ' + rotuloPeriodo() + '</p>' +

      '<div class="card"><h3>DRE simplificado do período (estimativas ilustrativas)</h3><div class="rolagem">' +
      '<table class="tabela dre"><tbody>' +
      '<tr><td>Receita bruta total</td><td class="num"><strong>' + brl(receitaTotal) + '</strong></td></tr>' +
      '<tr class="dre-sub"><td>Combustíveis</td><td class="num">' + brl(recCombustivel) + '</td></tr>' +
      '<tr class="dre-sub"><td>Conveniência</td><td class="num">' + brl(recConveniencia) + '</td></tr>' +
      '<tr><td>(−) Taxas de cartão / PIX</td><td class="num dre-negativo">− ' + brl(taxas) + '</td></tr>' +
      '<tr><td>(−) Custo estimado de combustível (' + Math.round(CUSTO_COMBUSTIVEL * 100) + '% da receita)</td><td class="num dre-negativo">− ' + brl(custoComb) + '</td></tr>' +
      '<tr><td>(−) Custo estimado da conveniência (' + Math.round(CUSTO_CONVENIENCIA * 100) + '% da receita)</td><td class="num dre-negativo">− ' + brl(custoConv) + '</td></tr>' +
      '<tr class="dre-total"><td>(=) Margem bruta estimada · ' + margemPct.toFixed(1).replace('.', ',') + '% da receita</td><td class="num">' + brl(margem) + '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="pequeno texto-suave">Percentuais de custo meramente ilustrativos para a demonstração — o DRE real usa notas fiscais de compra.</p></div>' +

      '<div class="card acoes-relatorio"><h3>Exportar</h3><div class="acoes-linha">' +
      '<button type="button" class="btn" id="btn-csv">Exportar CSV da conciliação</button>' +
      '<button type="button" class="btn btn-contorno" id="btn-imprimir">Imprimir / PDF</button>' +
      '<span class="pequeno texto-suave">O CSV usa separador “;” e decimais com vírgula (padrão brasileiro do Excel).</span>' +
      '</div></div>';

    byId('btn-csv').addEventListener('click', exportarCSV);
    byId('btn-imprimir').addEventListener('click', () => window.print());
  }

  function exportarCSV() {
    const numCSV = (v) => v === null ? '' : v.toFixed(2).replace('.', ',');
    const campoCSV = (v) => {
      const s = String(v);
      return s.indexOf(';') !== -1 || s.indexOf('"') !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rotuloStatus = { conciliado: 'Conciliado', manual: 'Conciliado (manual)', resolvida: 'Divergência resolvida', pendente: 'Pendente', divergencia: 'Divergência' };

    const linhas = [
      ['Lote', 'Data venda', 'Unidade', 'Turno', 'Forma de pagamento', 'Adquirente',
        'Valor bruto (R$)', 'Taxa contratada (%)', 'Taxa cobrada (%)',
        'Líquido esperado (R$)', 'Líquido recebido (R$)', 'Data liquidação', 'Status', 'Divergência'].join(';')
    ];
    const lotesExportar = lotesFiltrados().sort((a, b) =>
      (a.data + a.unidadeId + a.turno + a.forma).localeCompare(b.data + b.unidadeId + b.turno + b.forma));
    lotesExportar.forEach((l) => {
      linhas.push([
        l.id, fmtData(l.data), campoCSV(nomeUnidade(l.unidadeId)), l.turno,
        campoCSV(l.formaLabel), campoCSV(l.adquirente),
        numCSV(l.bruto), numCSV(l.taxaContratadaPct), numCSV(l.taxaCobradaPct),
        numCSV(l.liquidoEsperado), numCSV(l.liquidoRecebido), fmtData(l.dataLiquidacao),
        rotuloStatus[statusEfetivo(l)],
        campoCSV(l.divergencia ? l.divergencia.titulo : '')
      ].join(';'));
    });

    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'conciliacao_redeipe_' + estado.unidade + '_' + estado.periodo + 'dias.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('CSV exportado com ' + (linhas.length - 1) + ' lotes.');
  }

  /* ================= Aba 7 · Manual de Padronização ================= */
  const ETAPAS_MANUAL = [
    {
      titulo: 'Fechamento de caixa por turno',
      desc: 'Ao fim de cada turno, o frentista confere dinheiro, comprovantes de cartão e PIX, registra sangrias e assina o fechamento.',
      itens: ['Conferir dinheiro, comprovantes de cartão e PIX do turno', 'Registrar sangrias e fundo de troco', 'Colher assinatura do frentista no fechamento']
    },
    {
      titulo: 'Conferência de encerrantes / LMC',
      desc: 'Lançar encerrantes inicial e final por bico e conferir o volume vendido com o LMC, observando o limite de 0,6% da Resolução ANP nº 884/2022.',
      itens: ['Lançar encerrantes inicial e final por bico', 'Comparar volume vendido com o LMC do dia', 'Investigar variações de estoque acima de 0,6%']
    },
    {
      titulo: 'Importação das vendas e extratos',
      desc: 'Reunir as vendas do PDV, os arquivos das adquirentes e o extrato bancário do dia para alimentar a conciliação.',
      itens: ['Exportar vendas do PDV por unidade e turno', 'Baixar arquivos de Cielo, Stone, Rede e cartões-frota', 'Baixar o extrato bancário do dia']
    },
    {
      titulo: 'Matching automático',
      desc: 'Cruzar automaticamente venda × recebível × extrato e medir o percentual conciliado do dia.',
      itens: ['Executar a conciliação automática', 'Conferir o percentual conciliado do dia', 'Separar lotes pendentes e divergentes']
    },
    {
      titulo: 'Tratamento de divergências',
      desc: 'Classificar cada divergência (taxa, venda não localizada, chargeback, duplicidade, tarifa indevida) e abrir contestação quando cabível.',
      itens: ['Classificar o tipo de divergência', 'Abrir contestação junto à adquirente quando cabível', 'Registrar a tratativa e o prazo de resposta']
    },
    {
      titulo: 'Relatório e arquivamento',
      desc: 'Emitir o relatório diário, exportar o CSV do período e arquivar os comprovantes digitalizados.',
      itens: ['Emitir relatório diário e DRE do período', 'Exportar CSV e arquivar comprovantes', 'Comunicar pendências à gestão']
    }
  ];

  function renderManual(sec) {
    const totalItens = ETAPAS_MANUAL.reduce((s, e) => s + e.itens.length, 0);
    const feitos = Object.keys(persist.manualChecks).filter((k) => persist.manualChecks[k]).length;
    const pctFeito = Math.round(100 * feitos / totalItens);

    sec.innerHTML =
      '<h2 class="titulo-aba">Manual de Padronização — rotina diária de conciliação</h2>' +
      '<div class="nota"><strong>Nota:</strong> esta seção serve de roteiro para os vídeos de treinamento da padronização.</div>' +
      '<div class="progresso-caixa">' +
      '<div class="progresso-rotulo"><span>Checklist da rotina: ' + pctFeito + '% concluído</span><span class="texto-suave">' + feitos + ' de ' + totalItens + ' itens</span></div>' +
      '<div class="progresso-trilho"><div class="progresso-preenchido" style="width:' + pctFeito + '%"></div></div></div>' +
      '<div class="manual-etapas">' +
      ETAPAS_MANUAL.map((e, ei) =>
        '<div class="card etapa"><div class="etapa-numero">' + (ei + 1) + '</div>' +
        '<h3>' + esc(e.titulo) + '</h3>' +
        '<p class="etapa-desc">' + esc(e.desc) + '</p>' +
        '<label class="etapa-resp"><span><strong>Responsável:</strong></span>' +
        '<input type="text" name="responsavel-etapa-' + (ei + 1) + '" data-resp="' + ei + '" placeholder="Defina o responsável por esta etapa" value="' + esc(persist.manualResp[ei] || '') + '"></label>' +
        '<ul class="checklist">' +
        e.itens.map((item, ii) => {
          const chave = 'e' + ei + 'i' + ii;
          return '<li><label><input type="checkbox" name="item-' + chave + '" data-check="' + chave + '"' + (persist.manualChecks[chave] ? ' checked' : '') + '><span>' + esc(item) + '</span></label></li>';
        }).join('') +
        '</ul></div>').join('') +
      '</div>';

    sec.querySelectorAll('[data-check]').forEach((ch) => {
      ch.addEventListener('change', () => {
        persist.manualChecks[ch.getAttribute('data-check')] = ch.checked;
        salvarPersistencia();
        atualizarProgressoManual(sec);
      });
    });
    sec.querySelectorAll('[data-resp]').forEach((inp) => {
      inp.addEventListener('input', () => {
        persist.manualResp[inp.getAttribute('data-resp')] = inp.value;
        salvarPersistencia();
      });
    });
  }

  function atualizarProgressoManual(sec) {
    const totalItens = ETAPAS_MANUAL.reduce((s, e) => s + e.itens.length, 0);
    const feitos = Object.keys(persist.manualChecks).filter((k) => persist.manualChecks[k]).length;
    const pctFeito = Math.round(100 * feitos / totalItens);
    const rotulo = sec.querySelector('.progresso-rotulo');
    const barra = sec.querySelector('.progresso-preenchido');
    if (rotulo) rotulo.innerHTML = '<span>Checklist da rotina: ' + pctFeito + '% concluído</span><span class="texto-suave">' + feitos + ' de ' + totalItens + ' itens</span>';
    if (barra) barra.style.width = pctFeito + '%';
  }

  /* ================= Navegação por abas e filtros globais ================= */
  const RENDER_POR_TAB = {
    dashboard: renderDashboard,
    conciliacao: renderConciliacao,
    fechamento: renderFechamento,
    recebiveis: renderRecebiveis,
    taxas: renderTaxas,
    relatorios: renderRelatorios,
    manual: renderManual
  };

  function renderTabAtiva() {
    const sec = byId('tab-' + estado.tab);
    RENDER_POR_TAB[estado.tab](sec);
  }

  function ativarTab(tab) {
    estado.tab = tab;
    document.querySelectorAll('.aba').forEach((b) => {
      const ativa = b.getAttribute('data-tab') === tab;
      b.setAttribute('aria-selected', String(ativa));
    });
    document.querySelectorAll('.painel-aba').forEach((sec) => {
      sec.hidden = sec.id !== 'tab-' + tab;
    });
    renderTabAtiva();
  }

  function fecharBoasVindas() {
    byId('bv-fundo').hidden = true;
    document.body.style.overflow = '';
    persist.boasVindasVista = true;
    salvarPersistencia();
  }

  function iniciar() {
    // Filtro de unidade
    const sel = byId('filtro-unidade');
    sel.innerHTML = '<option value="all">Todas as unidades</option>' +
      DB.unidades.map((u) => '<option value="' + u.id + '">' + esc(u.nome) + '</option>').join('');
    sel.addEventListener('change', () => {
      estado.unidade = sel.value;
      estado.conc.pagina = 1;
      estado.conc.dia = '';
      renderTabAtiva();
    });

    // Filtro de período
    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.classList.contains('ativo')));
      b.addEventListener('click', () => {
        estado.periodo = parseInt(b.getAttribute('data-periodo'), 10);
        estado.conc.pagina = 1;
        estado.conc.dia = '';
        document.querySelectorAll('.seg-btn').forEach((x) => {
          x.classList.toggle('ativo', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        renderTabAtiva();
      });
    });

    // Abas
    document.querySelectorAll('.aba').forEach((b) => {
      b.addEventListener('click', () => ativarTab(b.getAttribute('data-tab')));
    });

    // Modal
    byId('modal-fechar').addEventListener('click', fecharModal);
    byId('modal-fundo').addEventListener('click', (ev) => {
      if (ev.target === byId('modal-fundo')) fecharModal();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !byId('modal-fundo').hidden) fecharModal();
      if (ev.key === 'Escape' && !byId('bv-fundo').hidden) fecharBoasVindas();
    });

    // Boas-vindas na primeira visita
    byId('bv-fechar').addEventListener('click', fecharBoasVindas);
    byId('bv-fundo').addEventListener('click', (ev) => {
      if (ev.target === byId('bv-fundo')) fecharBoasVindas();
    });
    if (!persist.boasVindasVista) {
      byId('bv-fundo').hidden = false;
      document.body.style.overflow = 'hidden';
      byId('bv-fechar').focus();
    }

    // Rodapé
    byId('rodape-unidades').innerHTML = DB.unidades.map((u) =>
      '<li><strong>' + esc(u.nome) + '</strong> — ' + esc(u.endereco) + '</li>').join('');
    byId('btn-reiniciar').addEventListener('click', () => {
      try { localStorage.removeItem(CHAVE_LS); } catch (e) { /* segue */ }
      location.reload();
    });

    ativarTab('dashboard');
  }

  iniciar();
})();
