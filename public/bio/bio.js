// Validação de licença e carregamento dinâmico da página de Bio/Links

function mascaraWhatsapp(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export async function carregarBioDinamica() {
  const carregando = document.getElementById('bio-carregando');
  const container = document.getElementById('bio-container') || document.querySelector('.bio-container');
  const rodape = document.getElementById('bio-rodape') || document.querySelector('.bio-rodape');

  // 1. Checa status da licença (bloqueio ou demo expirado)
  try {
    const respLic = await fetch('/api/licenca/status');
    if (respLic.ok) {
      const lic = await respLic.json();
      if (lic && lic.bloqueado) {
        if (carregando) carregando.remove();
        if (rodape) rodape.remove();

        const isDemo = lic.motivo === 'demo_expirado' || lic.tipo_plano === 'demonstracao';
        const zap = lic.whatsapp_negociacao || '5583988212971';
        const nomeCliente = lic.nome_cliente || 'Aplicativo';
        const msgZap = encodeURIComponent(`Olá Ian! O período de demonstração do aplicativo ${nomeCliente} chegou ao fim e gostaria de negociar a contratação do sistema definitivo.`);

        if (container) {
          container.style.display = 'flex';
          container.innerHTML = `
            <div class="bio-retrato-topo" style="margin-top: 20px;">
              <img src="/img/logo.png" alt="${nomeCliente}" class="bio-retrato" style="object-fit:cover;aspect-ratio:1/1">
            </div>
            <h1 class="bio-titulo" style="margin-top: 14px;">${isDemo ? 'Demonstração Finalizada' : 'Acesso Suspenso'}</h1>
            <div class="bio-subtitulo">${isDemo ? 'Período de Testes Concluído' : 'Acesso Temporariamente Suspenso'}</div>
            <p class="bio-bio" style="margin-bottom: 24px;">
              ${lic.mensagem || (isDemo ? 'O período de demonstração deste aplicativo chegou ao fim. Para ativar o aplicativo em definitivo com agendamento online e painel administrativo, entre em contato.' : 'Acesso suspenso temporariamente.')}
            </p>
            <div class="bio-links">
              <a href="https://wa.me/${zap}?text=${msgZap}" class="bio-btn bio-btn-principal" target="_blank" rel="noopener">
                <div class="bio-btn-conteudo">
                  <div class="bio-icone" style="background:#25d366;color:#ffffff">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.167 8.167 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.02 4.54-3.68 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.06 0 1.21.89 2.39 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z"/>
                    </svg>
                  </div>
                  <div class="bio-btn-textos">
                    <span class="bio-btn-titulo">Negociar Contrato no WhatsApp</span>
                    <span class="bio-btn-sub">(83) 98821-2971 · Falar com Ian</span>
                  </div>
                </div>
                <svg class="bio-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
            </div>
          `;
        }
        return;
      }
    }
  } catch (e) {
    // Modo offline ou rede instável continua para carregar dados
  }

  // 2. Carrega configurações do negócio (/api/publico/config)
  try {
    const respCfg = await fetch('/api/publico/config');
    if (respCfg.ok) {
      const cfg = await respCfg.json();
      const nome = cfg.nome || 'Jerusa Beauty';
      const primeiroNome = nome.split(' ')[0] || 'nossa equipe';

      document.title = `${nome} — Links Oficiais`;

      // Logomarca (com auto-ajuste e aspecto quadrado)
      const imgEl = document.getElementById('bio-foto');
      if (imgEl) {
        imgEl.src = cfg.logo_customizada || '/img/logo-retrato.png';
        imgEl.alt = nome;
      }

      // Ramo / Especialidade
      const ramoEl = document.getElementById('bio-ramo');
      if (ramoEl) {
        ramoEl.textContent = cfg.ramo_atividade || 'Manicure & Nail Designer';
      }

      // Slogan / Frase de apresentação
      const sloganEl = document.getElementById('bio-slogan');
      if (sloganEl) {
        const textoSlogan = (cfg.slogan ?? '').trim();
        if (textoSlogan) {
          sloganEl.textContent = textoSlogan;
          sloganEl.style.display = 'block';
        } else {
          sloganEl.style.display = 'none';
        }
      }

      // Botão Falar no WhatsApp
      const whatsBtn = document.getElementById('bio-btn-whats');
      if (whatsBtn) {
        if (cfg.exibir_whatsapp_bio && cfg.whatsapp) {
          whatsBtn.style.display = 'flex';
          const subEl = document.getElementById('bio-whats-sub');
          if (subEl) subEl.textContent = `${mascaraWhatsapp(cfg.whatsapp)} · Conversar com ${primeiroNome}`;
          const msgZap = encodeURIComponent(`Olá, ${primeiroNome}! Vim pelo link da Bio e gostaria de informações.`);
          whatsBtn.href = `https://wa.me/${cfg.whatsapp}?text=${msgZap}`;
        } else {
          whatsBtn.style.display = 'none';
        }
      }

      // Atendimento Local
      const txtLocal = document.getElementById('bio-txt-local');
      if (txtLocal) {
        if (cfg.atende_espaco && cfg.atende_domicilio) {
          txtLocal.textContent = 'Atendimento no Espaço & a Domicílio';
        } else if (cfg.atende_espaco) {
          txtLocal.textContent = cfg.endereco_espaco ? `Atendimento no Espaço (${cfg.endereco_espaco})` : 'Atendimento exclusivo no Espaço';
        } else if (cfg.atende_domicilio) {
          txtLocal.textContent = 'Atendimento a Domicílio';
        } else {
          document.getElementById('bio-info-local')?.remove();
        }
      }

      // Dias de Atendimento
      const txtDias = document.getElementById('bio-txt-dias');
      if (txtDias) {
        txtDias.textContent = cfg.dias_expediente_texto || 'Com horário marcado';
      }

      // Rodapé
      if (rodape) {
        rodape.textContent = `${nome} © ${new Date().getFullYear()} · Todos os direitos reservados`;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar configurações dinâmicas da Bio:', err);
  }

  // 3. Exibe conteúdo após carregar
  if (carregando) carregando.remove();
  if (container) container.style.display = 'flex';
  if (rodape) rodape.style.display = 'block';
}

carregarBioDinamica();
