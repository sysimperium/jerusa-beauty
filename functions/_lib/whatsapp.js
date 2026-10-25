import { inicioEmMs, agoraLocal, addDias, diaSemana } from './time.js';
import { carregarConfig, normalizarWhatsapp } from './util.js';

const DEFAULT_ZAP_URL = 'https://meustudio-zap.onrender.com';
const DEFAULT_ZAP_KEY = 'meustudio_zap_secret_2026';
const DEFAULT_APP_ID = 'jerusa-beauty';

export function getZapUrl(env) {
  return (env?.ZAP_SERVICE_URL || DEFAULT_ZAP_URL).replace(/\/+$/, '');
}

export function getZapKey(env) {
  return env?.ZAP_API_KEY || DEFAULT_ZAP_KEY;
}

export function getAppId(env) {
  return env?.APP_ID || DEFAULT_APP_ID;
}

export async function obterStatusZap(env) {
  const url = `${getZapUrl(env)}/sessao/status/${getAppId(env)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': getZapKey(env) },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao obter status WhatsApp (${res.status}): ${txt}`);
  }
  return await res.json();
}

export async function conectarZap(env) {
  const url = `${getZapUrl(env)}/sessao/conectar`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getZapKey(env),
    },
    body: JSON.stringify({ app_id: getAppId(env) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao iniciar conexão WhatsApp (${res.status}): ${txt}`);
  }
  return await res.json();
}

export async function desconectarZap(env) {
  const url = `${getZapUrl(env)}/sessao/desconectar`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getZapKey(env),
    },
    body: JSON.stringify({ app_id: getAppId(env) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao desconectar WhatsApp (${res.status}): ${txt}`);
  }
  return await res.json();
}

export async function enviarMensagemZap(env, { numero, mensagem }) {
  const url = `${getZapUrl(env)}/mensagem/enviar`;
  const zapKey = getZapKey(env);
  const appId = getAppId(env);

  let ultimoErro = null;
  // Tentativa com 1 retry automático (com intervalo de 2s) para cobrir eventual reconexão do gateway
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': zapKey,
        },
        body: JSON.stringify({
          app_id: appId,
          para: numero,
          mensagem,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return data;
      }
      ultimoErro = new Error(data.error || `Erro ${res.status} ao enviar WhatsApp`);
    } catch (err) {
      ultimoErro = err;
    }

    if (tentativa < 2) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw ultimoErro || new Error('Falha ao enviar WhatsApp');
}

export async function notificarAgendamentoZap(env, cfg, agendamento) {
  try {
    const {
      cliente_nome,
      cliente_whatsapp,
      data,
      inicio_min,
      local,
      endereco,
      servicos,
      criado_por_admin = false,
      token,
      link,
    } = agendamento;
    if (!cliente_whatsapp) return;

    const zapCliente = (() => {
      try {
        return normalizarWhatsapp(cliente_whatsapp);
      } catch {
        return cliente_whatsapp;
      }
    })();

    const [ano, mes, dia] = data.split('-');
    const dataFmt = `${dia}/${mes}/${ano}`;
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const dSemana = diasSemana[new Date(`${data}T00:00:00Z`).getUTCDay()];

    const horaFmt = String(Math.floor(inicio_min / 60)).padStart(2, '0') + ':' + String(inicio_min % 60).padStart(2, '0');
    const servicosTexto = servicos && servicos.length > 0
      ? servicos.map((s) => s.nome).join(', ')
      : 'Atendimento';

    const localTexto = local === 'espaco'
      ? (cfg?.endereco_espaco ? `No espaço (${cfg.endereco_espaco})` : 'No espaço de atendimento')
      : (endereco ? `A domicílio: ${endereco}` : 'A domicílio');

    const nomeNegocio = cfg?.nome_negocio || 'Jerusa Beauty';
    const linkAgendamento = link || (token ? `https://jerusa-beauty.pages.dev/?a=${token}` : null);
    const secaoLink = linkAgendamento
      ? `\n\n🔗 *Ver detalhes ou cancelar horário:*\n${linkAgendamento}`
      : '';

    // Mensagem de confirmação para a CLIENTE
    if (cliente_whatsapp) {
      const msgCliente =
`Olá, *${cliente_nome}*! ✨

Seu agendamento na *${nomeNegocio}* foi confirmado com sucesso!

📅 *Data:* ${dataFmt} (${dSemana})
⏰ *Horário:* ${horaFmt}
💅 *Serviço(s):* ${servicosTexto}
📍 *Local:* ${localTexto}${secaoLink}

Caso tenha algum imprevisto, você pode cancelar ou reagendar diretamente pelo link acima com antecedência. Estamos ansiosas para te atender! 💕`;

      await enviarMensagemZap(env, {
        numero: zapCliente,
        mensagem: msgCliente,
      }).catch(err => console.error('[WhatsApp] Erro ao enviar para cliente:', err.message));
    }
  } catch (err) {
    console.error('Falha ao enviar notificação WhatsApp:', err);
  }
}

export async function notificarCancelamentoZap(env, cfg, agendamento) {
  try {
    const { cliente_nome, cliente_whatsapp, data, inicio_min, servicos } = agendamento;
    if (!cliente_whatsapp) return;

    const zapCliente = (() => {
      try {
        return normalizarWhatsapp(cliente_whatsapp);
      } catch {
        return cliente_whatsapp;
      }
    })();

    const [ano, mes, dia] = data.split('-');
    const dataFmt = `${dia}/${mes}/${ano}`;
    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const dSemana = diasSemana[new Date(`${data}T00:00:00Z`).getUTCDay()];
    const horaFmt = String(Math.floor(inicio_min / 60)).padStart(2, '0') + ':' + String(inicio_min % 60).padStart(2, '0');
    const servicosTexto = servicos && servicos.length > 0 ? servicos.map((s) => s.nome).join(', ') : 'Atendimento';
    const nomeNegocio = cfg?.nome_negocio || 'Jerusa Beauty';

    // Mensagem para a CLIENTE
    if (cliente_whatsapp) {
      const msgCliente =
`Olá, *${cliente_nome}*! 👋

Confirmamos o cancelamento do seu atendimento na *${nomeNegocio}* marcado para ${dataFmt} (${dSemana}) às ${horaFmt}.

Quando quiser agendar um novo momento de autocuidado, estamos sempre à disposição por aqui ou pelo nosso site:
👉 https://jerusa-beauty.pages.dev/ 💕`;

      await enviarMensagemZap(env, {
        numero: zapCliente,
        mensagem: msgCliente,
      }).catch(err => console.error('[WhatsApp] Erro ao enviar cancelamento para cliente:', err.message));
    }
  } catch (err) {
    console.error('Falha ao enviar notificação de cancelamento WhatsApp:', err);
  }
}

export async function garantirColunasLembretes(db) {
  try {
    const info = await db.prepare('PRAGMA table_info(agendamentos)').all();
    const colunas = (info.results || []).map((r) => r.name);
    if (!colunas.includes('lembrete_24h_enviado')) {
      await db.prepare('ALTER TABLE agendamentos ADD COLUMN lembrete_24h_enviado INTEGER NOT NULL DEFAULT 0').run();
    }
    if (!colunas.includes('lembrete_2h_enviado')) {
      await db.prepare('ALTER TABLE agendamentos ADD COLUMN lembrete_2h_enviado INTEGER NOT NULL DEFAULT 0').run();
    }
    if (!colunas.includes('cancelamento_dispensado')) {
      await db.prepare('ALTER TABLE agendamentos ADD COLUMN cancelamento_dispensado INTEGER NOT NULL DEFAULT 0').run();
    }
    const infoCli = await db.prepare('PRAGMA table_info(clientes)').all();
    const colunasCli = (infoCli.results || []).map((r) => r.name);
    if (!colunasCli.includes('ultimo_aviso_fidelizacao')) {
      await db.prepare('ALTER TABLE clientes ADD COLUMN ultimo_aviso_fidelizacao TEXT').run();
    }
    if (!colunasCli.includes('aniversario_dia')) {
      await db.prepare('ALTER TABLE clientes ADD COLUMN aniversario_dia INTEGER').run();
    }
    if (!colunasCli.includes('aniversario_mes')) {
      await db.prepare('ALTER TABLE clientes ADD COLUMN aniversario_mes INTEGER').run();
    }
    if (!colunasCli.includes('ultimo_aviso_aniversario_ano')) {
      await db.prepare('ALTER TABLE clientes ADD COLUMN ultimo_aviso_aniversario_ano INTEGER').run();
    }
  } catch (err) {
    console.warn('Aviso colunas tabelas:', err.message);
  }
}

export function formatarMensagemLembrete24h(cfg, a) {
  const [ano, mes, dia] = a.data.split('-');
  const dataFmt = `${dia}/${mes}/${ano}`;
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const dSemana = diasSemana[new Date(`${a.data}T00:00:00Z`).getUTCDay()];
  const horaFmt = String(Math.floor(a.inicio_min / 60)).padStart(2, '0') + ':' + String(a.inicio_min % 60).padStart(2, '0');
  const servicosTexto = a.servicos && a.servicos.length > 0 ? a.servicos.map((s) => s.nome).join(', ') : 'Atendimento';
  const localTexto = a.local === 'espaco'
    ? (cfg.endereco_espaco ? `No espaço (${cfg.endereco_espaco})` : 'No espaço de atendimento')
    : (a.endereco ? `A domicílio: ${a.endereco}` : 'A domicílio');
  const nomeNegocio = cfg.nome_negocio || 'Jerusa Beauty';
  const linkTexto = a.token ? `\n\n🔗 *Ver detalhes ou gerenciar:* https://jerusa-beauty.pages.dev/?a=${a.token}` : '';

  return `Olá, *${a.cliente_nome}*! 💕

Passando para lembrar do seu atendimento amanhã na *${nomeNegocio}*:

📅 *Data:* ${dataFmt} (${dSemana})
⏰ *Horário:* ${horaFmt}
💅 *Serviço(s):* ${servicosTexto}
📍 *Local:* ${localTexto}${linkTexto}

Caso tenha algum imprevisto ou precise reagendar, avise por aqui com antecedência. Estamos te esperando! ✨`;
}

export function formatarMensagemLembrete2h(cfg, a) {
  const horaFmt = String(Math.floor(a.inicio_min / 60)).padStart(2, '0') + ':' + String(a.inicio_min % 60).padStart(2, '0');
  const servicosTexto = a.servicos && a.servicos.length > 0 ? a.servicos.map((s) => s.nome).join(', ') : 'Atendimento';
  const localTexto = a.local === 'espaco'
    ? (cfg.endereco_espaco ? `No espaço (${cfg.endereco_espaco})` : 'No espaço de atendimento')
    : (a.endereco ? `A domicílio: ${a.endereco}` : 'A domicílio');
  const nomeNegocio = cfg.nome_negocio || 'Jerusa Beauty';

  return `Oi, *${a.cliente_nome}*! ✨

Seu atendimento na *${nomeNegocio}* é daqui a pouco!

⏰ *Horário:* ${horaFmt} (hoje)
💅 *Serviço(s):* ${servicosTexto}
📍 *Local:* ${localTexto}

Já estamos preparando tudo para te receber com muito carinho! 💕`;
}

export async function processarLembretes(db, env) {
  await garantirColunasLembretes(db);

  const agora = agoraLocal();
  const agoraMs = Date.now();
  const cfg = await carregarConfig(db);
  const dataHoje = agora.data;
  const dataLimite = addDias(dataHoje, 2);

  const { results: agendamentos } = await db.prepare(`
    SELECT a.id, a.cliente_id, a.data, a.inicio_min, a.duracao_min, a.local, a.endereco, a.token,
           a.status, a.criado_em, a.lembrete_24h_enviado, a.lembrete_2h_enviado,
           c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    WHERE a.status = 'agendado'
      AND a.data >= ?1
      AND a.data <= ?2
    ORDER BY a.data ASC, a.inicio_min ASC
  `).bind(dataHoje, dataLimite).all();

  const resultados = { processados: 0, enviados_24h: 0, enviados_2h: 0, erros: [] };

  for (const a of (agendamentos || [])) {
    resultados.processados++;
    if (!a.cliente_whatsapp) continue;

    const inicioMs = inicioEmMs(a.data, a.inicio_min);
    const diffMin = Math.round((inicioMs - agoraMs) / 60000);
    const idadeAgendamentoMin = Math.round((agoraMs - a.criado_em) / 60000);

    // Se o atendimento já aconteceu no passado, marca ambos como enviados para não reprocessar
    if (diffMin < 0) {
      if (!a.lembrete_24h_enviado || !a.lembrete_2h_enviado) {
        await db.prepare('UPDATE agendamentos SET lembrete_24h_enviado = 1, lembrete_2h_enviado = 1 WHERE id = ?1').bind(a.id).run();
      }
      continue;
    }

    // Busca serviços vinculados ao agendamento
    const { results: servicos } = await db.prepare(
      'SELECT nome FROM agendamento_servicos WHERE agendamento_id = ?1'
    ).bind(a.id).all();
    const agendamentoCompleto = { ...a, servicos: servicos || [] };

    // 1. Lembrete de 24h
    // Condições: ainda não enviado, falta entre 3h e 24h (1440 min), e agendado há mais de 30min
    if (!a.lembrete_24h_enviado && diffMin <= 1440 && diffMin >= 180 && idadeAgendamentoMin >= 30) {
      try {
        const mensagem = formatarMensagemLembrete24h(cfg, agendamentoCompleto);
        await enviarMensagemZap(env, { numero: a.cliente_whatsapp, mensagem });
        await db.prepare('UPDATE agendamentos SET lembrete_24h_enviado = 1 WHERE id = ?1').bind(a.id).run();
        resultados.enviados_24h++;
      } catch (err) {
        resultados.erros.push(`24h id ${a.id}: ${err.message}`);
      }
    }

    // 2. Lembrete de 2h
    // Condições: ainda não enviado, falta entre 10min e 120min, e agendado há mais de 30min
    if (!a.lembrete_2h_enviado && diffMin <= 120 && diffMin >= 10 && idadeAgendamentoMin >= 30) {
      try {
        const mensagem = formatarMensagemLembrete2h(cfg, agendamentoCompleto);
        await enviarMensagemZap(env, { numero: a.cliente_whatsapp, mensagem });
        await db.prepare('UPDATE agendamentos SET lembrete_2h_enviado = 1 WHERE id = ?1').bind(a.id).run();
        resultados.enviados_2h++;
      } catch (err) {
        resultados.erros.push(`2h id ${a.id}: ${err.message}`);
      }
    }
  }

  // Se estiver em horário comercial, também processa um lote seguro de fidelização e felicitações de aniversário
  const ehHorarioComercial = agora.min >= 600 && agora.min <= 1020 && diaSemana(agora.data) !== 0;
  if (ehHorarioComercial) {
    try {
      resultados.fidelizacao = await processarFidelizacao(db, env, { forcar: false, limite: 5 });
    } catch (err) {
      resultados.erros.push(`fidelizacao: ${err.message}`);
    }
    try {
      resultados.aniversarios = await processarAniversarios(db, env, { forcar: false, limite: 10 });
    } catch (err) {
      resultados.erros.push(`aniversarios: ${err.message}`);
    }
  }

  return resultados;
}

export function formatarMensagemFidelizacao(cfg, cliente, linkAgendamento) {
  const primeiroNome = cliente.nome ? cliente.nome.split(' ')[0] : 'Cliente';
  const nomeNegocio = cfg.nome_negocio || 'Jerusa Beauty';

  return `Olá, *${primeiroNome}*! Tudo bem? ✨

Sentimos sua falta aqui na *${nomeNegocio}*! Já faz alguns dias desde o seu último atendimento com a gente. 💕

Que tal reservar um tempinho para cuidar de você e renovar suas unhas? 💅

Você pode escolher o seu dia e horário com toda facilidade pelo nosso link:
👉 ${linkAgendamento}

Se precisar de qualquer ajuda ou tiver alguma dúvida, é só responder por aqui. Estamos te esperando com muito carinho! ✨`;
}

export async function processarFidelizacao(db, env, { forcar = false, limite = 5, link = null } = {}) {
  await garantirColunasLembretes(db);

  const agora = agoraLocal();
  const cfg = await carregarConfig(db);
  const diasSumido = cfg.alerta_sumidos_dias || 15;
  const linkAgendamento = link || (env?.SITE_URL || 'https://jerusa-beauty.pages.dev/').replace(/\/+$/, '') + '/';

  // Proteção 1: Horário comercial (10h às 17h, exceto domingo), a menos que forçado pelo admin
  const diaSem = diaSemana(agora.data);
  const ehHorarioComercial = agora.min >= 600 && agora.min <= 1020 && diaSem !== 0;
  if (!forcar && !ehHorarioComercial) {
    return { status: 'ignorado_fora_horario_comercial', enviados: 0 };
  }

  // Proteção 2: Anti-Spam (intervalo de 30 dias) + sem agendamento futuro
  const dataCorteAusencia = addDias(agora.data, -diasSumido);
  const dataCorteSpam = addDias(agora.data, -30);

  const { results: elegiveis } = await db.prepare(`
    SELECT c.id, c.nome, c.whatsapp, MAX(a.data) AS ultimo_atendimento, c.ultimo_aviso_fidelizacao
    FROM clientes c
    JOIN agendamentos a ON a.cliente_id = c.id AND a.status = 'concluido'
    WHERE NOT EXISTS (
      SELECT 1 FROM agendamentos f
      WHERE f.cliente_id = c.id AND f.status = 'agendado' AND f.data >= ?1
    )
    AND (c.ultimo_aviso_fidelizacao IS NULL OR c.ultimo_aviso_fidelizacao <= ?2)
    GROUP BY c.id
    HAVING MAX(a.data) <= ?3
    ORDER BY MAX(a.data) DESC
    LIMIT ?4
  `).bind(agora.data, dataCorteSpam, dataCorteAusencia, limite).all();

  const resultados = { enviados: 0, total_elegiveis: elegiveis?.length || 0, erros: [] };

  for (let i = 0; i < (elegiveis || []).length; i++) {
    const c = elegiveis[i];
    if (!c.whatsapp) continue;

    // Proteção 3: Delay humanizado aleatório entre 3 e 6 segundos entre mensagens
    if (i > 0) {
      const pausaMs = Math.floor(3000 + Math.random() * 3000);
      await new Promise((r) => setTimeout(r, pausaMs));
    }

    try {
      const mensagem = formatarMensagemFidelizacao(cfg, c, linkAgendamento);
      await enviarMensagemZap(env, { numero: c.whatsapp, mensagem });
      await db.prepare('UPDATE clientes SET ultimo_aviso_fidelizacao = ?1 WHERE id = ?2').bind(agora.data, c.id).run();
      resultados.enviados++;
    } catch (err) {
      resultados.erros.push(`cliente ${c.id}: ${err.message}`);
    }
  }

  return resultados;
}

export function extrairDiaMesAniversario(str) {
  if (!str || typeof str !== 'string') return null;
  const limpo = str.trim();
  const match = limpo.match(/^(\d{1,2})\s*[\/-]\s*(\d{1,2})$/);
  if (!match) return null;
  const dia = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  if (isNaN(dia) || isNaN(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) {
    return null;
  }
  return { dia, mes };
}

export function ehAniversarioHoje(cliente, dataStr) {
  if (!cliente || !cliente.aniversario_dia || !cliente.aniversario_mes || !dataStr) return false;
  const [, mesStr, diaStr] = dataStr.split('-');
  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10);
  return cliente.aniversario_dia === dia && cliente.aniversario_mes === mes;
}

export function formatarMensagemAniversario(cfg, cliente, linkAgendamento) {
  const primeiroNome = cliente.nome ? cliente.nome.split(' ')[0] : 'Cliente';
  const nomeNegocio = cfg.nome_negocio || 'Jerusa Beauty';

  return `Parabéns, *${primeiroNome}*! 🎂✨

Hoje é o seu dia especial e a *${nomeNegocio}* deseja a você um ano incrível, repleto de momentos felizes, saúde e realizações! 💕

Para comemorar com muito carinho, você tem um *mimo especial* no seu próximo atendimento com a gente neste mês do seu aniversário! 💅🎁

Quando quiser reservar o seu momento exclusivo, é só acessar o link:
👉 ${linkAgendamento}

Tenha um dia maravilhoso e iluminado! ✨`;
}

export async function processarAniversarios(db, env, { forcar = false, limite = 10, link = null } = {}) {
  await garantirColunasLembretes(db);

  const agora = agoraLocal();
  const cfg = await carregarConfig(db);
  const linkAgendamento = link || (env?.SITE_URL || 'https://jerusa-beauty.pages.dev/').replace(/\/+$/, '') + '/';

  const [anoAtualStr, mesAtualStr, diaAtualStr] = agora.data.split('-');
  const anoAtual = parseInt(anoAtualStr, 10);
  const mesAtual = parseInt(mesAtualStr, 10);
  const diaAtual = parseInt(diaAtualStr, 10);

  // Horário comercial: a partir das 10h até 17h, exceto domingo (a menos que forçado)
  const diaSem = diaSemana(agora.data);
  const ehHorarioApropriado = agora.min >= 600 && agora.min <= 1020 && diaSem !== 0;
  if (!forcar && !ehHorarioApropriado) {
    return { status: 'ignorado_fora_horario_comercial', enviados: 0 };
  }

  const { results: aniversariantes } = await db.prepare(`
    SELECT id, nome, whatsapp, aniversario_dia, aniversario_mes, ultimo_aviso_aniversario_ano
    FROM clientes
    WHERE aniversario_dia = ?1
      AND aniversario_mes = ?2
      AND (ultimo_aviso_aniversario_ano IS NULL OR ultimo_aviso_aniversario_ano < ?3)
    ORDER BY id ASC
    LIMIT ?4
  `).bind(diaAtual, mesAtual, anoAtual, limite).all();

  const resultados = { enviados: 0, total_aniversariantes: aniversariantes?.length || 0, erros: [] };

  for (let i = 0; i < (aniversariantes || []).length; i++) {
    const c = aniversariantes[i];
    if (!c.whatsapp) continue;

    if (i > 0) {
      const pausaMs = Math.floor(3000 + Math.random() * 3000);
      await new Promise((r) => setTimeout(r, pausaMs));
    }

    try {
      const mensagem = formatarMensagemAniversario(cfg, c, linkAgendamento);
      await enviarMensagemZap(env, { numero: c.whatsapp, mensagem });
      await db.prepare('UPDATE clientes SET ultimo_aviso_aniversario_ano = ?1 WHERE id = ?2').bind(anoAtual, c.id).run();
      resultados.enviados++;
    } catch (err) {
      resultados.erros.push(`aniversariante ${c.id}: ${err.message}`);
    }
  }

  return resultados;
}
