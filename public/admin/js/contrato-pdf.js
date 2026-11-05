// Gerador de PDF Oficial — Contrato Digital Minha Agenda (SysImperium)
// Utiliza jsPDF (client-side, 100% autônomo, sem dependências de servidor)

export function gerarPdfContratoMinhaAgenda(dados = {}) {
  const jsPDF = window.jspdf ? window.jspdf.jsPDF : null;
  if (!jsPDF) {
    alert('Biblioteca jsPDF não carregada. Verifique a conexão com a internet.');
    return;
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margemEsq = 20;
  const margemDir = 20;
  const larguraUtil = 210 - margemEsq - margemDir; // 170mm
  let y = 22;

  function verificarQuebra(alturaNecessaria = 15) {
    if (y + alturaNecessaria > 275) {
      doc.addPage();
      y = 22;
      desenharCabecalhoSecundario();
    }
  }

  function desenharCabecalhoSecundario() {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 145, 155);
    doc.text('PLATAFORMA MINHA AGENDA · CONTRATO DE LICENÇA DE USO', margemEsq, 12);
    doc.text(`CÓDIGO: ${dados.codigo_autenticidade || 'CT-2026'}`, 210 - margemDir, 12, { align: 'right' });
    doc.setDrawColor(220, 225, 235);
    doc.setLineWidth(0.2);
    doc.line(margemEsq, 14, 210 - margemDir, 14);
  }

  // ---------- PÁGINA 1: CABEÇALHO PRINCIPAL ----------
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.roundedRect(margemEsq, y, larguraUtil, 22, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('SYSIMPERIUM SOLUÇÕES TECNOLÓGICAS', margemEsq + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('PLATAFORMA MINHA AGENDA — CONTRATO DIGITAL DE LICENÇA DE USO', margemEsq + 5, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(56, 189, 248);
  doc.text(dados.codigo_autenticidade || 'CT-2026-000001', 210 - margemDir - 5, y + 14, { align: 'right' });

  y += 28;

  // ---------- QUADRO DAS PARTES ----------
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margemEsq, y, larguraUtil, 32, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('IDENTIFICAÇÃO DAS PARTES CONTRATANTES', margemEsq + 4, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('CONTRATADA:', margemEsq + 4, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${dados.partes?.contratada?.razao_social || 'SysImperium Soluções Tecnológicas'} (Representante: ${dados.partes?.contratada?.representante || 'Ian Souza Santos'} · Contato: ${dados.partes?.contratada?.whatsapp || '(83) 98821-2971'})`,
    margemEsq + 28,
    y + 12,
    { maxWidth: larguraUtil - 32 }
  );

  doc.setFont('helvetica', 'bold');
  doc.text('CONTRATANTE:', margemEsq + 4, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${dados.nome_cliente || 'Profissional'} (Estabelecimento: ${dados.nome_estabelecimento || dados.nome_cliente || 'Cadastrado'} · WhatsApp: ${dados.whatsapp_mascarado || dados.assinado_por_whatsapp || dados.whatsapp || '-'})`,
    margemEsq + 30,
    y + 20,
    { maxWidth: larguraUtil - 34 }
  );

  doc.setFont('helvetica', 'bold');
  doc.text('VALOR & CONDIÇÃO:', margemEsq + 4, y + 28);
  doc.setFont('helvetica', 'normal');
  const valFmt = ((dados.valor_mensalidade_centavos || 3990) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  doc.text(
    `Adesão: R$ 39,99 · ${valFmt}/mês · Vencimento todo dia ${dados.dia_vencimento || 10} · SEM CARÊNCIA NEM MULTA`,
    margemEsq + 38,
    y + 28,
    { maxWidth: larguraUtil - 42 }
  );

  y += 38;

  // ---------- CLÁUSULAS CONTRATUAIS ----------
  const clausulas = dados.clausulas || [];
  for (const c of clausulas) {
    verificarQuebra(18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(c.titulo, margemEsq, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);

    const linhas = doc.splitTextToSize(c.texto, larguraUtil);
    for (const linha of linhas) {
      verificarQuebra(4.5);
      doc.text(linha, margemEsq, y);
      y += 4.2;
    }

    y += 3.5;
  }

  // ---------- QUADRO DE CERTIFICAÇÃO DA ASSINATURA ELETRÔNICA ----------
  verificarQuebra(42);

  doc.setFillColor(240, 253, 244); // #f0fdf4
  doc.setDrawColor(187, 247, 208); // #bbf7d0
  doc.setLineWidth(0.4);
  doc.roundedRect(margemEsq, y, larguraUtil, 36, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // #166534
  doc.text('CERTIFICADO DE ASSINATURA ELETRÔNICA — MINHA AGENDA', margemEsq + 5, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(21, 128, 61);

  const dataAssinatura = dados.assinado_em
    ? new Date(dados.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Assinado eletronicamente';

  doc.text(`• Status: ASSINADO DIGITALMENTE E EM VIGÊNCIA`, margemEsq + 5, y + 12);
  doc.text(`• Data / Hora do Servidor: ${dataAssinatura}`, margemEsq + 5, y + 17);
  doc.text(`• Confirmação via WhatsApp: ${dados.assinado_por_whatsapp || dados.whatsapp_mascarado || dados.whatsapp}`, margemEsq + 5, y + 22);
  doc.text(`• Código de Autenticidade: ${dados.codigo_autenticidade || 'CT-2026-000001'}`, margemEsq + 5, y + 27);
  
  if (dados.hash_sha256) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.text(`• Hash de Integridade (SHA-256): ${dados.hash_sha256}`, margemEsq + 5, y + 32);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text(`• Validade jurídica garantida conforme art. 10, § 2º da MP 2.200-2/2001 e Lei 14.063/2020.`, margemEsq + 5, y + 32);
  }

  y += 42;

  // ---------- RODAPÉ EM TODAS AS PÁGINAS ----------
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPaginas} · Contrato de Licença Minha Agenda · SysImperium Soluções Tecnológicas`,
      margemEsq,
      290
    );
    doc.text(
      `Código: ${dados.codigo_autenticidade || 'CT-2026'}`,
      210 - margemDir,
      290,
      { align: 'right' }
    );
  }

  const nomeArquivo = `Contrato-MinhaAgenda-${(dados.codigo_autenticidade || 'CT-2026').replace(/\//g, '-')}.pdf`;
  doc.save(nomeArquivo);
}
