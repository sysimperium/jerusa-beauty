import { rota } from './router.js';
import {
  erro, json, inteiro, texto, normalizarWhatsapp, carregarConfig, CHAVES_CONFIG, CHAVES_NUM, CHAVES_BOOL,
} from './util.js';
import {
  aleatorioHex, adminExiste, definirSenha, senhaConfere, validarSenhaNova, criarSessao, cookieSessao, cookieLimpo,
  sessaoValida, encerrarSessao, encerrarTodasSessoes, checarTentativas, registrarFalha, limparFalhas,
} from './auth.js';
import { agoraLocal, addDias, dataValida } from './time.js';
import {
  resolverServicos, validarLocal, upsertCliente, criarAgendamento, anexarServicos, sqlSemConflito, resumoMes,
} from './dominio.js';
import {
  obterStatusZap, conectarZap, desconectarZap, enviarMensagemZap, notificarAgendamentoZap, processarLembretes, processarFidelizacao,
  extrairDiaMesAniversario, processarAniversarios, garantirColunasLembretes,
} from './whatsapp.js';

const ip = (request) => request.headers.get('cf-connecting-ip') || 'local';
const mesValido = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

// ---------- sessão ----------
rota('GET', '/admin/estado', async ({ db, request }) => json({
  configurado: await adminExiste(db),
  logado: await sessaoValida(db, request),
}));

rota('POST', '/admin/configurar-senha', async ({ db, env, corpo }) => {
  if (await adminExiste(db)) throw erro(409, 'ja_configurado', 'A senha já foi criada.');
  if (env.CODIGO_INSTALACAO && corpo.codigo !== env.CODIGO_INSTALACAO) {
    throw erro(403, 'codigo_invalido', 'Código de instalação incorreto.');
  }
  validarSenhaNova(corpo.senha);
  await definirSenha(db, corpo.senha);
  const token = await criarSessao(db);
  return json({ ok: true }, 200, { 'set-cookie': cookieSessao(token) });
});

rota('POST', '/admin/login', async ({ db, request, corpo }) => {
  const endereco = ip(request);
  await checarTentativas(db, endereco);
  if (typeof corpo.senha !== 'string' || !(await senhaConfere(db, corpo.senha))) {
    await registrarFalha(db, endereco);
    throw erro(401, 'senha_incorreta', 'Senha incorreta.');
  }
  await limparFalhas(db, endereco);
  const token = await criarSessao(db);
  return json({ ok: true }, 200, { 'set-cookie': cookieSessao(token) });
});

rota('POST', '/admin/logout', async ({ db, request }) => {
  await encerrarSessao(db, request);
  return json({ ok: true }, 200, { 'set-cookie': cookieLimpo() });
});

rota('POST', '/admin/senha', async ({ db, corpo }) => {
  if (!(await senhaConfere(db, String(corpo.atual ?? '')))) throw erro(401, 'senha_incorreta', 'Senha atual incorreta.');
  validarSenhaNova(corpo.nova);
  await definirSenha(db, corpo.nova);
  await encerrarTodasSessoes(db);
  const token = await criarSessao(db);
  return json({ ok: true }, 200, { 'set-cookie': cookieSessao(token) });
}, { admin: true });

// ---------- configurações ----------
rota('GET', '/admin/config', async ({ db }) => {
  const cfg = await carregarConfig(db);
  const [exp, blq] = await Promise.all([
    db.prepare('SELECT * FROM expediente ORDER BY dia').all(),
    db.prepare('SELECT id, data, inicio_min, fim_min, motivo FROM bloqueios WHERE data >= ?1 ORDER BY data, inicio_min')
      .bind(agoraLocal().data).all(),
  ]);
  return json({ config: cfg, expediente: exp.results, bloqueios: blq.results });
}, { admin: true });

const LIMITES = {
  respiro_min: [0, 120], deslocamento_min: [0, 180], antecedencia_min: [0, 10080],
  janela_dias: [1, 365], passo_min: [5, 120], cancelar_horas: [0, 240],
  alerta_sumidos_dias: [3, 365],
};

rota('PUT', '/admin/config', async ({ db, corpo }) => {
  const atual = await carregarConfig(db);
  const novo = { ...atual };
  for (const k of CHAVES_CONFIG) {
    if (!(k in corpo)) continue;
    const v = corpo[k];
    if (CHAVES_NUM.includes(k)) novo[k] = inteiro(v, ...LIMITES[k], k.replace(/_/g, ' '));
    else if (CHAVES_BOOL.includes(k)) novo[k] = !!v;
    else if (k === 'whatsapp') novo[k] = v ? normalizarWhatsapp(v) : '';
    else if (k === 'pix_tipo') {
      if (!['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'].includes(v)) throw erro(400, 'dado_invalido', 'Tipo de chave Pix inválido.');
      novo[k] = v;
    } else {
      const max = { nome_negocio: 80, endereco_espaco: 200, pix_chave: 80, pix_nome: 25, pix_cidade: 15 }[k];
      novo[k] = texto(v, max, k.replace(/_/g, ' '));
    }
  }
  if (!novo.atende_espaco && !novo.atende_domicilio) {
    throw erro(400, 'dado_invalido', 'Ative pelo menos um tipo de atendimento (espaço ou domicílio).');
  }
  if (!novo.nome_negocio) throw erro(400, 'dado_invalido', 'Informe o nome do negócio.');
  const stmt = db.prepare(
    'INSERT INTO config (chave, valor) VALUES (?1, ?2) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  await db.batch(CHAVES_CONFIG.map((k) => {
    const v = novo[k];
    return stmt.bind(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? ''));
  }));
  return json({ config: novo });
}, { admin: true });

rota('PUT', '/admin/expediente', async ({ db, corpo }) => {
  const linhas = Array.isArray(corpo.dias) ? corpo.dias : [];
  if (linhas.length !== 7) throw erro(400, 'dado_invalido', 'Envie os 7 dias da semana.');
  const stmt = db.prepare(
    `INSERT INTO expediente (dia, ativo, inicio_min, fim_min, pausa_inicio_min, pausa_fim_min) VALUES (?1,?2,?3,?4,?5,?6)
     ON CONFLICT(dia) DO UPDATE SET ativo=excluded.ativo, inicio_min=excluded.inicio_min, fim_min=excluded.fim_min,
       pausa_inicio_min=excluded.pausa_inicio_min, pausa_fim_min=excluded.pausa_fim_min`);
  const lote = linhas.map((l) => {
    const dia = inteiro(l.dia, 0, 6, 'Dia');
    const ini = inteiro(l.inicio_min, 0, 1439, 'Início');
    const fim = inteiro(l.fim_min, 1, 1440, 'Fim');
    if (fim <= ini) throw erro(400, 'dado_invalido', 'O fim do expediente precisa ser depois do início.');
    let pi = null, pf = null;
    if (l.pausa_inicio_min != null && l.pausa_fim_min != null) {
      pi = inteiro(l.pausa_inicio_min, 0, 1439, 'Início da pausa');
      pf = inteiro(l.pausa_fim_min, 1, 1440, 'Fim da pausa');
      if (pf <= pi || pi < ini || pf > fim) throw erro(400, 'dado_invalido', 'A pausa precisa estar dentro do expediente.');
    }
    return stmt.bind(dia, l.ativo ? 1 : 0, ini, fim, pi, pf);
  });
  await db.batch(lote);
  return json({ ok: true });
}, { admin: true });

rota('POST', '/admin/bloqueios', async ({ db, corpo }) => {
  if (!dataValida(corpo.data)) throw erro(400, 'dado_invalido', 'Data inválida.');
  const ini = corpo.dia_todo ? 0 : inteiro(corpo.inicio_min, 0, 1439, 'Início');
  const fim = corpo.dia_todo ? 1440 : inteiro(corpo.fim_min, 1, 1440, 'Fim');
  if (fim <= ini) throw erro(400, 'dado_invalido', 'O fim precisa ser depois do início.');
  const motivo = texto(corpo.motivo, 80, 'o motivo');
  const r = await db.prepare('INSERT INTO bloqueios (data, inicio_min, fim_min, motivo) VALUES (?1,?2,?3,?4) RETURNING id')
    .bind(corpo.data, ini, fim, motivo || null).first();
  return json({ id: r.id }, 201);
}, { admin: true });

rota('DELETE', '/admin/bloqueios/:id', async ({ db, params }) => {
  await db.prepare('DELETE FROM bloqueios WHERE id = ?1').bind(inteiro(params.id, 1, 1e12, 'Id')).run();
  return json({ ok: true });
}, { admin: true });

// ---------- serviços ----------
function lerServico(corpo) {
  return {
    nome: texto(corpo.nome, 80, 'o nome do serviço', { obrigatorio: true }),
    descricao: texto(corpo.descricao, 200, 'a descrição'),
    preco: inteiro(corpo.preco_centavos, 0, 10000000, 'Preço'),
    duracao: inteiro(corpo.duracao_min, 5, 720, 'Duração'),
    ativo: corpo.ativo === false || corpo.ativo === 0 ? 0 : 1,
  };
}

rota('GET', '/admin/servicos', async ({ db }) => {
  const { results } = await db.prepare('SELECT * FROM servicos ORDER BY ordem, id').all();
  return json({ servicos: results });
}, { admin: true });

rota('POST', '/admin/servicos', async ({ db, corpo }) => {
  const s = lerServico(corpo);
  const max = await db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM servicos').first();
  const r = await db.prepare(
    'INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ativo, ordem) VALUES (?1,?2,?3,?4,?5,?6) RETURNING id')
    .bind(s.nome, s.descricao || null, s.preco, s.duracao, s.ativo, max.m + 1).first();
  return json({ id: r.id }, 201);
}, { admin: true });

rota('PUT', '/admin/servicos/:id', async ({ db, params, corpo }) => {
  const s = lerServico(corpo);
  await db.prepare('UPDATE servicos SET nome=?2, descricao=?3, preco_centavos=?4, duracao_min=?5, ativo=?6 WHERE id=?1')
    .bind(inteiro(params.id, 1, 1e12, 'Id'), s.nome, s.descricao || null, s.preco, s.duracao, s.ativo).run();
  return json({ ok: true });
}, { admin: true });

rota('POST', '/admin/servicos/:id/mover', async ({ db, params, corpo }) => {
  const id = inteiro(params.id, 1, 1e12, 'Id');
  const dir = corpo.direcao === 'cima' ? -1 : 1;
  const { results } = await db.prepare('SELECT id FROM servicos ORDER BY ordem, id').all();
  const ids = results.map((r) => r.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return json({ ok: true });
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const up = db.prepare('UPDATE servicos SET ordem = ?2 WHERE id = ?1');
  await db.batch(ids.map((x, k) => up.bind(x, k + 1)));
  return json({ ok: true });
}, { admin: true });

rota('DELETE', '/admin/servicos/:id', async ({ db, params }) => {
  await db.prepare('DELETE FROM servicos WHERE id = ?1').bind(inteiro(params.id, 1, 1e12, 'Id')).run();
  return json({ ok: true });
}, { admin: true });

// ---------- agendamentos ----------
const SELECT_AGEND = `SELECT a.id, a.data, a.inicio_min, a.duracao_min, a.local, a.endereco, a.referencia,
  a.preco_tabela_centavos, a.valor_cobrado_centavos, a.status, a.pago, a.forma_pagamento, a.observacoes, a.origem, a.token,
  c.id AS cliente_id, c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp
  FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id`;

async function listar(db, de, ate, extra = '', ...binds) {
  const { results } = await db.prepare(`${SELECT_AGEND} WHERE a.data BETWEEN ?1 AND ?2 ${extra} ORDER BY a.data, a.inicio_min`)
    .bind(de, ate, ...binds).all();
  return anexarServicos(db, results, de, ate);
}

rota('GET', '/admin/agendamentos', async ({ db, url }) => {
  const de = url.searchParams.get('de'), ate = url.searchParams.get('ate') || de;
  if (!dataValida(de) || !dataValida(ate) || ate < de || addDias(de, 92) < ate) {
    throw erro(400, 'dado_invalido', 'Período inválido (máximo de 92 dias).');
  }
  return json({ agendamentos: await listar(db, de, ate) });
}, { admin: true });

rota('POST', '/admin/agendamentos', async ({ db, env, corpo, waitUntil }) => {
  const cfg = await carregarConfig(db);
  const local = validarLocal(corpo.local, cfg);
  if (!dataValida(corpo.data)) throw erro(400, 'dado_invalido', 'Data inválida.');
  const inicio = inteiro(corpo.inicio_min, 0, 1439, 'Horário');
  const { servicos, duracao, preco } = await resolverServicos(db, corpo.servicos, { inativos: true });
  let clienteId;
  if (corpo.cliente_id) {
    const c = await db.prepare('SELECT id FROM clientes WHERE id = ?1').bind(inteiro(corpo.cliente_id, 1, 1e12, 'Cliente')).first();
    if (!c) throw erro(400, 'dado_invalido', 'Cliente não encontrado.');
    clienteId = c.id;
  } else {
    clienteId = await upsertCliente(db, {
      nome: texto(corpo.nome, 80, 'o nome', { obrigatorio: true, min: 2 }),
      whatsapp: normalizarWhatsapp(corpo.whatsapp),
      endereco: local === 'domicilio' ? texto(corpo.endereco, 200, 'o endereço') : '',
    });
  }
  const forcar = corpo.forcar === true || corpo.forcar === 'true' || corpo.forcar === 1;
  const fim = inicio + duracao;

  // Se não foi forçado, verifica se há choque de horário no mesmo dia
  if (!forcar) {
    const conflito = await db.prepare(`
      SELECT a.id, a.inicio_min, a.duracao_min, c.nome AS cliente_nome
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      WHERE a.data = ?1 AND a.status IN ('agendado', 'concluido')
        AND NOT (?2 >= a.inicio_min + a.duracao_min OR a.inicio_min >= ?3)
      ORDER BY a.inicio_min
      LIMIT 1
    `).bind(corpo.data, inicio, fim).first();

    if (conflito) {
      throw erro(409, 'choque_horario', 'Choque de horário com outro agendamento.', {}, {
        conflito: {
          cliente_nome: conflito.cliente_nome,
          inicio_min: conflito.inicio_min,
          duracao_min: conflito.duracao_min,
        },
      });
    }
  }

  const token = aleatorioHex(16);
  const ok = await criarAgendamento(db, cfg, {
    cliente_id: clienteId, data: corpo.data, inicio_min: inicio, duracao_min: duracao, local,
    endereco: local === 'domicilio' ? texto(corpo.endereco, 200, 'o endereço') : '',
    referencia: local === 'domicilio' ? texto(corpo.referencia, 120, 'a referência') : '',
    preco, token, origem: 'manicure', observacoes: texto(corpo.observacoes, 300, 'a observação'), servicos,
    forcar,
  });

  if (!ok) {
    if (!forcar) {
      const vizinho = await db.prepare(`
        SELECT a.id, a.inicio_min, a.duracao_min, c.nome AS cliente_nome
        FROM agendamentos a
        JOIN clientes c ON c.id = a.cliente_id
        WHERE a.data = ?1 AND a.status IN ('agendado', 'concluido')
        ORDER BY ABS(a.inicio_min - ?2)
        LIMIT 1
      `).bind(corpo.data, inicio).first();

      if (vizinho) {
        throw erro(409, 'choque_horario', 'Intervalo muito próximo de outro atendimento.', {}, {
          conflito: {
            cliente_nome: vizinho.cliente_nome,
            inicio_min: vizinho.inicio_min,
            duracao_min: vizinho.duracao_min,
          },
        });
      }
    }
    throw erro(409, 'horario_indisponivel', 'Já existe atendimento nesse horário (ou perto demais dele).');
  }

  // Notifica a cliente via WhatsApp sobre o agendamento criado pela profissional
  const cliente = await db.prepare('SELECT nome, whatsapp FROM clientes WHERE id = ?1').bind(clienteId).first();
  if (cliente?.whatsapp) {
    try {
      const linkAgendamento = `${url.origin}/?a=${token}`;
      await notificarAgendamentoZap(env, cfg, {
        cliente_nome: cliente.nome,
        cliente_whatsapp: cliente.whatsapp,
        data: corpo.data,
        inicio_min: inicio,
        local,
        endereco: local === 'domicilio' ? (corpo.endereco || '') : '',
        servicos,
        criado_por_admin: true,
        token,
        link: linkAgendamento,
      });
    } catch (err) {
      console.error('Falha ao enviar notificação WhatsApp admin:', err);
    }
  }

  return json({ token }, 201);
}, { admin: true });

rota('PATCH', '/admin/agendamentos/:id', async ({ db, params, corpo }) => {
  const id = inteiro(params.id, 1, 1e12, 'Id');
  const atual = await db.prepare('SELECT * FROM agendamentos WHERE id = ?1').bind(id).first();
  if (!atual) throw erro(404, 'nao_encontrado', 'Agendamento não encontrado.');
  const cfg = await carregarConfig(db);

  if (corpo.data !== undefined || corpo.inicio_min !== undefined) {
    const data = corpo.data ?? atual.data;
    if (!dataValida(data)) throw erro(400, 'dado_invalido', 'Data inválida.');
    const ini = inteiro(corpo.inicio_min ?? atual.inicio_min, 0, 1439, 'Horário');
    const r = await db.prepare(
      `UPDATE agendamentos SET data = ?2, inicio_min = ?3 WHERE id = ?1 AND ${sqlSemConflito({
        d: 2, i: 3, u: 4, l: 5, dl: 6, rs: 7, ignorar: 1 })}`
    ).bind(id, data, ini, atual.duracao_min, atual.local, cfg.deslocamento_min, cfg.respiro_min).run();
    if (!r.meta.changes) throw erro(409, 'horario_indisponivel', 'Já existe atendimento nesse horário (ou perto demais dele).');
  }

  const sets = [], binds = [];
  const add = (col, v) => { binds.push(v); sets.push(`${col} = ?${binds.length + 1}`); };
  if (corpo.status !== undefined) {
    if (!['agendado', 'concluido', 'cancelado', 'faltou'].includes(corpo.status)) throw erro(400, 'dado_invalido', 'Status inválido.');
    add('status', corpo.status);
    if (corpo.status === 'concluido' && corpo.valor_cobrado_centavos === undefined && atual.valor_cobrado_centavos == null) {
      add('valor_cobrado_centavos', atual.preco_tabela_centavos);
    }
  }
  if (corpo.valor_cobrado_centavos !== undefined) add('valor_cobrado_centavos', inteiro(corpo.valor_cobrado_centavos, 0, 10000000, 'Valor'));
  if (corpo.pago !== undefined) add('pago', corpo.pago ? 1 : 0);
  if (corpo.forma_pagamento !== undefined) {
    if (corpo.forma_pagamento !== null && !['pix', 'dinheiro', 'cartao'].includes(corpo.forma_pagamento)) throw erro(400, 'dado_invalido', 'Forma de pagamento inválida.');
    add('forma_pagamento', corpo.forma_pagamento);
  }
  if (corpo.observacoes !== undefined) add('observacoes', texto(corpo.observacoes, 300, 'a observação') || null);
  if (sets.length) {
    await db.prepare(`UPDATE agendamentos SET ${sets.join(', ')} WHERE id = ?1`).bind(id, ...binds).run();
  }
  const [linha] = await listar(db, atual.data, atual.data, 'AND a.id = ?3', id);
  const final = linha || (await listar(db, corpo.data ?? atual.data, corpo.data ?? atual.data, 'AND a.id = ?3', id))[0];
  return json({ agendamento: final });
}, { admin: true });

rota('DELETE', '/admin/agendamentos/:id', async ({ db, params }) => {
  await db.prepare('DELETE FROM agendamentos WHERE id = ?1').bind(inteiro(params.id, 1, 1e12, 'Id')).run();
  return json({ ok: true });
}, { admin: true });

// ---------- clientes ----------
rota('GET', '/admin/clientes', async ({ db, url }) => {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const { results } = await db.prepare(
    `SELECT c.id, c.nome, c.whatsapp, c.ultimo_endereco, c.observacoes,
       (SELECT COUNT(*) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status = 'concluido') AS atendimentos,
       (SELECT MAX(a.data) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status = 'concluido') AS ultimo_atendimento,
       (SELECT COALESCE(SUM(COALESCE(a.valor_cobrado_centavos, a.preco_tabela_centavos)), 0) FROM agendamentos a
          WHERE a.cliente_id = c.id AND a.status = 'concluido') AS total_centavos
     FROM clientes c ORDER BY c.nome COLLATE NOCASE LIMIT 500`).all();
  const filtrado = q ? results.filter((c) => c.nome.toLowerCase().includes(q) || c.whatsapp.includes(q.replace(/\D/g, '') || '\u0000')) : results;
  return json({ clientes: filtrado });
}, { admin: true });

rota('PUT', '/admin/clientes/:id', async ({ db, params, corpo }) => {
  await db.prepare('UPDATE clientes SET nome = ?2, observacoes = ?3 WHERE id = ?1').bind(
    inteiro(params.id, 1, 1e12, 'Id'), texto(corpo.nome, 80, 'o nome', { obrigatorio: true, min: 2 }),
    texto(corpo.observacoes, 300, 'a observação') || null).run();
  return json({ ok: true });
}, { admin: true });

// ---------- financeiro ----------
rota('GET', '/admin/despesas', async ({ db, url }) => {
  const mes = url.searchParams.get('mes');
  if (!mesValido(mes)) throw erro(400, 'dado_invalido', 'Mês inválido.');
  const { results } = await db.prepare('SELECT * FROM despesas WHERE data BETWEEN ?1 AND ?2 ORDER BY data DESC, id DESC')
    .bind(`${mes}-01`, `${mes}-31`).all();
  return json({ despesas: results });
}, { admin: true });

rota('POST', '/admin/despesas', async ({ db, corpo }) => {
  if (!dataValida(corpo.data)) throw erro(400, 'dado_invalido', 'Data inválida.');
  const r = await db.prepare('INSERT INTO despesas (descricao, valor_centavos, data, categoria) VALUES (?1,?2,?3,?4) RETURNING id')
    .bind(texto(corpo.descricao, 100, 'a descrição', { obrigatorio: true }), inteiro(corpo.valor_centavos, 1, 100000000, 'Valor'),
      corpo.data, texto(corpo.categoria, 40, 'a categoria') || null).first();
  return json({ id: r.id }, 201);
}, { admin: true });

rota('DELETE', '/admin/despesas/:id', async ({ db, params }) => {
  await db.prepare('DELETE FROM despesas WHERE id = ?1').bind(inteiro(params.id, 1, 1e12, 'Id')).run();
  return json({ ok: true });
}, { admin: true });

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

async function aReceber(db) {
  const { results } = await db.prepare(
    `${SELECT_AGEND} WHERE a.status = 'concluido' AND a.pago = 0 ORDER BY a.data DESC, a.inicio_min DESC LIMIT 100`).all();
  return results.map((r) => ({ ...r, valor_centavos: r.valor_cobrado_centavos ?? r.preco_tabela_centavos }));
}

rota('GET', '/admin/financeiro', async ({ db, url }) => {
  const mes = url.searchParams.get('mes');
  if (!mesValido(mes)) throw erro(400, 'dado_invalido', 'Mês inválido.');
  const agora = agoraLocal();
  const proximaRow = await db.prepare(
    `SELECT MIN(data) AS proxima_data FROM agendamentos WHERE data > ?1 AND status = 'agendado'`
  ).bind(agora.data).first();
  const proximaData = proximaRow?.proxima_data || null;

  const [resumo, anterior, receber, hojeRows, proxRows] = await Promise.all([
    resumoMes(db, mes),
    resumoMes(db, mesAnterior(mes)),
    aReceber(db),
    db.prepare(`SELECT status, pago, forma_pagamento, preco_tabela_centavos, valor_cobrado_centavos FROM agendamentos WHERE data = ?1 AND status != 'cancelado'`).bind(agora.data).all(),
    proximaData ? db.prepare(`SELECT status, preco_tabela_centavos, valor_cobrado_centavos FROM agendamentos WHERE data = ?1 AND status != 'cancelado'`).bind(proximaData).all() : Promise.resolve({ results: [] }),
  ]);

  const faturadoHoje = hojeRows.results.filter((a) => a.status === 'concluido').reduce((s, a) => s + (a.valor_cobrado_centavos ?? a.preco_tabela_centavos), 0);
  const previstoHoje = hojeRows.results.filter((a) => a.status === 'agendado').reduce((s, a) => s + a.preco_tabela_centavos, 0);
  const previstoProx = proxRows.results.filter((a) => a.status === 'agendado').reduce((s, a) => s + a.preco_tabela_centavos, 0);

  const hojeFormas = {
    pix: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    dinheiro: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    cartao: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
    outro: { recebido_centavos: 0, a_receber_centavos: 0, qtd_recebido: 0, qtd_a_receber: 0 },
  };

  let pendenteFechamentoHojeCentavos = 0;
  let pendenteFechamentoHojeQtd = 0;

  for (const a of hojeRows.results) {
    const val = a.valor_cobrado_centavos ?? a.preco_tabela_centavos;
    if (a.status === 'concluido') {
      const fKey = (a.forma_pagamento && hojeFormas[a.forma_pagamento]) ? a.forma_pagamento : 'outro';
      if (a.pago === 1) {
        hojeFormas[fKey].recebido_centavos += val;
        hojeFormas[fKey].qtd_recebido += 1;
      } else {
        hojeFormas[fKey].a_receber_centavos += val;
        hojeFormas[fKey].qtd_a_receber += 1;
      }
    } else if (a.status === 'agendado') {
      pendenteFechamentoHojeCentavos += a.preco_tabela_centavos;
      pendenteFechamentoHojeQtd += 1;
    }
  }

  const recebidoHoje = hojeRows.results.filter((a) => a.status === 'concluido' && a.pago === 1).reduce((s, a) => s + (a.valor_cobrado_centavos ?? a.preco_tabela_centavos), 0);
  const aReceberHoje = hojeRows.results.filter((a) => a.status === 'concluido' && a.pago === 0).reduce((s, a) => s + (a.valor_cobrado_centavos ?? a.preco_tabela_centavos), 0);

  return json({
    ...resumo,
    faturado_anterior_centavos: anterior.faturado_centavos,
    a_receber_lista: receber,
    hoje: {
      data: agora.data,
      faturado_centavos: faturadoHoje,
      previsto_centavos: previstoHoje,
      recebido_centavos: recebidoHoje,
      a_receber_centavos: aReceberHoje,
      qtd_total: hojeRows.results.length,
      qtd_agendados: hojeRows.results.filter((a) => a.status === 'agendado').length,
      qtd_concluidos: hojeRows.results.filter((a) => a.status === 'concluido').length,
      por_forma: hojeFormas,
      pendente_fechamento_centavos: pendenteFechamentoHojeCentavos,
      qtd_pendente_fechamento: pendenteFechamentoHojeQtd,
    },
    proximo_dia: proximaData ? {
      data: proximaData,
      previsto_centavos: previstoProx,
      qtd_agendados: proxRows.results.filter((a) => a.status === 'agendado').length,
    } : null,
  });
}, { admin: true });

rota('GET', '/admin/painel', async ({ db }) => {
  await garantirColunasLembretes(db);
  const agora = agoraLocal();
  const mes = agora.data.slice(0, 7);
  const cfg = await carregarConfig(db);
  const diasSumido = cfg.alerta_sumidos_dias || 15;

  const proximaRow = await db.prepare(
    `SELECT MIN(data) AS proxima_data FROM agendamentos WHERE data > ?1 AND status = 'agendado'`
  ).bind(agora.data).first();
  const proximaData = proximaRow?.proxima_data || null;

  const [hoje, proximoDia, resumo, receber, sumidos, proximos, canceladosRecentes] = await Promise.all([
    listar(db, agora.data, agora.data, `AND a.status != 'cancelado'`),
    proximaData ? listar(db, proximaData, proximaData, `AND a.status != 'cancelado'`) : Promise.resolve([]),
    resumoMes(db, mes),
    aReceber(db),
    db.prepare(
      `SELECT c.id, c.nome, c.whatsapp, MAX(a.data) AS ultimo_atendimento
       FROM clientes c JOIN agendamentos a ON a.cliente_id = c.id AND a.status = 'concluido'
       WHERE NOT EXISTS (SELECT 1 FROM agendamentos f WHERE f.cliente_id = c.id AND f.status = 'agendado' AND f.data >= ?1)
       GROUP BY c.id HAVING MAX(a.data) <= ?2 ORDER BY MAX(a.data) DESC LIMIT 50`).bind(agora.data, addDias(agora.data, -diasSumido)).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE status = 'agendado' AND data > ?1 AND data <= ?2`)
      .bind(agora.data, addDias(agora.data, 7)).first(),
    listar(db, agora.data, addDias(agora.data, 30), `AND a.status = 'cancelado' AND (a.cancelamento_dispensado IS NULL OR a.cancelamento_dispensado = 0)`),
  ]);

  const faturadoHoje = hoje.filter((a) => a.status === 'concluido').reduce((s, a) => s + (a.valor_cobrado_centavos ?? a.preco_tabela_centavos), 0);
  const previstoHoje = hoje.filter((a) => a.status === 'agendado').reduce((s, a) => s + a.preco_tabela_centavos, 0);
  const previstoProx = proximoDia.filter((a) => a.status === 'agendado').reduce((s, a) => s + a.preco_tabela_centavos, 0);
  const vencidosHoje = hoje.filter((a) => a.status === 'agendado' && agora.min >= a.inicio_min + a.duracao_min);
  const vencidosHojeTotal = vencidosHoje.reduce((s, a) => s + a.preco_tabela_centavos, 0);

  return json({
    hoje: agora.data,
    agora_min: agora.min,
    agendamentos_hoje: hoje,
    faturado_hoje_centavos: faturadoHoje,
    previsto_hoje_centavos: previstoHoje,
    vencidos_hoje_qtd: vencidosHoje.length,
    vencidos_hoje_centavos: vencidosHojeTotal,
    proxima_data: proximaData,
    agendamentos_proximo_dia: proximoDia,
    previsto_proximo_dia_centavos: previstoProx,
    mes: resumo,
    a_receber_total_centavos: receber.reduce((s, r) => s + r.valor_centavos, 0),
    a_receber_qtd: receber.length,
    sumidos: sumidos.results,
    alerta_sumidos_dias: diasSumido,
    proximos_7_dias: proximos.n,
    cancelados_recentes: canceladosRecentes,
  });
}, { admin: true });

rota('POST', '/admin/agendamentos/:id/dispensar-cancelamento', async ({ db, params }) => {
  await garantirColunasLembretes(db);
  const id = inteiro(params.id, 1, 1e12, 'Id');
  await db.prepare('UPDATE agendamentos SET cancelamento_dispensado = 1 WHERE id = ?1').bind(id).run();
  return json({ ok: true, id });
}, { admin: true });

rota('POST', '/admin/agendamentos/dispensar-cancelamentos', async ({ db, corpo }) => {
  await garantirColunasLembretes(db);
  const ids = Array.isArray(corpo?.ids) ? corpo.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
    await db.prepare(`UPDATE agendamentos SET cancelamento_dispensado = 1 WHERE id IN (${placeholders})`).bind(...ids).run();
  }
  return json({ ok: true, dispensados: ids });
}, { admin: true });

// ---------- whatsapp ----------
rota('GET', '/admin/whatsapp/status', async ({ env }) => {
  try {
    const st = await obterStatusZap(env);
    return json(st);
  } catch (err) {
    return json({ status: 'disconnected', erro: err.message });
  }
}, { admin: true });

rota('POST', '/admin/whatsapp/conectar', async ({ env }) => {
  try {
    const r = await conectarZap(env);
    return json(r);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}, { admin: true });

rota('POST', '/admin/whatsapp/desconectar', async ({ env }) => {
  try {
    const r = await desconectarZap(env);
    return json(r);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}, { admin: true });

rota('POST', '/admin/whatsapp/teste', async ({ env, db, corpo }) => {
  const cfg = await carregarConfig(db);
  const destino = corpo?.numero ? normalizarWhatsapp(corpo.numero) : cfg.whatsapp;
  if (!destino) throw erro(400, 'dado_invalido', 'Nenhum número de WhatsApp informado.');
  const nome = cfg.nome_negocio || 'Jerusa Beauty';
  const mensagem = `🤖 *Teste de Notificação Automática - ${nome}*\n\nSeu WhatsApp está conectado com sucesso ao MeuStudio! As confirmações e lembretes de agendamento serão enviados automaticamente para suas clientes por aqui. ✨`;
  const r = await enviarMensagemZap(env, { numero: destino, mensagem });
  return json({ ok: true, resultado: r });
}, { admin: true });

rota('POST', '/admin/whatsapp/lembretes/processar', async ({ db, env, request }) => {
  const cronKey = request.headers.get('x-cron-key') || request.headers.get('x-api-key');
  const zapKey = env?.ZAP_API_KEY || 'meustudio_zap_secret_2026';
  const ehCronAutorizado = cronKey && cronKey === zapKey;
  if (!ehCronAutorizado && !(await sessaoValida(db, request))) {
    throw erro(401, 'nao_autenticado', 'Não autorizado.');
  }
  const resultado = await processarLembretes(db, env);
  return json({ ok: true, resultado });
});

rota('POST', '/admin/whatsapp/fidelizacao/processar', async ({ db, env, request, corpo }) => {
  const forcar = corpo?.forcar === true;
  const limite = inteiro(corpo?.limite || 5, 1, 20, 'Limite');
  const url = new URL(request.url);
  const link = `${url.origin}/`;
  const resultado = await processarFidelizacao(db, env, { forcar, limite, link });
  return json({ ok: true, resultado });
}, { admin: true });

rota('GET', '/admin/aniversariantes/hoje', async ({ db }) => {
  const agora = agoraLocal();
  const [anoStr, mesStr, diaStr] = agora.data.split('-');
  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10);
  const ano = parseInt(anoStr, 10);

  const { results: aniversariantes = [] } = await db.prepare(`
    SELECT id, nome, whatsapp, aniversario_dia, aniversario_mes, ultimo_aviso_aniversario_ano
    FROM clientes
    WHERE aniversario_dia = ?1 AND aniversario_mes = ?2
    ORDER BY nome ASC
  `).bind(dia, mes).all();

  return json({
    data: agora.data,
    ano_atual: ano,
    aniversariantes: aniversariantes.map((c) => ({
      ...c,
      enviado_este_ano: c.ultimo_aviso_aniversario_ano === ano,
    })),
  });
}, { admin: true });



