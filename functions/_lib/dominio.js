import { erro } from './util.js';

export const ATIVOS = `('agendado','concluido')`;

export async function resolverServicos(db, ids, { inativos = false } = {}) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))];
  if (lista.length === 0 || lista.length > 10) throw erro(400, 'servico_invalido', 'Escolha pelo menos um serviço.');
  const marcas = lista.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await db.prepare(
    `SELECT id, nome, preco_centavos, duracao_min FROM servicos WHERE id IN (${marcas})${inativos ? '' : ' AND ativo = 1'} ORDER BY ordem, id`
  ).bind(...lista).all();
  if (results.length !== lista.length) throw erro(400, 'servico_invalido', 'Um dos serviços não está mais disponível.');
  return {
    servicos: results,
    duracao: results.reduce((s, x) => s + x.duracao_min, 0),
    preco: results.reduce((s, x) => s + x.preco_centavos, 0),
  };
}

export async function dadosDoPeriodo(db, de, ate, { ignorarId = null } = {}) {
  const [exp, blq, ag] = await Promise.all([
    db.prepare('SELECT * FROM expediente').all(),
    db.prepare('SELECT data, inicio_min, fim_min FROM bloqueios WHERE data BETWEEN ?1 AND ?2').bind(de, ate).all(),
    db.prepare(
      `SELECT id, data, inicio_min, duracao_min, local FROM agendamentos WHERE data BETWEEN ?1 AND ?2 AND status IN ${ATIVOS}`
    ).bind(de, ate).all(),
  ]);
  const porDia = (rows) => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r.data)) m.set(r.data, []); m.get(r.data).push(r); }
    return m;
  };
  return {
    expediente: new Map(exp.results.map((r) => [r.dia, r])),
    bloqueios: porDia(blq.results),
    agendamentos: porDia(ignorarId ? ag.results.filter((a) => a.id !== ignorarId) : ag.results),
  };
}

// Trecho SQL que testa conflito de horário (com intervalo de respiro/deslocamento).
// Parâmetros esperados: ?{d}=data ?{i}=início ?{u}=duração ?{l}=local ?{dl}=deslocamento ?{rs}=respiro
export function sqlSemConflito({ d, i, u, l, dl, rs, ignorar = null }) {
  const g = `(CASE WHEN ?${l}='domicilio' OR e.local='domicilio' THEN ?${dl} ELSE ?${rs} END)`;
  return `NOT EXISTS (
    SELECT 1 FROM agendamentos e
    WHERE e.data = ?${d} AND e.status IN ${ATIVOS}${ignorar ? ` AND e.id != ?${ignorar}` : ''}
      AND NOT (?${i} + ?${u} + ${g} <= e.inicio_min OR e.inicio_min + e.duracao_min + ${g} <= ?${i})
  )`;
}

export async function anexarServicos(db, linhas, de, ate) {
  if (linhas.length === 0) return linhas;
  const { results } = await db.prepare(
    `SELECT s.agendamento_id, s.servico_id, s.nome, s.preco_centavos, s.duracao_min
     FROM agendamento_servicos s JOIN agendamentos a ON a.id = s.agendamento_id
     WHERE a.data BETWEEN ?1 AND ?2 ORDER BY s.id`
  ).bind(de, ate).all();
  const m = new Map();
  for (const s of results) { if (!m.has(s.agendamento_id)) m.set(s.agendamento_id, []); m.get(s.agendamento_id).push(s); }
  return linhas.map((l) => ({ ...l, servicos: m.get(l.id) || [] }));
}

export async function upsertCliente(db, { nome, whatsapp, endereco, aniversario_dia, aniversario_mes }) {
  const row = await db.prepare(
    `INSERT INTO clientes (nome, whatsapp, ultimo_endereco, aniversario_dia, aniversario_mes, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(whatsapp) DO UPDATE SET
       ultimo_endereco = COALESCE(excluded.ultimo_endereco, clientes.ultimo_endereco),
       aniversario_dia = COALESCE(excluded.aniversario_dia, clientes.aniversario_dia),
       aniversario_mes = COALESCE(excluded.aniversario_mes, clientes.aniversario_mes)
     RETURNING id`
  ).bind(nome, whatsapp, endereco || null, aniversario_dia || null, aniversario_mes || null, Date.now()).first();
  return row.id;
}

export function validarLocal(local, cfg) {
  if (local !== 'espaco' && local !== 'domicilio') throw erro(400, 'local_invalido', 'Escolha onde será o atendimento.');
  if (local === 'espaco' && !cfg.atende_espaco) throw erro(400, 'local_invalido', 'Atendimento no espaço indisponível.');
  if (local === 'domicilio' && !cfg.atende_domicilio) throw erro(400, 'local_invalido', 'Atendimento a domicílio indisponível.');
  return local;
}

// Cria o agendamento de forma atômica: só insere se não houver conflito.
// Retorna o token ou null quando o horário já foi ocupado.
export async function criarAgendamento(db, cfg, a) {
  const sinalStatus = a.sinal_status || 'nenhum';
  const sinalPorcentagem = a.sinal_porcentagem || 0;
  const sinalValorCentavos = a.sinal_valor_centavos || 0;
  const sinalPago = a.sinal_pago ? 1 : 0;
  const sinalPagoEm = a.sinal_pago_em || null;

  const stmtInsert = a.forcar
    ? db.prepare(
        `INSERT INTO agendamentos
           (cliente_id, data, inicio_min, duracao_min, local, endereco, referencia, preco_tabela_centavos, token, origem, observacoes, criado_em, sinal_status, sinal_porcentagem, sinal_valor_centavos, sinal_pago, sinal_pago_em)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
      ).bind(
        a.cliente_id, a.data, a.inicio_min, a.duracao_min, a.local, a.endereco || null, a.referencia || null,
        a.preco, a.token, a.origem, a.observacoes || null, Date.now(),
        sinalStatus, sinalPorcentagem, sinalValorCentavos, sinalPago, sinalPagoEm
      )
    : db.prepare(
        `INSERT INTO agendamentos
           (cliente_id, data, inicio_min, duracao_min, local, endereco, referencia, preco_tabela_centavos, token, origem, observacoes, criado_em, sinal_status, sinal_porcentagem, sinal_valor_centavos, sinal_pago, sinal_pago_em)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17
         WHERE ${sqlSemConflito({ d: 2, i: 3, u: 4, l: 5, dl: 18, rs: 19 })}`
      ).bind(
        a.cliente_id, a.data, a.inicio_min, a.duracao_min, a.local, a.endereco || null, a.referencia || null,
        a.preco, a.token, a.origem, a.observacoes || null, Date.now(),
        sinalStatus, sinalPorcentagem, sinalValorCentavos, sinalPago, sinalPagoEm,
        cfg.deslocamento_min, cfg.respiro_min
      );

  const stmts = [
    stmtInsert,
    ...a.servicos.map((s) => db.prepare(
      `INSERT INTO agendamento_servicos (agendamento_id, servico_id, nome, preco_centavos, duracao_min)
       SELECT id, ?2, ?3, ?4, ?5 FROM agendamentos WHERE token = ?1`
    ).bind(a.token, s.id, s.nome, s.preco_centavos, s.duracao_min)),
  ];
  const res = await db.batch(stmts);
  return res[0].meta.changes > 0 ? a.token : null;
}

export async function resumoMes(db, mes) {
  const de = `${mes}-01`, ate = `${mes}-31`;
  const [tot, desp, porServico, porForma] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS atendimentos,
              COALESCE(SUM(COALESCE(valor_cobrado_centavos, preco_tabela_centavos)), 0) AS faturado,
              COALESCE(SUM(CASE WHEN COALESCE(valor_cobrado_centavos, preco_tabela_centavos) < preco_tabela_centavos THEN (preco_tabela_centavos - COALESCE(valor_cobrado_centavos, preco_tabela_centavos)) ELSE 0 END), 0) AS descontos,
              COALESCE(SUM(CASE WHEN COALESCE(valor_cobrado_centavos, preco_tabela_centavos) > preco_tabela_centavos THEN (COALESCE(valor_cobrado_centavos, preco_tabela_centavos) - preco_tabela_centavos) ELSE 0 END), 0) AS acrescimos,
              COALESCE(SUM(CASE WHEN pago = 1 THEN COALESCE(valor_cobrado_centavos, preco_tabela_centavos) ELSE 0 END), 0) AS recebido
       FROM agendamentos WHERE status = 'concluido' AND data BETWEEN ?1 AND ?2`).bind(de, ate).first(),
    db.prepare('SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM despesas WHERE data BETWEEN ?1 AND ?2').bind(de, ate).first(),
    db.prepare(
      `SELECT s.nome, COUNT(*) AS qtd, SUM(s.preco_centavos) AS total
       FROM agendamento_servicos s JOIN agendamentos a ON a.id = s.agendamento_id
       WHERE a.status = 'concluido' AND a.data BETWEEN ?1 AND ?2 GROUP BY s.nome ORDER BY total DESC`).bind(de, ate).all(),
    db.prepare(
      `SELECT COALESCE(forma_pagamento, 'outro') AS forma,
              pago,
              COUNT(*) AS qtd,
              COALESCE(SUM(COALESCE(valor_cobrado_centavos, preco_tabela_centavos)), 0) AS total_centavos
       FROM agendamentos
       WHERE status = 'concluido' AND data BETWEEN ?1 AND ?2
       GROUP BY forma, pago`).bind(de, ate).all(),
  ]);

  const formas = {
    pix: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    dinheiro: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    cartao: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    outro: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
  };

  for (const row of porForma.results) {
    const f = formas[row.forma] || formas.outro;
    if (row.pago === 1) {
      f.recebido_centavos += row.total_centavos || 0;
      f.qtd_recebido += row.qtd || 0;
    } else {
      f.a_receber_centavos += row.total_centavos || 0;
      f.qtd_a_receber += row.qtd || 0;
    }
  }

  return {
    mes,
    atendimentos: tot.atendimentos,
    faturado_centavos: tot.faturado,
    descontos_centavos: tot.descontos,
    acrescimos_centavos: tot.acrescimos,
    recebido_centavos: tot.recebido,
    a_receber_centavos: tot.faturado - tot.recebido,
    despesas_centavos: desp.total,
    lucro_centavos: tot.faturado - desp.total,
    por_servico: porServico.results,
    por_forma: formas,
  };
}
