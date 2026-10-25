// Teste de integração da API contra um servidor local (npm run dev) com o banco recém-criado.
// Uso: node scripts/integracao.mjs [http://127.0.0.1:8788]
const BASE = process.argv[2] || 'http://127.0.0.1:8788';
let cookie = '';
let falhas = 0, total = 0;

async function req(metodo, caminho, corpo, { semCookie = false, headers = {} } = {}) {
  const r = await fetch(BASE + '/api' + caminho, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie && !semCookie ? { cookie } : {}), ...headers },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc && /^sid=[a-f0-9]/.test(sc)) cookie = sc.split(';')[0];
  let dados = {}; try { dados = await r.json(); } catch {}
  return { status: r.status, dados };
}
function ok(cond, nome, extra = '') {
  total++;
  if (cond) console.log('  ✓', nome);
  else { falhas++; console.log('  ✗', nome, extra); }
}
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somaDias = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

console.log('# público');
let r = await req('GET', '/publico/config');
ok(r.status === 200 && r.dados.servicos.length === 8, '8 serviços cadastrados', JSON.stringify(r.dados).slice(0, 120));
const maoEPe = r.dados.servicos.find((s) => s.nome === 'Mão e pé');
const soMao = r.dados.servicos.find((s) => s.nome === 'Só mão');
ok(maoEPe.preco_centavos === 5000 && maoEPe.duracao_min === 70, 'Mão e pé: R$ 50,00 / 70 min');

r = await req('GET', `/publico/disponibilidade?servicos=${maoEPe.id}&local=espaco`);
ok(r.status === 200 && Object.keys(r.dados.dias).length > 15, 'há dias livres na janela', JSON.stringify(r.dados).slice(0, 100));
ok(!r.dados.dias[somaDias(hoje(), 31)], 'nada além da janela de 30 dias');
const dias = Object.keys(r.dados.dias);
const dia = dias.find((d) => d >= somaDias(hoje(), 2));
const slots = r.dados.dias[dia];
ok(slots[0] === 480, `primeiro horário de ${dia} é 08:00`);
ok(!slots.some((s) => s > 650 && s < 780), 'pausa de almoço respeitada');

r = await req('GET', `/publico/disponibilidade?servicos=${maoEPe.id}&local=domicilio`);
ok(r.status === 200, 'disponibilidade a domicílio');
r = await req('GET', `/publico/disponibilidade?servicos=999&local=espaco`);
ok(r.status === 400, 'serviço inexistente → 400');
r = await req('GET', `/publico/disponibilidade?servicos=${maoEPe.id}&local=lua`);
ok(r.status === 400, 'local inválido → 400');

console.log('# agendar');
const corpoBase = { servicos: [maoEPe.id], local: 'espaco', data: dia, inicio_min: 480, nome: 'Maria Teste', whatsapp: '(83) 99999-1111' };
r = await req('POST', '/publico/agendar', corpoBase);
ok(r.status === 201 && /^[a-f0-9]{32}$/.test(r.dados.token), 'agendamento criado', JSON.stringify(r.dados));
const token = r.dados.token;
r = await req('POST', '/publico/agendar', { ...corpoBase, nome: 'Outra Pessoa', whatsapp: '83988887777' });
ok(r.status === 409 && r.dados.erro === 'horario_indisponivel', 'mesmo horário → 409');

r = await req('GET', `/publico/disponibilidade?servicos=${maoEPe.id}&local=espaco`);
const depois = r.dados.dias[dia];
ok(!depois.includes(480) && !depois.includes(510) && !depois.includes(540), 'horários colados ao atendimento somem');
ok(depois.includes(480 + 70 + 15), 'encaixe colado em 09:25 (70 min + 15 de respiro)');
r = await req('GET', `/publico/disponibilidade?servicos=${soMao.id}&local=domicilio`);
ok(r.dados.dias[dia].includes(480 + 70 + 15), 'a domicílio: 15 min de deslocamento (não soma com respiro)');

r = await req('POST', '/publico/agendar', { ...corpoBase, local: 'domicilio', inicio_min: 565, nome: 'Dom Teste', whatsapp: '83977776666' });
ok(r.status === 400, 'domicílio sem endereço → 400');
r = await req('POST', '/publico/agendar', { ...corpoBase, inicio_min: 700, whatsapp: '123' });
ok(r.status === 400, 'WhatsApp inválido → 400');
r = await req('POST', '/publico/agendar', { ...corpoBase, inicio_min: 481, nome: 'X Y', whatsapp: '83955554444' });
ok(r.status === 409, 'minuto fora da grade → 409');
r = await req('POST', '/publico/agendar', { ...corpoBase, data: somaDias(hoje(), -1), inicio_min: 480, nome: 'Ontem', whatsapp: '83955554444' });
ok(r.status === 409, 'data passada → 409');

console.log('# concorrência: 6 pedidos simultâneos para o mesmo horário');
const alvo = depois.find((s) => s >= 600 && s <= 660) ?? depois[3];
const simult = await Promise.all(Array.from({ length: 6 }, (_, i) =>
  req('POST', '/publico/agendar', { ...corpoBase, inicio_min: alvo, nome: `Cliente ${i}x`, whatsapp: `8399000000${i}` })));
ok(simult.filter((x) => x.status === 201).length === 1, 'exatamente 1 vence', simult.map((x) => x.status).join(','));

console.log('# meu agendamento');
r = await req('GET', `/publico/agendamento/${token}`);
ok(r.status === 200 && r.dados.servicos[0].nome === 'Mão e pé' && r.dados.pode_cancelar === true, 'consulta pelo link e pode cancelar (≥12h)', JSON.stringify(r.dados).slice(0, 150));
ok(r.dados.id === undefined, 'não expõe id interno');
r = await req('GET', `/publico/agendamento/zzzz`);
ok(r.status === 404, 'token inválido → 404');

console.log('# admin: acesso');
r = await req('GET', '/admin/painel', undefined, { semCookie: true });
ok(r.status === 401, 'painel sem login → 401');
r = await req('GET', '/admin/estado');
ok(r.dados.configurado === false && r.dados.logado === false, 'estado inicial: sem senha');
r = await req('POST', '/admin/configurar-senha', { senha: '123' });
ok(r.status === 400, 'senha curta recusada');
r = await req('POST', '/admin/configurar-senha', { senha: 'esmalte2026' });
ok(r.status === 200 && cookie.startsWith('sid='), 'senha criada e sessão aberta');
r = await req('POST', '/admin/configurar-senha', { senha: 'outra-senha' });
ok(r.status === 409, 'não dá para recriar a senha');
r = await req('GET', '/admin/estado');
ok(r.dados.logado === true, 'sessão válida');
r = await req('POST', '/admin/agendamentos', {}, { headers: { origin: 'http://evil.example' } });
ok(r.status === 403, 'origem externa bloqueada (CSRF)');

console.log('# admin: configurações');
r = await req('PUT', '/admin/config', { whatsapp: '(83) 98888-0000', pix_tipo: 'telefone', pix_chave: '(83) 98888-0000', pix_nome: 'Jussara Soares', pix_cidade: 'Campina Grande', antecedencia_min: 60 });
ok(r.status === 200 && r.dados.config.whatsapp === '5583988880000', 'salva WhatsApp/Pix');
r = await req('PUT', '/admin/config', { atende_espaco: false, atende_domicilio: false });
ok(r.status === 400, 'não deixa desligar os dois tipos de atendimento');
r = await req('PUT', '/admin/config', { respiro_min: -3 });
ok(r.status === 400, 'valor fora do limite → 400');
r = await req('GET', '/admin/config');
ok(r.dados.expediente.length === 7 && r.dados.config.respiro_min === 15 && r.dados.config.deslocamento_min === 15, 'padrões: 15 min de respiro e deslocamento');
const exp = r.dados.expediente.map((e) => ({ ...e }));
exp[1].pausa_inicio_min = 400;
r = await req('PUT', '/admin/expediente', { dias: exp });
ok(r.status === 400, 'pausa fora do expediente → 400');

console.log('# admin: atendimento completo');
const ini = somaDias(hoje(), 2), fim = somaDias(hoje(), 40);
r = await req('GET', `/admin/agendamentos?de=${ini}&ate=${fim}`);
const meu = r.dados.agendamentos.find((a) => a.cliente_nome === 'Maria Teste');
ok(!!meu && meu.cliente_whatsapp === '5583999991111' && meu.preco_tabela_centavos === 5000, 'agendamento aparece com cliente e preço de tabela');

r = await req('PATCH', `/admin/agendamentos/${meu.id}`, { status: 'concluido', valor_cobrado_centavos: 4500, forma_pagamento: 'pix', pago: false });
ok(r.status === 200 && r.dados.agendamento.status === 'concluido' && r.dados.agendamento.valor_cobrado_centavos === 4500, 'concluído com desconto no local (R$ 45,00)');
const mes = dia.slice(0, 7);
r = await req('GET', `/admin/financeiro?mes=${mes}`);
ok(r.dados.faturado_centavos === 4500 && r.dados.descontos_centavos === 500 && r.dados.a_receber_centavos === 4500 && r.dados.recebido_centavos === 0,
  'financeiro: faturado 45, desconto 5, a receber 45', JSON.stringify(r.dados).slice(0, 220));
ok(r.dados.a_receber_lista.length === 1, 'lista "a receber"');
await req('PATCH', `/admin/agendamentos/${meu.id}`, { pago: true });
r = await req('GET', `/admin/financeiro?mes=${mes}`);
ok(r.dados.recebido_centavos === 4500 && r.dados.a_receber_centavos === 0, 'marcar como pago move para recebido');
ok(r.dados.por_servico[0].nome === 'Mão e pé' && r.dados.por_servico[0].qtd === 1, 'resumo por serviço');

r = await req('POST', '/admin/despesas', { descricao: 'Esmaltes', valor_centavos: 1200, data: dia, categoria: 'Material' });
ok(r.status === 201, 'despesa criada');
const despId = r.dados.id;
r = await req('GET', `/admin/financeiro?mes=${mes}`);
ok(r.dados.despesas_centavos === 1200 && r.dados.lucro_centavos === 3300, 'lucro = faturado − despesas');
r = await req('DELETE', `/admin/despesas/${despId}`);
ok(r.status === 200, 'despesa removida');

console.log('# admin: remarcar, manual, bloqueio');
r = await req('GET', `/admin/agendamentos?de=${ini}&ate=${fim}`);
const outro = r.dados.agendamentos.find((a) => a.cliente_nome.endsWith('x') && a.status === 'agendado');
ok(!!outro, 'achou o agendamento vencedor da corrida');
r = await req('PATCH', `/admin/agendamentos/${outro.id}`, { data: meu.data, inicio_min: meu.inicio_min });
ok(r.status === 409, 'remarcar para cima de outro atendimento → 409');
r = await req('PATCH', `/admin/agendamentos/${outro.id}`, { inicio_min: 900 });
ok(r.status === 200 && r.dados.agendamento.inicio_min === 900, 'remarcar para horário livre');

const clientes = (await req('GET', '/admin/clientes')).dados.clientes;
const cm = clientes.find((c) => c.nome === 'Maria Teste');
ok(cm.atendimentos === 1 && cm.total_centavos === 4500, 'cliente com 1 atendimento e total gasto');
r = await req('POST', '/admin/agendamentos', { cliente_id: cm.id, servicos: [soMao.id, maoEPe.id], local: 'domicilio', endereco: 'Rua das Flores, 10', referencia: 'Portão azul', data: somaDias(dia, 1), inicio_min: 540 });
ok(r.status === 201, 'agendamento manual com 2 serviços a domicílio');
r = await req('GET', `/admin/agendamentos?de=${somaDias(dia, 1)}&ate=${somaDias(dia, 1)}`);
const manual = r.dados.agendamentos[0];
ok(manual.duracao_min === 115 && manual.preco_tabela_centavos === 8000, 'soma duração (45+70) e preço (30+50)');
r = await req('POST', '/admin/agendamentos', { cliente_id: cm.id, servicos: [soMao.id], local: 'espaco', data: somaDias(dia, 1), inicio_min: 540 + 115 + 10 });
ok(r.status === 409, 'manual dentro do intervalo de deslocamento → 409');

const dBloq = somaDias(dia, 3);
r = await req('POST', '/admin/bloqueios', { data: dBloq, dia_todo: true, motivo: 'Folga' });
ok(r.status === 201, 'bloqueio de dia inteiro');
r = await req('GET', `/publico/disponibilidade?servicos=${soMao.id}&local=espaco`);
ok(!r.dados.dias[dBloq], 'dia bloqueado some para o cliente');
const bId = (await req('GET', '/admin/config')).dados.bloqueios[0].id;
await req('DELETE', `/admin/bloqueios/${bId}`);
r = await req('GET', `/publico/disponibilidade?servicos=${soMao.id}&local=espaco`);
ok(!!r.dados.dias[dBloq], 'dia volta após remover o bloqueio');

console.log('# serviços');
r = await req('POST', '/admin/servicos', { nome: 'Teste', descricao: '', preco_centavos: 2500, duracao_min: 30 });
ok(r.status === 201, 'cria serviço');
const sid = r.dados.id;
await req('PUT', `/admin/servicos/${sid}`, { nome: 'Teste 2', descricao: '', preco_centavos: 2500, duracao_min: 30, ativo: false });
r = await req('GET', '/publico/config');
ok(!r.dados.servicos.some((s) => s.id === sid), 'serviço inativo não aparece para o cliente');
await req('POST', `/admin/servicos/${sid}/mover`, { direcao: 'cima' });
await req('DELETE', `/admin/servicos/${sid}`);

console.log('# cancelamento pelo cliente');
r = await req('POST', `/publico/agendamento/${token}/cancelar`, {});
ok(r.status === 409 && r.dados.erro === 'nao_cancelavel', 'atendimento já concluído não cancela pelo link');
const livres2 = (await req('GET', `/publico/disponibilidade?servicos=${soMao.id}&local=espaco`)).dados.dias[somaDias(dia, 2)];
r = await req('POST', '/publico/agendar', { servicos: [soMao.id], local: 'espaco', data: somaDias(dia, 2), inicio_min: livres2[0], nome: 'Cancelar Teste', whatsapp: '83911112222' });
const tk2 = r.dados.token;
r = await req('POST', `/publico/agendamento/${tk2}/cancelar`, {});
ok(r.status === 200, 'cancela pelo link com antecedência');
r = await req('GET', `/publico/agendamento/${tk2}`);
ok(r.dados.status === 'cancelado', 'status vira cancelado');
r = await req('GET', `/publico/disponibilidade?servicos=${soMao.id}&local=espaco`);
ok(r.dados.dias[somaDias(dia, 2)].includes(livres2[0]), 'horário cancelado volta a ficar livre');

console.log('# painel');
r = await req('GET', '/admin/painel');
ok(r.status === 200 && r.dados.mes.faturado_centavos >= 0 && Array.isArray(r.dados.agendamentos_hoje), 'painel responde');

console.log('# login e bloqueio por tentativas');
r = await req('POST', '/admin/logout', {});
r = await req('GET', '/admin/painel', undefined, { semCookie: true });
ok(r.status === 401, 'logout encerra a sessão');
for (let i = 0; i < 5; i++) r = await req('POST', '/admin/login', { senha: 'errada' + i }, { semCookie: true });
ok(r.status === 401, '5 senhas erradas → 401');
r = await req('POST', '/admin/login', { senha: 'esmalte2026' }, { semCookie: true });
ok(r.status === 429, 'depois de 5 erros, bloqueia (429) até passar 15 min');

console.log(`\n${total - falhas}/${total} verificações passaram`);
process.exit(falhas ? 1 : 0);
