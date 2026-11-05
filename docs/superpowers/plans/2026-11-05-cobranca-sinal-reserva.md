# Cobrança de Sinal para Reserva de Horário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo completo de cobrança de sinal percentual para reserva de horário em Jerusa Beauty, com bloqueio imediato do horário, Pix Copia e Cola / QR Code com valor exato, contador visual de tempo aguardando (verde/amarelo/vermelho), confirmação/recusa pela manicure com liberação imediata da vaga e notificação WhatsApp, filtro rápido no topo da tela inicial e da agenda, e dedução automática do sinal no fechamento financeiro.

**Architecture:**
- **Banco de Dados (D1/SQLite):** Adicionar colunas em `agendamentos` (`sinal_status`, `sinal_porcentagem`, `sinal_valor_centavos`, `sinal_pago`, `sinal_pago_em`) e configurações em `config` (`sinal_ativo`, `sinal_porcentagem`, `sinal_prazo_horas`). Migração runtime idêntica ao padrão de `garantirColunasLembretes`.
- **Agendamento Público:** Quando `sinal_ativo` estiver ativo, o agendamento é criado com `status = 'agendado'` (bloqueando o horário de conflito na consulta existente de horários livres) e `sinal_status = 'pendente'`. O cliente recebe o QR Code e Pix Copia e Cola no valor exato do sinal e botão direto para enviar o comprovante via WhatsApp.
- **Admin - Tela Inicial (`telaInicio`):** Apenas avisos e alertas críticos: card com contador visual colorido de tempo aguardando (`<1h` verde, `1-2h` amarelo, `>2h` vermelho com sugestão de liberar horário) e filtro rápido no topo da agenda (`[Todos]`, `[Confirmados]`, `[⏳ Aguardando Sinal (N)]`).
- **Admin - Guia Agenda (`telaAgenda`):** O contador visual aparece nos cartões dos agendamentos, o filtro rápido permite isolar pendentes de sinal, e o painel de configuração do sinal permite ativar/desativar e ajustar a porcentagem (validando se a chave Pix, nome e cidade estão cadastrados em Ajustes).
- **Ações da Manicure:** `✓ Confirmar Sinal` (marca como pago/confirmado e envia WhatsApp de confirmação), `💬 Lembrar Sinal` (abre/envia lembrete amigável via WhatsApp), e `✕ Sinal Não Recebido` (cancela agendamento, libera a vaga imediatamente e avisa a cliente via WhatsApp).
- **Financeiro:** Ao concluir atendimento, desconta automaticamente o sinal já pago do valor total da comanda, indicando o saldo restante a receber.

**Tech Stack:** Cloudflare Workers, Cloudflare D1 (SQLite), Vanilla JS (ES Modules), CSS nativo, Node.js `--test` para testes automatizados.

**Spec:** Baseado na solicitação direta do usuário em Jerusa Beauty (requisições 4, 5 e 6).

## Global Constraints
- Implementação e testes EXCLUSIVAMENTE em `jeursa-beauty` (`C:\Users\Ian & Jerusa\Documents\AppsCriacao\jeursa-beauty`). Não alterar outros apps ou painel-root.
- A ativação do sinal EXIGE que a chave Pix, nome do titular e cidade estejam configurados na guia Ajustes (`pix_chave`, `pix_nome`, `pix_cidade`).
- Na tela inicial (`telaInicio`), exibir APENAS os avisos importantes (contador visual de tempo de espera com cores de alerta e filtro rápido). As configurações do sinal residem na guia Agenda (`telaAgenda`).
- O horário agendado fica reservado (bloqueado para outros clientes) enquanto aguarda sinal. Se recusado ou cancelado, é liberado imediatamente.

## Review Focus
1. Agendamento com sinal não permite que outro cliente reserve o mesmo horário durante a espera.
2. Cancelamento / recusa de sinal libera o horário instantaneamente na consulta de disponibilidade pública.
3. Tentativa de ativar o sinal sem chave Pix configurada em Ajustes é rejeitada com aviso claro.
4. Cálculo da porcentagem do sinal lida corretamente com arredondamento em centavos.
5. Conclusão financeira de atendimento com sinal desconta o valor pago previamente do total a cobrar.

---

### Task 1: Migração e Modelo de Dados para Sinal

**Files:**
- Modify: `functions/_lib/util.js`
- Modify: `functions/_lib/whatsapp.js`
- Modify: `functions/_lib/dominio.js`
- Test: `test/sinal-dados.test.js`

**Interfaces:**
- Consumes: `PADRAO`, `NUM`, `BOOL` em `functions/_lib/util.js`, `garantirColunasLembretes` em `functions/_lib/whatsapp.js`.
- Produces: colunas em `agendamentos` (`sinal_status`, `sinal_porcentagem`, `sinal_valor_centavos`, `sinal_pago`, `sinal_pago_em`), configs (`sinal_ativo`, `sinal_porcentagem`, `sinal_prazo_horas`), suporte no `criarAgendamento`.

- [ ] **Step 1: Write the failing test**
Criar `test/sinal-dados.test.js` testando:
1. `carregarConfig` inclui `sinal_ativo: false`, `sinal_porcentagem: 30`, `sinal_prazo_horas: 2` por padrão.
2. `garantirColunasSinal(db)` adiciona as colunas de sinal em `agendamentos` caso não existam.
3. `criarAgendamento` persiste `sinal_status`, `sinal_porcentagem`, `sinal_valor_centavos`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/sinal-dados.test.js`
Expected: FAIL (missing exports/columns).

- [ ] **Step 3: Implement data model changes**
1. Em `functions/_lib/util.js`: adicionar `sinal_ativo: false`, `sinal_porcentagem: 30`, `sinal_prazo_horas: 2` ao `PADRAO`, `sinal_ativo` em `BOOL`, e `sinal_porcentagem`, `sinal_prazo_horas` em `NUM`.
2. Em `functions/_lib/whatsapp.js` (ou módulo de migração): em `garantirColunasLembretes` (ou nova função `garantirColunasSinal`), verificar e adicionar colunas `sinal_status`, `sinal_porcentagem`, `sinal_valor_centavos`, `sinal_pago`, `sinal_pago_em`.
3. Em `functions/_lib/dominio.js`: em `criarAgendamento`, aceitar campos de sinal e gravar no `INSERT`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/sinal-dados.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/util.js functions/_lib/whatsapp.js functions/_lib/dominio.js test/sinal-dados.test.js
git commit -m "feat(sinal): adicionar modelo de dados e colunas de sinal de reserva"
```

---

### Task 2: Rotas Públicas e Geração do Pix de Sinal com Bloqueio de Horário

**Files:**
- Modify: `functions/_lib/rotas-publicas.js`
- Test: `test/sinal-publico.test.js`

**Interfaces:**
- Consumes: `carregarConfig`, `criarAgendamento`, `gerarBrCode` de `public/js/pix.js`.
- Produces: `GET /publico/config` retornando `sinal_ativo`, `sinal_porcentagem`, `sinal_prazo_horas`, `pix_configurado`; `POST /publico/agendar` calculando valor do sinal e gerando dados Pix quando ativo; `GET /publico/agendamento/:token` expondo status do sinal e dados Pix.

- [ ] **Step 1: Write the failing test**
Criar `test/sinal-publico.test.js` testando:
1. `GET /publico/config` retorna flags de sinal.
2. Agendamento com `sinal_ativo = true` cria reserva com `status = 'agendado'` e `sinal_status = 'pendente'`, gerando `sinal_valor_centavos` proporcional ao percentual.
3. O horário reservado não aparece mais na lista de horários livres (`/publico/disponibilidade`).
4. Quando o agendamento é cancelado, o horário volta a ficar livre imediatamente.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/sinal-publico.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement backend public routes for sinal**
1. Em `functions/_lib/rotas-publicas.js`:
   - Em `/publico/config`, retornar `sinal_ativo`, `sinal_porcentagem`, `sinal_prazo_horas`, `pix_chave`, `pix_tipo`, `pix_nome`, `pix_cidade`.
   - Em `/publico/agendar`: se `cfg.sinal_ativo` estiver ativo e houver chave Pix configurada, calcular `sinal_valor_centavos = Math.round((preco * cfg.sinal_porcentagem) / 100)`. Salvar com `sinal_status = 'pendente'`, `sinal_porcentagem = cfg.sinal_porcentagem`, `sinal_valor_centavos`.
   - Em `/publico/agendamento/:token`: retornar os campos de sinal para a tela do cliente.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/sinal-publico.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/rotas-publicas.js test/sinal-publico.test.js
git commit -m "feat(sinal): expor configuracoes de sinal e calcular valor na rota publica"
```

---

### Task 3: Rotas Administrativas de Sinal (Configuração, Confirmação, Recusa e Lembrete)

**Files:**
- Modify: `functions/_lib/rotas-admin.js`
- Modify: `functions/_lib/whatsapp.js`
- Test: `test/sinal-admin.test.js`

**Interfaces:**
- Consumes: `SELECT_AGEND` em `rotas-admin.js`, `enviarMensagemZap` em `whatsapp.js`.
- Produces:
  - `PUT /admin/config/sinal`: atualiza ativação e porcentagem do sinal (exige Pix configurado em Ajustes).
  - `POST /admin/agendamentos/:id/confirmar-sinal`: confirma sinal, marca `sinal_pago = 1` e notifica via WhatsApp.
  - `POST /admin/agendamentos/:id/recusar-sinal`: recusa sinal, seta `status = 'cancelado'`, libera o horário imediatamente e notifica via WhatsApp.
  - `POST /admin/agendamentos/:id/lembrar-sinal`: envia lembrete amigável via WhatsApp.
  - `GET /admin/painel`: inclui contagem e lista de pendentes de sinal para alimentar os alertas e contador visual.

- [ ] **Step 1: Write the failing test**
Criar `test/sinal-admin.test.js` testando:
1. `PUT /admin/config/sinal` com `sinal_ativo = true` falha com `400 dado_invalido` se a chave Pix não estiver preenchida.
2. `PUT /admin/config/sinal` com chave Pix existente salva com sucesso.
3. `POST /admin/agendamentos/:id/confirmar-sinal` altera `sinal_status = 'confirmado'` e `sinal_pago = 1`.
4. `POST /admin/agendamentos/:id/recusar-sinal` altera `status = 'cancelado'`, `sinal_status = 'recusado'`, liberando o horário.
5. Formatação da mensagem de WhatsApp de lembrete de sinal e cancelamento por falta de sinal.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/sinal-admin.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement admin endpoints and WhatsApp messages**
1. Em `functions/_lib/whatsapp.js`:
   - `formatarMensagemLembreteSinal(cfg, a)`
   - `formatarMensagemSinalConfirmado(cfg, a)`
   - `formatarMensagemSinalNaoRecebido(cfg, a)`
2. Em `functions/_lib/rotas-admin.js`:
   - Adicionar `sinal_status`, `sinal_porcentagem`, `sinal_valor_centavos`, `sinal_pago`, `sinal_pago_em`, `criado_em` no `SELECT_AGEND`.
   - Adicionar validação de Pix ao salvar sinal em `PUT /admin/config` e no novo endpoint `PUT /admin/config/sinal`.
   - Implementar `POST /admin/agendamentos/:id/confirmar-sinal`.
   - Implementar `POST /admin/agendamentos/:id/recusar-sinal`.
   - Implementar `POST /admin/agendamentos/:id/lembrar-sinal`.
   - Em `GET /admin/painel`, incluir `sinal_pendentes`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/sinal-admin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/_lib/rotas-admin.js functions/_lib/whatsapp.js test/sinal-admin.test.js
git commit -m "feat(sinal): rotas administrativas para gerenciar sinal e mensagens de whatsapp"
```

---

### Task 4: Interface do Cliente (Tela de Confirmação com Pix Copia e Cola e QR Code)

**Files:**
- Modify: `public/js/cliente.js`
- Test: `test/cliente-sinal-ui.test.js`

**Interfaces:**
- Consumes: `gerarBrCode` de `public/js/pix.js`, `qrSvg` de `public/js/comum.js`.
- Produces: Interface amigável exibindo sinal a pagar, QR Code, botão de Copiar Pix Copia e Cola e botão direto de envio do comprovante para o WhatsApp de Jerusa Beauty.

- [ ] **Step 1: Write the failing test**
Criar `test/cliente-sinal-ui.test.js` para validar que `cliente.js` possui sintaxe válida e monta o bloco de sinal quando `sinal_status === 'pendente'`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/cliente-sinal-ui.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement client UI changes**
1. Em `public/js/cliente.js`:
   - Em `telaPronto`: se `a.sinal_status === 'pendente'`, exibir cartão de destaque dourado/laranja com:
     - Título: "Horário pré-reservado — Aguardando sinal"
     - "Para garantir seu horário, realize o pagamento do sinal de **R$ [valor]** ([X]%) via Pix em até 2 horas e envie o comprovante."
     - QR Code gerado na hora via `qrSvg(gerarBrCode(...))`
     - Botão `Copiar Pix Copia e Cola` com feedback
     - Detalhamento: Valor total do serviço, Sinal a transferir agora, Saldo restante a pagar no dia do atendimento
     - Botão principal destacado: `Enviar Comprovante no WhatsApp` (abre conversa com mensagem pré-preenchida com o resumo do agendamento).
   - Em `telaMeu`: se o agendamento estiver com `sinal_status === 'pendente'`, exibir o status e as instruções de envio do sinal.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/cliente-sinal-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add public/js/cliente.js test/cliente-sinal-ui.test.js
git commit -m "feat(sinal): exibir qr code e copia e cola de sinal na tela de confirmacao do cliente"
```

---

### Task 5: Interface da Manicure (Tela Inicial, Guia Agenda, Ações e Fechamento Financeiro)

**Files:**
- Modify: `public/admin/admin.js`
- Test: `test/contrato-admin-sintaxe.test.js` (e novos testes em `test/sinal-admin-ui.test.js`)

**Interfaces:**
- Consumes: `linhaAtendimento`, `telaInicio`, `telaAgenda`, `abrirAtendimento`, `folhaConcluir`.
- Produces:
  - **`telaInicio`:** Apenas avisos importantes:
    - Card de Alerta "Reservas Aguardando Sinal" com contador visual (`<1h` verde, `1-2h` amarelo, `>2h` vermelho com aviso de liberação).
    - Filtro rápido no topo da agenda: `[Todos]`, `[Confirmados]`, `[⏳ Aguardando Sinal (N)]`.
  - **`telaAgenda`:**
    - Contador visual nos cartões de atendimento.
    - Filtro rápido `[⏳ Aguardando Sinal (N)]`.
    - Painel/modal "Configurações do Sinal" (ativar/desativar, porcentagem, verificação se Pix está cadastrado em Ajustes).
  - **`abrirAtendimento`:**
    - Botão `✓ Confirmar Sinal`.
    - Botão `💬 Lembrar Sinal (WhatsApp)`.
    - Botão `✕ Sinal Não Recebido (Liberar Horário)`.
  - **`folhaConcluir`:**
    - Se sinal pago, desconta automaticamente: saldo = total - sinal.

- [ ] **Step 1: Write the failing test**
Criar `test/sinal-admin-ui.test.js` testando funções utilitárias de formatação do contador de tempo aguardando e verificação de sintaxe de `public/admin/admin.js`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/sinal-admin-ui.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement admin UI changes**
1. Criar helper `tempoAguardandoSinal(criadoEm)` que retorna o tempo decorrido formatado e a classe de alerta (`ok`, `atencao`, `perigo`).
2. Em `linhaAtendimento`: exibir badge colorido do sinal (`⏳ Sinal: 35min`, `⏳ Sinal: 1h 20min`, `⚠️ Sinal: 2h 15min - Liberar?`).
3. Em `telaInicio`:
   - Inserir na `central-alertas` o bloco de "Reservas Aguardando Sinal" quando houver pendências.
   - Adicionar os botões de filtro rápido no topo da lista de atendimentos.
4. Em `telaAgenda`:
   - Adicionar o botão/seção de "Configurações de Sinal" no topo ou ações da agenda.
   - Adicionar filtro `[⏳ Aguardando Sinal (N)]`.
5. Em `abrirAtendimento`:
   - Adicionar botões específicos quando `sinal_status === 'pendente'` (`✓ Confirmar Sinal`, `💬 Lembrar Sinal`, `✕ Sinal Não Recebido`).
6. Em `folhaConcluir`:
   - Pré-preencher com o saldo deduzido do sinal pago (`valor_cobrado = preco_tabela - sinal_valor`).

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/sinal-admin-ui.test.js` and `npm test`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**
```bash
git add public/admin/admin.js test/sinal-admin-ui.test.js
git commit -m "feat(sinal): contador visual, filtros rapidos e acoes de sinal no painel administrativo"
```

---

### Task 6: Migração Remota do Banco D1 e Deploy em Jerusa Beauty

**Files:**
- Modify/Run: Remote Cloudflare D1 `jerusa-beauty`
- Test: Full integration verification

**Interfaces:**
- Consumes: Credenciais Cloudflare D1 (`7fd07bf9fdec715ef4cb326c9094f2d1`).
- Produces: Banco remoto atualizado e build deployado em `https://jerusa-beauty.pages.dev`.

- [ ] **Step 1: Execute D1 remote migration for Jerusa Beauty**
Executar comandos SQL no D1 remoto `jerusa-beauty` adicionando colunas se não existirem e garantindo as configs iniciais.
- [ ] **Step 2: Run complete local test suite**
Run: `npm test`
Expected: 100% tests passing.
- [ ] **Step 3: Deploy to Cloudflare Pages**
Executar `node scripts/deploy.mjs`.
- [ ] **Step 4: Verify production deployment**
Checar resposta HTTP 200 de `https://jerusa-beauty.pages.dev/api/publico/config`.
- [ ] **Step 5: Commit & Final Wrap-up**
```bash
git commit --allow-empty -m "deploy: cobranca de sinal de reserva em jerusa-beauty"
```
