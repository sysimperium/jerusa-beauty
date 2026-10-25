import test from 'node:test';
import assert from 'node:assert/strict';
import { horariosDoDia, conflita, intervaloEntre } from '../functions/_lib/slots.js';
import { agoraLocal, addDias, diaSemana, dataValida, inicioEmMs } from '../functions/_lib/time.js';

const cfg = { respiro_min: 15, deslocamento_min: 15, antecedencia_min: 60, janela_dias: 30, passo_min: 30, encaixar_colado: false };
const exp = { ativo: 1, inicio_min: 480, fim_min: 1020, pausa_inicio_min: 720, pausa_fim_min: 780 };
const agora = { data: '2026-10-03', min: 600 };
const base = { data: '2026-10-05', duracao: 70, local: 'espaco', cfg, expediente: exp, bloqueios: [], agendamentos: [], agora };

test('grade de 30 min respeita pausa e fim do expediente', () => {
  const r = horariosDoDia(base);
  assert.equal(r[0], 480);
  assert.ok(!r.includes(660), 'termina 12:10, invade a pausa');
  assert.ok(!r.includes(750));
  assert.ok(r.includes(780));
  assert.equal(r.at(-1), 930); // 15:30 + 1h10 = 16:40 ≤ 17:00 ; 16:00 → 17:10 estoura
});

test('dia inativo, passado e além da janela não têm horários', () => {
  assert.deepEqual(horariosDoDia({ ...base, expediente: { ...exp, ativo: 0 } }), []);
  assert.deepEqual(horariosDoDia({ ...base, data: '2026-10-02' }), []);
  assert.deepEqual(horariosDoDia({ ...base, data: '2026-11-04' }), []);
  assert.ok(horariosDoDia({ ...base, data: '2026-11-02' }).length > 0);
});

test('antecedência mínima vale só para hoje', () => {
  // agora = 10:00 e antecedência = 60 min → nada antes de 11:00
  const hoje = horariosDoDia({ ...base, data: agora.data, duracao: 45 });
  assert.equal(hoje[0], 660);
  assert.ok(hoje.every((s) => s >= 660));
  const amanha = horariosDoDia({ ...base, data: '2026-10-04', duracao: 45 });
  assert.equal(amanha[0], 480);
});

test('intervalo entre atendimentos: respiro no espaço, deslocamento no domicílio, sem somar', () => {
  assert.equal(intervaloEntre('espaco', 'espaco', { respiro_min: 10, deslocamento_min: 25 }), 10);
  assert.equal(intervaloEntre('domicilio', 'espaco', { respiro_min: 10, deslocamento_min: 25 }), 25);
  assert.equal(intervaloEntre('espaco', 'domicilio', { respiro_min: 10, deslocamento_min: 25 }), 25);
  assert.equal(intervaloEntre('domicilio', 'domicilio', { respiro_min: 10, deslocamento_min: 25 }), 25);
});

test('conflito exige o intervalo de 15 min dos dois lados', () => {
  const ag = { inicio_min: 600, duracao_min: 60, local: 'espaco' }; // 10:00–11:00
  assert.equal(conflita(675, 735, 'espaco', ag, cfg), false); // 11:15 começa livre
  assert.equal(conflita(670, 730, 'espaco', ag, cfg), true);  // 11:10 é cedo demais
  assert.equal(conflita(480, 585, 'espaco', ag, cfg), false); // termina 09:45 → 15 min antes
  assert.equal(conflita(480, 590, 'espaco', ag, cfg), true);
});

test('encaixe colado oferece o minuto exato após o atendimento anterior', () => {
  const ag = [{ inicio_min: 480, duracao_min: 70, local: 'espaco' }]; // 08:00–09:10
  const sem = horariosDoDia({ ...base, duracao: 45, agendamentos: ag });
  const com = horariosDoDia({ ...base, duracao: 45, agendamentos: ag, cfg: { ...cfg, encaixar_colado: true } });
  assert.ok(!sem.includes(565));
  assert.ok(com.includes(565)); // 09:10 + 15 = 09:25
  assert.ok(!com.includes(510));
  assert.ok(!com.includes(540));
});

test('domicílio usa o deslocamento configurado', () => {
  const ag = [{ inicio_min: 480, duracao_min: 60, local: 'espaco' }]; // até 09:00
  const c30 = { ...cfg, deslocamento_min: 30, encaixar_colado: true };
  const r = horariosDoDia({ ...base, duracao: 60, local: 'domicilio', agendamentos: ag, cfg: c30 });
  assert.ok(!r.includes(540)); // 09:00 → precisa de 30 min
  assert.ok(r.includes(570)); // 09:30
});

test('bloqueios removem horários sobrepostos', () => {
  const r = horariosDoDia({ ...base, duracao: 60, bloqueios: [{ inicio_min: 600, fim_min: 660 }] });
  assert.ok(!r.includes(570) && !r.includes(600) && !r.includes(630));
  assert.ok(r.includes(660) || r.includes(510));
});

test('capacidade em 8h bate com a tabela combinada (sem grade, encaixe colado)', () => {
  const expDia = { ativo: 1, inicio_min: 480, fim_min: 960, pausa_inicio_min: null, pausa_fim_min: null }; // 8h
  const c = { ...cfg, encaixar_colado: true };
  for (const [dur, esperado] of [[45, 8], [60, 6], [70, 5], [90, 4], [120, 3]]) {
    const ag = [];
    for (;;) {
      const livres = horariosDoDia({ ...base, expediente: expDia, duracao: dur, agendamentos: ag, cfg: c });
      if (!livres.length) break;
      ag.push({ inicio_min: livres[0], duracao_min: dur, local: 'espaco' });
    }
    assert.equal(ag.length, esperado, `duração ${dur}`);
  }
});

test('helpers de data', () => {
  assert.equal(agoraLocal(Date.UTC(2026, 9, 3, 2, 30)).data, '2026-10-02'); // 23:30 em Fortaleza
  assert.equal(agoraLocal(Date.UTC(2026, 9, 3, 2, 30)).min, 23 * 60 + 30);
  assert.equal(addDias('2026-12-31', 1), '2027-01-01');
  assert.equal(diaSemana('2026-10-03'), 6);
  assert.equal(dataValida('2026-02-30'), false);
  assert.equal(inicioEmMs('2026-10-03', 480), Date.UTC(2026, 9, 3, 11, 0));
});
