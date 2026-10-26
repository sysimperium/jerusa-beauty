import { rota } from './router.js';
import { notificarAgendamentoZap, notificarCancelamentoZap, extrairDiaMesAniversario } from './whatsapp.js';
import { erro, json, inteiro, texto, normalizarWhatsapp, carregarConfig } from './util.js';
import { aleatorioHex } from './auth.js';
import { agoraLocal, dataValida, diaSemana, inicioEmMs } from './time.js';
import { horariosDoDia, diasDaJanela } from './slots.js';
import {
  resolverServicos, dadosDoPeriodo, validarLocal, upsertCliente, criarAgendamento, anexarServicos,
} from './dominio.js';

const idsDaQuery = (url) => (url.searchParams.get('servicos') || '').split(',').filter(Boolean).map(Number);

rota('GET', '/publico/config', async ({ db }) => {
  const cfg = await carregarConfig(db);
  const { results } = await db.prepare(
    'SELECT id, nome, descricao, preco_centavos, duracao_min FROM servicos WHERE ativo = 1 ORDER BY ordem, id').all();
  return json({
    nome: cfg.nome_negocio,
    whatsapp: cfg.whatsapp,
    atende_espaco: cfg.atende_espaco,
    atende_domicilio: cfg.atende_domicilio,
    endereco_espaco: cfg.atende_espaco ? cfg.endereco_espaco : '',
    cancelar_horas: cfg.cancelar_horas,
    janela_dias: cfg.janela_dias,
    servicos: results,
  }, 200, { 'cache-control': 'no-store' });
});

rota('GET', '/publico/disponibilidade', async ({ db, url }) => {
  const cfg = await carregarConfig(db);
  const localParam = url.searchParams.get('local');
  const local = localParam ? validarLocal(localParam, cfg) : (cfg.atende_espaco ? 'espaco' : 'domicilio');
  const servicosIds = idsDaQuery(url);
  let duracao = 0;
  let preco = 0;
  if (servicosIds.length > 0) {
    const res = await resolverServicos(db, servicosIds);
    duracao = res.duracao;
    preco = res.preco;
  } else {
    const minRow = await db.prepare('SELECT MIN(duracao_min) AS min_dur FROM servicos WHERE ativo = 1').first();
    duracao = minRow?.min_dur || cfg.passo_min || 30;
  }
  const agora = agoraLocal();
  const dias = diasDaJanela(agora, cfg);
  const dados = await dadosDoPeriodo(db, dias[0], dias[dias.length - 1]);
  const resultado = {};
  for (const data of dias) {
    const livres = horariosDoDia({
      data, duracao, local, cfg, agora,
      expediente: dados.expediente.get(diaSemana(data)),
      bloqueios: dados.bloqueios.get(data) || [],
      agendamentos: dados.agendamentos.get(data) || [],
    });
    if (livres.length) resultado[data] = livres;
  }
  return json({ hoje: agora.data, duracao_min: duracao, preco_centavos: preco, dias: resultado });
});

rota('POST', '/publico/agendar', async ({ db, env, corpo, url, waitUntil }) => {
  const cfg = await carregarConfig(db);
  const nome = texto(corpo.nome, 80, 'o nome', { obrigatorio: true, min: 2 });
  const whatsapp = normalizarWhatsapp(corpo.whatsapp);
  const local = validarLocal(corpo.local, cfg);
  if (!dataValida(corpo.data)) throw erro(400, 'dado_invalido', 'Data inválida.');
  const inicio = inteiro(corpo.inicio_min, 0, 1439, 'Horário');
  const endereco = local === 'domicilio' ? texto(corpo.endereco, 200, 'o endereço', { obrigatorio: true, min: 5 }) : '';
  const referencia = local === 'domicilio' ? texto(corpo.referencia, 120, 'a referência') : '';
  const { servicos, duracao, preco } = await resolverServicos(db, corpo.servicos);

  const agora = agoraLocal();
  const dados = await dadosDoPeriodo(db, corpo.data, corpo.data);
  const livres = horariosDoDia({
    data: corpo.data, duracao, local, cfg, agora,
    expediente: dados.expediente.get(diaSemana(corpo.data)),
    bloqueios: dados.bloqueios.get(corpo.data) || [],
    agendamentos: dados.agendamentos.get(corpo.data) || [],
  });
  if (!livres.includes(inicio)) {
    throw erro(409, 'horario_indisponivel', 'Esse horário acabou de ser ocupado. Escolha outro.');
  }

  let anivDia = null;
  let anivMes = null;
  if (corpo.aniversario) {
    const extraido = extrairDiaMesAniversario(corpo.aniversario);
    if (extraido) {
      anivDia = extraido.dia;
      anivMes = extraido.mes;
    }
  }

  const clienteId = await upsertCliente(db, {
    nome,
    whatsapp,
    endereco,
    aniversario_dia: anivDia,
    aniversario_mes: anivMes,
  });
  const token = aleatorioHex(16);
  const ok = await criarAgendamento(db, cfg, {
    cliente_id: clienteId, data: corpo.data, inicio_min: inicio, duracao_min: duracao, local,
    endereco, referencia, preco, token, origem: 'cliente', servicos,
  });
  if (!ok) throw erro(409, 'horario_indisponivel', 'Esse horário acabou de ser ocupado. Escolha outro.');

  // Disparo automático do WhatsApp para a cliente e para a profissional
  try {
    const linkAgendamento = url?.origin ? `${url.origin}/?a=${token}` : (token ? `https://jerusa-beauty.pages.dev/?a=${token}` : null);
    await notificarAgendamentoZap(env, cfg, {
      cliente_nome: nome,
      cliente_whatsapp: whatsapp,
      data: corpo.data,
      inicio_min: inicio,
      local,
      endereco,
      servicos,
      criado_por_admin: false,
      token,
      link: linkAgendamento,
    });
  } catch (err) {
    console.error('Falha ao enviar notificação WhatsApp:', err);
  }

  return json({ token }, 201);
});

async function buscarPorToken(db, token) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw erro(404, 'nao_encontrado', 'Agendamento não encontrado.');
  const a = await db.prepare(
    `SELECT a.id, a.data, a.inicio_min, a.duracao_min, a.local, a.endereco, a.referencia, a.preco_tabela_centavos,
            a.status, c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp
     FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id WHERE a.token = ?1`).bind(token).first();
  if (!a) throw erro(404, 'nao_encontrado', 'Agendamento não encontrado.');
  const { results } = await db.prepare(
    'SELECT nome, preco_centavos, duracao_min FROM agendamento_servicos WHERE agendamento_id = ?1 ORDER BY id').bind(a.id).all();
  return { ...a, servicos: results };
}

function podeCancelar(a, cfg) {
  return a.status === 'agendado' && inicioEmMs(a.data, a.inicio_min) - Date.now() >= cfg.cancelar_horas * 3600000;
}

rota('GET', '/publico/agendamento/:token', async ({ db, params }) => {
  const cfg = await carregarConfig(db);
  const a = await buscarPorToken(db, params.token);
  const { id, ...resto } = a;
  return json({ ...resto, pode_cancelar: podeCancelar(a, cfg), cancelar_horas: cfg.cancelar_horas, whatsapp: cfg.whatsapp, nome_negocio: cfg.nome_negocio });
});

rota('POST', '/publico/agendamento/:token/cancelar', async ({ db, env, params }) => {
  const cfg = await carregarConfig(db);
  const a = await buscarPorToken(db, params.token);
  if (a.status === 'cancelado') return json({ ok: true });
  if (a.status !== 'agendado') throw erro(409, 'nao_cancelavel', 'Este atendimento não pode mais ser cancelado pelo link.');
  if (!podeCancelar(a, cfg)) {
    throw erro(409, 'prazo_encerrado',
      `O prazo para cancelar pelo link é de ${cfg.cancelar_horas}h antes do horário. Fale direto com a manicure.`);
  }
  await db.prepare(`UPDATE agendamentos SET status = 'cancelado' WHERE id = ?1 AND status = 'agendado'`).bind(a.id).run();

  // Disparo automático do WhatsApp sobre o cancelamento para a cliente e para a profissional
  try {
    await notificarCancelamentoZap(env, cfg, {
      cliente_nome: a.cliente_nome,
      cliente_whatsapp: a.cliente_whatsapp,
      data: a.data,
      inicio_min: a.inicio_min,
      servicos: a.servicos,
      cancelado_por_admin: false,
    });
  } catch (err) {
    console.error('Falha ao enviar notificação de cancelamento WhatsApp:', err);
  }

  return json({ ok: true });
});
