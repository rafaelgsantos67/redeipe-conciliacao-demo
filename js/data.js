/* ============================================================
   Rede Ipê · Conciliação Bancária — DEMO
   js/data.js — Dados simulados 100% fictícios e determinísticos
   Gerados com PRNG seedado (mulberry32, seed 20260723): os
   números são idênticos em qualquer recarregamento.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- PRNG seedado (mulberry32) ---------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260723);
  const entre = (min, max) => min + rng() * (max - min);
  const escolha = (arr) => arr[Math.floor(rng() * arr.length)];
  function escolhaPeso(itens) { // itens: [{v, p}]
    const total = itens.reduce((s, i) => s + i.p, 0);
    let x = rng() * total;
    for (const i of itens) { x -= i.p; if (x <= 0) return i.v; }
    return itens[itens.length - 1].v;
  }
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- Calendário: 30 dias encerrando em 22/07/2026 ---------- */
  const HOJE = '2026-07-22';
  function isoMais(iso, dias) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }
  const DIAS = [];
  for (let i = 29; i >= 0; i--) DIAS.push(isoMais(HOJE, -i));
  const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
  // dom seg ter qua qui sex sáb
  const FATOR_DOW = [0.70, 0.95, 1.00, 1.00, 1.05, 1.20, 1.10];

  /* ---------- Cadastros ---------- */
  const UNIDADES = [
    { id: 'centro',       nome: 'Centro',        endereco: 'Rua Vinte e Seis de Agosto, 499', litrosBase: 7800, convBase: 90 },
    { id: 'bandeirantes', nome: 'Bandeirantes',  endereco: 'Av. Bandeirantes, 2390',          litrosBase: 7000, convBase: 75 },
    { id: 'lagoa',        nome: 'Lagoa Dourada', endereco: 'Av. Três Barras, 3384',           litrosBase: 6600, convBase: 65 },
    { id: 'aimore',       nome: 'Vila Aimoré',   endereco: 'Av. Guaicurus, 8138',             litrosBase: 6200, convBase: 55 }
  ];

  const PRODUTOS = [
    { id: 'GC',   nome: 'Gasolina Comum',    preco: 6.294, share: 0.46 },
    { id: 'GA',   nome: 'Gasolina Aditivada', preco: 6.55,  share: 0.12 },
    { id: 'ET',   nome: 'Etanol',            preco: 3.852, share: 0.22 },
    { id: 'S10',  nome: 'Diesel S10',        preco: 6.842, share: 0.20 },
    { id: 'CONV', nome: 'Conveniência',      preco: null,  share: 0 }
  ];

  const TURNOS = [
    { n: 1, label: '06h–14h', share: 0.38, convShare: 0.35 },
    { n: 2, label: '14h–22h', share: 0.42, convShare: 0.45 },
    { n: 3, label: '22h–06h', share: 0.20, convShare: 0.20 }
  ];

  // Taxas CONTRATADAS (ilustrativas) + mix aproximado de pagamento
  const FORMAS = [
    { id: 'dinheiro',     label: 'Dinheiro',          taxaPct: 0,    dias: 0,  mix: 0.12 },
    { id: 'pix',          label: 'PIX',               taxaPct: 1.10, dias: 0,  mix: 0.30 },
    { id: 'debito',       label: 'Débito',            taxaPct: 1.69, dias: 1,  mix: 0.22 },
    { id: 'credito',      label: 'Crédito à vista',   taxaPct: 2.99, dias: 30, mix: 0.20 },
    { id: 'credito_parc', label: 'Crédito parcelado', taxaPct: 3.49, dias: 30, mix: 0.06 },
    { id: 'frota',        label: 'Cartão-frota',      taxaPct: 4.00, dias: 35, mix: 0.10 }
  ];

  const ADQ_CARTAO = [
    { v: 'Cielo', p: 0.40 }, { v: 'Stone', p: 0.35 }, { v: 'Rede', p: 0.25 }
  ];
  const ADQ_FROTA = [
    { v: 'Taurus Card', p: 0.55 }, { v: 'Ticket Log', p: 0.45 }
  ];

  const FRENTISTAS = {
    centro:       ['Carlos Nogueira', 'Vanessa Prado', 'Ednaldo Ferreira'],
    bandeirantes: ['Juliana Arruda', 'Marcos Vilela', 'Rosana Queiroz'],
    lagoa:        ['Tiago Bittencourt', 'Patrícia Fontes', 'André Sales'],
    aimore:       ['Renata Cunha', 'Felipe Dourado', 'Sônia Almeida']
  };
  const FOLGUISTAS = {
    centro: 'Wesley Martins', bandeirantes: 'Débora Lima',
    lagoa: 'Otávio Ramos', aimore: 'Cláudia Peixoto'
  };

  // Bombas (bicos) por unidade — mesmo arranjo, encerrantes próprios
  const LAYOUT_BOMBAS = [
    { bomba: 'B01', produto: 'GC' }, { bomba: 'B02', produto: 'GC' },
    { bomba: 'B03', produto: 'GA' }, { bomba: 'B04', produto: 'ET' },
    { bomba: 'B05', produto: 'ET' }, { bomba: 'B06', produto: 'S10' }
  ];
  // Encerrantes iniciais (litros acumulados no totalizador de cada bico)
  const encerrantes = {};
  UNIDADES.forEach((u) => {
    encerrantes[u.id] = {};
    LAYOUT_BOMBAS.forEach((b) => {
      encerrantes[u.id][b.bomba] = Math.floor(entre(120000, 920000));
    });
  });

  /* ---------- Geração de vendas, fechamentos e lotes ---------- */
  const vendas = [];        // por dia × unidade × turno × produto
  const fechamentos = [];   // por dia × unidade × turno (pista)
  const lotes = [];         // por dia × unidade × turno × forma (venda × recebível)

  const TIPOS_DIV = [
    { v: 'taxa_maior', p: 0.30 }, { v: 'nao_localizada', p: 0.20 },
    { v: 'chargeback', p: 0.15 }, { v: 'duplicidade', p: 0.15 },
    { v: 'aluguel_pos', p: 0.20 }
  ];

  function normaliza(pesos) {
    const s = pesos.reduce((a, b) => a + b, 0);
    return pesos.map((p) => p / s);
  }

  DIAS.forEach((data) => {
    const fatorDia = FATOR_DOW[diaSemana(data)] * entre(0.94, 1.06);

    UNIDADES.forEach((u) => {
      const litrosDia = u.litrosBase * fatorDia;
      const sharesTurno = normaliza(TURNOS.map((t) => t.share * entre(0.92, 1.08)));

      TURNOS.forEach((t, ti) => {
        const litrosTurno = litrosDia * sharesTurno[ti];
        const sharesProd = normaliza(
          PRODUTOS.filter((p) => p.id !== 'CONV').map((p) => p.share * entre(0.85, 1.15))
        );

        /* --- vendas de combustível por produto --- */
        let valorCombustivel = 0;
        const litrosPorProduto = {};
        PRODUTOS.filter((p) => p.id !== 'CONV').forEach((p, pi) => {
          const litros = Math.round(litrosTurno * sharesProd[pi]);
          const valor = r2(litros * p.preco);
          litrosPorProduto[p.id] = litros;
          valorCombustivel = r2(valorCombustivel + valor);
          vendas.push({ data, unidadeId: u.id, turno: t.n, produtoId: p.id, litros, valor });
        });

        /* --- conveniência (ticket médio R$ 18–45) --- */
        const qtdConv = Math.max(5, Math.round(u.convBase * t.convShare * fatorDia * entre(0.85, 1.15)));
        const valorConv = r2(qtdConv * entre(18, 45));
        vendas.push({ data, unidadeId: u.id, turno: t.n, produtoId: 'CONV', litros: null, qtd: qtdConv, valor: valorConv });

        const totalTurno = r2(valorCombustivel + valorConv);

        /* --- fechamento de caixa (pista) --- */
        const ehDomingo = diaSemana(data) === 0;
        const frentista = ehDomingo ? FOLGUISTAS[u.id] : FRENTISTAS[u.id][ti];
        const bombas = [];
        const porProdutoRestante = Object.assign({}, litrosPorProduto);
        const bicosPorProduto = {};
        LAYOUT_BOMBAS.forEach((b) => {
          bicosPorProduto[b.produto] = (bicosPorProduto[b.produto] || 0) + 1;
        });
        const jaAtribuido = {};
        LAYOUT_BOMBAS.forEach((b) => {
          jaAtribuido[b.produto] = (jaAtribuido[b.produto] || 0) + 1;
          const ehUltimoBico = jaAtribuido[b.produto] === bicosPorProduto[b.produto];
          const restante = porProdutoRestante[b.produto];
          const litrosBico = ehUltimoBico ? restante : Math.round(restante * entre(0.42, 0.58));
          porProdutoRestante[b.produto] = restante - litrosBico;
          const encIni = encerrantes[u.id][b.bomba];
          const encFim = encIni + litrosBico;
          encerrantes[u.id][b.bomba] = encFim;
          bombas.push({ bomba: b.bomba, produtoId: b.produto, encIni, encFim, litros: litrosBico });
        });
        const litrosFech = bombas.reduce((s, b) => s + b.litros, 0);
        // Quebra de caixa pequena, positiva ou negativa (falta é mais comum)
        const quebra = r2((rng() < 0.62 ? -1 : 1) * Math.pow(rng(), 1.6) * 55);
        const nSangrias = t.n === 3 ? 1 : (rng() < 0.55 ? 2 : 1);
        const sangrias = [];
        for (let s = 0; s < nSangrias; s++) {
          const horaBase = t.n === 1 ? 8 : t.n === 2 ? 16 : 23;
          const hora = String(horaBase + s * 3).padStart(2, '0') + ':' + escolha(['10', '25', '40', '50']);
          sangrias.push({ hora, valor: Math.round(entre(40, 150)) * 10 });
        }
        fechamentos.push({
          data, unidadeId: u.id, turno: t.n, turnoLabel: t.label, frentista,
          bombas, litros: litrosFech,
          valorEsperado: valorCombustivel,
          valorApurado: r2(valorCombustivel + quebra),
          quebra, sangrias,
          sangriaTotal: sangrias.reduce((s, x) => s + x.valor, 0)
        });

        /* --- lotes por forma de pagamento (venda × recebível) --- */
        const pesosMix = normaliza(FORMAS.map((f) => f.mix * entre(0.85, 1.15)));
        let acumulado = 0;
        FORMAS.forEach((f, fi) => {
          const ehUltima = fi === FORMAS.length - 1;
          const bruto = ehUltima ? r2(totalTurno - acumulado) : r2(totalTurno * pesosMix[fi]);
          acumulado = r2(acumulado + bruto);

          const adquirente =
            f.id === 'dinheiro' ? '—' :
            f.id === 'pix' ? 'Sicredi (PIX)' :
            f.id === 'frota' ? escolhaPeso(ADQ_FROTA) : escolhaPeso(ADQ_CARTAO);

          const dataLiquidacao = isoMais(data, f.dias);
          const liquidada = dataLiquidacao <= HOJE;

          let taxaCobradaPct = f.taxaPct;
          let divergencia = null;

          // ~5% dos lotes eletrônicos recebem divergência plantada.
          // Elegibilidade por forma/situação: taxa errada e lote ausente são
          // visíveis já na agenda da adquirente; chargeback só em crédito;
          // duplicidade e tarifa de POS aparecem no extrato, na liquidação.
          if (f.id !== 'dinheiro' && rng() < 0.05) {
            const elegiveis = TIPOS_DIV.filter((t) => {
              if (t.v === 'chargeback') return f.id === 'credito' || f.id === 'credito_parc';
              if (t.v === 'duplicidade') return liquidada;
              if (t.v === 'aluguel_pos') return liquidada && f.id !== 'pix';
              return true; // taxa_maior e nao_localizada: qualquer lote eletrônico
            });
            const tipo = escolhaPeso(elegiveis);
            if (tipo === 'taxa_maior') {
              taxaCobradaPct = r2(f.taxaPct + entre(0.20, 0.60));
              divergencia = { tipo };
            } else if (tipo === 'chargeback') {
              divergencia = { tipo, valorContestado: r2(entre(180, 520)) };
            } else if (tipo === 'aluguel_pos') {
              divergencia = { tipo, valorDebito: adquirente === 'Stone' ? 89.90 : 79.90 };
            } else {
              divergencia = { tipo }; // nao_localizada ou duplicidade
            }
          }

          const taxaContratadaValor = r2(bruto * f.taxaPct / 100);
          const taxaCobradaValor = divergencia && divergencia.tipo === 'nao_localizada'
            ? 0 : r2(bruto * taxaCobradaPct / 100);
          const liquidoEsperado = r2(bruto - taxaContratadaValor);

          // Valor informado/creditado pela adquirente
          let liquidoInformado = r2(bruto - taxaCobradaValor);
          if (divergencia) {
            if (divergencia.tipo === 'nao_localizada') liquidoInformado = 0;
            if (divergencia.tipo === 'chargeback') {
              divergencia.valorContestado = Math.min(divergencia.valorContestado, liquidoInformado);
              liquidoInformado = r2(liquidoInformado - divergencia.valorContestado);
            }
            if (divergencia.tipo === 'duplicidade') liquidoInformado = r2(liquidoInformado * 2);
            if (divergencia.tipo === 'aluguel_pos') liquidoInformado = r2(liquidoInformado - divergencia.valorDebito);
          }

          const liquidoRecebido = liquidada ? liquidoInformado : null;
          const status = divergencia ? 'divergencia' : (liquidada ? 'conciliado' : 'pendente');

          if (divergencia) {
            divergencia.impacto = r2(liquidoEsperado - liquidoInformado);
            const abs = Math.abs(divergencia.impacto);
            divergencia.severidade = abs >= 400 ? 'alta' : abs >= 150 ? 'média' : 'baixa';
          }

          lotes.push({
            id: 'L-' + u.id.toUpperCase().slice(0, 3) + '-' + data.replace(/-/g, '') + '-T' + t.n + '-' + f.id.toUpperCase(),
            data, unidadeId: u.id, turno: t.n,
            forma: f.id, formaLabel: f.label, adquirente,
            bruto,
            taxaContratadaPct: f.taxaPct, taxaCobradaPct,
            taxaContratadaValor, taxaCobradaValor,
            liquidoEsperado, liquidoInformado, liquidoRecebido,
            dataLiquidacao, dias: f.dias, status, divergencia
          });
        });
      });
    });
  });

  /* ---------- Textos das divergências ---------- */
  const TITULOS_DIV = {
    taxa_maior: 'Taxa cobrada maior que a contratada',
    nao_localizada: 'Venda não localizada na adquirente',
    chargeback: 'Chargeback (contestação do portador)',
    duplicidade: 'Lançamento em duplicidade',
    aluguel_pos: 'Débito de aluguel de POS não previsto'
  };
  function descricaoDiv(l) {
    const d = l.divergencia;
    switch (d.tipo) {
      case 'taxa_maior':
        return 'A adquirente ' + l.adquirente + ' aplicou taxa de ' + l.taxaCobradaPct.toFixed(2).replace('.', ',') +
          '% neste lote de ' + l.formaLabel.toLowerCase() + ', mas a taxa contratada é ' +
          l.taxaContratadaPct.toFixed(2).replace('.', ',') + '%. Recomenda-se abrir contestação junto à adquirente para estorno da diferença.';
      case 'nao_localizada':
        return 'A venda foi registrada no PDV, porém o lote não foi localizado nos arquivos da adquirente ' + l.adquirente +
          '. Verificar se o terminal transmitiu a captura; se necessário, solicitar reprocessamento à adquirente.';
      case 'chargeback':
        return 'O portador do cartão contestou uma transação deste lote (chargeback). A adquirente ' + l.adquirente +
          ' reteve o valor contestado na liquidação. Reunir comprovante da venda e apresentar defesa dentro do prazo.';
      case 'duplicidade':
        return 'O lote foi creditado em duplicidade pela adquirente ' + l.adquirente +
          '. O valor excedente deverá ser devolvido — registrar a ocorrência e aguardar débito de ajuste no extrato.';
      case 'aluguel_pos':
        return 'A adquirente ' + l.adquirente + ' descontou aluguel de terminal POS diretamente da liquidação deste lote, ' +
          'débito não previsto em contrato. Solicitar detalhamento da cobrança e eventual estorno.';
      default:
        return '';
    }
  }
  lotes.forEach((l) => {
    if (l.divergencia) {
      l.divergencia.titulo = TITULOS_DIV[l.divergencia.tipo];
      l.divergencia.descricao = descricaoDiv(l);
    }
  });

  /* ---------- Recebíveis (agenda futura) ---------- */
  const recebiveis = lotes
    .filter((l) => l.dataLiquidacao > HOJE)
    .map((l) => ({
      data: l.dataLiquidacao, unidadeId: l.unidadeId, adquirente: l.adquirente,
      forma: l.forma, formaLabel: l.formaLabel, valor: l.liquidoInformado, loteId: l.id, dataVenda: l.data
    }))
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

  /* ---------- Extrato bancário simulado ---------- */
  const extrato = [];
  lotes.forEach((l) => {
    if (l.liquidoRecebido === null) return;
    if (l.forma === 'dinheiro') {
      extrato.push({ data: l.dataLiquidacao, tipo: 'credito', valor: l.liquidoRecebido, descricao: 'Depósito em espécie — ' + l.id });
    } else if (l.liquidoRecebido > 0) {
      extrato.push({ data: l.dataLiquidacao, tipo: 'credito', valor: l.liquidoRecebido, descricao: 'Liquidação ' + l.formaLabel + ' ' + l.adquirente + ' — ' + l.id });
    }
    if (l.divergencia && l.divergencia.tipo === 'aluguel_pos') {
      extrato.push({ data: l.dataLiquidacao, tipo: 'debito', valor: l.divergencia.valorDebito, descricao: 'Tarifa aluguel POS ' + l.adquirente + ' — ref. ' + l.id });
    }
  });
  extrato.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

  /* ---------- Alertas (divergências ordenadas por impacto) ---------- */
  const alertas = lotes
    .filter((l) => l.divergencia)
    .map((l) => ({
      loteId: l.id, data: l.data, unidadeId: l.unidadeId,
      tipo: l.divergencia.tipo, titulo: l.divergencia.titulo,
      severidade: l.divergencia.severidade,
      impacto: l.divergencia.impacto,
      formaLabel: l.formaLabel, adquirente: l.adquirente
    }))
    .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto));

  /* ---------- Exposição global ---------- */
  window.DB = {
    hoje: HOJE,
    dias: DIAS,
    unidades: UNIDADES,
    produtos: PRODUTOS,
    turnos: TURNOS,
    taxas: FORMAS,
    vendas, fechamentos, lotes, recebiveis, extrato, alertas
  };
})();
