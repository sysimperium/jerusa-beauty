import {
  esc, moeda, duracao, hora, campoParaMin, minParaCampo, dataLonga, dataCurta, diaSemanaCurto, diaDoMes, mesNome, mesAno, somaDias, somaMeses,
  lerDinheiro, centavosParaCampo, mascaraWhatsapp, linkWhatsapp, api, qrSvg, copiar, aviso, confirmar, ajustarExclusividadeServicos,
} from '/js/comum.js';
import { gerarBrCode } from '/js/pix.js';

const raiz = document.getElementById('raiz');
const S = {
  aba: 'inicio', dia: null, mes: null, hoje: null, config: null, servicos: null,
  ocultarValores: (() => { try { return localStorage.getItem('admin_ocultar_valores') === '1'; } catch { return false; } })()
};
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hojeLocal = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const nomeLocal = (l) => (l === 'domicilio' ? 'Domicílio' : 'Espaço');
const valorDe = (a) => a.valor_cobrado_centavos ?? a.preco_tabela_centavos;
const maps = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const saudacao = () => { const h = new Date(Date.now() - 3 * 3600000).getUTCHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

const ICONES = {
  inicio: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  agenda: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  financeiro: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.7 2.2 0 0 1 9.5 15M12 6v1.5M12 16.5V18"/>',
  servicos: '<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7 4 8.8 9.6 8z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
  esq: '<path d="M15 6l-6 6 6 6"/>', dir: '<path d="M9 6l6 6-6 6"/>',
  olho: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  olhoFechado: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
};
const icone = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;

async function seguro(fn) {
  try { return await fn(); } catch (e) {
    if (e.status === 401) { telaEntrada(); return null; }
    aviso(e.message, true); return null;
  }
}

// ======================================================================== entrada
async function iniciar() {
  let est;
  try { est = await api('/admin/estado'); } catch (e) {
    raiz.innerHTML = `<div class="login"><div class="aviso erro">${esc(e.message)}</div></div>`; return;
  }
  if (!est.configurado) return telaEntrada(true);
  if (!est.logado) return telaEntrada(false);
  S.hoje = hojeLocal(); S.dia = S.hoje; S.mes = S.hoje.slice(0, 7);
  montar();
}

function telaEntrada(primeira = false, msg = '') {
  raiz.innerHTML = `<main class="login">
    <img src="/img/logo.png" alt="" width="120" height="120">
    <h1 class="assinatura">${primeira ? 'Bem-vinda' : 'Minha agenda'}</h1>
    <p class="suave">${primeira ? 'Crie uma senha para proteger a sua agenda e o seu financeiro.' : 'Digite a sua senha para entrar.'}</p>
    ${msg ? `<div class="aviso erro" role="alert">${esc(msg)}</div>` : ''}
    <form id="f" novalidate>
      <div class="campo"><label for="senha">${primeira ? 'Nova senha (mínimo 6 caracteres)' : 'Senha'}</label>
        <input id="senha" type="password" autocomplete="${primeira ? 'new-password' : 'current-password'}" required></div>
      ${primeira ? `<div class="campo"><label for="senha2">Repita a senha</label><input id="senha2" type="password" autocomplete="new-password" required></div>
        <div class="campo"><label for="codigo">Código de instalação (se existir)</label><input id="codigo" autocomplete="off"><span class="dica">Só preencha se quem instalou o sistema configurou um código.</span></div>` : ''}
      <div class="acoes"><button class="botao" type="submit">${primeira ? 'Criar senha e entrar' : 'Entrar'}</button></div>
    </form></main>`;
  document.getElementById('f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const senha = document.getElementById('senha').value;
    if (primeira && senha !== document.getElementById('senha2').value) return telaEntrada(true, 'As senhas não são iguais.');
    const b = ev.target.querySelector('button'); b.classList.add('carregando');
    try {
      await api(primeira ? '/admin/configurar-senha' : '/admin/login', { metodo: 'POST', corpo: { senha, codigo: document.getElementById('codigo')?.value || undefined } });
      iniciar();
    } catch (e) { telaEntrada(primeira, e.message); }
  });
}

// ======================================================================== casca
function montar() {
  raiz.innerHTML = `<div class="admin-corpo"><main class="coluna larga" id="conteudo"></main></div>
    <div class="abas"><nav aria-label="Seções">${[['inicio', 'Início'], ['agenda', 'Agenda'], ['financeiro', 'Financeiro'], ['servicos', 'Serviços'], ['ajustes', 'Ajustes']]
      .map(([k, t]) => `<button data-aba="${k}" ${S.aba === k ? 'aria-current="page"' : ''}>${icone(k)}<span>${t}</span></button>`).join('')}</nav></div>`;
  raiz.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.aba)));
  desenhar();
}
function ir(aba) {
  S.aba = aba;
  raiz.querySelectorAll('[data-aba]').forEach((b) => (b.dataset.aba === aba ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  window.scrollTo(0, 0); desenhar();
}
const conteudo = () => document.getElementById('conteudo');
function desenhar() {
  if (S.zapIntervalo) { clearInterval(S.zapIntervalo); S.zapIntervalo = null; }
  conteudo().innerHTML = '<p class="carregando-pagina">Carregando…</p>';
  ({ inicio: telaInicio, agenda: telaAgenda, financeiro: telaFinanceiro, servicos: telaServicos, ajustes: telaAjustes })[S.aba]();
}

// ======================================================================== folha (bottom sheet)
function folha(html, aoAbrir) {
  fecharFolha();
  const c = document.createElement('div'); c.className = 'cortina'; c.id = 'cortina';
  c.innerHTML = `<div class="folha" role="dialog" aria-modal="true"><div class="alca"></div>${html}</div>`;
  c.addEventListener('click', (e) => { if (e.target === c) fecharFolha(); });
  document.body.appendChild(c); document.body.style.overflow = 'hidden';
  aoAbrir?.(c.querySelector('.folha'));
  c.querySelector('[autofocus]')?.focus();
  return c;
}
function fecharFolha() { document.getElementById('cortina')?.remove(); document.body.style.overflow = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFolha(); });

// ======================================================================== atendimento (cartão + ações)
function linhaAtendimento(a, agoraMin = null) {
  const dom = a.local === 'domicilio';
  const etiq = [];
  if (dom) etiq.push('<span class="selo-texto dom">Domicílio</span>');
  let pendenteFechamento = false;
  if (a.status === 'concluido') {
    etiq.push('<span class="selo-texto ok">✓ Concluído</span>');
    if (!a.pago) etiq.push('<span class="selo-texto pend">A receber</span>');
    else etiq.push('<span class="selo-texto ok">Pago</span>');
  } else if (a.status === 'cancelado') {
    etiq.push('<span class="selo-texto">Cancelado</span>');
  } else if (a.status === 'faltou') {
    etiq.push('<span class="selo-texto">Faltou</span>');
  } else if (a.status === 'agendado') {
    if (agoraMin != null && a.data === S.hoje) {
      if (agoraMin >= a.inicio_min + a.duracao_min) {
        pendenteFechamento = true;
        etiq.push('<span class="selo-texto atencao">⚠️ Aguardando baixa</span>');
      } else if (agoraMin >= a.inicio_min) {
        etiq.push('<span class="selo-texto agora">Em atendimento</span>');
      } else if (agoraMin >= a.inicio_min - 30) {
        etiq.push('<span class="selo-texto proximo">A seguir</span>');
      }
    }
  }
  const periodo = a.inicio_min < 720 ? 'Manhã' : (a.inicio_min < 1080 ? 'Tarde' : 'Noite');
  return `<button class="atendimento card-atendimento ${a.status}${pendenteFechamento ? ' pendente-fechamento' : ''}" data-id="${a.id}">
    <span class="hora-txt">${hora(a.inicio_min)}<small>${periodo} · ${duracao(a.duracao_min)}</small></span>
    <span><span class="cliente">${esc(a.cliente_nome)}</span><span class="servicos" style="display:block">${a.servicos.map((s) => esc(s.nome)).join(' + ')}</span></span>
    <span class="etiquetas">${etiq.join('')}<span class="valor-txt">${moeda(valorDe(a))}</span></span></button>`;
}

function ligarAtendimentos(lista, recarregar) {
  conteudo().querySelectorAll('.atendimento').forEach((b) => b.addEventListener('click', () => {
    const a = lista.find((x) => x.id === Number(b.dataset.id));
    if (a) abrirAtendimento(a, recarregar);
  }));
}

function abrirAtendimento(a, recarregar) {
  const dom = a.local === 'domicilio';
  const aberto = a.status === 'agendado';
  const agoraMinHoje = S.hoje ? (new Date(Date.now() - 3 * 3600000).getUTCHours() * 60 + new Date(Date.now() - 3 * 3600000).getUTCMinutes()) : null;
  const atrasado = aberto && a.data === S.hoje && agoraMinHoje != null && agoraMinHoje >= a.inicio_min + a.duracao_min;
  const msgCliente = `Olá, ${a.cliente_nome.split(' ')[0]}! Confirmando seu horário: ${a.servicos.map((s) => s.nome).join(' + ')}, ${dataLonga(a.data)} às ${hora(a.inicio_min)}${dom ? ' (no seu endereço)' : ''}. Até lá! 💅`;
  folha(`
    <h2>${esc(a.cliente_nome)}</h2>
    <p class="suave">${esc(dataLonga(a.data))}, ${hora(a.inicio_min)} às ${hora(a.inicio_min + a.duracao_min)} · ${nomeLocal(a.local)}</p>
    ${atrasado ? `
    <div style="margin:12px 0;background:#fffdf7;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 14px;color:#92400e">
      <strong style="display:block;font-size:.9rem;margin-bottom:2px">⚠️ Atendimento concluído?</strong>
      <span class="pequeno" style="color:#78350f">O horário previsto já encerrou. Confirme a conclusão abaixo ou escolha reagendar caso não tenha acontecido.</span>
    </div>` : ''}
    <dl class="resumo">
      ${a.servicos.map((s) => `<div><dt>${esc(s.nome)}</dt><dd>${moeda(s.preco_centavos)}</dd></div>`).join('')}
      ${a.valor_cobrado_centavos != null && a.valor_cobrado_centavos !== a.preco_tabela_centavos ? `<div><dt>Valor cobrado</dt><dd>${moeda(a.valor_cobrado_centavos)}</dd></div>` : ''}
      ${dom && a.endereco ? `<div><dt>Endereço</dt><dd>${esc(a.endereco)}${a.referencia ? `<br><span class="suave pequeno">${esc(a.referencia)}</span>` : ''}</dd></div>` : ''}
      ${a.observacoes ? `<div><dt>Observação</dt><dd>${esc(a.observacoes)}</dd></div>` : ''}
    </dl>
    <div class="acoes">
      ${aberto ? '<button class="botao" data-acao="concluir">Concluir atendimento</button>' : ''}
      ${a.status === 'concluido' && !a.pago ? '<button class="botao" data-acao="pagar">Marcar como pago</button>' : ''}
      ${a.status === 'concluido' && a.forma_pagamento === 'pix' && !a.pago ? '<button class="botao sec" data-acao="qr">Mostrar QR Pix</button>' : ''}
      <a class="botao sec" href="${linkWhatsapp(a.cliente_whatsapp, aberto ? msgCliente : '')}">Falar no WhatsApp</a>
      ${dom && a.endereco ? `<a class="botao sec" href="${maps(a.endereco)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}
      ${aberto ? '<button class="botao sec" data-acao="remarcar">Remarcar</button>' : ''}
      ${aberto ? '<div class="acoes duas"><button class="botao sec" data-acao="faltou">Faltou</button><button class="botao perigo" data-acao="cancelar">Cancelar</button></div>' : ''}
      ${!aberto ? '<button class="botao sec" data-acao="reabrir">Voltar para agendado</button>' : ''}
    </div>`, (f) => {
    f.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      const atualizar = async (corpo, msg) => { if (await seguro(() => api(`/admin/agendamentos/${a.id}`, { metodo: 'PATCH', corpo }))) { fecharFolha(); aviso(msg); recarregar(); } };
      if (acao === 'concluir') return folhaConcluir(a, recarregar);
      if (acao === 'qr') return folhaQr(a, valorDe(a), recarregar);
      if (acao === 'pagar') return atualizar({ pago: true }, 'Marcado como pago');
      if (acao === 'faltou') return atualizar({ status: 'faltou' }, 'Marcado como falta');
      if (acao === 'reabrir') return atualizar({ status: 'agendado', pago: false }, 'Atendimento reaberto');
      if (acao === 'cancelar') {
        const ok = await confirmar({
          titulo: 'Cancelar atendimento?',
          mensagem: `Tem certeza que deseja cancelar o atendimento de ${a.cliente_nome}?`,
          textoOk: 'Sim, cancelar',
          textoCancelar: 'Voltar',
          perigo: true,
        });
        if (ok) return atualizar({ status: 'cancelado' }, 'Atendimento cancelado');
      }
      if (acao === 'remarcar') return folhaRemarcar(a, recarregar);
    }));
  });
}

function folhaRemarcar(a, recarregar) {
  folha(`<h2>Remarcar</h2><p class="suave">${esc(a.cliente_nome)}</p>
    <div class="campo"><label for="rd">Dia</label><input id="rd" type="date" value="${a.data}"></div>
    <div class="campo"><label for="rh">Horário</label><input id="rh" type="time" value="${minParaCampo(a.inicio_min)}" step="300"></div>
    <div id="rmsg"></div>
    <div class="acoes"><button class="botao" id="rok">Salvar novo horário</button><button class="botao sec" id="rno">Voltar</button></div>`, (f) => {
    f.querySelector('#rno').addEventListener('click', () => { fecharFolha(); abrirAtendimento(a, recarregar); });
    f.querySelector('#rok').addEventListener('click', async () => {
      const data = f.querySelector('#rd').value, min = campoParaMin(f.querySelector('#rh').value);
      if (!data || min == null) return;
      try {
        await api(`/admin/agendamentos/${a.id}`, { metodo: 'PATCH', corpo: { data, inicio_min: min } });
        folhaRemarcadoSucesso(a, data, min, recarregar);
      } catch (e) { f.querySelector('#rmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(e.message)}</div>`; }
    });
  });
}

function folhaRemarcadoSucesso(a, novaData, novoMin, recarregar) {
  const msgWhats = `Olá, ${a.cliente_nome.split(' ')[0]}! Seu horário de ${a.servicos.map((s) => s.nome).join(' + ')} foi remarcado para ${dataLonga(novaData)}, às ${hora(novoMin)}. Qualquer dúvida, estou por aqui! 💅`;
  folha(`<h2>Horário remarcado!</h2>
    <p class="suave">Novo agendamento salvo para <strong>${esc(a.cliente_nome)}</strong>:</p>
    <div class="aviso" style="margin:16px 0;background:rgba(212,175,55,.12);border-color:rgba(212,175,55,.4);color:var(--texto)">
      <strong style="font-size:16px;display:block">${esc(dataLonga(novaData))} às ${hora(novoMin)}</strong>
      <span class="pequeno suave" style="display:block;margin-top:4px">${a.servicos.map((s) => esc(s.nome)).join(' + ')} · ${nomeLocal(a.local)}</span>
    </div>
    <p class="suave pequeno" style="margin-bottom:16px">Avise a cliente pelo WhatsApp para ela ficar ciente do novo horário.</p>
    <div class="acoes">
      <a class="botao" href="${linkWhatsapp(a.cliente_whatsapp, msgWhats)}" target="_blank" rel="noopener">Avisar cliente no WhatsApp</a>
      <button class="botao sec" id="fechar-remarcado">Concluir</button>
    </div>`, (f) => {
    f.querySelector('#fechar-remarcado').addEventListener('click', () => { fecharFolha(); aviso('Horário atualizado'); recarregar(); });
  });
}

function folhaConcluir(a, recarregar) {
  const tabela = a.preco_tabela_centavos;
  folha(`<h2>Concluir atendimento</h2><p class="suave">${esc(a.cliente_nome)} · ${a.servicos.map((s) => esc(s.nome)).join(' + ')}</p>
    <div class="campo"><label for="valor">Valor cobrado (R$)</label><input id="valor" inputmode="decimal" value="${centavosParaCampo(tabela)}" autofocus>
      <span class="dica" id="dica">Valor de tabela: ${moeda(tabela)}</span></div>
    <div class="campo"><span class="rotulo">Forma de pagamento</span>
      <div class="segmentos" id="forma">${[['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']].map(([k, t], i) => `<button type="button" data-f="${k}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div></div>
    <label class="interruptor" style="margin-top:8px"><span>Já recebi o pagamento</span><input type="checkbox" id="pago"><span class="trilho"></span></label>
    <div id="cmsg"></div>
    <div class="acoes"><button class="botao" id="cok">Concluir</button></div>`, (f) => {
    let forma = 'pix';
    const valor = f.querySelector('#valor');
    const dica = f.querySelector('#dica');
    const atualizarDica = () => {
      const v = lerDinheiro(valor.value);
      dica.textContent = v == null ? 'Digite um valor válido' : v === tabela ? `Valor de tabela: ${moeda(tabela)}` : v < tabela ? `Desconto de ${moeda(tabela - v)} sobre ${moeda(tabela)}` : `Acréscimo de ${moeda(v - tabela)} sobre ${moeda(tabela)}`;
    };
    valor.addEventListener('input', atualizarDica);
    f.querySelectorAll('#forma button').forEach((b) => b.addEventListener('click', () => {
      forma = b.dataset.f; f.querySelectorAll('#forma button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      f.querySelector('#pago').checked = forma !== 'pix';
    }));
    f.querySelector('#cok').addEventListener('click', async () => {
      const v = lerDinheiro(valor.value);
      if (v == null) return (f.querySelector('#cmsg').innerHTML = '<div class="aviso erro" role="alert">Digite um valor válido.</div>');
      const pago = f.querySelector('#pago').checked;
      try {
        await api(`/admin/agendamentos/${a.id}`, { metodo: 'PATCH', corpo: { status: 'concluido', valor_cobrado_centavos: v, forma_pagamento: forma, pago } });
        if (forma === 'pix' && !pago) { folhaQr({ ...a, cliente_nome: a.cliente_nome }, v, recarregar); recarregar(); }
        else { fecharFolha(); aviso('Atendimento concluído'); recarregar(); }
      } catch (e) { f.querySelector('#cmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(e.message)}</div>`; }
    });
  });
}

async function config() {
  if (!S.config) S.config = (await api('/admin/config')).config;
  return S.config;
}

async function folhaQr(a, valorCentavos, recarregar) {
  const cfg = await seguro(config);
  if (!cfg) return;
  let codigo = '', problema = '';
  try { codigo = gerarBrCode({ tipo: cfg.pix_tipo, chave: cfg.pix_chave, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valorCentavos }); }
  catch (e) { problema = e.message; }
  folha(`<h2>Pix de ${moeda(valorCentavos)}</h2><p class="suave">${esc(a.cliente_nome)}</p>
    ${problema ? `<div class="aviso erro">${esc(problema)}</div><div class="acoes"><button class="botao" id="aj">Abrir ajustes</button></div>` : `
      <div class="qr">${qrSvg(codigo)}</div>
      <p class="suave pequeno" style="text-align:center;margin-top:8px">O cliente aponta a câmera do app do banco. O app não confirma o pagamento sozinho: confira no seu banco.</p>
      <div class="codigo">${esc(codigo)}</div>`}
    <div class="acoes">
      ${problema ? '' : '<button class="botao sec" id="cp">Copiar Pix copia e cola</button>'}
      ${problema ? '' : '<button class="botao" id="pg">Recebi, marcar como pago</button>'}
      <button class="botao sec" id="fc">${problema ? 'Fechar' : 'Fechar sem marcar'}</button>
    </div>`, (f) => {
    f.querySelector('#aj')?.addEventListener('click', () => { fecharFolha(); ir('ajustes'); });
    f.querySelector('#cp')?.addEventListener('click', async () => aviso((await copiar(codigo)) ? 'Código copiado' : 'Não deu para copiar', false));
    f.querySelector('#fc').addEventListener('click', () => { fecharFolha(); recarregar(); });
    f.querySelector('#pg')?.addEventListener('click', async () => {
      if (await seguro(() => api(`/admin/agendamentos/${a.id}`, { metodo: 'PATCH', corpo: { pago: true } }))) { fecharFolha(); aviso('Pagamento registrado'); recarregar(); }
    });
  });
}

function folhaDivulgarAgenda() {
  const link = window.location.origin + '/';
  const msgWhats = `Olá! ✨ Minha agenda para os próximos dias já está aberta para agendamentos. Garanta seu horário pelo link: ${link} 💅`;
  folha(`<h2>Divulgar agenda</h2>
    <p class="suave">Compartilhe o link da sua esmalteria com suas clientes para elas agendarem horários online.</p>
    <div class="cartao-link" style="margin:16px 0;background:var(--marfim);border:1px solid var(--linha);border-radius:12px;padding:12px 14px">
      <div class="suave pequeno" style="margin-bottom:4px">Link de agendamento online:</div>
      <strong style="word-break:break-all;color:var(--ouro-escuro)">${esc(link)}</strong>
    </div>
    <div class="acoes">
      <button class="botao" id="div-copiar">Copiar link</button>
      <a class="botao sec" href="${linkWhatsapp('', msgWhats)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a>
      <button class="botao sec" id="div-fechar">Fechar</button>
    </div>`, (f) => {
    f.querySelector('#div-copiar').addEventListener('click', async () => {
      const ok = await copiar(link);
      aviso(ok ? 'Link copiado!' : 'Não foi possível copiar');
    });
    f.querySelector('#div-fechar').addEventListener('click', fecharFolha);
  });
}

function folhaClientesSumidos(sumidos, diasConfig = 15, recarregar = null) {
  const linkAgendamento = `${window.location.origin}/`;
  folha(`<h2>Fidelização de clientes</h2>
    <p class="suave">Clientes que não agendam há mais de <strong>${diasConfig} dias</strong> e estão sem horário futuro marcado.</p>
    
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--marfim);border:1px solid var(--linha);padding:10px 14px;border-radius:12px;margin:14px 0">
      <div>
        <label for="cfg-sumidos-dias" class="pequeno negrito" style="display:block">Período de ausência:</label>
        <span class="pequeno suave">Alertar após quantos dias:</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <input id="cfg-sumidos-dias" type="number" min="3" max="365" value="${diasConfig}" style="width:65px;min-height:36px;text-align:center;padding:4px 6px;border:1.5px solid var(--linha);border-radius:8px">
        <span class="pequeno suave">dias</span>
        <button class="botao sec pequeno" id="btn-salvar-dias-sumidos" style="min-height:36px;padding:0 12px">Salvar</button>
      </div>
    </div>

    <div style="margin-top:14px;max-height:55vh;overflow-y:auto">
      ${sumidos.length === 0 ? '<p class="vazio">Nenhuma cliente ausente nesse período! Todas estão em dia.</p>' : `
        <div class="lista">
          ${sumidos.map((c) => {
            const dias = Math.max(0, Math.round((new Date(S.hoje + 'T00:00:00Z') - new Date(c.ultimo_atendimento + 'T00:00:00Z')) / 86400000));
            const primeiroNome = c.nome.split(' ')[0];
            const msgWhats = `Olá, ${primeiroNome}! Tudo bem? ✨ Sentimos sua falta aqui na Jerusa Beauty! Já faz alguns dias desde o seu último atendimento com a gente. 💕 Que tal reservar um tempinho para cuidar de você e renovar suas unhas? 💅 Você pode escolher o seu dia e horário pelo link: ${linkAgendamento}`;
            return `
              <div class="item-simples" style="padding:12px 0">
                <div>
                  <div class="negrito">${esc(c.nome)}</div>
                  <div class="pequeno suave">Última vez há <strong>${dias} dias</strong> (${dataCurta(c.ultimo_atendimento)})</div>
                  <div class="pequeno suave" style="font-size:0.75rem">${esc(mascaraWhatsapp(c.whatsapp))}</div>
                </div>
                <a class="botao pequeno" href="${linkWhatsapp(c.whatsapp, msgWhats)}" target="_blank" rel="noopener" style="background:#25d366;border-color:#25d366;color:#fff;display:inline-flex;align-items:center;gap:6px;flex:none" title="Abrir WhatsApp para ${esc(c.nome)}">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.167 8.167 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.02 4.54-3.68 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.06 0 1.21.89 2.39 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z"/></svg>
                  WhatsApp
                </a>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
    <div class="acoes" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <button class="botao sec" id="sum-fechar">Fechar</button>
      ${sumidos.length > 0 ? `<button class="botao pequeno" id="btn-disparar-fidelizacao" style="background:#25d366;border-color:#25d366;color:#fff">Disparar automáticos (até 5)</button>` : ''}
    </div>`, (f) => {
    f.querySelector('#sum-fechar').addEventListener('click', fecharFolha);
    f.querySelector('#btn-disparar-fidelizacao')?.addEventListener('click', async (e) => {
      const btn = e.target;
      if (!confirmar('O sistema enviará a mensagem de fidelização para até 5 clientes ausentes com intervalo seguro entre cada uma. Deseja disparar agora?')) return;
      btn.disabled = true;
      btn.textContent = 'Enviando com intervalo seguro...';
      try {
        const res = await api('/admin/whatsapp/fidelizacao/processar', { metodo: 'POST', corpo: { forcar: true, limite: 5 } });
        if (res?.resultado?.enviados > 0) {
          aviso(`${res.resultado.enviados} mensagem(ns) de fidelização enviada(s) com sucesso!`);
        } else {
          aviso('Nenhuma cliente elegível para envio no momento (respeitando intervalo anti-spam).');
        }
        fecharFolha();
        recarregar?.();
      } catch (err) {
        aviso(err.message || 'Erro ao processar envio', true);
        btn.disabled = false;
        btn.textContent = 'Disparar automáticos (até 5)';
      }
    });
    f.querySelector('#btn-salvar-dias-sumidos')?.addEventListener('click', async () => {
      const val = Number(f.querySelector('#cfg-sumidos-dias').value);
      if (!val || val < 3 || val > 365) return aviso('Informe um período entre 3 e 365 dias', true);
      try {
        await api('/admin/config', { metodo: 'PUT', corpo: { alerta_sumidos_dias: val } });
        aviso(`Alerta atualizado para ${val} dias`);
        fecharFolha();
        recarregar?.();
      } catch (e) {
        aviso(e.message, true);
      }
    });
  });
}

// ======================================================================== início
async function telaInicio() {
  api('/admin/whatsapp/lembretes/processar', { metodo: 'POST' }).catch(() => {});
  const [p, anivDados] = await Promise.all([
    seguro(() => api('/admin/painel')),
    seguro(() => api('/admin/aniversariantes/hoje')).catch(() => null),
  ]);
  if (!p) return;
  S.hoje = p.hoje;
  const aniversariantesHoje = anivDados?.aniversariantes || [];
  const abertos = p.agendamentos_hoje.filter((a) => a.status === 'agendado');
  const concluidosHoje = p.agendamentos_hoje.filter((a) => a.status === 'concluido');
  const vencidosHoje = p.agendamentos_hoje.filter(
    (a) => a.status === 'agendado' && p.agora_min >= a.inicio_min + a.duracao_min
  );
  const totalVencidos = vencidosHoje.reduce((s, a) => s + valorDe(a), 0);
  const m = p.mes;
  const prox = p.proxima_data;
  const proxNome = prox ? (prox === somaDias(p.hoje, 1) ? 'Amanhã' : dataLonga(prox)) : '';
  const todosAtendimentos = [...p.agendamentos_hoje, ...(p.agendamentos_proximo_dia || [])];
  const diasSumido = p.alerta_sumidos_dias || 15;

  let alertasQtd = 0;
  if (vencidosHoje.length > 0) alertasQtd++;
  if (p.a_receber_qtd > 0) alertasQtd++;
  if (p.proximos_7_dias <= 3) alertasQtd++;
  if (p.sumidos.length > 0) alertasQtd++;
  if (p.cancelados_recentes && p.cancelados_recentes.length > 0) alertasQtd++;

  const oculto = !!S.ocultarValores;

  conteudo().innerHTML = `
    <header class="cabeca">
      <div><h1 class="assinatura">${saudacao()}</h1><p>${esc(dataLonga(p.hoje))}</p></div>
      <button class="icone-btn" id="btn-olho" type="button" aria-label="${oculto ? 'Mostrar valores' : 'Ocultar valores'}" title="${oculto ? 'Mostrar valores' : 'Ocultar valores'}">
        ${icone(oculto ? 'olhoFechado' : 'olho')}
      </button>
    </header>

    ${aniversariantesHoje.length > 0 ? `
      <div style="background:rgba(212,175,55,.1);border:1.5px solid rgba(212,175,55,.35);border-radius:16px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
        <span style="font-size:26px;line-height:1">🎂</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:15px;color:var(--tinta)">Aniversariantes de Hoje (${aniversariantesHoje.length})</div>
          <div class="suave pequeno" style="margin-top:2px">${aniversariantesHoje.map((a) => esc(a.nome.split(' ')[0])).join(', ')} · Parabéns automático enviado via WhatsApp ✨</div>
        </div>
      </div>
    ` : ''}

    <div class="grid-kpis" aria-label="Resumo do mês">
      <div class="card-kpi">
        <span class="card-kpi-rotulo">Faturado (Mês)</span>
        <strong class="card-kpi-valor" data-kpi-valor="${moeda(m.faturado_centavos)}">${oculto ? '***' : moeda(m.faturado_centavos)}</strong>
        <span class="card-kpi-sub">${m.atendimentos} atendimento${m.atendimentos === 1 ? '' : 's'}</span>
      </div>
      <div class="card-kpi">
        <span class="card-kpi-rotulo">Lucro Líquido</span>
        <strong class="card-kpi-valor ${m.lucro_centavos >= 0 ? 'positivo' : 'negativo'}" data-kpi-valor="${moeda(m.lucro_centavos)}">${oculto ? '***' : moeda(m.lucro_centavos)}</strong>
        <span class="card-kpi-sub">Despesas: ${moeda(m.despesas_centavos)}</span>
      </div>
      <div class="card-kpi ${p.a_receber_qtd > 0 ? 'alerta' : ''}">
        <span class="card-kpi-rotulo">A Receber</span>
        <strong class="card-kpi-valor" data-kpi-valor="${moeda(p.a_receber_total_centavos)}">${oculto ? '***' : moeda(p.a_receber_total_centavos)}</strong>
        <span class="card-kpi-sub">${p.a_receber_qtd ? `${p.a_receber_qtd} pendência(s)` : 'Tudo em dia'}</span>
      </div>
      <div class="card-kpi">
        <span class="card-kpi-rotulo">Hoje (Previsão)</span>
        <strong class="card-kpi-valor" data-kpi-valor="${moeda(p.faturado_hoje_centavos + p.previsto_hoje_centavos)}">${oculto ? '***' : moeda(p.faturado_hoje_centavos + p.previsto_hoje_centavos)}</strong>
        <span class="card-kpi-sub">${p.agendamentos_hoje.length} no dia · ${abertos.length} a atender</span>
      </div>
    </div>

    <section class="central-alertas" aria-label="Central de decisão e alertas">
      <div class="central-alertas-topo">
        <h2>Central de Decisão & Alertas</h2>
        <span class="selo-texto ${alertasQtd > 0 ? 'pend' : 'ok'}">${alertasQtd} ação${alertasQtd === 1 ? '' : 'ões'} pendente${alertasQtd === 1 ? '' : 's'}</span>
      </div>

      ${vencidosHoje.length > 0 ? `
      <div class="card-alerta alerta-vencidos">
        <div class="card-alerta-conteudo">
          <div class="card-alerta-titulo">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Atendimentos aguardando fechamento</span>
          </div>
          <div class="card-alerta-texto"><strong>${vencidosHoje.length} atendimento${vencidosHoje.length === 1 ? '' : 's'}</strong> de hoje já passaram do horário (${moeda(totalVencidos)} previstos).</div>
        </div>
        <button class="botao pequeno" id="acao-vencidos" style="background:#d97706;border-color:#d97706;color:#fff">Ver na Agenda →</button>
      </div>` : ''}

      ${p.a_receber_qtd ? `
      <div class="card-alerta alerta-receber">
        <div class="card-alerta-conteudo">
          <div class="card-alerta-titulo">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="16" cy="14" r="1"/></svg>
            <span>A receber pendente</span>
          </div>
          <div class="card-alerta-texto">${moeda(p.a_receber_total_centavos)} a receber em <strong>${p.a_receber_qtd} atendimento(s)</strong> concluído(s).</div>
        </div>
        <button class="botao sec pequeno" id="acao-cobrar">Cobrar</button>
      </div>` : ''}

      ${(p.cancelados_recentes && p.cancelados_recentes.length > 0) ? `
      <div class="card-alerta alerta-cancelamentos" style="border-left:4px solid #ef4444;background:#fff5f5">
        <div class="card-alerta-conteudo">
          <div class="card-alerta-titulo" style="color:#b91c1c">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>Cancelamentos recentes (${p.cancelados_recentes.length})</span>
          </div>
          <div class="card-alerta-texto" style="color:#7f1d1d">
            <strong>${p.cancelados_recentes.length} horário(s) desmarcado(s)</strong> recentemente nos próximos dias.
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
              ${p.cancelados_recentes.slice(0, 3).map((c) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid #fee2e2">
                  <span><strong>${esc(c.cliente_nome)}</strong> · ${dataCurta(c.data)} às ${hora(c.inicio_min)}</span>
                  ${c.cliente_whatsapp ? `<a class="botao sec pequeno" href="${linkWhatsapp(c.cliente_whatsapp, 'Olá, ' + c.cliente_nome.split(' ')[0] + '! Tudo bem? Vi que precisou cancelar seu horário de ' + dataCurta(c.data) + ' às ' + hora(c.inicio_min) + '. Gostaria de remarcar para outro dia?')}" target="_blank" rel="noopener" style="font-size:.75rem;padding:3px 8px">Chamar no Zap</a>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <button class="botao sec pequeno" id="acao-ver-cancelados" style="border-color:#fca5a5;color:#b91c1c">Ver Agenda</button>
      </div>` : ''}

      <div class="card-alerta alerta-ocupacao">
        <div class="card-alerta-conteudo">
          <div class="card-alerta-titulo">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Oportunidade na agenda</span>
          </div>
          <div class="card-alerta-texto">${p.proximos_7_dias ? `<strong>${p.proximos_7_dias} atendimento(s)</strong> nos próximos 7 dias. Divulgue para preencher os horários livres!` : 'Nenhum atendimento marcado para os próximos 7 dias. Divulgue seu link para agendamentos!'}</div>
        </div>
        <button class="botao sec pequeno" id="acao-divulgar">Divulgar</button>
      </div>

      <div class="card-alerta alerta-fidelizacao">
        <div class="card-alerta-conteudo">
          <div class="card-alerta-titulo">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
            <span>Fidelização (+${diasSumido} dias sem voltar)</span>
          </div>
          <div class="card-alerta-texto">${p.sumidos.length ? `<strong>${p.sumidos.length} cliente(s)</strong> não retornam há mais de ${diasSumido} dias.` : `Todas as clientes recentes estão em dia!`}</div>
        </div>
        <button class="botao sec pequeno" id="acao-sumidos">${p.sumidos.length ? `Ver lista (${p.sumidos.length})` : 'Ajustar dias'}</button>
      </div>
    </section>

    <section class="secao" style="margin-top:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <h2 style="font-size:1.15rem;font-weight:600">Hoje: ${p.agendamentos_hoje.length} atendimento${p.agendamentos_hoje.length === 1 ? '' : 's'}</h2>
          <p class="sub-texto" style="margin:2px 0 0">${p.agendamentos_hoje.length === 0 ? 'Sem atendimentos hoje.' : `${abertos.length} a atender · ${concluidosHoje.length} já atendido(s)`}</p>
        </div>
        <button class="link" id="ver-grade" style="font-size:.875rem;white-space:nowrap">Ver na agenda →</button>
      </div>

      <div id="hoje" style="margin-top:14px">
        ${p.agendamentos_hoje.length === 0 ? '<p class="vazio">Dia livre hoje.</p>' : `
          ${abertos.length > 0 ? `
            <div style="margin-bottom:14px">
              <div style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--suave);margin-bottom:8px">A atender (${abertos.length})</div>
              ${abertos.map((a) => linhaAtendimento(a, p.agora_min)).join('')}
            </div>` : ''}
          ${concluidosHoje.length > 0 ? `
            <div>
              <div style="font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--ok);margin-bottom:8px">✓ Já atendidos (${concluidosHoje.length})</div>
              ${concluidosHoje.map((a) => linhaAtendimento(a, p.agora_min)).join('')}
            </div>` : ''}
          ${p.agendamentos_hoje.filter((a) => a.status !== 'agendado' && a.status !== 'concluido').length > 0 ? `
            <details style="margin-top:10px">
              <summary class="suave pequeno" style="cursor:pointer;padding:4px 0">Outros atendimentos (${p.agendamentos_hoje.filter((a) => a.status !== 'agendado' && a.status !== 'concluido').length})</summary>
              <div style="margin-top:6px">${p.agendamentos_hoje.filter((a) => a.status !== 'agendado' && a.status !== 'concluido').map((a) => linhaAtendimento(a, p.agora_min)).join('')}</div>
            </details>` : ''}
        `}
      </div>
      <div class="acoes"><button class="botao" id="novo">Novo agendamento</button></div>
    </section>

    ${prox ? `
    <section class="secao" style="margin-top:28px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div>
          <h2>Próximo dia (${esc(proxNome)})</h2>
          <p class="sub-texto">${p.agendamentos_proximo_dia.length} atendimento(s) agendado(s) para ${dataCurta(prox)}.</p>
        </div>
        <span class="negrito pequeno" style="color:var(--ouro-escuro)">${moeda(p.previsto_proximo_dia_centavos)} <span class="suave pequeno" style="font-weight:normal">(previsão)</span></span>
      </div>
      <div id="proximo">${p.agendamentos_proximo_dia.map((a) => linhaAtendimento(a)).join('')}</div>
    </section>` : ''}
  `;

  ligarAtendimentos(todosAtendimentos, telaInicio);
  conteudo().querySelector('#novo').addEventListener('click', () => folhaNovo(S.hoje, telaInicio));
  const btnOlho = conteudo().querySelector('#btn-olho');
  if (btnOlho) {
    btnOlho.addEventListener('click', () => {
      S.ocultarValores = !S.ocultarValores;
      try { localStorage.setItem('admin_ocultar_valores', S.ocultarValores ? '1' : '0'); } catch {}
      btnOlho.innerHTML = icone(S.ocultarValores ? 'olhoFechado' : 'olho');
      btnOlho.setAttribute('aria-label', S.ocultarValores ? 'Mostrar valores' : 'Ocultar valores');
      btnOlho.setAttribute('title', S.ocultarValores ? 'Mostrar valores' : 'Ocultar valores');
      conteudo().querySelectorAll('[data-kpi-valor]').forEach((el) => {
        el.textContent = S.ocultarValores ? '***' : el.dataset.kpiValor;
      });
    });
  }
  conteudo().querySelector('#ver-grade')?.addEventListener('click', () => ir('agenda'));
  conteudo().querySelector('#acao-ver-cancelados')?.addEventListener('click', () => ir('agenda'));
  conteudo().querySelector('#acao-vencidos')?.addEventListener('click', () => { S.dia = S.hoje; ir('agenda'); });
  conteudo().querySelector('#acao-cobrar')?.addEventListener('click', () => ir('financeiro'));
  conteudo().querySelector('#acao-divulgar')?.addEventListener('click', folhaDivulgarAgenda);
  conteudo().querySelector('#acao-sumidos')?.addEventListener('click', () => folhaClientesSumidos(p.sumidos, diasSumido, telaInicio));
}

// ======================================================================== agenda
async function telaAgenda() {
  const dia = S.dia;
  const r = await seguro(() => api(`/admin/agendamentos?de=${dia}&ate=${dia}`));
  const cfgAll = await seguro(() => api('/admin/config'));
  if (!r || !cfgAll) return;
  S.config = cfgAll.config;
  const bloqueios = cfgAll.bloqueios.filter((b) => b.data === dia);
  const lista = r.agendamentos;
  const ativos = lista.filter((a) => a.status !== 'cancelado');
  const agendados = lista.filter((a) => a.status === 'agendado');
  const concluidos = lista.filter((a) => a.status === 'concluido');
  const outros = lista.filter((a) => a.status === 'cancelado' || a.status === 'faltou');
  const totalConcluido = concluidos.reduce((s, a) => s + valorDe(a), 0);
  const totalAgendado = agendados.reduce((s, a) => s + valorDe(a), 0);
  const agoraMin = dia === S.hoje ? new Date(Date.now() - 3 * 3600000).getUTCHours() * 60 + new Date(Date.now() - 3 * 3600000).getUTCMinutes() : null;
  const vencidos = dia === S.hoje && agoraMin != null ? agendados.filter((a) => agoraMin >= a.inicio_min + a.duracao_min) : [];

  conteudo().innerHTML = `
    <header class="cabeca"><div><h1 class="assinatura">Agenda</h1><p>${ativos.length} atendimento(s)${dia === S.hoje ? ' hoje' : ''} · ${agendados.length} a atender · ${concluidos.length} já atendido(s)</p></div></header>
    <div class="nav-data">
      <button class="icone-btn" id="ant" aria-label="Dia anterior">${icone('esq')}</button>
      <label class="data-atual" style="display:grid;place-items:center;position:relative"><span>${esc(dataLonga(dia))}</span>
        <input id="pular" type="date" value="${dia}" aria-label="Escolher data" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer"></label>
      <button class="icone-btn" id="prox" aria-label="Próximo dia">${icone('dir')}</button>
    </div>
    ${dia !== S.hoje ? '<p style="text-align:center;margin-top:10px"><button class="link" id="hojeb">Voltar para hoje</button></p>' : ''}
    ${bloqueios.map((b) => `<div class="aviso">Bloqueado${b.inicio_min === 0 && b.fim_min === 1440 ? ' o dia todo' : `: ${hora(b.inicio_min)} às ${hora(b.fim_min)}`}${b.motivo ? ` · ${esc(b.motivo)}` : ''}</div>`).join('')}

    ${outros.length > 0 ? `
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>
        <strong style="color:#991b1b;display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444"></span>
          ${outros.length} cancelamento(s) / falta(s) neste dia
        </strong>
        <p class="pequeno" style="margin:2px 0 0;color:#7f1d1d">
          ${outros.map(c => `<b>${esc(c.cliente_nome)}</b> (${hora(c.inicio_min)})`).join(', ')} — horário(s) livre(s) para novo agendamento ou encaixe.
        </p>
      </div>
      <button class="botao sec pequeno" id="btn-abrir-cancelados" type="button" style="color:#991b1b;border-color:#fca5a5">Ver cancelados</button>
    </div>` : ''}

    ${lista.length > 0 ? `
    <div class="segmentos-filtro" id="filtro-agenda">
      <button type="button" class="filtro-btn" data-filtro="todos" aria-pressed="true">Todos (${lista.length})</button>
      <button type="button" class="filtro-btn" data-filtro="agendados" aria-pressed="false">A atender (${agendados.length})</button>
      <button type="button" class="filtro-btn" data-filtro="concluidos" aria-pressed="false">Já atendidos (${concluidos.length})</button>
      ${outros.length ? `<button type="button" class="filtro-btn" data-filtro="outros" aria-pressed="false">Cancelados (${outros.length})</button>` : ''}
    </div>` : ''}

    <div style="margin-top:12px" id="lista-agenda-container">
      ${lista.length === 0 ? '<p class="vazio">Nada marcado para este dia.</p>' : `
        <div class="secao-agenda" id="secao-agendados" ${agendados.length === 0 ? 'hidden' : ''}>
          <div class="secao-agenda-topo">
            <span class="secao-agenda-titulo">A atender (${agendados.length})</span>
            <span style="display:flex;align-items:center;gap:6px">
              ${vencidos.length > 0 ? `<span class="selo-texto atencao">${vencidos.length} aguardando baixa</span>` : ''}
              <span class="suave pequeno">${moeda(totalAgendado)} previsto</span>
            </span>
          </div>
          <div class="lista-atendimentos">
            ${agendados.map((a) => linhaAtendimento(a, agoraMin)).join('')}
          </div>
        </div>

        <div class="secao-agenda concluidos" id="secao-concluidos" style="${concluidos.length > 0 && agendados.length > 0 ? 'margin-top:20px' : ''}" ${concluidos.length === 0 ? 'hidden' : ''}>
          <div class="secao-agenda-topo">
            <span class="secao-agenda-titulo" style="display:flex;align-items:center;gap:6px">
              <span style="color:var(--ok)">✓</span> Já atendidos (${concluidos.length})
            </span>
            <span class="selo-texto ok">${moeda(totalConcluido)} realizado</span>
          </div>
          <div class="lista-atendimentos">
            ${concluidos.map((a) => linhaAtendimento(a, agoraMin)).join('')}
          </div>
        </div>

        ${outros.length ? `
        <details class="secao-agenda" id="secao-outros" style="margin-top:16px">
          <summary class="suave pequeno" style="cursor:pointer;padding:6px 0">Cancelados e faltas (${outros.length})</summary>
          <div class="lista-atendimentos" style="margin-top:8px">
            ${outros.map((a) => linhaAtendimento(a, agoraMin)).join('')}
          </div>
        </details>` : ''}
      `}
    </div>

    <div class="acoes duas" style="margin-top:24px"><button class="botao" id="novo">Novo agendamento</button><button class="botao sec" id="bloquear">Bloquear horário</button></div>`;

  const c = conteudo();
  c.querySelector('#ant').addEventListener('click', () => { S.dia = somaDias(dia, -1); telaAgenda(); });
  c.querySelector('#prox').addEventListener('click', () => { S.dia = somaDias(dia, 1); telaAgenda(); });
  c.querySelector('#hojeb')?.addEventListener('click', () => { S.dia = S.hoje; telaAgenda(); });
  c.querySelector('#pular').addEventListener('change', (e) => { if (e.target.value) { S.dia = e.target.value; telaAgenda(); } });
  c.querySelector('#novo').addEventListener('click', () => folhaNovo(dia, telaAgenda));
  c.querySelector('#btn-abrir-cancelados')?.addEventListener('click', () => {
    const det = c.querySelector('#secao-outros');
    if (det) {
      det.open = true;
      det.scrollIntoView({ behavior: 'smooth' });
    }
  });
  c.querySelector('#bloquear').addEventListener('click', () => folhaBloquear(dia, telaAgenda));

  c.querySelectorAll('#filtro-agenda .filtro-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filtro;
      c.querySelectorAll('#filtro-agenda .filtro-btn').forEach((b) => b.setAttribute('aria-pressed', b === btn));
      const sAg = c.querySelector('#secao-agendados');
      const sCo = c.querySelector('#secao-concluidos');
      const sOu = c.querySelector('#secao-outros');
      if (sAg) sAg.hidden = (f === 'concluidos' || f === 'outros') || agendados.length === 0;
      if (sCo) sCo.hidden = (f === 'agendados' || f === 'outros') || concluidos.length === 0;
      if (sOu) sOu.hidden = (f === 'agendados' || f === 'concluidos') || outros.length === 0;
    });
  });

  ligarAtendimentos(lista, telaAgenda);
}

function folhaBloquear(dia, recarregar) {
  folha(`<h2>Bloquear horário</h2><p class="suave">O cliente não verá esse período na agenda.</p>
    <div class="campo"><label for="bd">Dia</label><input id="bd" type="date" value="${dia}"></div>
    <label class="interruptor"><span>Dia inteiro</span><input type="checkbox" id="bt" checked><span class="trilho"></span></label>
    <div class="grade2" id="bh" hidden><div class="campo"><label for="bi">Das</label><input id="bi" type="time" value="12:00"></div><div class="campo"><label for="bf">Até</label><input id="bf" type="time" value="14:00"></div></div>
    <div class="campo"><label for="bm">Motivo (opcional)</label><input id="bm" maxlength="80" placeholder="Folga, consulta, curso…"></div>
    <div id="bmsg"></div><div class="acoes"><button class="botao" id="bok">Bloquear</button></div>`, (f) => {
    f.querySelector('#bt').addEventListener('change', (e) => { f.querySelector('#bh').hidden = e.target.checked; });
    f.querySelector('#bok').addEventListener('click', async () => {
      const corpo = { data: f.querySelector('#bd').value, dia_todo: f.querySelector('#bt').checked, motivo: f.querySelector('#bm').value };
      if (!corpo.dia_todo) { corpo.inicio_min = campoParaMin(f.querySelector('#bi').value); corpo.fim_min = campoParaMin(f.querySelector('#bf').value); }
      try { await api('/admin/bloqueios', { metodo: 'POST', corpo }); fecharFolha(); aviso('Horário bloqueado'); recarregar(); }
      catch (e) { f.querySelector('#bmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(e.message)}</div>`; }
    });
  });
}

async function folhaNovo(dia, recarregar) {
  const cfg = await seguro(config); if (!cfg) return;
  let local = cfg.atende_espaco ? 'espaco' : 'domicilio';

  const [sv, cl, dispoIni] = await Promise.all([
    seguro(() => api('/admin/servicos')),
    seguro(() => api('/admin/clientes')),
    seguro(() => api(`/publico/disponibilidade?local=${local}`)),
  ]);
  if (!sv || !cl) return;
  const servicos = sv.servicos.filter((s) => s.ativo);
  const sel = new Set();
  let dispo = dispoIni;
  let dataSel = dia || S.hoje || dispo?.hoje;
  const diasLivres = Object.keys(dispo?.dias || {});
  if (!dispo?.dias?.[dataSel] && diasLivres.length > 0 && dataSel === S.hoje) {
    dataSel = diasLivres[0];
  }
  let horaSel = null;

  folha(`<h2>Novo agendamento</h2>
    <div class="campo"><label for="nc">Cliente</label>
      <input id="nc" list="lista-clientes" placeholder="Nome (escolha da lista ou digite um novo)" autocomplete="off" autofocus>
      <datalist id="lista-clientes">${cl.clientes.map((c) => `<option value="${esc(c.nome)}"></option>`).join('')}</datalist></div>
    <div class="campo" id="cw"><label for="nw">WhatsApp</label><input id="nw" type="tel" inputmode="tel" placeholder="(83) 99999-0000"></div>
    <div class="campo" id="bloco-agenda">
      <span class="rotulo">Dia e horário</span>
      <div class="dias" id="ndias" role="group" aria-label="Dia" style="margin-top:4px"></div>
      <p class="suave pequeno" style="margin-top:10px;font-weight:500" id="ntitulo-dia"></p>
      <div id="nhoras"></div>
      <div style="margin-top:12px;padding:8px 12px;background:var(--marfim);border-radius:12px;border:1px solid var(--linha);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span style="font-size:0.85rem;font-weight:500">⏱️ Digitar outro horário:</span>
        <input type="time" id="noutro-horario" style="min-height:36px;padding:4px 10px;border:1.5px solid var(--linha);border-radius:8px;background:var(--papel);font-weight:600;font-size:0.95rem">
      </div>
    </div>
    <div class="campo"><span class="rotulo">Serviços</span><div class="lista" id="ns">${servicos.map((s) => `
      <button type="button" class="opcao" data-id="${s.id}" aria-pressed="false"><span class="anel"></span>
        <span><span class="nome">${esc(s.nome)}</span><span class="detalhe" style="display:block">${duracao(s.duracao_min)}</span></span><span class="preco">${moeda(s.preco_centavos)}</span></button>`).join('')}</div></div>
    ${cfg.atende_espaco && cfg.atende_domicilio ? `<div class="campo"><span class="rotulo">Onde</span><div class="segmentos" id="nl">
      <button type="button" data-l="espaco" aria-pressed="true">No espaço</button><button type="button" data-l="domicilio" aria-pressed="false">A domicílio</button></div></div>` : ''}
    <div id="ne" hidden><div class="campo"><label for="ned">Endereço</label><input id="ned" maxlength="200"></div>
      <div class="campo"><label for="nref">Referência (opcional)</label><input id="nref" maxlength="120"></div></div>
    <p class="suave pequeno" id="nresumo" style="margin-top:12px"></p>
    <div id="nmsg"></div><div class="acoes"><button class="botao" id="nok">Agendar</button></div>`, (f) => {
    const mostrarEnd = () => { f.querySelector('#ne').hidden = local !== 'domicilio'; };
    mostrarEnd();

    const resumo = () => {
      const s = servicos.filter((x) => sel.has(x.id));
      const partes = [];
      if (dataSel && horaSel != null) {
        partes.push(`${dataCurta(dataSel)} às ${hora(horaSel)}`);
      }
      if (s.length) {
        partes.push(`${moeda(s.reduce((t, x) => t + x.preco_centavos, 0))} · ${duracao(s.reduce((t, x) => t + x.duracao_min, 0))}`);
      }
      f.querySelector('#nresumo').textContent = partes.join(' — ');
    };

    const desenharDias = () => {
      const elDias = f.querySelector('#ndias');
      if (!dispo) {
        elDias.innerHTML = '<p class="suave pequeno">Buscando horários livres…</p>';
        return;
      }
      const todos = [];
      const d0 = dispo.hoje;
      const janela = cfg.janela_dias || 30;
      for (let i = 0; i <= janela; i++) {
        const d = new Date(d0 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
        todos.push(d.toISOString().slice(0, 10));
      }
      let mesAtual = '';
      elDias.innerHTML = todos.map((d) => {
        const m = d.slice(0, 7);
        const marcaMes = m !== mesAtual ? `<span class="mes-marca">${mesNome(d)}</span>` : '';
        mesAtual = m;
        const livre = !!dispo.dias?.[d]?.length;
        return `${marcaMes}<button type="button" class="dia" data-dia="${d}" ${livre ? '' : 'disabled'} aria-pressed="${d === dataSel}" aria-label="${esc(dataLonga(d))}${livre ? '' : ', sem horários'}">
          <small>${diaSemanaCurto(d)}</small><b>${diaDoMes(d)}</b></button>`;
      }).join('');

      const ativo = elDias.querySelector('.dia[aria-pressed="true"]');
      ativo?.scrollIntoView({ inline: 'center', block: 'nearest' });

      elDias.querySelectorAll('.dia:not(:disabled)').forEach((b) => b.addEventListener('click', () => {
        if (dataSel !== b.dataset.dia) horaSel = null;
        dataSel = b.dataset.dia;
        elDias.querySelectorAll('.dia').forEach((x) => x.setAttribute('aria-pressed', x.dataset.dia === dataSel));
        desenharHoras();
        resumo();
      }));
    };

    const desenharHoras = () => {
      const elHoras = f.querySelector('#nhoras');
      const elTitulo = f.querySelector('#ntitulo-dia');
      if (!dispo) {
        elTitulo.textContent = '';
        elHoras.innerHTML = '';
        return;
      }
      elTitulo.textContent = `${dataLonga(dataSel)}${horaSel != null ? ` às ${hora(horaSel)}` : ''}`;
      const horasLivres = dispo.dias?.[dataSel] || [];
      if (!horasLivres.length) {
        elHoras.innerHTML = '<p class="suave pequeno" style="margin:12px 0 0;text-align:center">Nenhum horário livre neste dia.</p>';
        return;
      }
      elHoras.innerHTML = `<div class="horas" role="group" aria-label="Horários livres">
        ${horasLivres.map((m) => `<button type="button" class="hora" data-min="${m}" aria-pressed="${m === horaSel}">${hora(m)}</button>`).join('')}
      </div>`;

      elHoras.querySelectorAll('.hora').forEach((b) => b.addEventListener('click', () => {
        horaSel = Number(b.dataset.min);
        const elOutro = f.querySelector('#noutro-horario');
        if (elOutro) elOutro.value = '';
        elHoras.querySelectorAll('.hora').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.min) === horaSel));
        elTitulo.textContent = `${dataLonga(dataSel)} às ${hora(horaSel)}`;
        resumo();
      }));
    };

    const elOutro = f.querySelector('#noutro-horario');
    if (elOutro) {
      elOutro.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val) return;
        const m = campoParaMin(val);
        if (m != null) {
          horaSel = m;
          elHoras.querySelectorAll('.hora').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          elTitulo.textContent = `${dataLonga(dataSel)} às ${hora(horaSel)}`;
          resumo();
        }
      });
    }

    const atualizarDispo = async () => {
      try {
        const q = new URLSearchParams();
        if (sel.size) q.set('servicos', [...sel].join(','));
        if (local) q.set('local', local);
        const res = await api(`/publico/disponibilidade?${q.toString()}`);
        if (res) {
          dispo = res;
          if (horaSel != null && !(dispo.dias?.[dataSel] || []).includes(horaSel) && !elOutro?.value) {
            horaSel = null;
          }
          desenharDias();
          desenharHoras();
          resumo();
        }
      } catch { /* ignora erro temporário */ }
    };

    desenharDias();
    desenharHoras();
    resumo();

    const achar = () => cl.clientes.find((c) => c.nome.toLowerCase() === f.querySelector('#nc').value.trim().toLowerCase());
    f.querySelector('#nc').addEventListener('input', () => {
      const c = achar();
      f.querySelector('#cw').hidden = !!c;
      if (c && local === 'domicilio' && c.ultimo_endereco && !f.querySelector('#ned').value) f.querySelector('#ned').value = c.ultimo_endereco;
    });
    f.querySelector('#nw').addEventListener('input', (e) => { e.target.value = mascaraWhatsapp(e.target.value); });
    f.querySelectorAll('#ns .opcao').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id);
      ajustarExclusividadeServicos(servicos, sel, id);
      f.querySelectorAll('#ns .opcao').forEach((x) => {
        const xId = Number(x.dataset.id);
        x.setAttribute('aria-pressed', sel.has(xId));
      });
      resumo();
      await atualizarDispo();
    }));
    f.querySelectorAll('#nl button').forEach((b) => b.addEventListener('click', async () => {
      local = b.dataset.l; f.querySelectorAll('#nl button').forEach((x) => x.setAttribute('aria-pressed', x === b)); mostrarEnd();
      const c = achar(); if (c?.ultimo_endereco && local === 'domicilio' && !f.querySelector('#ned').value) f.querySelector('#ned').value = c.ultimo_endereco;
      await atualizarDispo();
    }));
    f.querySelector('#nok').addEventListener('click', async () => {
      const msg = (t) => (f.querySelector('#nmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(t)}</div>`);
      const c = achar();
      if (!c && f.querySelector('#nc').value.trim().length < 2) return msg('Informe o nome do cliente.');
      if (!dataSel || horaSel == null) return msg('Escolha o dia e o horário.');
      if (sel.size === 0) return msg('Escolha pelo menos um serviço.');

      const btnOk = f.querySelector('#nok');
      btnOk.disabled = true;

      const salvarAgendamento = async (forcar = false) => {
        const corpo = {
          servicos: [...sel], local, data: dataSel, inicio_min: horaSel,
          endereco: f.querySelector('#ned').value, referencia: f.querySelector('#nref').value,
          forcar,
          ...(c ? { cliente_id: c.id } : { nome: f.querySelector('#nc').value, whatsapp: f.querySelector('#nw').value }),
        };
        try {
          await api('/admin/agendamentos', { metodo: 'POST', corpo });
          fecharFolha();
          S.dia = corpo.data;
          aviso(forcar ? 'Agendamento confirmado' : 'Agendamento criado');
          if (S.aba === 'agenda') telaAgenda();
          else recarregar();
        } catch (e) {
          btnOk.disabled = false;
          if (e.codigo === 'choque_horario' && e.conflito) {
            const conf = e.conflito;
            const fimConf = conf.inicio_min + conf.duracao_min;
            const continuar = await confirmar({
              titulo: '⚠️ Choque de Horário!',
              mensagem: `Já existe um agendamento para ${conf.cliente_nome} das ${hora(conf.inicio_min)} às ${hora(fimConf)}.\n\nDeseja manter ambos os atendimentos e agendar mesmo com esse choque de horário?\n(O agendamento anterior NÃO será apagado).`,
              textoOk: 'Sim, Agendar Mesmo Assim',
              textoCancelar: 'Não, Ajustar Horário',
            });
            if (continuar) {
              btnOk.disabled = true;
              await salvarAgendamento(true);
            }
            return;
          }
          msg(e.message);
        }
      };

      await salvarAgendamento(false);
    });
  });
}

// ======================================================================== financeiro
async function telaFinanceiro() {
  const mes = S.mes;
  const [f, d] = await Promise.all([seguro(() => api(`/admin/financeiro?mes=${mes}`)), seguro(() => api(`/admin/despesas?mes=${mes}`))]);
  if (!f || !d) return;
  const maior = Math.max(1, ...f.por_servico.map((s) => s.total));
  const variacao = f.faturado_anterior_centavos > 0 ? Math.round(((f.faturado_centavos - f.faturado_anterior_centavos) / f.faturado_anterior_centavos) * 100) : null;
  const ticket = f.atendimentos ? Math.round(f.faturado_centavos / f.atendimentos) : 0;
  conteudo().innerHTML = `
    <header class="cabeca"><div><h1 class="assinatura">Financeiro</h1></div></header>
    <div class="nav-data">
      <button class="icone-btn" id="ant" aria-label="Mês anterior">${icone('esq')}</button>
      <div class="data-atual" style="display:grid;place-items:center">${esc(mesAno(mes).replace(/^./, (c) => c.toUpperCase()).replace(' de ', ' de '))}</div>
      <button class="icone-btn" id="prox" aria-label="Próximo mês">${icone('dir')}</button>
    </div>
    <div class="numeros">
      <div><small>Faturado (Mês)</small><strong>${moeda(f.faturado_centavos)}</strong></div>
      <div><small>Despesas (Mês)</small><strong>${moeda(f.despesas_centavos)}</strong></div>
      <div><small>Lucro Líquido</small><strong>${moeda(f.lucro_centavos)}</strong></div>
    </div>
    ${f.hoje ? `
    <div class="caixa-dia-bloco">
      <div class="caixa-dia-topo">
        <div>
          <strong style="font-size:1rem;display:block">Caixa de Hoje (${dataCurta(f.hoje.data)})</strong>
          <span class="suave pequeno">${f.hoje.qtd_total} agendamento(s) · ${moeda(f.hoje.recebido_centavos || 0)} recebido(s)</span>
        </div>
        <span class="selo-texto ok">${moeda(f.hoje.recebido_centavos || 0)} em caixa</span>
      </div>

      <div class="grid-formas">
        <div class="card-forma ${f.hoje.por_forma?.pix?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">⚡ Pix</span>
          <strong class="card-forma-valor">${moeda(f.hoje.por_forma?.pix?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.hoje.por_forma?.pix?.qtd_recebido || 0} recebido(s)${f.hoje.por_forma?.pix?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.hoje.por_forma.pix.a_receber_centavos)} pend.</span>` : ''}</span>
        </div>
        <div class="card-forma ${f.hoje.por_forma?.dinheiro?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">💵 Dinheiro</span>
          <strong class="card-forma-valor">${moeda(f.hoje.por_forma?.dinheiro?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.hoje.por_forma?.dinheiro?.qtd_recebido || 0} recebido(s)${f.hoje.por_forma?.dinheiro?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.hoje.por_forma.dinheiro.a_receber_centavos)} pend.</span>` : ''}</span>
        </div>
        <div class="card-forma ${f.hoje.por_forma?.cartao?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">💳 Cartão</span>
          <strong class="card-forma-valor">${moeda(f.hoje.por_forma?.cartao?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.hoje.por_forma?.cartao?.qtd_recebido || 0} recebido(s)${f.hoje.por_forma?.cartao?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.hoje.por_forma.cartao.a_receber_centavos)} pend.</span>` : ''}</span>
        </div>
        ${((f.hoje.pendente_fechamento_centavos || 0) > 0 || (f.hoje.a_receber_centavos || 0) > 0) ? `
        <div class="card-forma alerta-pendente">
          <span class="card-forma-titulo" style="color:#b45309">⏳ Pendentes</span>
          <strong class="card-forma-valor" style="color:#b45309">${moeda((f.hoje.pendente_fechamento_centavos || 0) + (f.hoje.a_receber_centavos || 0))}</strong>
          <span class="card-forma-sub">${f.hoje.qtd_pendente_fechamento || 0} a fechar${(f.hoje.a_receber_centavos || 0) > 0 ? ` · ${moeda(f.hoje.a_receber_centavos)} a receber` : ''}</span>
        </div>` : ''}
      </div>

      ${f.proximo_dia ? `
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--linha);display:flex;justify-content:space-between;align-items:center">
        <span class="suave pequeno">Previsão Próximo dia (${dataCurta(f.proximo_dia.data)})</span>
        <span class="negrito pequeno" style="color:var(--ouro-escuro)">${moeda(f.proximo_dia.previsto_centavos)} <span class="suave pequeno" style="font-weight:normal">(${f.proximo_dia.qtd_agendados} agendado(s))</span></span>
      </div>` : ''}
    </div>` : ''}
    <div style="margin-top:8px">
      <div class="linha-valor"><span>Recebido</span><span>${moeda(f.recebido_centavos)}</span></div>
      <div class="linha-valor"><span>A receber</span><span>${moeda(f.a_receber_centavos)}</span></div>
      ${f.acrescimos_centavos > 0 ? `<div class="linha-valor"><span>Acréscimos</span><span>+${moeda(f.acrescimos_centavos)}</span></div>` : ''}
      <div class="linha-valor"><span>Descontos dados</span><span>${moeda(f.descontos_centavos)}</span></div>
      <div class="linha-valor"><span>Atendimentos concluídos</span><span>${f.atendimentos}${f.atendimentos ? ` · média ${moeda(ticket)}` : ''}</span></div>
      ${variacao != null ? `<div class="linha-valor"><span>Comparado ao mês anterior</span><span>${variacao >= 0 ? '+' : ''}${variacao}%</span></div>` : ''}
    </div>
    <section class="secao">
      <h2>Formas de pagamento no mês</h2>
      <p class="sub-texto">Total recebido e a receber no mês por forma de pagamento.</p>
      <div class="grid-formas" style="margin-top:12px">
        <div class="card-forma ${f.por_forma?.pix?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">⚡ Pix</span>
          <strong class="card-forma-valor">${moeda(f.por_forma?.pix?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.por_forma?.pix?.qtd_recebido || 0} recebido(s)${f.por_forma?.pix?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.por_forma.pix.a_receber_centavos)} a receber</span>` : ''}</span>
        </div>
        <div class="card-forma ${f.por_forma?.dinheiro?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">💵 Dinheiro</span>
          <strong class="card-forma-valor">${moeda(f.por_forma?.dinheiro?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.por_forma?.dinheiro?.qtd_recebido || 0} recebido(s)${f.por_forma?.dinheiro?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.por_forma.dinheiro.a_receber_centavos)} a receber</span>` : ''}</span>
        </div>
        <div class="card-forma ${f.por_forma?.cartao?.recebido_centavos > 0 ? 'destaque' : ''}">
          <span class="card-forma-titulo">💳 Cartão</span>
          <strong class="card-forma-valor">${moeda(f.por_forma?.cartao?.recebido_centavos || 0)}</strong>
          <span class="card-forma-sub">${f.por_forma?.cartao?.qtd_recebido || 0} recebido(s)${f.por_forma?.cartao?.a_receber_centavos > 0 ? ` · <span style="color:var(--erro)">${moeda(f.por_forma.cartao.a_receber_centavos)} a receber</span>` : ''}</span>
        </div>
      </div>
    </section>
    <section class="secao"><h2>Por serviço</h2><p class="sub-texto">Valores de tabela, antes dos descontos.</p>
      ${f.por_servico.map((s) => `<div style="margin-top:14px"><div class="linha-valor" style="border:0;padding:0"><span>${esc(s.nome)} <span class="suave pequeno">× ${s.qtd}</span></span><span class="negrito">${moeda(s.total)}</span></div>
        <div class="barra-servico"><i style="width:${Math.round((s.total / maior) * 100)}%"></i></div></div>`).join('') || '<p class="vazio">Nenhum atendimento concluído neste mês.</p>'}</section>
    <section class="secao"><h2>A receber</h2>
      ${f.a_receber_lista.map((a) => `<div class="item-simples"><div><div class="negrito">${esc(a.cliente_nome)}</div><div class="pequeno suave">${dataCurta(a.data)} · ${moeda(a.valor_centavos)}</div></div>
        <div style="display:flex;gap:8px"><button class="botao sec pequeno" data-qr="${a.id}">Pix</button><button class="botao pequeno" data-pago="${a.id}">Recebi</button></div></div>`).join('') || '<p class="vazio">Nada pendente.</p>'}</section>
    <section class="secao"><h2>Despesas</h2><p class="sub-texto">Material, transporte, taxas…</p>
      ${d.despesas.map((x) => `<div class="item-simples"><div><div>${esc(x.descricao)}</div><div class="pequeno suave">${dataCurta(x.data)}${x.categoria ? ` · ${esc(x.categoria)}` : ''}</div></div>
        <div style="display:flex;gap:10px;align-items:center"><span class="negrito">${moeda(x.valor_centavos)}</span><button class="link perigo" data-del="${x.id}" aria-label="Remover ${esc(x.descricao)}">Remover</button></div></div>`).join('')}
      <div class="acoes"><button class="botao sec" id="novad">Adicionar despesa</button></div></section>`;
  const c = conteudo();
  c.querySelector('#ant').addEventListener('click', () => { S.mes = somaMeses(mes, -1); telaFinanceiro(); });
  c.querySelector('#prox').addEventListener('click', () => { S.mes = somaMeses(mes, 1); telaFinanceiro(); });
  c.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', async () => {
    if (await seguro(() => api(`/admin/agendamentos/${b.dataset.pago}`, { metodo: 'PATCH', corpo: { pago: true } }))) { aviso('Pagamento registrado'); telaFinanceiro(); }
  }));
  c.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => {
    const a = f.a_receber_lista.find((x) => x.id === Number(b.dataset.qr));
    folhaQr(a, a.valor_centavos, telaFinanceiro);
  }));
  c.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Remover despesa?',
      mensagem: 'Esta despesa será excluída do financeiro.',
      textoOk: 'Sim, remover',
      textoCancelar: 'Voltar',
      perigo: true,
    });
    if (!ok) return;
    if (await seguro(() => api(`/admin/despesas/${b.dataset.del}`, { metodo: 'DELETE' }))) { aviso('Despesa removida'); telaFinanceiro(); }
  }));
  c.querySelector('#novad').addEventListener('click', () => folha(`<h2>Nova despesa</h2>
    <div class="campo"><label for="dd">Descrição</label><input id="dd" maxlength="100" placeholder="Ex.: esmaltes, algodão, gasolina" autofocus></div>
    <div class="grade2"><div class="campo"><label for="dv">Valor (R$)</label><input id="dv" inputmode="decimal" placeholder="0,00"></div>
      <div class="campo"><label for="dt">Data</label><input id="dt" type="date" value="${mes === S.hoje.slice(0, 7) ? S.hoje : mes + '-01'}"></div></div>
    <div class="campo"><label for="dc">Categoria (opcional)</label><input id="dc" maxlength="40" placeholder="Material, transporte…"></div>
    <div id="dmsg"></div><div class="acoes"><button class="botao" id="dok">Salvar despesa</button></div>`, (fo) => {
    fo.querySelector('#dok').addEventListener('click', async () => {
      const v = lerDinheiro(fo.querySelector('#dv').value);
      const msg = (t) => (fo.querySelector('#dmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(t)}</div>`);
      if (!fo.querySelector('#dd').value.trim()) return msg('Informe a descrição.');
      if (!v) return msg('Informe um valor maior que zero.');
      try { await api('/admin/despesas', { metodo: 'POST', corpo: { descricao: fo.querySelector('#dd').value, valor_centavos: v, data: fo.querySelector('#dt').value, categoria: fo.querySelector('#dc').value } });
        fecharFolha(); aviso('Despesa salva'); telaFinanceiro(); } catch (e) { msg(e.message); }
    });
  }));
}

// ======================================================================== serviços
async function telaServicos() {
  const r = await seguro(() => api('/admin/servicos'));
  if (!r) return;
  S.servicos = r.servicos;
  conteudo().innerHTML = `
    <header class="cabeca"><div><h1 class="assinatura">Serviços</h1><p>Preços e tempo de cada atendimento. O tempo define os horários que o cliente vê.</p></div></header>
    <div>${r.servicos.map((s, i) => `
      <div class="item-simples" style="${s.ativo ? '' : 'opacity:.55'}">
        <button class="atendimento" style="grid-template-columns:1fr auto;border:0;padding:0" data-edit="${s.id}">
          <span><span class="cliente">${esc(s.nome)}${s.ativo ? '' : ' <span class="selo-texto">Oculto</span>'}</span>
            <span class="servicos" style="display:block">${duracao(s.duracao_min)}${s.descricao ? ' · ' + esc(s.descricao) : ''}</span></span>
          <span class="negrito">${moeda(s.preco_centavos)}</span></button>
        <span style="display:flex;flex-direction:column;gap:2px">
          <button class="icone-btn" style="width:34px;height:30px;border-radius:10px" data-mv="${s.id}" data-d="cima" aria-label="Subir ${esc(s.nome)}" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
          <button class="icone-btn" style="width:34px;height:30px;border-radius:10px" data-mv="${s.id}" data-d="baixo" aria-label="Descer ${esc(s.nome)}" ${i === r.servicos.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button></span>
      </div>`).join('')}</div>
    <div class="acoes"><button class="botao" id="novo">Novo serviço</button></div>`;
  const c = conteudo();
  c.querySelector('#novo').addEventListener('click', () => folhaServico(null));
  c.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => folhaServico(r.servicos.find((s) => s.id === Number(b.dataset.edit)))));
  c.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', async () => {
    if (await seguro(() => api(`/admin/servicos/${b.dataset.mv}/mover`, { metodo: 'POST', corpo: { direcao: b.dataset.d } }))) telaServicos();
  }));
}

function folhaServico(s) {
  folha(`<h2>${s ? 'Editar serviço' : 'Novo serviço'}</h2>
    <div class="campo"><label for="sn">Nome</label><input id="sn" maxlength="80" value="${esc(s?.nome || '')}" autofocus></div>
    <div class="campo"><label for="sd">Descrição (opcional)</label><input id="sd" maxlength="200" value="${esc(s?.descricao || '')}" placeholder="O que está incluído"></div>
    <div class="grade2"><div class="campo"><label for="sp">Preço (R$)</label><input id="sp" inputmode="decimal" value="${s ? centavosParaCampo(s.preco_centavos) : ''}"></div>
      <div class="campo"><label for="st">Duração (minutos)</label><input id="st" type="number" inputmode="numeric" min="5" max="720" step="5" value="${s?.duracao_min || ''}"></div></div>
    <label class="interruptor" style="margin-top:8px"><span>Mostrar para os clientes</span><input type="checkbox" id="sa" ${!s || s.ativo ? 'checked' : ''}><span class="trilho"></span></label>
    <div id="smsg"></div>
    <div class="acoes"><button class="botao" id="sok">Salvar</button>${s ? '<button class="botao perigo" id="sdel">Excluir serviço</button>' : ''}</div>`, (f) => {
    f.querySelector('#sok').addEventListener('click', async () => {
      const preco = lerDinheiro(f.querySelector('#sp').value), dur = Number(f.querySelector('#st').value);
      const msg = (t) => (f.querySelector('#smsg').innerHTML = `<div class="aviso erro" role="alert">${esc(t)}</div>`);
      if (!f.querySelector('#sn').value.trim()) return msg('Informe o nome do serviço.');
      if (preco == null) return msg('Informe o preço.');
      if (!Number.isInteger(dur) || dur < 5) return msg('Informe a duração em minutos (mínimo 5).');
      const corpo = { nome: f.querySelector('#sn').value, descricao: f.querySelector('#sd').value, preco_centavos: preco, duracao_min: dur, ativo: f.querySelector('#sa').checked };
      try { await api(s ? `/admin/servicos/${s.id}` : '/admin/servicos', { metodo: s ? 'PUT' : 'POST', corpo }); fecharFolha(); aviso('Serviço salvo'); telaServicos(); }
      catch (e) { msg(e.message); }
    });
    f.querySelector('#sdel')?.addEventListener('click', async () => {
      const ok = await confirmar({
        titulo: 'Excluir serviço?',
        mensagem: 'Os atendimentos antigos continuarão no histórico. Para apenas esconder das clientes, desligue a opção "Mostrar para os clientes".',
        textoOk: 'Sim, excluir serviço',
        textoCancelar: 'Voltar',
        perigo: true,
      });
      if (!ok) return;
      if (await seguro(() => api(`/admin/servicos/${s.id}`, { metodo: 'DELETE' }))) { fecharFolha(); aviso('Serviço excluído'); telaServicos(); }
    });
  });
}

// ======================================================================== ajustes
async function telaAjustes() {
  const r = await seguro(() => api('/admin/config'));
  if (!r) return;
  const cfg = r.config; S.config = cfg;
  const link = `${location.origin}/`;
  conteudo().innerHTML = `
    <header class="cabeca"><div><h1 class="assinatura">Ajustes</h1></div></header>

    <section class="secao" style="margin-top:12px"><h2>Link para os clientes</h2><p class="sub-texto">Envie para quem quiser marcar horário. Coloque também no Instagram.</p>
      <div class="cartao-link">${esc(link)}</div>
      <div class="acoes duas"><button class="botao sec" id="copiar">Copiar link</button>
        <a class="botao" href="${linkWhatsapp('', '')}" id="compartilhar">Enviar no WhatsApp</a></div></section>

    <section class="secao"><h2>Seu negócio</h2>
      <div class="campo"><label for="c-nome">Nome</label><input id="c-nome" maxlength="80" value="${esc(cfg.nome_negocio)}"></div>
      <div class="campo"><label for="c-whats">Seu WhatsApp</label><input id="c-whats" type="tel" inputmode="tel" value="${esc(mascaraWhatsapp(cfg.whatsapp))}" placeholder="(83) 99999-0000"><span class="dica">O cliente usa este número para avisar que marcou e para falar com você.</span></div>
      <label class="interruptor"><span>Atendo no meu espaço</span><input type="checkbox" id="c-esp" ${cfg.atende_espaco ? 'checked' : ''}><span class="trilho"></span></label>
      <div class="campo" id="c-end-w"><label for="c-end">Endereço do espaço</label><input id="c-end" maxlength="200" value="${esc(cfg.endereco_espaco)}"></div>
      <label class="interruptor"><span>Atendo a domicílio</span><input type="checkbox" id="c-dom" ${cfg.atende_domicilio ? 'checked' : ''}><span class="trilho"></span></label>
      <p class="dica suave pequeno" style="margin-top:4px">Deixe desmarcado para atender exclusivamente no seu espaço.</p>
      <div class="acoes" style="margin-top:14px">
        <button class="botao" id="salvar-negocio" type="button">Salvar ajustes</button>
      </div></section>

    <section class="secao"><h2>Agenda</h2><p class="sub-texto">Regras para os horários que o cliente enxerga.</p>
      <div class="grade2">
        <div class="campo"><label for="c-resp">Respiro no espaço (min)</label><input id="c-resp" type="number" inputmode="numeric" min="0" value="${cfg.respiro_min}"></div>
        <div class="campo"><label for="c-desl">Deslocamento (min)</label><input id="c-desl" type="number" inputmode="numeric" min="0" value="${cfg.deslocamento_min}"></div>
        <div class="campo"><label for="c-ant">Antecedência mínima (min)</label><input id="c-ant" type="number" inputmode="numeric" min="0" value="${cfg.antecedencia_min}"></div>
        <div class="campo"><label for="c-jan">Marcar até (dias à frente)</label><input id="c-jan" type="number" inputmode="numeric" min="1" max="365" value="${cfg.janela_dias}"></div>
        <div class="campo"><label for="c-passo">Horários a cada (min)</label><input id="c-passo" type="number" inputmode="numeric" min="5" step="5" value="${cfg.passo_min}"></div>
        <div class="campo"><label for="c-canc">Cancelar até (horas antes)</label><input id="c-canc" type="number" inputmode="numeric" min="0" value="${cfg.cancelar_horas}"></div></div>
      <p class="dica suave pequeno" style="margin-top:8px">Respiro vale entre atendimentos no espaço; deslocamento vale quando um dos dois é a domicílio. Os dois nunca se somam.</p>
      <label class="interruptor" style="margin-top:8px"><span>Encaixar logo após o atendimento anterior<br><span class="suave pequeno">Evita buracos na agenda (ex.: 09:25 em vez de 09:30)</span></span><input type="checkbox" id="c-col" ${cfg.encaixar_colado ? 'checked' : ''}><span class="trilho"></span></label></section>

    <section class="secao"><h2>Fidelização de clientes</h2><p class="sub-texto">Acompanhe clientes ausentes para enviar mensagem de retorno.</p>
      <div class="campo"><label for="c-sumidos">Alertar clientes ausentes após (dias sem voltar)</label>
        <input id="c-sumidos" type="number" inputmode="numeric" min="3" max="365" value="${cfg.alerta_sumidos_dias || 15}">
        <span class="dica">Padrão: 15 dias. O painel e a lista de fidelização alertarão clientes cujo último atendimento ultrapassou esse período sem novo agendamento.</span></div></section>

    <section class="secao"><h2>Pix <span class="suave pequeno" style="font-weight:400">(Opcional)</span></h2>
      <p class="sub-texto">Usado para gerar o QR Code ao concluir um atendimento. <strong>Se você não usa Pix no aplicativo, pode deixar em branco — os ajustes serão salvos normalmente.</strong></p><p class="sub-texto">Usado para gerar o QR Code ao concluir um atendimento.</p>
      <div class="campo"><span class="rotulo">Tipo da chave</span><div class="segmentos" id="c-tipo" style="grid-auto-flow:row;grid-template-columns:repeat(3,1fr)">${[['telefone', 'Telefone'], ['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['aleatoria', 'Aleatória']].map(([k, t]) => `<button type="button" data-t="${k}" aria-pressed="${cfg.pix_tipo === k}">${t}</button>`).join('')}</div></div>
      <div class="campo"><label for="c-chave">Chave Pix</label><input id="c-chave" maxlength="80" value="${esc(cfg.pix_chave)}" autocomplete="off"></div>
      <div class="campo"><label for="c-pnome">Nome que aparece para quem paga</label><input id="c-pnome" maxlength="25" value="${esc(cfg.pix_nome)}" placeholder="Como está no banco (até 25 letras)"></div>
      <div class="campo"><label for="c-pcid">Cidade</label><input id="c-pcid" maxlength="15" value="${esc(cfg.pix_cidade)}" placeholder="Campina Grande"></div></section>

    <section class="secao" id="secao-whatsapp">
      <h2>WhatsApp — Notificações Automáticas</h2>
      <p class="sub-texto">Conecte seu WhatsApp para que suas clientes recebam confirmações imediatas e lembretes automáticos dos agendamentos.</p>
      <div id="zap-conteudo" style="margin-top:14px">
        <div class="suave pequeno" style="padding:12px 0">Verificando status da conexão...</div>
      </div>
    </section>

    <div class="acoes" style="position:sticky;bottom:calc(76px + env(safe-area-inset-bottom,0px));background:linear-gradient(transparent,#fff 30%);padding-top:18px;margin-top:8px">
      <button class="botao" id="salvar">Salvar ajustes</button></div>

    <section class="secao"><h2>Expediente</h2><p class="sub-texto">Dias e horários em que você atende.</p>
      <div id="expediente">${r.expediente.map((e) => `
        <div class="expediente-linha" data-dia="${e.dia}">
          <label class="interruptor"><span class="negrito">${DIAS[e.dia]}</span><input type="checkbox" class="e-ativo" ${e.ativo ? 'checked' : ''}><span class="trilho"></span></label>
          <div class="horas-campos" ${e.ativo ? '' : 'hidden'}>
            <label>Começa<input type="time" class="e-ini" value="${minParaCampo(e.inicio_min)}"></label>
            <label>Termina<input type="time" class="e-fim" value="${minParaCampo(e.fim_min)}"></label>
            <label>Pausa de<input type="time" class="e-pi" value="${e.pausa_inicio_min != null ? minParaCampo(e.pausa_inicio_min) : ''}"></label>
            <label>até<input type="time" class="e-pf" value="${e.pausa_fim_min != null ? minParaCampo(e.pausa_fim_min) : ''}"></label>
          </div></div>`).join('')}</div>
      <div class="acoes"><button class="botao" id="salvar-exp">Salvar expediente</button></div></section>

    <section class="secao"><h2>Folgas e bloqueios</h2><p class="sub-texto">Datas ou horários em que o cliente não pode marcar.</p>
      ${r.bloqueios.map((b) => `<div class="item-simples"><div><div>${esc(dataLonga(b.data))}</div><div class="pequeno suave">${b.inicio_min === 0 && b.fim_min === 1440 ? 'Dia inteiro' : `${hora(b.inicio_min)} às ${hora(b.fim_min)}`}${b.motivo ? ' · ' + esc(b.motivo) : ''}</div></div>
        <button class="link perigo" data-bdel="${b.id}">Remover</button></div>`).join('') || '<p class="vazio">Nenhum bloqueio futuro.</p>'}
      <div class="acoes"><button class="botao sec" id="novo-bloq">Bloquear data ou horário</button></div></section>

    <section class="secao"><h2>Segurança</h2>
      <div class="acoes"><button class="botao sec" id="trocar">Trocar senha</button><button class="botao sec" id="sair">Sair</button></div></section>`;

  const c = conteudo();
  const $ = (s) => c.querySelector(s);
  $('#copiar')?.addEventListener('click', async () => aviso((await copiar(link)) ? 'Link copiado' : 'Não deu para copiar', false));
  $('#compartilhar')?.addEventListener('click', (e) => { e.preventDefault(); location.href = `https://wa.me/?text=${encodeURIComponent('Agende seu horário comigo: ' + link)}`; });
  $('#c-whats').addEventListener('input', (e) => { e.target.value = mascaraWhatsapp(e.target.value); });
  const endVis = () => { $('#c-end-w').hidden = !$('#c-esp').checked; }; endVis(); $('#c-esp').addEventListener('change', endVis);
  let tipo = cfg.pix_tipo;
  c.querySelectorAll('#c-tipo button').forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.t; c.querySelectorAll('#c-tipo button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  c.querySelectorAll('.expediente-linha').forEach((l) => l.querySelector('.e-ativo').addEventListener('change', (e) => { l.querySelector('.horas-campos').hidden = !e.target.checked; }));

  const salvarAjustesGerais = async (btn) => {
    if (btn) btn.disabled = true;
    try {
      const corpo = {
        nome_negocio: $('#c-nome').value, whatsapp: $('#c-whats').value, atende_espaco: $('#c-esp').checked, endereco_espaco: $('#c-end').value,
        atende_domicilio: $('#c-dom').checked, respiro_min: $('#c-resp').value, deslocamento_min: $('#c-desl').value, antecedencia_min: $('#c-ant').value,
        janela_dias: $('#c-jan').value, passo_min: $('#c-passo').value, cancelar_horas: $('#c-canc').value, encaixar_colado: $('#c-col').checked,
        alerta_sumidos_dias: $('#c-sumidos').value,
        pix_tipo: tipo, pix_chave: $('#c-chave').value, pix_nome: $('#c-pnome').value, pix_cidade: $('#c-pcid').value,
      };
      for (const k of ['respiro_min', 'deslocamento_min', 'antecedencia_min', 'janela_dias', 'passo_min', 'cancelar_horas', 'alerta_sumidos_dias']) corpo[k] = Number(corpo[k]);
      const r2 = await seguro(() => api('/admin/config', { metodo: 'PUT', corpo }));
      if (r2) {
        S.config = r2.config;
        cfg = r2.config;
        aviso('Ajustes salvos com sucesso!');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  $('#salvar')?.addEventListener('click', (e) => salvarAjustesGerais(e.target));
  $('#salvar-negocio')?.addEventListener('click', (e) => salvarAjustesGerais(e.target));
  $('#salvar-exp').addEventListener('click', async () => {
    const dias = [...c.querySelectorAll('.expediente-linha')].map((l) => {
      const pi = campoParaMin(l.querySelector('.e-pi').value), pf = campoParaMin(l.querySelector('.e-pf').value);
      return { dia: Number(l.dataset.dia), ativo: l.querySelector('.e-ativo').checked, inicio_min: campoParaMin(l.querySelector('.e-ini').value) ?? 480,
        fim_min: campoParaMin(l.querySelector('.e-fim').value) ?? 1020, pausa_inicio_min: pi != null && pf != null ? pi : null, pausa_fim_min: pi != null && pf != null ? pf : null };
    });
    if (await seguro(() => api('/admin/expediente', { metodo: 'PUT', corpo: { dias } }))) aviso('Expediente salvo');
  });
  c.querySelectorAll('[data-bdel]').forEach((b) => b.addEventListener('click', async () => {
    if (await seguro(() => api(`/admin/bloqueios/${b.dataset.bdel}`, { metodo: 'DELETE' }))) { aviso('Bloqueio removido'); telaAjustes(); }
  }));
  $('#novo-bloq').addEventListener('click', () => folhaBloquear(S.hoje, telaAjustes));
  $('#btn-ajustes-mensalidades')?.addEventListener('click', () => folhaMensalidades());
  $('#sair').addEventListener('click', async () => { await api('/admin/logout', { metodo: 'POST', corpo: {} }).catch(() => {}); S.config = null; iniciar(); });
  $('#trocar').addEventListener('click', () => folha(`<h2>Trocar senha</h2>
    <div class="campo"><label for="pa">Senha atual</label><input id="pa" type="password" autocomplete="current-password" autofocus></div>
    <div class="campo"><label for="pn">Nova senha (mínimo 6 caracteres)</label><input id="pn" type="password" autocomplete="new-password"></div>
    <div id="pmsg"></div><div class="acoes"><button class="botao" id="pok">Trocar senha</button></div>`, (f) => {
    f.querySelector('#pok').addEventListener('click', async () => {
      try { await api('/admin/senha', { metodo: 'POST', corpo: { atual: f.querySelector('#pa').value, nova: f.querySelector('#pn').value } }); fecharFolha(); aviso('Senha trocada'); }
      catch (e) { f.querySelector('#pmsg').innerHTML = `<div class="aviso erro" role="alert">${esc(e.message)}</div>`; }
    });
  }));

  // WhatsApp — Conexão e QR Code
  const zapContainer = $('#zap-conteudo');
  function renderizarQr(qr) {
    if (!qr) return '';
    if (typeof qr === 'string' && qr.startsWith('data:image')) {
      return `<img src="${qr}" alt="QR Code WhatsApp" style="width:220px;height:220px;display:block;margin:0 auto;border-radius:6px;object-fit:contain" />`;
    }
    try {
      return qrSvg(qr);
    } catch {
      return '<p class="pequeno erro">Erro ao processar QR Code</p>';
    }
  }

  async function renderizarWhatsApp() {
    if (!zapContainer) return;
    try {
      const st = await api('/admin/whatsapp/status');
      if (st.status === 'connected') {
        if (S.zapIntervalo) { clearInterval(S.zapIntervalo); S.zapIntervalo = null; }
        const foneFmt = st.userPhone ? mascaraWhatsapp(st.userPhone) : (cfg.whatsapp ? mascaraWhatsapp(cfg.whatsapp) : 'Conectado');
        zapContainer.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e"></span>
                <strong style="color:#166534">WhatsApp Conectado</strong>
              </div>
              <span class="pequeno suave">${esc(foneFmt)}</span>
            </div>
            <p class="pequeno suave" style="margin:0">Suas clientes receberão mensagens automáticas de confirmação e lembretes por este número.</p>
            <div class="acoes duas" style="margin-top:4px">
              <button class="botao sec pequeno" id="zap-btn-teste" type="button">Enviar mensagem de teste</button>
              <button class="botao sec pequeno perigo" id="zap-btn-desconectar" type="button">Desconectar</button>
            </div>
          </div>
        `;
        zapContainer.querySelector('#zap-btn-teste')?.addEventListener('click', async (e) => {
          const btn = e.target;
          btn.disabled = true;
          try {
            await api('/admin/whatsapp/teste', { metodo: 'POST', corpo: {} });
            aviso('Mensagem de teste enviada com sucesso no seu WhatsApp!');
          } catch (err) {
            aviso(err.message || 'Erro ao enviar mensagem de teste', true);
          } finally {
            btn.disabled = false;
          }
        });
        zapContainer.querySelector('#zap-btn-desconectar')?.addEventListener('click', async () => {
          if (!confirmar('Deseja realmente desconectar o WhatsApp da sua agenda?')) return;
          try {
            await api('/admin/whatsapp/desconectar', { metodo: 'POST', corpo: {} });
            aviso('WhatsApp desconectado.');
            renderizarWhatsApp();
          } catch (err) {
            aviso(err.message || 'Erro ao desconectar', true);
          }
        });
      } else if (st.qr) {
        zapContainer.innerHTML = `
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center">
            <div style="display:inline-block;padding:10px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
              <div id="zap-qr-svg" style="max-width:220px;margin:0 auto">${renderizarQr(st.qr)}</div>
            </div>
            <p class="negrito" style="margin:12px 0 4px">Escaneie com seu WhatsApp</p>
            <p class="pequeno suave" style="margin:0 0 12px">No seu celular: WhatsApp > Aparelhos conectados > Conectar um aparelho</p>
            <div class="acoes" style="justify-content:center">
              <button class="botao sec pequeno" id="zap-btn-cancelar" type="button">Cancelar</button>
            </div>
          </div>
        `;
        zapContainer.querySelector('#zap-btn-cancelar')?.addEventListener('click', async () => {
          if (S.zapIntervalo) { clearInterval(S.zapIntervalo); S.zapIntervalo = null; }
          await api('/admin/whatsapp/desconectar', { metodo: 'POST', corpo: {} }).catch(() => {});
          renderizarWhatsApp();
        });
        let ultimoQr = st.qr;
        if (!S.zapIntervalo) {
          S.zapIntervalo = setInterval(async () => {
            const check = await api('/admin/whatsapp/status').catch(() => null);
            if (check?.status === 'connected') {
              clearInterval(S.zapIntervalo);
              S.zapIntervalo = null;
              aviso('WhatsApp conectado com sucesso!');
              renderizarWhatsApp();
            } else if (check?.qr && check.qr !== ultimoQr) {
              ultimoQr = check.qr;
              const imgEl = document.querySelector('#zap-qr-svg img');
              if (imgEl && check.qr.startsWith('data:image')) {
                imgEl.src = check.qr;
              } else {
                const el = document.getElementById('zap-qr-svg');
                if (el) el.innerHTML = renderizarQr(check.qr);
              }
            }
          }, 2500);
        }
      } else if (st.status === 'connecting') {
        zapContainer.innerHTML = `
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;text-align:center">
            <p class="negrito" style="margin:0 0 6px">Gerando QR Code...</p>
            <p class="pequeno suave" style="margin:0 0 14px">Aguarde alguns segundos enquanto preparamos a conexão com o WhatsApp.</p>
            <div class="acoes" style="justify-content:center">
              <button class="botao sec pequeno" id="zap-btn-cancelar" type="button">Cancelar</button>
            </div>
          </div>
        `;
        zapContainer.querySelector('#zap-btn-cancelar')?.addEventListener('click', async () => {
          if (S.zapIntervalo) { clearInterval(S.zapIntervalo); S.zapIntervalo = null; }
          await api('/admin/whatsapp/desconectar', { metodo: 'POST', corpo: {} }).catch(() => {});
          renderizarWhatsApp();
        });
        if (!S.zapIntervalo) {
          S.zapIntervalo = setInterval(async () => {
            const check = await api('/admin/whatsapp/status').catch(() => null);
            if (check?.status === 'connected' || check?.qr) {
              clearInterval(S.zapIntervalo);
              S.zapIntervalo = null;
              renderizarWhatsApp();
            }
          }, 2500);
        }
      } else {
        if (S.zapIntervalo) { clearInterval(S.zapIntervalo); S.zapIntervalo = null; }
        zapContainer.innerHTML = `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#94a3b8"></span>
              <strong>WhatsApp Desconectado</strong>
            </div>
            <p class="pequeno suave" style="margin:0">Conecte o seu WhatsApp para ativar as notificações e lembretes automáticos das clientes.</p>
            <div class="acoes" style="margin-top:6px">
              <button class="botao pequeno" id="zap-btn-conectar" type="button">Conectar WhatsApp</button>
            </div>
          </div>
        `;
        zapContainer.querySelector('#zap-btn-conectar')?.addEventListener('click', async (e) => {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = 'Gerando QR Code...';
          try {
            await api('/admin/whatsapp/conectar', { metodo: 'POST', corpo: {} });
            renderizarWhatsApp();
          } catch (err) {
            aviso(err.message || 'Erro ao iniciar conexão', true);
            btn.disabled = false;
            btn.textContent = 'Conectar WhatsApp';
          }
        });
      }
    } catch (err) {
      zapContainer.innerHTML = `<p class="aviso erro pequeno">Não foi possível carregar o status do WhatsApp: ${esc(err.message)}</p>`;
    }
  }

  renderizarWhatsApp();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
iniciar();
