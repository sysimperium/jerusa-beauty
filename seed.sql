-- Dados iniciais. Rode uma vez depois do schema.sql.
INSERT OR IGNORE INTO config (chave, valor) VALUES
  ('nome_negocio', 'Jerusa Beauty'),
  ('whatsapp', '5583996677643'),
  ('atende_espaco', '1'),
  ('atende_domicilio', '1'),
  ('endereco_espaco', ''),
  ('respiro_min', '15'),
  ('deslocamento_min', '15'),
  ('antecedencia_min', '60'),
  ('janela_dias', '30'),
  ('passo_min', '30'),
  ('cancelar_horas', '12'),
  ('encaixar_colado', '1'),
  ('pix_tipo', 'telefone'),
  ('pix_chave', '5583996677643'),
  ('pix_nome', 'Jerusa Beauty'),
  ('pix_cidade', '');

-- Seg a sáb, 08:00–17:00, pausa 12:00–13:00. Domingo fechado.
INSERT OR IGNORE INTO expediente (dia, ativo, inicio_min, fim_min, pausa_inicio_min, pausa_fim_min) VALUES
  (0, 0, 480, 1020, NULL, NULL),
  (1, 1, 480, 1020, 720, 780),
  (2, 1, 480, 1020, 720, 780),
  (3, 1, 480, 1020, 720, 780),
  (4, 1, 480, 1020, 720, 780),
  (5, 1, 480, 1020, 720, 780),
  (6, 1, 480, 1020, 720, 780);

-- Serviços e preços (cada um só é criado se ainda não existir pelo nome).
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Mão e pé', 'Manicure e pedicure tradicional', 5000, 70, 1
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Mão e pé');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Só mão', 'Manicure tradicional', 3000, 45, 2
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Só mão');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Só pé', 'Pedicure tradicional', 3000, 45, 3
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Só pé');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Esmaltação em gel', NULL, 5000, 60, 4
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Esmaltação em gel');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Blindagem em gel', 'Blindagem em gel + cutilagem + esmaltação tradicional', 8000, 90, 5
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Blindagem em gel');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Banho de gel', 'Banho de gel + cutilagem + esmaltação tradicional', 9500, 120, 6
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Banho de gel');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Manutenção', 'Manutenção de alongamento', 10000, 60, 7
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Manutenção');
INSERT INTO servicos (nome, descricao, preco_centavos, duracao_min, ordem)
SELECT 'Alongamento em gel', 'Alongamento em gel (técnica no mold F1) + cutilagem + esmaltação tradicional', 15000, 120, 8
WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Alongamento em gel');
