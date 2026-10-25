import { addDias, diaSemana, dataValida } from './time.js';

// Intervalo mínimo entre dois atendimentos: se qualquer um dos dois é a domicílio,
// vale o tempo de deslocamento; senão, vale o respiro. Os dois NÃO se somam.
export function intervaloEntre(localA, localB, cfg) {
  return localA === 'domicilio' || localB === 'domicilio' ? cfg.deslocamento_min : cfg.respiro_min;
}

export function conflita(ini, fim, local, outro, cfg) {
  const g = intervaloEntre(local, outro.local, cfg);
  const outroFim = outro.inicio_min + outro.duracao_min;
  return !(fim + g <= outro.inicio_min || outroFim + g <= ini);
}

/**
 * Horários de início livres em um dia.
 * - expediente: linha do dia da semana (ou null)
 * - bloqueios: [{inicio_min, fim_min}] do dia
 * - agendamentos: [{inicio_min, duracao_min, local}] ativos do dia
 */
export function horariosDoDia({ data, duracao, local, cfg, expediente, bloqueios = [], agendamentos = [], agora }) {
  if (!dataValida(data) || !(duracao > 0)) return [];
  if (data < agora.data) return [];
  if (data > addDias(agora.data, cfg.janela_dias)) return [];
  const exp = expediente;
  if (!exp || !exp.ativo) return [];

  const candidatos = new Set();
  for (let s = exp.inicio_min; s + duracao <= exp.fim_min; s += cfg.passo_min) candidatos.add(s);

  if (cfg.encaixar_colado) {
    // Começar logo depois de um atendimento, pausa ou bloqueio, sem deixar buraco.
    for (const a of agendamentos) {
      candidatos.add(a.inicio_min + a.duracao_min + intervaloEntre(local, a.local, cfg));
    }
    if (exp.pausa_fim_min != null) candidatos.add(exp.pausa_fim_min);
    for (const b of bloqueios) candidatos.add(b.fim_min);
  }

  const livres = [];
  for (const s of [...candidatos].sort((a, b) => a - b)) {
    const e = s + duracao;
    if (s < exp.inicio_min || e > exp.fim_min) continue;
    if (data === agora.data && s < agora.min + cfg.antecedencia_min) continue;
    if (exp.pausa_inicio_min != null && exp.pausa_fim_min != null &&
        s < exp.pausa_fim_min && e > exp.pausa_inicio_min) continue;
    if (bloqueios.some((b) => s < b.fim_min && e > b.inicio_min)) continue;
    if (agendamentos.some((a) => conflita(s, e, local, a, cfg))) continue;
    livres.push(s);
  }
  return livres;
}

export function diasDaJanela(agora, cfg) {
  const dias = [];
  for (let i = 0; i <= cfg.janela_dias; i++) dias.push(addDias(agora.data, i));
  return dias;
}

export { diaSemana };
