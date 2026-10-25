// Fuso fixo America/Fortaleza (UTC-3, sem horário de verão).
export const TZ_OFFSET_MIN = -180;

export function agoraLocal(nowMs = Date.now()) {
  const d = new Date(nowMs + TZ_OFFSET_MIN * 60000);
  return { data: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDias(data, n) {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaSemana(data) {
  return new Date(data + 'T00:00:00Z').getUTCDay();
}

export function minParaHora(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// Instante (ms) em que o atendimento começa, para comparar com "agora".
export function inicioEmMs(data, inicioMin) {
  return new Date(data + 'T00:00:00Z').getTime() + inicioMin * 60000 - TZ_OFFSET_MIN * 60000;
}
