import {
  esc, moeda, duracao, hora, dataLonga, dataCurta, diaSemanaCurto, diaDoMes, mesNome, api, aviso, copiar, SELO_SVG,
  mascaraWhatsapp, linkWhatsapp, confirmar, ajustarExclusividadeServicos,
} from './comum.js';

const app = document.getElementById('app');
const GUARDA = 'jussara.cliente';
const ler = () => { try { return JSON.parse(localStorage.getItem(GUARDA) || '{}'); } catch { return {}; } };
const gravar = (o) => { try { localStorage.setItem(GUARDA, JSON.stringify({ ...ler(), ...o })); } catch { /* ignore */ } };

const S = { cfg: null, ids: new Set(), local: null, dispo: null, data: null, inicio: null, enviando: false };

const nomeLocal = (l) => (l === 'domicilio' ? 'A domicílio' : 'No espaço');
const selecionados = () => S.cfg.servicos.filter((s) => S.ids.has(s.id));
const totais = () => selecionados().reduce((t, s) => ({ preco: t.preco + s.preco_centavos, min: t.min + s.duracao_min }), { preco: 0, min: 0 });

function marca(titulo, sub, compacta = true) {
  const logoSrc = S.cfg?.logo_customizada || '/img/logo.png';
  return `<header class="marca${compacta ? ' compacta' : ''}">
    <img src="${esc(logoSrc)}" alt="${esc(S.cfg?.nome || 'Jerusa Beauty')}" width="108" height="108" style="object-fit:cover;aspect-ratio:1/1;border-radius:18px;">
    <h1>${esc(titulo)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>`;
}
function passos(atual, total) {
  return `<div class="passos" role="img" aria-label="Passo ${atual} de ${total}">${Array.from({ length: total }, (_, i) =>
    `<i class="${i + 1 < atual ? 'feito' : i + 1 === atual ? 'atual' : ''}"></i>`).join('')}</div>`;
}
const iniciar = (html) => { app.innerHTML = html; window.scrollTo(0, 0); };
const dois = () => (S.cfg.atende_espaco && S.cfg.atende_domicilio ? 4 : 3);
const posicao = (n) => (dois() === 3 && n > 2 ? n - 1 : n);

// ---------------------------------------------------------------- passo 1: dia e hora
async function telaHorario(banner = '') {
  iniciar(`
    ${marca('Agende seu horário', 'Escolha o melhor dia e horário para o seu atendimento.', false)}
    ${passos(1, dois())}
    ${banner}
    <p class="vazio" id="carga">Buscando horários livres…</p>`);
  try {
    if (!S.dispo) {
      const q = new URLSearchParams();
      if (S.ids.size) q.set('servicos', [...S.ids].join(','));
      if (S.local) q.set('local', S.local);
      const qs = q.toString() ? `?${q.toString()}` : '';
      S.dispo = await api(`/publico/disponibilidade${qs}`);
    }
  } catch (e) {
    app.querySelector('#carga').outerHTML = `<div class="aviso erro">${esc(e.message)}</div>
      <div class="acoes"><button class="botao" id="de-novo">Tentar de novo</button></div>`;
    app.querySelector('#de-novo').addEventListener('click', () => telaHorario(banner));
    return;
  }
  const dias = Object.keys(S.dispo.dias);
  if (dias.length === 0) {
    const wa = S.cfg.whatsapp ? `<div class="acoes"><a class="botao" href="${linkWhatsapp(S.cfg.whatsapp, 'Olá! Não encontrei horário livre no link de agendamento. Tem como me encaixar?')}">Chamar no WhatsApp</a></div>` : '';
    app.querySelector('#carga').outerHTML = `<p class="vazio">Não há horários livres nos próximos ${S.cfg.janela_dias} dias.</p>${wa}`;
    return;
  }
  if (!S.data || !S.dispo.dias[S.data]) { S.data = dias[0]; S.inicio = null; }
  desenharHorario();
}

function desenharHorario() {
  const todos = [];
  const d0 = S.dispo.hoje;
  for (let i = 0; i <= S.cfg.janela_dias; i++) {
    const d = new Date(d0 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    todos.push(d.toISOString().slice(0, 10));
  }
  let mesAtual = '';
  const tira = todos.map((d) => {
    const m = d.slice(0, 7);
    const marcaMes = m !== mesAtual ? `<span class="mes-marca">${mesNome(d)}</span>` : '';
    mesAtual = m;
    const livre = !!S.dispo.dias[d];
    return `${marcaMes}<button type="button" class="dia" data-dia="${d}" ${livre ? '' : 'disabled'} aria-pressed="${d === S.data}" aria-label="${esc(dataLonga(d))}${livre ? '' : ', sem horários'}">
      <small>${diaSemanaCurto(d)}</small><b>${diaDoMes(d)}</b></button>`;
  }).join('');
  const alvo = app.querySelector('#carga') || app.querySelector('#conteudo');
  const selTxt = selecionados().length ? `<p class="suave pequeno" style="text-align:center">${selecionados().map((s) => esc(s.nome)).join(' + ')}${S.local ? ` · ${nomeLocal(S.local)}` : ''}</p>` : '';
  const html = `<div id="conteudo">
    ${selTxt}
    <div class="dias" role="group" aria-label="Dia">${tira}</div>
    <h2 class="titulo" style="margin-top:12px" id="titulo-dia">${esc(dataLonga(S.data))}</h2>
    <div class="horas" role="group" aria-label="Horários livres">
      ${(S.dispo.dias[S.data] || []).map((m) => `<button type="button" class="hora" data-min="${m}" aria-pressed="${m === S.inicio}">${hora(m)}</button>`).join('')}
    </div>
    <div class="com-rodape"></div>
    <div class="rodape-acao"><div class="coluna">
      <div class="total"><strong>${S.inicio != null ? hora(S.inicio) : '—'}</strong><span class="pequeno suave">${diaSemanaCurto(S.data)}, ${dataCurta(S.data)}</span></div>
      <button class="botao" id="continuar" ${S.inicio != null ? '' : 'disabled'}>Continuar</button>
    </div></div></div>`;
  alvo.outerHTML = html;
  const ativo = app.querySelector('.dia[aria-pressed="true"]');
  ativo?.scrollIntoView({ inline: 'center', block: 'nearest' });
  app.querySelectorAll('.dia:not(:disabled)').forEach((b) => b.addEventListener('click', () => {
    if (S.data !== b.dataset.dia) S.inicio = null;
    S.data = b.dataset.dia; desenharHorario();
  }));
  app.querySelectorAll('.hora').forEach((b) => b.addEventListener('click', () => { S.inicio = Number(b.dataset.min); desenharHorario(); }));
  app.querySelector('#continuar').addEventListener('click', () => telaServicos());
}

// ---------------------------------------------------------------- passo 2: serviços
function telaServicos() {
  const { preco, min } = totais();
  iniciar(`
    ${marca('Serviços')}
    ${passos(2, dois())}
    <button class="voltar" id="voltar">← Voltar</button>
    <p class="suave pequeno" style="text-align:center;margin-top:-6px;margin-bottom:14px">${esc(dataLonga(S.data))} às ${hora(S.inicio)}</p>
    <h2 class="titulo">Serviços</h2>
    <div class="lista" role="group" aria-label="Serviços">
      ${S.cfg.servicos.map((s) => `
        <button type="button" class="opcao" data-id="${s.id}" aria-pressed="${S.ids.has(s.id)}">
          <span class="anel"></span>
          <span><span class="nome">${esc(s.nome)}</span>${s.descricao ? `<span class="detalhe" style="display:block">${esc(s.descricao)}</span>` : ''}</span>
          <span class="preco">${moeda(s.preco_centavos)}</span>
        </button>`).join('')}
    </div>
    ${S.cfg.servicos.length === 0 ? '<p class="vazio">Nenhum serviço disponível no momento.</p>' : ''}
    <div class="com-rodape"></div>
    <div class="rodape-acao"><div class="coluna">
      <div class="total" id="total">${totalHtml(preco, min)}</div>
      <button class="botao" id="continuar" ${S.ids.size ? '' : 'disabled'}>Continuar</button>
    </div></div>`);
  app.querySelector('#voltar').addEventListener('click', () => telaHorario());
  app.querySelectorAll('.opcao').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id);
    ajustarExclusividadeServicos(S.cfg.servicos, S.ids, id);
    app.querySelectorAll('.opcao').forEach((x) => {
      const xId = Number(x.dataset.id);
      x.setAttribute('aria-pressed', S.ids.has(xId));
    });
    const t = totais();
    app.querySelector('#total').innerHTML = totalHtml(t.preco, t.min);
    app.querySelector('#continuar').disabled = S.ids.size === 0;
    S.dispo = null;
  }));
  app.querySelector('#continuar').addEventListener('click', () => {
    if (S.cfg.atende_espaco && S.cfg.atende_domicilio) return telaLocal();
    S.local = S.cfg.atende_espaco ? 'espaco' : 'domicilio';
    telaDados();
  });
}
const totalHtml = (preco, min) => S.ids.size
  ? `<strong>${moeda(preco)}</strong><span class="pequeno suave">${S.ids.size === 1 ? '1 serviço selecionado' : `${S.ids.size} serviços selecionados`}</span>`
  : `<span class="suave">Escolha ao menos um serviço</span>`;

// ---------------------------------------------------------------- passo 3: local
function telaLocal() {
  iniciar(`
    ${marca('Onde será?')}
    ${passos(3, 4)}
    <button class="voltar" id="voltar">← Voltar</button>
    <div class="lista">
      <button type="button" class="opcao grande" data-local="espaco" aria-pressed="${S.local === 'espaco'}">
        <span class="anel"></span>
        <span><span class="nome">No espaço</span><span class="detalhe" style="display:block">${esc(S.cfg.endereco_espaco || 'Você vem até a manicure')}</span></span><span></span>
      </button>
      <button type="button" class="opcao grande" data-local="domicilio" aria-pressed="${S.local === 'domicilio'}">
        <span class="anel"></span>
        <span><span class="nome">A domicílio</span><span class="detalhe" style="display:block">A manicure vai até o seu endereço</span></span><span></span>
      </button>
    </div>
    <div class="acoes"><button class="botao" id="continuar" ${S.local ? '' : 'disabled'}>Continuar</button></div>`);
  app.querySelector('#voltar').addEventListener('click', () => telaServicos());
  app.querySelectorAll('[data-local]').forEach((b) => b.addEventListener('click', () => {
    if (S.local !== b.dataset.local) { S.dispo = null; }
    S.local = b.dataset.local;
    app.querySelectorAll('[data-local]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    app.querySelector('#continuar').disabled = false;
  }));
  app.querySelector('#continuar').addEventListener('click', () => telaDados());
}

// ---------------------------------------------------------------- passo 4: dados
function telaDados(erroMsg = '') {
  if (typeof erroMsg !== 'string') erroMsg = '';
  const salvo = ler();
  const dom = S.local === 'domicilio';
  const t = totais();
  iniciar(`
    ${marca('Seus dados')}${passos(dois(), dois())}
    <button class="voltar" id="voltar">← Voltar</button>
    <dl class="resumo">
      <div><dt>Quando</dt><dd>${esc(dataLonga(S.data))}<br>às ${hora(S.inicio)}</dd></div>
      <div><dt>Serviços</dt><dd>${selecionados().map((s) => esc(s.nome)).join('<br>')}</dd></div>
      <div><dt>Onde</dt><dd>${nomeLocal(S.local)}</dd></div>
      <div><dt>Valor</dt><dd>${moeda(t.preco)}</dd></div>
    </dl>
    ${erroMsg ? `<div class="aviso erro" role="alert">${esc(erroMsg)}</div>` : ''}
    <form id="form" novalidate>
      <div class="campo"><label for="nome">Seu nome</label><input id="nome" name="nome" autocomplete="name" required maxlength="80" value="${esc(salvo.nome || '')}"></div>
      <div class="campo"><label for="whats">Seu WhatsApp</label><input id="whats" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="(83) 99999-0000" required value="${esc(salvo.whatsapp || '')}">
        <span class="dica">É por ele que a manicure confirma o horário.</span></div>
      <div class="campo"><label for="aniversario">Dia e mês do seu aniversário <span class="suave pequeno">(opcional)</span></label>
        <input id="aniversario" name="aniversario" type="text" inputmode="numeric" placeholder="Ex: 25/10" maxlength="5" value="${esc(salvo.aniversario || '')}">
        <span class="dica">✨ Informe para receber mimos e condições especiais no seu mês de aniversário.</span></div>
      ${dom ? `
        <div class="campo"><label for="end">Endereço completo</label><input id="end" name="endereco" autocomplete="street-address" required maxlength="200" value="${esc(salvo.endereco || '')}" placeholder="Rua, número, bairro"></div>
        <div class="campo"><label for="ref">Ponto de referência (opcional)</label><input id="ref" name="referencia" maxlength="120" value="${esc(salvo.referencia || '')}"></div>` : ''}
      <div class="acoes"><button class="botao" id="enviar" type="submit">Confirmar horário</button></div>
    </form>`);
  app.querySelector('#voltar').addEventListener('click', () => (S.cfg.atende_espaco && S.cfg.atende_domicilio ? telaLocal() : telaServicos()));
  const whats = app.querySelector('#whats');
  whats.addEventListener('input', () => { whats.value = mascaraWhatsapp(whats.value); });
  if (whats.value) whats.value = mascaraWhatsapp(whats.value);
  const aniv = app.querySelector('#aniversario');
  if (aniv) {
    aniv.addEventListener('input', () => {
      let v = aniv.value.replace(/\D/g, '').slice(0, 4);
      if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      aniv.value = v;
    });
  }
  app.querySelector('#form').addEventListener('submit', enviar);
}

async function enviar(ev) {
  ev.preventDefault();
  if (S.enviando) return;
  const f = Object.fromEntries(new FormData(ev.target));
  const nome = (f.nome || '').trim(), whats = (f.whatsapp || '').replace(/\D/g, '');
  if (nome.length < 2) return telaDadosErro('Informe seu nome.', f);
  if (whats.length < 10) return telaDadosErro('Informe o WhatsApp com DDD.', f);
  if (S.local === 'domicilio' && (f.endereco || '').trim().length < 5) return telaDadosErro('Informe o endereço completo.', f);
  const botao = app.querySelector('#enviar');
  S.enviando = true; botao.classList.add('carregando'); botao.textContent = 'Reservando…';
  try {
    const { token } = await api('/publico/agendar', { metodo: 'POST', corpo: {
      servicos: [...S.ids], local: S.local, data: S.data, inicio_min: S.inicio,
      nome, whatsapp: whats, endereco: f.endereco || '', referencia: f.referencia || '',
      aniversario: f.aniversario || '' } });
    gravar({ nome, whatsapp: f.whatsapp, endereco: f.endereco || '', referencia: f.referencia || '', aniversario: f.aniversario || '', token });
    const dados = await api(`/publico/agendamento/${token}`);
    S.dispo = null;
    telaPronto(token, dados);
  } catch (e) {
    S.enviando = false;
    if (e.codigo === 'horario_indisponivel') { S.dispo = null; S.inicio = null; await telaHorario(); aviso(e.message, true); return; }
    telaDadosErro(e.message, f);
  }
  S.enviando = false;
}
function telaDadosErro(msg, f) { gravar({ nome: f.nome, whatsapp: f.whatsapp, endereco: f.endereco, referencia: f.referencia }); telaDados(msg); }

// ---------------------------------------------------------------- confirmação e "meu agendamento"
const linkDoAgendamento = (token) => `${location.origin}/?a=${token}`;

let promptInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalacao = e;
});

const estaInstalado = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const ehIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function blocoInstalacao() {
  if (estaInstalado()) return '';
  if (ehIos()) {
    return `
      <div class="cartao-instalar" style="margin:20px 0;padding:16px 18px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.3);border-radius:18px;text-align:center">
        <div style="font-weight:600;font-size:15px;color:var(--tinta);margin-bottom:6px">📲 Instalar no seu iPhone</div>
        <p class="suave pequeno" style="line-height:1.5;margin:0">Para ter o app na tela inicial: toque em <strong>Compartilhar</strong> <svg style="display:inline-block;vertical-align:-3px;width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-4-6l-4-4m0 0l-4 4m4-4v12"/></svg> (na barra do Safari) e selecione <strong>"Adicionar à Tela de Início"</strong>.</p>
      </div>`;
  }
  return `
    <div class="cartao-instalar" style="margin:20px 0;padding:16px 18px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.3);border-radius:18px;text-align:center">
      <div style="font-weight:600;font-size:15px;color:var(--tinta);margin-bottom:4px">📲 Instalar o aplicativo</div>
      <p class="suave pequeno" style="margin-bottom:12px;line-height:1.4">Guarde o app na sua tela inicial para acompanhar seus horários e agendar com 1 toque.</p>
      <button type="button" class="botao" id="btn-instalar" style="min-height:44px;font-size:14px;padding:0 20px">Instalar no celular</button>
    </div>`;
}

function ligarInstalacao() {
  app.querySelector('#btn-instalar')?.addEventListener('click', async () => {
    if (promptInstalacao) {
      promptInstalacao.prompt();
      const { outcome } = await promptInstalacao.userChoice;
      if (outcome === 'accepted') {
        aviso('Aplicativo instalado!');
        app.querySelector('.cartao-instalar')?.remove();
      }
      promptInstalacao = null;
    } else {
      aviso('Toque no menu (três pontinhos) do navegador e selecione "Instalar aplicativo" ou "Adicionar à tela inicial".', false);
    }
  });
}

function resumoAgendamento(a) {
  const total = a.servicos.reduce((s, x) => s + x.preco_centavos, 0);
  return `<dl class="resumo">
    <div><dt>Serviços</dt><dd>${a.servicos.map((s) => esc(s.nome)).join('<br>')}</dd></div>
    <div><dt>Quando</dt><dd>${esc(dataLonga(a.data))}<br>às ${hora(a.inicio_min)}</dd></div>
    <div><dt>Onde</dt><dd>${nomeLocal(a.local)}${a.local === 'domicilio' && a.endereco ? `<br><span class="suave pequeno">${esc(a.endereco)}</span>` : ''}</dd></div>
    <div><dt>Valor</dt><dd>${moeda(total)}</dd></div></dl>`;
}

function telaPronto(token, a) {
  const msg = `Olá! Acabei de marcar pelo link:\n${a.servicos.map((s) => s.nome).join(' + ')}\n${dataLonga(a.data)}, ${hora(a.inicio_min)} (${nomeLocal(a.local).toLowerCase()}).\nNome: ${a.cliente_nome}`;
  iniciar(`
    <header class="marca" style="padding-top:0">${SELO_SVG}<h1 class="assinatura" style="margin-top:14px">Horário reservado</h1>
      <p>${esc(a.cliente_nome.split(' ')[0])}, seu horário está marcado. A manicure confirma com você pelo WhatsApp.</p></header>
    ${resumoAgendamento(a)}
    <div class="acoes">
      ${a.whatsapp ? `<a class="botao" href="${linkWhatsapp(a.whatsapp, msg)}">Avisar no WhatsApp</a>` : ''}
      <button class="botao sec" id="copiar">Copiar link do agendamento</button>
    </div>
    ${blocoInstalacao()}
    <p class="suave pequeno" style="margin-top:16px;text-align:center">Precisa mudar? Pelo link você pode cancelar até ${a.cancelar_horas}h antes. Guarde-o.</p>
    <p style="text-align:center;margin-top:16px"><button class="link" id="outro">Marcar outro horário</button></p>`);
  ligarInstalacao();
  app.querySelector('#copiar').addEventListener('click', async () => aviso((await copiar(linkDoAgendamento(token))) ? 'Link copiado' : 'Não deu para copiar', false));
  app.querySelector('#outro').addEventListener('click', () => { history.replaceState(null, '', '/'); S.ids.clear(); S.local = null; S.data = null; S.inicio = null; S.dispo = null; telaHorario(); });
}

async function telaMeu(token) {
  iniciar('<p class="carregando-pagina">Carregando…</p>');
  let a;
  try { a = await api(`/publico/agendamento/${token}`); } catch (e) {
    iniciar(`${marca('Agendamento')}<div class="aviso erro">${esc(e.message)}</div><div class="acoes"><a class="botao" href="/">Fazer um agendamento</a></div>`);
    return;
  }
  S.cfg = S.cfg || { nome: a.nome_negocio, servicos: [] };
  const cancelado = a.status === 'cancelado';
  const titulo = cancelado ? 'Agendamento cancelado' : a.status === 'concluido' ? 'Atendimento concluído' : 'Seu horário';
  const msgCancela = `Olá! Cancelei meu agendamento de ${dataLonga(a.data)} às ${hora(a.inicio_min)} (${a.servicos.map((s) => s.nome).join(' + ')}). Nome: ${a.cliente_nome}`;
  const rodape = cancelado
    ? `<div class="acoes">
        ${a.whatsapp ? `<a class="botao sec" href="${linkWhatsapp(a.whatsapp, msgCancela)}" target="_blank" rel="noopener">Avisar a manicure no WhatsApp</a>` : ''}
        <a class="botao" href="/">Marcar novo horário</a>
       </div>`
    : a.status !== 'agendado' ? '<div class="acoes"><a class="botao" href="/">Marcar novo horário</a></div>'
    : a.pode_cancelar
      ? `<div class="acoes"><button class="botao perigo" id="cancelar">Cancelar agendamento</button></div>`
      : `<div class="aviso">O prazo para cancelar pelo link é de ${a.cancelar_horas}h antes do horário. Para mudar, fale com a manicure.</div>
         ${a.whatsapp ? `<div class="acoes"><a class="botao" href="${linkWhatsapp(a.whatsapp, 'Olá! Preciso falar sobre meu horário de ' + dataLonga(a.data) + ', ' + hora(a.inicio_min) + '.')}">Falar no WhatsApp</a></div>` : ''}`;
  iniciar(`${marca(titulo, a.nome_negocio)}${resumoAgendamento(a)}${!cancelado ? blocoInstalacao() : ''}${rodape}`);
  ligarInstalacao();
  app.querySelector('#cancelar')?.addEventListener('click', async (ev) => {
    const ok = await confirmar({
      titulo: 'Cancelar agendamento?',
      mensagem: `Deseja realmente cancelar seu atendimento de ${dataLonga(a.data)} às ${hora(a.inicio_min)}? O horário será liberado para outros clientes.`,
      textoOk: 'Sim, cancelar agendamento',
      textoCancelar: 'Não, manter horário',
      perigo: true,
    });
    if (!ok) return;
    ev.target.classList.add('carregando');
    try { await api(`/publico/agendamento/${token}/cancelar`, { metodo: 'POST', corpo: {} }); gravar({ token: null }); telaMeu(token); aviso('Agendamento cancelado'); }
    catch (e) { ev.target.classList.remove('carregando'); aviso(e.message, true); }
  });
}

// ---------------------------------------------------------------- início
async function iniciarApp() {
  const token = new URLSearchParams(location.search).get('a');
  if (token) return telaMeu(token);
  try { S.cfg = await api('/publico/config'); } catch (e) {
    app.innerHTML = `<div class="aviso erro" style="margin-top:40px">${esc(e.message)}</div>`; return;
  }
  document.title = `Agende seu horário — ${S.cfg.nome}`;
  let banner = '';
  const guardado = ler().token;
  if (guardado) {
    try {
      const a = await api(`/publico/agendamento/${guardado}`);
      const futuro = a.status === 'agendado' && a.data >= new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      if (futuro) banner = `<div class="faixa"><span>Você já tem um horário: <b>${esc(dataLonga(a.data))}, ${hora(a.inicio_min)}</b></span><a href="/?a=${guardado}">Ver</a></div>`;
    } catch { /* link antigo */ }
  }
  telaHorario(banner);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
iniciarApp();
