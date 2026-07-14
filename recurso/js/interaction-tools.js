/* ================================================
   interaction-tools.js  —  v1.0
   Ferramentas interativas de captura e classificação.

   Responsabilidades:
   - Wizard de Recorte de Imagem (state-machine de 3 estados)
   - Popup de Classificação de Texto
   - Event Listeners do Overlay de Recorte

   Dependências externas (definidas em app.js, carregado após):
   - topicos[], currentPage           → leitura/escrita de estado global
   - salvarAnotacao(), renderizarTopicos(), exibirToast()  → chamadas de serviço
   ================================================ */

/* ================================================
   REFERÊNCIA AO OVERLAY (DOM já disponível: script no fim do <body>)
   ================================================ */
const overlay = document.getElementById('crop-overlay');

/* ================================================
   ESTADO DO WIZARD DE RECORTE E EXTRATOR
   ================================================ */
let modoRecorteAtivo         = false;
let modoExtratorAtivo        = false;
let extratorTempState        = null;
let startX, startY;
let cropBox                  = null;
let _wizardTopicoSelecionado = null;  // ID do tópico confirmado no Passo 1
let _wizardImagemCapturada   = null;  // Data URL base64 do recorte confirmado
let _ultimoTopicoUsadoId     = null;  // Memória inteligente: pré-seleciona na próxima abertura

/* ================================================
   ESTADO DO POPUP DE CLASSIFICAÇÃO
   ================================================ */
let pendingTipo     = null;   // Tipo da extração pendente: 'texto' | 'imagem'
let pendingConteudo = null;   // Conteúdo bruto da extração pendente

window.toggleModoFoco = function(ativar) {
    // Agora capturamos OS DOIS painéis principais da tela
    const pdfContainer = document.getElementById('pdf-container');
    const historyContainer = document.getElementById('history-container'); // Adicionado o painel de Anotações

    if (ativar) {
        // Aplica o efeito de transparência/blur em tudo
        if (pdfContainer) pdfContainer.classList.add('pdf-foco-ativo');
        if (historyContainer) historyContainer.classList.add('pdf-foco-ativo');
    } else {
        // Remove o efeito ao fechar os modais
        if (pdfContainer) pdfContainer.classList.remove('pdf-foco-ativo');
        if (historyContainer) historyContainer.classList.remove('pdf-foco-ativo');
    }
};

// --- CONFIGURAÇÃO CENTRAL DE DOCUMENTOS ---
const DOC_CONFIG = [
    // --- FASE 1: Postulação e Recursos ---
    { label: 'Recurso Ordinário', polo: 'DUAL', tipo: 'dual', fase: 1 },
    { label: 'Contrarrazões', polo: 'DUAL', tipo: 'dual', fase: 1 },

    // --- FASE 2: Gênese do Conflito ---
    { label: 'Petição Inicial', polo: 'Parte Autora', tipo: 'auto', fase: 2 },
    { label: 'Contestação', polo: 'Parte Ré', tipo: 'auto', fase: 2 },
    { label: 'Impugnação à Contestação', polo: 'Parte Autora', tipo: 'auto', fase: 2 },
    // Novas Entradas Execução:
    { label: 'Título Executivo', polo: 'Juízo / Tribunal', tipo: 'auto', fase: 2, isExecucao: true },
    { label: 'Cálculos de Liquidação', polo: 'DUAL', tipo: 'dual', fase: 2, isExecucao: true },
    { label: 'Embargos à Execução', polo: 'Parte Executada', tipo: 'auto', fase: 2, isExecucao: true },
    { label: 'Impugnação aos Cálculos', polo: 'Parte Exequente', tipo: 'auto', fase: 2, isExecucao: true },

    // --- FASE 3: Sentenças e Acórdãos ---
    { label: 'Sentença', polo: 'Juízo', tipo: 'auto', fase: 3 },
    { label: 'Acórdão / Decisão TRT', polo: 'Juízo', tipo: 'auto', fase: 3 },
    { label: 'Sentença de Embargos de Declaração', polo: 'Juízo', tipo: 'auto', fase: 3 },
    // Novas Entradas Execução:
    { label: 'Sentença de Liquidação', polo: 'Juízo', tipo: 'auto', fase: 3, isExecucao: true },
    { label: 'Decisão de Embargos à Execução', polo: 'Juízo', tipo: 'auto', fase: 3, isExecucao: true },

    // --- FASE 4: Provas e Atos Processuais ---
    { label: 'Ata de Audiência', polo: 'DUAL', tipo: 'dual', fase: 4 },
    { label: 'Laudo Pericial', polo: 'Perito', tipo: 'auto', fase: 4 },
    { label: 'Documento (Prova Pré-constituída)', polo: 'DUAL', tipo: 'dual', fase: 4 },
    { label: 'Despacho / Decisão', polo: 'Juízo', tipo: 'auto', fase: 4 },
    // Novas Entradas Execução (substituindo a antiga genérica):
    { label: 'Mandado de Penhora', polo: 'Auxiliar da Justiça', tipo: 'auto', fase: 4, isExecucao: true },
    { label: 'Bacenjud / Sisbajud', polo: 'Juízo / Tribunal', tipo: 'auto', fase: 4, isExecucao: true },
    { label: 'Decisão / Despacho (Execução)', polo: 'Juízo / Tribunal', tipo: 'auto', fase: 4, isExecucao: true },
    { label: 'Documento / Manifestação', polo: 'DUAL', tipo: 'dual', fase: 4, isHibrido: true }
];

let _docSelecionado = null;
let _isWizardContext = false;
let _pendingTargetIndex = null;

function renderizarFasesModais(context) {
    const tabsContainer = document.getElementById(`${context}-phase-tabs`);
    const listContainer = document.getElementById(`lista-docs-${context}`);
    if (!tabsContainer || !listContainer) return;
    
    const fases = [
        { id: 1, nome: '1. Recurso' }, { id: 2, nome: '2. Gênese' },
        { id: 3, nome: '3. Sentença' }, { id: 4, nome: '4. Provas' }
    ];

    tabsContainer.innerHTML = '';
    fases.forEach(f => {
        const btn = document.createElement('button');
        btn.className = `phase-tab-btn`;
        btn.textContent = f.nome;
        btn.onclick = (e) => {
            e.stopPropagation();
            Array.from(tabsContainer.children).forEach(b => b.className = 'phase-tab-btn');
            btn.classList.add(`active-f${f.id}`);
            
            listContainer.innerHTML = '';
            DOC_CONFIG.filter(doc => doc.fase === f.id).forEach(doc => {
                const docBtn = document.createElement('button');
                docBtn.className = `doc-btn ${doc.tipo}`;
                docBtn.textContent = doc.label;
                docBtn.onclick = (e) => { e.stopPropagation(); selecionarDocumento(doc.label, doc.polo || 'DUAL', context); };
                listContainer.appendChild(docBtn);
            });
        };
        tabsContainer.appendChild(btn);
    });
}

function toggleAgruparPopup() {
    const agrupar = document.querySelector('input[name="modo_agrupar_popup"]:checked').value === 'agrupar';
    const input = document.getElementById('input-ideia-popup');
    input.style.display = agrupar ? 'block' : 'none';
    if(agrupar) input.focus();
}

function toggleAgruparWizard() {
    const agrupar = document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar';
    const input = document.getElementById('input-ideia-wizard');
    input.style.display = agrupar ? 'block' : 'none';
    if(agrupar) input.focus();
}

function processarAgrupamento(topicoId, inputId) {
    const isWizard = inputId.includes('wizard');
    const radioName = isWizard ? 'modo_agrupar_wizard' : 'modo_agrupar_popup';
    
    if (document.querySelector(`input[name="${radioName}"]:checked`).value === 'agrupar') {
        const topico = topicos.find(t => t.id === topicoId);
        const numero = parseInt(document.getElementById(inputId).value, 10);
        
        if (isNaN(numero) || numero < 1 || numero > topico.anotacoes.length) {
            exibirToast(`Número inválido. O tópico tem ${topico.anotacoes.length} ideia(s).`, 'erro');
            return false;
        }
        return numero - 1; // Retorna índice base 0
    }
    return null;
}

function selecionarDocumento(docLabel, polo, context) {
    const topicoId = context === 'popup' ? document.getElementById('seletor-topico').value : _wizardTopicoSelecionado;
    if (!topicoId) { exibirToast('Selecione o tópico de destino primeiro.', 'aviso'); return; }

    const inputId = context === 'popup' ? 'input-ideia-popup' : 'input-ideia-wizard';
    const targetIndex = processarAgrupamento(topicoId, inputId);
    if (targetIndex === false) return;

    _pendingTargetIndex = targetIndex;

    if (polo === 'DUAL') {
        _docSelecionado = docLabel;
        _isWizardContext = (context === 'wizard');
        
        const conf = DOC_CONFIG.find(d => d.label === docLabel);
        const isExecucao = conf && conf.isExecucao;

        const targetDocText = context === 'popup' ? 'popup-doc-selecionado' : 'wizard-doc-selecionado';
        const targetContainer = context === 'popup' ? 'popup-polo-buttons-container' : 'wizard-polo-buttons-container';
        
        document.getElementById(targetDocText).innerText = docLabel;
        
        // 1. Dicionário de UI (Single Source of Truth para Botões)
        const botoesDef = {
            autora:    `<button class="chip-btn chip-autora" onclick="confirmarPolo('Parte Autora', event)">✔ Parte Autora</button>`,
            re:        `<button class="chip-btn chip-re" onclick="confirmarPolo('Parte Ré', event)">✔ Parte Ré</button>`,
            exequente: `<button class="chip-btn chip-exequente" onclick="confirmarPolo('Parte Exequente', event)">✔ Parte Exequente</button>`,
            executada: `<button class="chip-btn chip-executada" onclick="confirmarPolo('Parte Executada', event)">✔ Parte Executada</button>`,
            juizo:     `<button class="chip-btn chip-juizo" onclick="confirmarPolo('Juízo / Tribunal', event)">🏛️ Juízo / Tribunal</button>`,
            auxiliar:  `<button class="chip-btn chip-auxiliar" onclick="confirmarPolo('Auxiliar da Justiça', event)">⚖️ Auxiliar da Justiça</button>`
        };

        let htmlBotoes = '';
        
        // 2. Mapeamento Lógico Baseado em Metadados
        if (conf && conf.isHibrido) {
            htmlBotoes += `${botoesDef.autora}${botoesDef.re}${botoesDef.exequente}${botoesDef.executada}${botoesDef.juizo}`;
        } else if (conf && conf.isExecucao) {
            htmlBotoes += `${botoesDef.exequente}${botoesDef.executada}${botoesDef.juizo}${botoesDef.auxiliar}`;
        } else {
            htmlBotoes += `${botoesDef.autora}${botoesDef.re}`;
        }

        // 3. Renderização Consistente do Botão Voltar
        if (context === 'popup') {
            htmlBotoes += `<button class="chip-btn chip-cancelar" onclick="voltarParaDocumentos('popup', event)">← Voltar</button>`;
        } else {
            htmlBotoes += `<div class="wizard-actions" style="margin-top: 0;"><button class="chip-btn chip-cancelar" onclick="voltarParaDocumentos('wizard', event)">← Voltar</button></div>`;
        }

        document.getElementById(targetContainer).innerHTML = htmlBotoes;

        document.getElementById(`${context}-step-doc`).style.display = 'none';
        document.getElementById(`${context}-step-polo`).style.display = 'block';
    } else {
        executarSalvamento(docLabel, polo, topicoId, _pendingTargetIndex, context);
    }
}

function confirmarPolo(polo, event) {
    if(event) event.stopPropagation();
    const context = _isWizardContext ? 'wizard' : 'popup';
    const topicoId = context === 'popup' ? document.getElementById('seletor-topico').value : _wizardTopicoSelecionado;
    executarSalvamento(_docSelecionado, polo, topicoId, _pendingTargetIndex, context);
}

function voltarParaDocumentos(context, event) {
    if(event) event.stopPropagation();
    document.getElementById(`${context}-step-polo`).style.display = 'none';
    document.getElementById(`${context}-step-doc`).style.display = 'block';
    _docSelecionado = null;
}

function executarSalvamento(docLabel, polo, topicoId, targetIndex, context) {
    if (context === 'popup') {
        const comentario = document.getElementById('comentario-input').value.trim();
        salvarAnotacao(pendingTipo, pendingConteudo, docLabel, polo, topicoId, comentario, targetIndex);
        fecharPopupClassificacao();
    } else {
        _ultimoTopicoUsadoId = topicoId;
        const comentario = document.getElementById('crop-comment-input').value.trim();
        salvarAnotacao('imagem', _wizardImagemCapturada, docLabel, polo, topicoId, comentario, targetIndex);
        fecharTudoWizard();
    }
}

/* ================================================
   WIZARD DE RECORTE DE IMAGEM
   State-machine de 3 estados:
   IDLE → PASSO_1 (seleção de tópico) →
   RECORTANDO (overlay ativo) → PASSO_2 (confirmação)
   ================================================ */

/**
 * PASSO 0 — Ponto de entrada.
 * Abre o Passo 1 do wizard (seleção de tópico).
 * Bloqueia a interface com o backdrop.
 */
function iniciarRecorteWizard() {
    window.toggleModoFoco(true);
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal antes de realizar recortes.', 'aviso');
        return;
    }

    const select = document.getElementById('crop-topic-select');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => select.appendChild(new Option(t.nome, t.id)));

    // Memória inteligente: pré-seleciona o último tópico utilizado
    if (_ultimoTopicoUsadoId) select.value = _ultimoTopicoUsadoId;

    document.getElementById('wizard-backdrop').style.display  = 'block';
    document.getElementById('crop-wizard-step1').style.display = 'flex';
}

/**
 * PASSO 1 → RECORTANDO.
 * Valida o tópico selecionado, fecha o Passo 1 e ativa o overlay de recorte.
 */
function avancarParaRecorte() {
    const topicoId = document.getElementById('crop-topic-select').value;
    if (!topicoId) {
        exibirToast('Selecione um tópico para continuar.', 'aviso');
        return;
    }

    _wizardTopicoSelecionado = topicoId;
    document.getElementById('crop-wizard-step1').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';

    // NOVO: Remove o desfoque do documento para garantir precisão no recorte
    window.toggleModoFoco(false);

    modoRecorteAtivo = true;
    const r = document.getElementById('pdf-container').getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left     = r.left   + 'px';
    overlay.style.top      = r.top    + 'px';
    overlay.style.width    = r.width  + 'px';
    overlay.style.height   = r.height + 'px';
    overlay.style.display  = 'block';

    // CORREÇÃO ARQUITETURAL: Desativa a camada de texto E a camada de links (annotationLayer).
    // A highlightLayer NÃO é alterada aqui para respeitar seu estado CSS base.
    document.querySelectorAll('.textLayer, .annotationLayer').forEach(l => l.style.pointerEvents = 'none');
    
    document.getElementById('btn-ferramenta-recorte').classList.add('ativo');
    exibirToast('Tópico confirmado. Arraste o mouse sobre o documento para recortar.', 'sucesso');
}

/**
 * RECORTANDO → IDLE.
 * Esconde o overlay e restaura os event listeners do texto e dos links.
 */
function desativarOverlayRecorte() {
    modoRecorteAtivo = false;
    overlay.style.display = 'none';
    document.getElementById('btn-ferramenta-recorte').classList.remove('ativo');
    
    // RESTAURAÇÃO: Devolve a interatividade APENAS para as camadas que foram bloqueadas.
    document.querySelectorAll('.textLayer, .annotationLayer').forEach(l => l.style.pointerEvents = 'auto');
}

/**
 * RECORTANDO → PASSO_2.
 * Desativa o overlay e exibe o Passo 2 com a pré-visualização da imagem.
 */
function abrirConfirmacaoRecorteWizard() {
    desativarOverlayRecorte();
    
    // NOVO: Reativa o desfoque para centralizar a atenção cognitiva no formulário
    window.toggleModoFoco(true);

    document.getElementById('crop-preview-img').src = _wizardImagemCapturada;
    document.getElementById('crop-comment-input').value = '';
    
    // NOVO: Resetar modal e popular seletor com o tópico escolhido no Passo 1
    document.querySelector('input[name="modo_agrupar_wizard"][value="nova"]').checked = true;
    toggleAgruparWizard();
    
    renderizarFasesModais('wizard');
    const tabsWizard = document.getElementById('wizard-phase-tabs');
    if(tabsWizard && tabsWizard.firstElementChild) tabsWizard.firstElementChild.click();

    const topicoObj = topicos.find(t => t.id === _wizardTopicoSelecionado);
    const wizardHeader = document.getElementById('wizard-topic-color-feedback');
    if(topicoObj && wizardHeader) {
        wizardHeader.style.backgroundColor = topicoObj.cor;
        wizardHeader.style.height = '6px';
    }

    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('crop-wizard-step2').style.display = 'flex';
}

/**
 * PASSO_2 → IDLE.
 * Salva a anotação com o polo selecionado e encerra o wizard.
 */
function finalizarRecorteWizard(polo) {
    const comentario = document.getElementById('crop-comment-input').value.trim();
    _ultimoTopicoUsadoId = _wizardTopicoSelecionado;
    
    let targetIndex = null;
    if (document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar') {
        targetIndex = document.getElementById('seletor-ideia-wizard').value;
    }

    salvarAnotacao('imagem', _wizardImagemCapturada, polo, _wizardTopicoSelecionado, comentario, targetIndex);
    fecharTudoWizard();
}

/**
 * PASSO_2 → RECORTANDO.
 * Volta ao overlay sem retornar ao Passo 1: o tópico já foi escolhido.
 */
function refazerRecorteArea() {
    document.getElementById('crop-wizard-step2').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';
    avancarParaRecorte();
}

/**
 * QUALQUER ESTADO → IDLE.
 * Cancela o wizard por completo, fechando todos os painéis e limpando o estado.
 */
function cancelarRecorteWizard() {
    fecharTudoWizard();
    desativarOverlayRecorte();
}

/** Utilitário interno: fecha os painéis visuais e zera as variáveis de estado. */
function fecharTudoWizard() {
    window.toggleModoFoco(false);
    document.getElementById('crop-wizard-step1').style.display = 'none';
    document.getElementById('crop-wizard-step2').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';
    _wizardTopicoSelecionado = null;
    _wizardImagemCapturada   = null;
    
    // NOVO: Prevenção de State Leakage
    if (typeof _tempHighlightState !== 'undefined') {
        _tempHighlightState.rects = null;
        _tempHighlightState.paginaFisica = null;
    }
}

/* ================================================
   POPUP DE CLASSIFICAÇÃO DE TEXTO
   ================================================ */

function fecharPopupClassificacao() {
    window.toggleModoFoco(false);
    const popup = document.getElementById('classification-popup');
    popup.style.display = 'none';

    document.getElementById('popup-step-polo').style.display = 'none';
    document.getElementById('popup-step-doc').style.display = 'block';
    document.getElementById('input-ideia-popup').value = '';

    const txtArea = document.getElementById('comentario-input');
    if (txtArea) {
        txtArea.style.display = 'none';
        txtArea.value = '';
    }
    pendingTipo = null;
    pendingConteudo = null;
    
    // NOVO: Limpa o estado global geométrico com segurança
    if (typeof _tempHighlightState !== 'undefined') {
        _tempHighlightState.rects = null;
        _tempHighlightState.paginaFisica = null;
    }
    
    if (window.getSelection) window.getSelection().removeAllRanges();
    
    const header = document.getElementById('popup-topic-color-feedback');
    if(header) header.style.height = '0';
}

function exibirPopupClassificacao(tipo, conteudo) {
    window.toggleModoFoco(true);
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal.', 'aviso'); return;
    }
    pendingTipo = tipo;
    pendingConteudo = conteudo;

    const select = document.getElementById('seletor-topico');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => {
        const opt = new Option(t.nome, t.id);
        opt.dataset.cor = t.cor;
        select.appendChild(opt);
    });

    document.getElementById('agrupamento-popup-box').style.display = 'none';
    document.querySelector('input[name="modo_agrupar_popup"][value="nova"]').checked = true;
    toggleAgruparPopup();

    renderizarFasesModais('popup');
    const tabsPopup = document.getElementById('popup-phase-tabs');
    if(tabsPopup && tabsPopup.firstElementChild) tabsPopup.firstElementChild.click();

    const popup = document.getElementById('classification-popup');
    popup.style.display = 'flex';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';

    const txtArea = document.getElementById('comentario-input');
    txtArea.value = '';
    if (tipo === 'imagem') {
        txtArea.style.display = 'block';
        requestAnimationFrame(() => requestAnimationFrame(() => txtArea.focus()));
    } else {
        txtArea.style.display = 'none';
    }
}

document.getElementById('seletor-topico').addEventListener('change', (e) => {
    // 1. Controla exibição do agrupamento
    const box = document.getElementById('agrupamento-popup-box');
    box.style.display = e.target.value ? 'flex' : 'none';
    
    // 2. Controla o feedback visual de cor desacoplado (lê data-cor injetado na option)
    const header = document.getElementById('popup-topic-color-feedback');
    const selectedOpt = e.target.options[e.target.selectedIndex];
    
    if (e.target.value && selectedOpt.dataset.cor) {
        header.style.backgroundColor = selectedOpt.dataset.cor;
        header.style.height = '6px';
    } else {
        header.style.height = '0';
        header.style.backgroundColor = 'transparent';
    }
});

/* ================================================
   MÓDULO: EXTRATOR INTELIGENTE DE TEXTO (ALFINETE)
   ================================================ */
window.iniciarMarcadorExtracao = function() {
    if (topicos.length === 0) {
        exibirToast('Crie um tópico recursal primeiro.', 'aviso'); return;
    }
    if (modoRecorteAtivo) desativarOverlayRecorte(); 
    
    modoExtratorAtivo = true;
    document.body.classList.add('modo-extrator-ativo');
    
    const r = document.getElementById('pdf-container').getBoundingClientRect();
    overlay.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px; display:block;`;
    
    exibirToast('Clique na linha do PDF onde o texto começa ou termina.', 'info');
};

window.salvarMarcadorExtracao = function() {
    const topicoId = document.getElementById('extrator-topic-select').value;
    const docTipo = document.getElementById('extrator-doc-select').value;
    const fronteira = document.getElementById('extrator-fronteira-select').value;
    
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico.marcosExtracao) topico.marcosExtracao = [];
    
    topico.marcosExtracao = topico.marcosExtracao.filter(m => !(m.docTipo === docTipo && m.fronteira === fronteira));
    topico.marcosExtracao.push({ ...extratorTempState, docTipo, fronteira });

    cancelarMarcadorExtracao();
    exibirToast(`Marco de ${fronteira} definido com sucesso!`, 'sucesso');
    
    if(window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    if(typeof salvarBackupAutomatico === 'function') salvarBackupAutomatico();
    
    // [NOVO] Valida o botão imediatamente após salvar um novo marco
    if (window.atualizarStatusBotaoExtrator) window.atualizarStatusBotaoExtrator();
};

window.cancelarMarcadorExtracao = function() {
    document.getElementById('extrator-modal-backdrop').style.display = 'none';
    document.getElementById('extrator-wizard-popup').style.display = 'none';
    extratorTempState = null;
    modoExtratorAtivo = false;
    document.body.classList.remove('modo-extrator-ativo');
    if (!modoRecorteAtivo) overlay.style.display = 'none';
};

/* ================================================
   DISPATCHER DE EVENTOS DO OVERLAY (RECORTE E EXTRATOR)
   ================================================ */

overlay.addEventListener('mousedown', function (e) {
    if (modoExtratorAtivo) {
        const rect = overlay.getBoundingClientRect();
        let targetContainer = null, localY = 0;
        
        document.querySelectorAll('.pdf-page-container').forEach(container => {
            const r = container.getBoundingClientRect();
            if (e.clientY >= r.top && e.clientY <= r.bottom) {
                targetContainer = container;
                localY = e.clientY - r.top; 
            }
        });

        if (!targetContainer) return;
        
        extratorTempState = { 
            pagina: parseInt(targetContainer.dataset.pageNumber), 
            offsetY: localY 
        };
        
        modoExtratorAtivo = false;
        document.body.classList.remove('modo-extrator-ativo');
        overlay.style.display = 'none';

        const select = document.getElementById('extrator-topic-select');
        select.innerHTML = '';
        
        // Memória inteligente para acelerar o processo (usa o tópico ativo se houver)
        const activeTabId = (typeof TopicsManager !== 'undefined') ? TopicsManager.getActiveTabId() : null;
        topicos.forEach(t => {
            const opt = new Option(t.nome, t.id);
            if (t.id === activeTabId) opt.selected = true;
            select.appendChild(opt);
        });
        
        document.getElementById('extrator-modal-backdrop').style.display = 'block';
        document.getElementById('extrator-wizard-popup').style.display = 'flex';
        return; // Early return bloqueia a execução do Recorte
    }

    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (cropBox) cropBox.remove();
    cropBox = document.createElement('div');
    cropBox.id = 'crop-box';
    cropBox.style.cssText = `left:${startX}px; top:${startY}px; width:0; height:0;`;
    overlay.appendChild(cropBox);
});

overlay.addEventListener('mousemove', function (e) {
    if (!cropBox) return;
    const rect = overlay.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    cropBox.style.width  = Math.abs(curX - startX) + 'px';
    cropBox.style.height = Math.abs(curY - startY) + 'px';
    cropBox.style.left   = Math.min(startX, curX)  + 'px';
    cropBox.style.top    = Math.min(startY, curY)  + 'px';
});

overlay.addEventListener('mouseup', function (e) {
    if (!cropBox) return;

    const cropW = parseFloat(cropBox.style.width);
    const cropH = parseFloat(cropBox.style.height);

    if (cropW < 5 || cropH < 5) {
        cropBox.remove();
        cropBox = null;
        return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const cropLeft = parseFloat(cropBox.style.left) + overlayRect.left;
    const cropTop  = parseFloat(cropBox.style.top)  + overlayRect.top;

    const cropCenterX = cropLeft + cropW / 2;
    const cropCenterY = cropTop  + cropH / 2;

    let targetContainer = null;
    document.querySelectorAll('.pdf-page-container').forEach(container => {
        const r = container.getBoundingClientRect();
        if (cropCenterX >= r.left && cropCenterX <= r.right &&
            cropCenterY >= r.top  && cropCenterY <= r.bottom) {
            targetContainer = container;
        }
    });

    if (!targetContainer) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Selecione uma área dentro de uma página do documento.', 'aviso');
        // CORREÇÃO: Removido desativarOverlayRecorte() para não quebrar o fluxo.
        return;
    }

    const canvas = targetContainer.querySelector('canvas');
    if (!canvas) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Página ainda sendo renderizada. Aguarde um instante e tente novamente.', 'aviso');
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const relX = cropLeft - canvasRect.left;
    const relY = cropTop  - canvasRect.top;

    const srcX = Math.max(0, relX);
    const srcY = Math.max(0, relY);
    const srcW = Math.min(cropW - Math.max(0, -relX), canvasRect.width  - srcX);
    const srcH = Math.min(cropH - Math.max(0, -relY), canvasRect.height - srcY);

    if (srcW <= 0 || srcH <= 0) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Selecione uma área dentro da página do documento.', 'aviso');
        // CORREÇÃO: Removido desativarOverlayRecorte() para não quebrar o fluxo.
        return;
    }

    // --- CAPTURA DE COORDENADAS PARA O CRACHÁ ---
    const containerRect = targetContainer.getBoundingClientRect();
    _tempHighlightState.rects = [{
        top: cropTop - containerRect.top,
        left: cropLeft - containerRect.left,
        width: cropW,
        height: cropH
    }];
    _tempHighlightState.paginaFisica = parseInt(targetContainer.dataset.pageNumber);
    // ------------------------------------------------

    const scaleX = canvas.width  / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const recorteCanvas = document.createElement('canvas');
    recorteCanvas.width  = Math.round(srcW * scaleX);
    recorteCanvas.height = Math.round(srcH * scaleY);

    try {
        recorteCanvas.getContext('2d').drawImage(
            canvas,
            Math.round(srcX * scaleX), Math.round(srcY * scaleY),
            recorteCanvas.width,       recorteCanvas.height,
            0, 0,
            recorteCanvas.width,       recorteCanvas.height
        );
        const imageDataUrl = recorteCanvas.toDataURL('image/png');

        currentPage = parseInt(targetContainer.dataset.pageNumber);

        _wizardImagemCapturada = imageDataUrl;
        abrirConfirmacaoRecorteWizard();
    } catch (err) {
        console.error('Erro ao processar recorte:', err);
        exibirToast('Erro ao processar o recorte. Tente novamente.', 'erro');
    }

    cropBox.remove();
    cropBox = null;
    desativarOverlayRecorte();
});

/* ================================================
   ATALHOS DE TECLADO E ACESSIBILIDADE
   ================================================ */
document.addEventListener('keydown', function(e) {
    // Se a tecla for ESC e o overlay de recorte estiver ativo, abortamos o processo
    if (e.key === 'Escape' && modoRecorteAtivo) {
        // Limpa o quadrado em progresso, se houver
        if (cropBox) {
            cropBox.remove();
            cropBox = null;
        }
        // Restaura todo o estado, desliga o foco e remove o overlay
        cancelarRecorteWizard();
        exibirToast('Recorte cancelado.', 'info');
    }
});

/* ================================================
   MÓDULO: GERADOR DE CONTEXTO ESTRUTURADO (IA)
   ================================================ */

// Função utilitária de Debounce para proteger o Main Thread
function _debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/* --- NOVA FUNÇÃO DE LIMPEZA MANUAL --- */
window.limparAreaInternaLGPD = function() {
    document.getElementById('ctx-teor-sentenca').value = '';
    document.getElementById('ctx-teor-recurso').value = '';
    sessionStorage.removeItem('juris_ctx_sentenca');
    sessionStorage.removeItem('juris_ctx_recurso');
    exibirToast('Área restrita limpa.', 'info');
};

/* --- NOVA FUNÇÃO DE LIMPEZA MANUAL --- */
window.limparAreaInternaLGPD = function() {
    document.getElementById('ctx-teor-sentenca').value = '';
    document.getElementById('ctx-teor-recurso').value = '';
    sessionStorage.removeItem('juris_ctx_sentenca');
    sessionStorage.removeItem('juris_ctx_recurso');
    exibirToast('Área restrita limpa.', 'info');
};

/* --- ATUALIZAÇÃO DO AUTO-SAVE COM INJEÇÃO DE HASH DO PROCESSO --- */
window.salvarRascunhoContextoDebounced = _debounce(function() {
    try {
        const minuta = document.getElementById('ctx-minuta-anterior').value;
        const rascunho = document.getElementById('ctx-rascunho-ia').value;
        const sentenca = document.getElementById('ctx-teor-sentenca').value;
        const recurso = document.getElementById('ctx-teor-recurso').value;
        
        // Captura o processo atual como ID de Segurança
        const tagProcesso = document.getElementById('tag-numero-processo');
        const numProcesso = tagProcesso ? tagProcesso.textContent.trim() : 'sem-processo';
        
        sessionStorage.setItem('juris_ctx_minuta', minuta);
        sessionStorage.setItem('juris_ctx_rascunho', rascunho);
        
        // Só salva o sigilo se houver dados, amarrado ao ID do processo atual
        sessionStorage.setItem('juris_ctx_sentenca', sentenca);
        sessionStorage.setItem('juris_ctx_recurso', recurso);
        sessionStorage.setItem('juris_ctx_processo_ref', numProcesso);
    } catch (e) {
        console.warn('Falha ao acessar sessionStorage:', e);
    }
}, 800);

/* --- ABERTURA ASSÍNCRONA DO MODAL DE CONTEXTO (COM EXTRAÇÃO JIT) --- */
window.abrirModalGeradorContexto = async function() {
    if (!window.ExportManager) return;
    const dadosTopico = ExportManager.obterDadosDoTopicoAtivo();
    if (!dadosTopico) {
        exibirToast('Selecione um tópico com provas estruturadas antes de gerar o contexto.', 'aviso');
        return;
    }

    // 1. UI UNBLOCKING: Feedback visual imediato antes da operação pesada na Main Thread
    const btnGerador = document.getElementById('btn-gerador-contexto');
    const originalHTML = btnGerador.innerHTML;
    btnGerador.innerHTML = "⏳";
    btnGerador.style.pointerEvents = "none";

    // Cede controle para o navegador renderizar o loading (micro-delay)
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        // 2. EXTRAÇÃO ASSÍNCRONA DINÂMICA (Baseada nos Pinos)
        const topicoBruto = topicos.find(t => t.id === TopicsManager.getActiveTabId());
        
        if (topicoBruto && topicoBruto.marcosExtracao && topicoBruto.marcosExtracao.length > 0) {
            // Agrupar marcos pareados por tipo de documento
            const agrupados = topicoBruto.marcosExtracao.reduce((acc, curr) => {
                if(!acc[curr.docTipo]) acc[curr.docTipo] = {};
                acc[curr.docTipo][curr.fronteira] = curr;
                return acc;
            }, {});

            let sentencaXML = "";
            let recursoXML = "";

            for (const [docTipo, limites] of Object.entries(agrupados)) {
                if (limites.inicio && limites.fim) {
                    const textoBruto = await window.PdfEngine.extrairTextoPorRegiao(limites.inicio, limites.fim);
                    const textoLimpo = window.JurisUtils.limparTextoPDF(textoBruto);
                    
                    // GERAÇÃO DE XML PROFUNDO PARA A IA
                    const tagName = docTipo.toUpperCase();
                    const xml = `\n<${tagName}>\n${textoLimpo}\n</${tagName}>\n`;
                    
                    if (docTipo === 'sentenca') sentencaXML += xml;
                    else recursoXML += xml;
                }
            }

            // Injeta nas textareas protegidas por LGPD
            if (sentencaXML) sessionStorage.setItem('juris_ctx_sentenca', sentencaXML.trim());
            if (recursoXML) sessionStorage.setItem('juris_ctx_recurso', recursoXML.trim());
        }

        // 3. FLUXO ORIGINAL DE ABERTURA DO MODAL
        const tagProcesso = document.getElementById('tag-numero-processo');
        const numProcessoAtual = tagProcesso ? (tagProcesso.textContent.trim() || 'Não informado') : 'Não informado';
        
        document.getElementById('ctx-metadados').value = `Processo: ${numProcessoAtual}\nTópico: ${dadosTopico.nome}`;
        document.getElementById('ctx-diretrizes').value = dadosTopico.markdown;
        
        document.getElementById('ctx-minuta-anterior').value = sessionStorage.getItem('juris_ctx_minuta') || '';
        document.getElementById('ctx-rascunho-ia').value = sessionStorage.getItem('juris_ctx_rascunho') || '';
        
        const processoSalvoRef = sessionStorage.getItem('juris_ctx_processo_ref');
        if (processoSalvoRef && processoSalvoRef !== numProcessoAtual) {
            window.limparAreaInternaLGPD();
            sessionStorage.setItem('juris_ctx_processo_ref', numProcessoAtual);
        } else {
            document.getElementById('ctx-teor-sentenca').value = sessionStorage.getItem('juris_ctx_sentenca') || '';
            document.getElementById('ctx-teor-recurso').value = sessionStorage.getItem('juris_ctx_recurso') || '';
        }

        const painelPdf = document.getElementById('pdf-container');
        const painelAnotacoes = document.getElementById('history-container');
        if (painelPdf) painelPdf.classList.add('pdf-foco-ativo');
        if (painelAnotacoes) painelAnotacoes.classList.add('pdf-foco-ativo');

        document.getElementById('gerador-contexto-backdrop').style.display = 'block';
        document.getElementById('modal-gerador-contexto').style.display = 'flex';

    } catch (error) {
        console.error("Erro na compilação do contexto:", error);
        exibirToast("Erro ao processar os trechos. Tente marcar novamente.", "erro");
    } finally {
        // Restaura botão original
        btnGerador.innerHTML = originalHTML;
        btnGerador.style.pointerEvents = "auto";
    }
};

window.fecharModalGeradorContexto = function() {
    // ==============================================================
    // SOLUÇÃO BULLETPROOF: Remove a transparência ao fechar a janela
    // ==============================================================
    const painelPdf = document.getElementById('pdf-container');
    const painelAnotacoes = document.getElementById('history-container');
    
    if (painelPdf) painelPdf.classList.remove('pdf-foco-ativo');
    if (painelAnotacoes) painelAnotacoes.classList.remove('pdf-foco-ativo');

    // Esconde o modal
    document.getElementById('gerador-contexto-backdrop').style.display = 'none';
    document.getElementById('modal-gerador-contexto').style.display = 'none';
};

/* --- ATUALIZAÇÃO DA EXPORTAÇÃO COM TRAVA LGPD E TAGS XML --- */
window.gerarECopiarContexto = function(modo = 'pro') {
    const nomeAcao = modo === 'interno' ? 'copiar DADOS COMPLETOS para ChatJT' : 'copiar DADOS SEGUROS para Gemini PRO';
    
    // Guardrail context-aware
    if (window.BalancaManager && !window.BalancaManager.executarGuardrailDeTarefas(nomeAcao)) {
        exibirToast('Cópia interrompida pelo usuário.', 'aviso');
        return; 
    }

    const btnId = modo === 'interno' ? 'btn-copiar-contexto-interno' : 'btn-copiar-contexto-pro';
    const btn = document.getElementById(btnId);
    const originalText = btn.innerHTML; // Preserva a estrutura do <span>
    
    let outputFinal = "";
    
    const minuta = document.getElementById('ctx-minuta-anterior').value.trim();
    if (minuta) outputFinal += "== MINUTA_ATUAL ==\n" + minuta + "\n\n";
    
    outputFinal += "== METADADOS E TÓPICO ==\n" + document.getElementById('ctx-metadados').value.trim() + "\n\n";
    outputFinal += "== DIRETRIZES ==\n" + document.getElementById('ctx-diretrizes').value.trim() + "\n\n";
    
    const rascunho = document.getElementById('ctx-rascunho-ia').value.trim();
    if (rascunho) outputFinal += "== RASCUNHO BASE ==\n" + rascunho + "\n\n";

    // INJEÇÃO XML SIGILOSA: Só ocorre se o modo for interno
    if (modo === 'interno') {
        const sentenca = document.getElementById('ctx-teor-sentenca').value.trim();
        const recurso = document.getElementById('ctx-teor-recurso').value.trim();

        if (sentenca || recurso) {
            outputFinal += "<relatorio_do_conflito>\n";
            if (sentenca) {
                outputFinal += "  <inteiro_teor_sentenca>\n";
                // Identação profunda para delimitar pro LLM
                outputFinal += `    ${sentenca.replace(/\n/g, '\n    ')}\n`; 
                outputFinal += "  </inteiro_teor_sentenca>\n\n";
            }
            if (recurso) {
                outputFinal += "  <inteiro_teor_recurso>\n";
                outputFinal += `    ${recurso.replace(/\n/g, '\n    ')}\n`;
                outputFinal += "  </inteiro_teor_recurso>\n";
            }
            outputFinal += "</relatorio_do_conflito>\n";
        }
    }

    // Feedback Visual Progressivo
    btn.innerHTML = "<span style='font-weight: bold;'>⏳ Copiando...</span>";
    btn.style.opacity = "0.8";

    if (!navigator.clipboard) {
        executarCopiaFallback(outputFinal, btn, originalText, modo);
        return;
    }

    navigator.clipboard.writeText(outputFinal).then(() => {
        btn.innerHTML = "<span style='font-weight: bold;'>✅ Sucesso!</span>";
        btn.style.backgroundColor = "#2e7d32"; 
        btn.style.opacity = "1";
        
        const msgToast = modo === 'interno' ? 'Pacote Interno copiado (com XML).' : 'Pacote PRO seguro copiado.';
        exibirToast(msgToast, 'sucesso');
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = modo === 'interno' ? '#f57c00' : 'var(--trt-blue)';
            fecharModalGeradorContexto();
        }, 1500); // 1.5s para o usuário ler o sucesso
        
    }).catch(err => {
        console.error('Falha na Clipboard API:', err);
        executarCopiaFallback(outputFinal, btn, originalText, modo);
    });
};

function executarCopiaFallback(texto, btn, originalText, modo) {
    btn.innerHTML = "<span style='font-weight: bold;'>⚠️ Falha ao Copiar</span>";
    btn.style.backgroundColor = "#d32f2f";
    btn.style.opacity = "1";
    exibirToast('Permissão negada. Copie manualmente (Ctrl+A, Ctrl+C).', 'erro');
    
    // Retorna visual do botão após 3s, mas NÃO fecha o modal
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.backgroundColor = modo === 'interno' ? '#f57c00' : 'var(--trt-blue)';
    }, 3000);
}

/* ================================================
   DELEGAÇÃO DE EVENTOS (EVENT DELEGATION) - TOOLTIPS DOS ALFINETES
   ================================================ */
// Singleton para Cache do elemento Tooltip
let _cachedTooltip = null;

document.addEventListener('mouseover', (e) => {
    const pin = e.target.closest('.pdf-extrator-pin');
    if (!pin) return;

    if (!_cachedTooltip) _cachedTooltip = document.getElementById('quick-intent-tooltip');
    if (!_cachedTooltip) return;

    // 1. STATE SYNC: Cancela temporizadores pendentes no elemento global (previne concorrência de timers)
    if (_cachedTooltip._timer) clearTimeout(_cachedTooltip._timer);

    const fronteira = pin.dataset.tooltipFronteira === 'inicio' ? 'INÍCIO' : 'FIM';
    const docTipo = pin.dataset.tooltipDoc;
    const topicoNome = pin.dataset.tooltipTopico;

    // Dicionário visual
    const docNomes = { 
        sentenca: "Sentença / Acórdão", 
        recurso_autora: "Recurso (Autora)", 
        recurso_re: "Recurso (Ré)", 
        contrarrazões_autora: "Contrarrazões (Autora)", 
        contrarrazões_re: "Contrarrazões (Ré)", 
        inicial: "Petição Inicial", 
        contestacao: "Contestação" 
    };
    const nomeBonito = docNomes[docTipo] || (docTipo ? docTipo.toUpperCase() : 'DESCONHECIDO');
    const corFronteira = fronteira === 'INÍCIO' ? '#34db98' : '#e74c3c';

    // 2. DOM MUTATION: Injeta o novo conteúdo e semântica de cores
    _cachedTooltip.innerHTML = `
        <strong style="color: ${corFronteira};">📍 MARCO DE ${fronteira}</strong>
        <span style="display:block; margin-top:4px; font-size: 0.8rem; color:#ecf0f1;">
            <b>Doc:</b> ${nomeBonito}<br>
            <b>Tópico:</b> ${topicoNome}
        </span>
    `;

    // Garante que o elemento seja posicionado em display block mas permaneça temporariamente invisível
    _cachedTooltip.classList.remove('visible');
    _cachedTooltip.style.display = 'block';

    // 3. ANCORAGEM GEOMÉTRICA FIXA: Cálculo estático com base na posição física do pino
    const pinRect = pin.getBoundingClientRect();
    const tooltipRect = _cachedTooltip.getBoundingClientRect();
    
    let x = pinRect.left + (pinRect.width / 2) - (tooltipRect.width / 2);
    let y = pinRect.bottom + 10;

    // Proteção de limites da Viewport (Viewport Collision Prevention)
    if (x + tooltipRect.width > window.innerWidth) x = window.innerWidth - tooltipRect.width - 15;
    if (x < 0) x = 15;
    if (y + tooltipRect.height > window.innerHeight) y = pinRect.top - tooltipRect.height - 10;

    _cachedTooltip.style.left = `${x}px`;
    _cachedTooltip.style.top = `${y}px`;

    // 4. PAINT/ANIMATION TIER: Exibição gradual sob agendamento
    _cachedTooltip._timer = setTimeout(() => {
        requestAnimationFrame(() => _cachedTooltip.classList.add('visible'));
    }, 150);
});

document.addEventListener('mouseout', (e) => {
    const pin = e.target.closest('.pdf-extrator-pin');
    if (!pin || !_cachedTooltip) return;

    // BOUNDARY CHECK: Se o movimento ocorreu dentro dos limites internos do próprio pino, ignora o fechamento
    if (pin.contains(e.relatedTarget)) return;

    // Cancela o ciclo de exibição caso o mouse saia antes de expirar o timeout de ativação
    if (_cachedTooltip._timer) clearTimeout(_cachedTooltip._timer);

    _cachedTooltip.classList.remove('visible');
    
    // Libera o espaço de exibição no DOM após o encerramento da transição de opacidade (200ms)
    _cachedTooltip._timer = setTimeout(() => { 
        _cachedTooltip.style.display = 'none'; 
    }, 200);
});