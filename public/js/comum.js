// Funções compartilhadas entre a página do cliente e a área da manicure.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const moeda = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function duracao(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export const hora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const minParaCampo = hora;
export function campoParaMin(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const fmt = (opts) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts });
const paraDate = (d) => new Date(d + 'T00:00:00Z');
export const diaSemanaCurto = (d) => fmt({ weekday: 'short' }).format(paraDate(d)).replace('.', '');
export const diaDoMes = (d) => Number(d.slice(8, 10));
export const mesNome = (d) => fmt({ month: 'long' }).format(paraDate(d));
export const dataLonga = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(paraDate(d));
export const dataCurta = (d) => fmt({ day: '2-digit', month: '2-digit' }).format(paraDate(d));
export const mesAno = (mes) => fmt({ month: 'long', year: 'numeric' }).format(paraDate(mes + '-01'));
export const somaDias = (d, n) => { const x = paraDate(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const somaMeses = (mes, n) => {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

// "50", "50,5", "1.250,00" → centavos
export function lerDinheiro(txt) {
  const s = String(txt ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const centavosParaCampo = (c) => (c / 100).toFixed(2).replace('.', ',');

export function mascaraWhatsapp(v) {
  const d = String(v).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const whatsappLegivel = (w) => mascaraWhatsapp(w);
export const linkWhatsapp = (numero, texto) =>
  `https://wa.me/${String(numero).replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const resp = await fetch('/api' + caminho, {
    method: metodo,
    headers: corpo !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  }).catch(() => { throw Object.assign(new Error('Sem conexão. Confira a internet e tente de novo.'), { codigo: 'offline' }); });
  let dados = {};
  try { dados = await resp.json(); } catch { /* resposta sem corpo */ }
  if (!resp.ok) throw Object.assign(new Error(dados.mensagem || 'Algo deu errado. Tente de novo.'), { codigo: dados.erro, status: resp.status, conflito: dados.conflito, dados });
  return dados;
}

export function qrSvg(texto) {
  const q = window.qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch {
    const t = document.createElement('textarea');
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    t.remove();
    return ok;
  }
}

export function aviso(texto, erro = false) {
  document.querySelectorAll('.aviso-flutuante').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'aviso-flutuante' + (erro ? ' erro' : '');
  el.setAttribute('role', erro ? 'alert' : 'status');
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), erro ? 5000 : 2600);
}

export const SELO_SVG = `<svg class="selo" viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r="48"/><path d="M36 58l14 14 27-30"/></svg>`;

export function confirmar({
  titulo = 'Confirmar',
  mensagem = 'Tem certeza que deseja continuar?',
  textoOk = 'Confirmar',
  textoCancelar = 'Voltar',
  perigo = false,
} = {}) {
  return new Promise((resolve) => {
    document.getElementById('cortina-confirmar')?.remove();
    const c = document.createElement('div');
    c.className = 'cortina';
    c.id = 'cortina-confirmar';
    c.innerHTML = `
      <div class="folha" role="dialog" aria-modal="true" style="text-align:center">
        <div class="alca"></div>
        <h2 style="margin-bottom:10px">${esc(titulo)}</h2>
        <p class="suave" style="margin-bottom:22px;line-height:1.5">${esc(mensagem)}</p>
        <div class="acoes">
          <button class="botao ${perigo ? 'perigo' : ''}" id="dlg-ok">${esc(textoOk)}</button>
          <button class="botao sec" id="dlg-cancela">${esc(textoCancelar)}</button>
        </div>
      </div>`;
    const fechar = (resp) => {
      c.remove();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', tecla);
      resolve(resp);
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar(false); };
    c.addEventListener('click', (e) => { if (e.target === c) fechar(false); });
    window.addEventListener('keydown', tecla);
    document.body.appendChild(c);
    document.body.style.overflow = 'hidden';
    c.querySelector('#dlg-ok').addEventListener('click', () => fechar(true));
    c.querySelector('#dlg-cancela').addEventListener('click', () => fechar(false));
    c.querySelector('#dlg-ok').focus();
  });
}

// Garante que serviços mutuamente exclusivos (ex.: "Mão e pé" vs "Só mão" / "Só pé")
// não sejam marcados ao mesmo tempo, fazendo a troca ou upgrade de forma inteligente.
export function ajustarExclusividadeServicos(servicos, idsSet, idClicado) {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const isCombo = (nome) => { const n = norm(nome); return n.includes('mao') && n.includes('pe'); };
  const isSoMao = (nome) => { const n = norm(nome); return n.includes('mao') && !n.includes('pe'); };
  const isSoPe = (nome) => { const n = norm(nome); return n.includes('pe') && !n.includes('mao'); };

  const clicado = servicos.find((s) => s.id === idClicado);
  if (!clicado) return;

  if (idsSet.has(idClicado)) {
    idsSet.delete(idClicado);
    return;
  }

  idsSet.add(idClicado);

  const combo = servicos.find((s) => isCombo(s.nome));
  const soMao = servicos.find((s) => isSoMao(s.nome));
  const soPe = servicos.find((s) => isSoPe(s.nome));

  if (isCombo(clicado.nome)) {
    if (soMao) idsSet.delete(soMao.id);
    if (soPe) idsSet.delete(soPe.id);
  } else if (isSoMao(clicado.nome)) {
    if (combo) idsSet.delete(combo.id);
    if (combo && soPe && idsSet.has(soPe.id)) {
      idsSet.delete(soMao.id);
      idsSet.delete(soPe.id);
      idsSet.add(combo.id);
    }
  } else if (isSoPe(clicado.nome)) {
    if (combo) idsSet.delete(combo.id);
    if (combo && soMao && idsSet.has(soMao.id)) {
      idsSet.delete(soMao.id);
      idsSet.delete(soPe.id);
      idsSet.add(combo.id);
    }
  }
}

