import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoMes } from '../functions/_lib/dominio.js';

test('resumoMes calcula descontos e acrescimos separadamente sem valores negativos', async () => {
  const mockDb = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('COUNT(*) AS atendimentos')) {
                // Simula 1 atendimento com desconto (tabela 50, cobrado 40 => desc 10)
                // e 1 atendimento com acréscimo (tabela 50, cobrado 75 => acréscimo 25)
                return {
                  atendimentos: 2,
                  faturado: 11500, // 40 + 75
                  descontos: 1000, // 10 de desconto (e NÃO -15!)
                  acrescimos: 2500, // 25 de acréscimo
                  recebido: 11500,
                };
              }
              if (sql.includes('FROM despesas')) {
                return { total: 1500 };
              }
              return {};
            },
            async all() {
              if (sql.includes('FROM agendamento_servicos')) {
                return { results: [{ nome: 'Manicure', qtd: 2, total: 10000 }] };
              }
              if (sql.includes('FROM agendamentos')) {
                return { results: [{ forma: 'pix', pago: 1, qtd: 2, total_centavos: 11500 }] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const res = await resumoMes(mockDb, '2026-10');
  assert.equal(res.atendimentos, 2);
  assert.equal(res.faturado_centavos, 11500);
  assert.equal(res.descontos_centavos, 1000);
  assert.equal(res.acrescimos_centavos, 2500);
  assert.equal(res.despesas_centavos, 1500);
  assert.equal(res.lucro_centavos, 10000);
});
