/* ================================================
   acervo-controller.js
   CONTROLE DE INTERFACE PARA MODELOS E TAGS (ACERVO)
   ================================================ */

// Variáveis de Estado Isolado para o Acervo
let _idsRecomendadosIA = null;
let _noAlvoParaSalvar = null;

window.aplicarFiltroIAAcervo = function(idsArray) {
    _idsRecomendadosIA = idsArray;
    window.abrirModalAcervo();
};

window.limparFiltroIAAcervo = function() {
    _idsRecomendadosIA = null;
    window.abrirModalAcervo(); 
};
// ==========================================
// ESTADO DO ACERVO (Isolado e Seguro)
// ==========================================
let _modeloSelecionadoId = null;
let _modeloSelecionadoNodes = [];
let _tagsGlobais = [];
let _tagsModeloEmEdicao = [];
let _modeloSelecionadoEscopo = 'card';

let _todosModelosEmMemoria = [];
let _modelosFiltrados = [];
let _paginaAtualRenderizacao = 0;
const TAMANHO_LOTE_RENDERIZACAO = 20;
let _observerScrollAcervo = null;
let _eventDelegationAtivo = false;

// HELPER PRIVADO: Manipulação segura de DOM
function _safeDisplay(id, styleStr) {
    const el = document.getElementById(id);
    if (el) el.style.display = styleStr;
}

// --- HELPER VISUAL (Fábrica de SVGs) ---
function getIconeAcervoSVG(intencao) {
    const map = {
        'comando': `<svg viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>`,
        'texto': `<svg viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
        'nota': `<svg viewBox="0 0 24 24" fill="none" stroke="#616161" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
        'premissa': `<svg viewBox="0 0 24 24" fill="none" stroke="#7b1fa2" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`,
        'fundamentacao': `<svg viewBox="0 0 24 24" fill="none" stroke="#00695c" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
        'refutacao': `<svg viewBox="0 0 24 24" fill="none" stroke="#8B4513" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`,
        'preliminar': `<svg viewBox="0 0 24 24" fill="none" stroke="#5d4037" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        'veredito': `<svg viewBox="0 0 24 24" fill="none" stroke="#e65100" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
    };
    return map[intencao] || map['premissa'];
}

window.atualizarIconeAcervoUI = function(selectElement) {
    const container = selectElement.closest('.acervo-node-edit-box');
    const iconDiv = container.querySelector('.svg-icon-wrapper');
    const intencao = selectElement.value;
    
    if (iconDiv && typeof getIconeAcervoSVG === 'function') {
        iconDiv.innerHTML = getIconeAcervoSVG(intencao);
        iconDiv.className = `svg-icon-wrapper sub-badge has-intent intencao-${intencao} modal-static-badge`;
    }
};

// Filtro totalmente em memória (RAM Speed)
window.filtrarListaUI = function(termo, listaId) { // listaId mantido para retrocompatibilidade
    const termoMin = termo.toLowerCase().trim();
    
    if (!termoMin) {
        _modelosFiltrados = [..._todosModelosEmMemoria];
    } else {
        _modelosFiltrados = _todosModelosEmMemoria.filter(mod => {
            const titulo = mod.nome.toLowerCase();
            const tagsData = (mod.tags || []).join(' ').toLowerCase();
            return titulo.includes(termoMin) || tagsData.includes(termoMin);
        });
    }

    _paginaAtualRenderizacao = 0;
    
    // Limpeza SEGURA - Apenas o wrapper!
    const wrapper = document.getElementById('acervo-items-wrapper');
    if(wrapper) wrapper.innerHTML = ''; 
    
    if (_modelosFiltrados.length === 0) {
        if(wrapper) wrapper.innerHTML = '<p class="empty-state">Nenhum modelo encontrado para esta pesquisa.</p>';
        const sentinela = document.getElementById('sentinela-scroll-acervo');
        if(sentinela) sentinela.style.display = 'none';
        return;
    }

    // Debounce em 150ms chamará a renderização inicial indiretamente, mas forçamos a primeira para UX.
    renderizarProximoLoteAcervo();
};

window.debounce = function(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};
window.filtrarListaUIDebounced = window.debounce(window.filtrarListaUI, 300);

// ==========================================
// MÓDULO 1: SALVAR NO ACERVO
// ==========================================
window.abrirModalSalvarModelo = function() {
    if (!window.AcervoManager) return exibirToast('Conecte-se ao Firebase primeiro.', 'erro');
    if (typeof _menuSubAnotacaoCtx === 'undefined' || !_menuSubAnotacaoCtx) return;
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const alvo = (typeof _resolverSubAlvo === 'function') 
        ? _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource)
        : topico.anotacoes[_menuSubAnotacaoCtx.parentIndex];
    
    _noAlvoParaSalvar = alvo.subAnotacoes[_menuSubAnotacaoCtx.localIndex];

    // Detecta o escopo de forma agnóstica
    let escopoDetectado = 'card';
    if (_menuSubAnotacaoCtx.viewSource === 'global') escopoDetectado = 'global';
    else if (typeof _menuSubAnotacaoCtx.viewSource === 'string' && _menuSubAnotacaoCtx.viewSource.startsWith('tese:')) escopoDetectado = 'tese';
    
    _noAlvoParaSalvar.escopoOriginal = escopoDetectado;

    document.getElementById('sub-annotation-context-menu').style.display = 'none';
    document.querySelector('input[name="modo_salvar_modelo"][value="novo"]').checked = true;
    document.getElementById('input-nome-modelo').value = '';
    
    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('modal-salvar-modelo').style.display = 'flex';
    window.toggleModoSalvarModelo(); 
};

window.toggleModoSalvarModelo = function() {
    const isNovo = document.querySelector('input[name="modo_salvar_modelo"]:checked').value === 'novo';
    document.getElementById('box-modelo-novo').style.display = isNovo ? 'block' : 'none';
    document.getElementById('box-modelo-existente').style.display = isNovo ? 'none' : 'block';
    
    if (!isNovo) {
        const container = document.getElementById('lista-modelos-salvar');
        container.innerHTML = '<div class="acervo-loader"></div>';
        
        AcervoManager.carregarModelos().then(modelos => {
            container.innerHTML = modelos.length === 0 ? '<p style="text-align:center; font-size:0.8rem;">Nenhum modelo encontrado.</p>' : '';
            modelos.forEach(mod => {
                const item = document.createElement('div');
                item.className = 'acervo-item';
                item.innerHTML = `<div class="acervo-item-titulo">${TopicsManager.escaparHTML(mod.nome)}</div><div style="font-size:0.7rem; color:#888;">${mod.nos.length} nó(s) salvos</div>`;
                item.onclick = () => {
                    document.querySelectorAll('#lista-modelos-salvar .acervo-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    _modeloSelecionadoId = mod.id;
                };
                container.appendChild(item);
            });
        }).catch(() => {
            container.innerHTML = '<p style="color:red; font-size:0.8rem;">Erro ao conectar. Faça login.</p>';
        });
    }
};

window.fecharModalSalvarModelo = function() {
    document.getElementById('wizard-backdrop').style.display = 'none';
    document.getElementById('modal-salvar-modelo').style.display = 'none';
    _noAlvoParaSalvar = null;
};

window.confirmarSalvarModelo = async function() {
    if (!_noAlvoParaSalvar) return;
    
    const isNovo = document.querySelector('input[name="modo_salvar_modelo"]:checked').value === 'novo';
    const btnConfirmar = document.querySelector('#btn-confirmar-salvar-modelo') || document.querySelector('#modal-salvar-modelo button.btn-primario') || document.querySelector('#modal-salvar-modelo .chip-autora');
    
    let textoOriginalBtn = 'Confirmar';
    if (btnConfirmar) {
        textoOriginalBtn = btnConfirmar.innerHTML;
        btnConfirmar.disabled = true;
        btnConfirmar.style.opacity = '0.7';
        btnConfirmar.innerHTML = '⌛ Salvando...';
    }

    try {
        if (isNovo) {
            const nome = document.getElementById('input-nome-modelo').value.trim();
            if (!nome) {
                exibirToast('Defina um nome para o modelo.', 'aviso');
                return;
            }
            await AcervoManager.salvarNovoModelo(nome, _noAlvoParaSalvar);
        } else {
            if (!_modeloSelecionadoId) {
                exibirToast('Selecione um modelo existente.', 'aviso');
                return;
            }
            await AcervoManager.adicionarNoAModelo(_modeloSelecionadoId, _noAlvoParaSalvar);
        }
        
        window.fecharModalSalvarModelo(); 
        exibirToast('Nó salvo no acervo com sucesso!', 'sucesso');

    } catch (e) {
        console.error("[Juris Notes UI] Transação abortada:", e);
        if (e.isCustom) exibirToast(e.message, 'erro');
        else exibirToast(`Falha: ${e.message}`, 'erro');
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.style.opacity = '1';
            btnConfirmar.innerHTML = textoOriginalBtn;
        }
    }
};

// ==========================================
// MÓDULO 2: INSERIR DO ACERVO
// ==========================================
// ==========================================
// CICLO DE VIDA: ABERTURA DO MODAL E INICIALIZAÇÃO
// ==========================================
window.abrirModalAcervo = function() {
    if (!window.AcervoManager) return exibirToast('Conecte-se ao Firebase primeiro.', 'erro');

    if (typeof AcervoManager.carregarConfigTags === 'function') {
        AcervoManager.carregarConfigTags().then(tags => { _tagsGlobais = tags; });
    }
    
    document.getElementById('history-container').classList.add('pdf-foco-ativo');
    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('modal-acervo-inserir').style.display = 'flex';
    
    // Reset Arquitetural de View
    document.getElementById('modal-acervo-inserir').classList.remove('is-fullscreen');
    document.getElementById('acervo-focus-view').style.display = 'none';
    document.getElementById('acervo-focus-view').classList.remove('is-active');
    
    const listView = document.getElementById('acervo-list-view');
    if (listView) {
        listView.style.display = 'block';
        listView.style.opacity = '1';
    }
    
    // Tratamento de UI para Filtros IA vs Manual
    if (_idsRecomendadosIA) {
        _safeDisplay('banner-filtro-ia', 'flex');
        _safeDisplay('acervo-search-wrapper', 'none'); 
    } else {
        _safeDisplay('banner-filtro-ia', 'none');
        _safeDisplay('acervo-search-wrapper', 'flex');
        document.getElementById('input-pesquisa-acervo').value = '';
    }
    
    _safeDisplay('box-destino-dinamico-acervo', 'none');
    _safeDisplay('box-preview-acervo', 'none');
    _safeDisplay('btn-inserir-acervo', 'none');
    
    // Reset do Estado de Seleção
    _modeloSelecionadoId = null; 
    _modeloSelecionadoNodes = [];
    
    // Inicializar Event Delegation UMA única vez
    configurarEventDelegation();

    // Reset Visual Seguro (Limpando apenas o Wrapper)
    const wrapper = document.getElementById('acervo-items-wrapper');
    wrapper.innerHTML = '<div class="acervo-loader"></div>';
    
    // Carregamento de Dados
    AcervoManager.carregarModelos().then(modelos => {
        _todosModelosEmMemoria = modelos;
        
        // Aplicação de Filtros Base
        if (_idsRecomendadosIA) {
            _modelosFiltrados = _todosModelosEmMemoria.filter(mod => _idsRecomendadosIA.includes(mod.id));
        } else {
            _modelosFiltrados = [..._todosModelosEmMemoria];
        }

        wrapper.innerHTML = ''; // Limpa o loader de forma segura
        
        if (_modelosFiltrados.length === 0) {
            const msg = _idsRecomendadosIA ? 'Nenhum modelo compatível encontrado pela IA.' : 'Acervo vazio.';
            wrapper.innerHTML = `<p class="empty-state">${msg}</p>`;
            document.getElementById('sentinela-scroll-acervo').style.display = 'none';
            return;
        }

        _paginaAtualRenderizacao = 0;
        iniciarObserverDeRolagem(); // Garante o ciclo do observer
        renderizarProximoLoteAcervo();

    }).catch(() => wrapper.innerHTML = '<p style="color:red; text-align:center;">Erro ao conectar.</p>');
};

// ==========================================
// RENDERIZAÇÃO EM LOTES (CHUNKING / VIRTUALIZAÇÃO)
// ==========================================
function renderizarProximoLoteAcervo() {
    const wrapper = document.getElementById('acervo-items-wrapper');
    const sentinela = document.getElementById('sentinela-scroll-acervo');
    if (!wrapper || !sentinela) return;
    
    const inicio = _paginaAtualRenderizacao * TAMANHO_LOTE_RENDERIZACAO;
    const fim = inicio + TAMANHO_LOTE_RENDERIZACAO;
    const lote = _modelosFiltrados.slice(inicio, fim);

    if (lote.length === 0) return; // Failsafe

    // Injeção de alta performance sem tocar no DOM principal iterativamente
    const fragment = document.createDocumentFragment();

    lote.forEach(mod => {
        const item = document.createElement('div');
        // Adicionamos os atributos data-* para o Event Delegation
        item.className = _idsRecomendadosIA ? 'acervo-item ai-recommended' : 'acervo-item';
        item.dataset.id = mod.id;
        
        const htmlTags = (mod.tags && mod.tags.length > 0) 
            ? `<div class="acervo-item-tags-lista">${mod.tags.map(t => `<span class="acervo-tag-chip">${TopicsManager.escaparHTML(t)}</span>`).join('')}</div>`
            : '';

        const escopoAtual = mod.escopo || 'card';
        let escopoSelo = '';
        if(escopoAtual === 'global') escopoSelo = `<span class="acervo-node-badge" style="background:#e3f2fd; color:#0d47a1; margin-right:6px; padding:2px 6px; border-radius:4px; font-weight:bold;">🌐 Global</span>`;
        if(escopoAtual === 'tese') escopoSelo = `<span class="acervo-node-badge" style="background:#f3e5f5; color:#6a1b9a; margin-right:6px; padding:2px 6px; border-radius:4px; font-weight:bold;">⚖️ Tese</span>`;

        // Remoção completa de eventos inlines (onclick)
        item.innerHTML = `
            <div class="acervo-item-header">
                <div style="flex: 1; pointer-events: none;"> <!-- pointer-events previne falsos alvos no clique -->
                    <div class="acervo-item-titulo">${TopicsManager.escaparHTML(mod.nome)}</div>
                    <div style="font-size:0.7rem; color:#888; margin-top:2px; display:flex; align-items:center;">${escopoSelo} ${mod.nos.length} nó(s) salvos</div>
                    ${htmlTags}
                </div>
                <button class="acervo-action-btn" data-action="edit" data-id="${mod.id}" title="Editar este modelo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events: none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </div>`;
        
        fragment.appendChild(item);
    });

    wrapper.appendChild(fragment);
    _paginaAtualRenderizacao++;

    // Gerenciamento dinâmico da Sentinela
    if (fim >= _modelosFiltrados.length) {
        sentinela.style.display = 'none'; // Lista chegou ao fim
    } else {
        sentinela.style.display = 'block';
    }
}

// ==========================================
// EVENT DELEGATION (Prevenção de Memory Leaks)
// ==========================================
function configurarEventDelegation() {
    if (_eventDelegationAtivo) return; // Evita duplicação de listeners
    
    const wrapper = document.getElementById('acervo-items-wrapper');
    if (!wrapper) return;

    wrapper.addEventListener('click', (e) => {
        // 1. Verifica se clicou no botão de editar
        const btnEdit = e.target.closest('.acervo-action-btn[data-action="edit"]');
        if (btnEdit) {
            e.stopPropagation();
            abrirEdicaoModeloAcervo(e, btnEdit.dataset.id);
            return;
        }

        // 2. Verifica se clicou no Card do Modelo (para ativar o Foco)
        const card = e.target.closest('.acervo-item');
        if (card) {
            selecionarEAtivarModelo(card, card.dataset.id);
        }
    });

    _eventDelegationAtivo = true;
}

// Lógica isolada chamada pelo Event Delegation
function selecionarEAtivarModelo(cardElement, modeloId) {
    document.querySelectorAll('#acervo-items-wrapper .acervo-item').forEach(el => el.classList.remove('selected'));
    cardElement.classList.add('selected');
    
    const mod = _todosModelosEmMemoria.find(m => m.id === modeloId);
    if (!mod) return;

    _modeloSelecionadoId = mod.id;
    _modeloSelecionadoNodes = mod.nos;
    _modeloSelecionadoEscopo = mod.escopo || 'card';
    
    const previewHtml = mod.nos.map(n => `
        <div class="acervo-node-preview">
            ${getIconeAcervoSVG(n.intencao)}
            <span class="acervo-node-text wrap-text">${TopicsManager.escaparHTML(n.texto)}</span>
        </div>
    `).join('');
    
    const previewBox = document.getElementById('box-preview-acervo');
    previewBox.innerHTML = previewHtml;
    previewBox.style.display = 'block';
    
    window.ativarModoFocoAcervo(mod.nome);
    
    // Roteamento Defensivo (Legado)
    _safeDisplay('box-destino-dinamico-acervo', 'block');
    _safeDisplay('destino-acervo-card', 'none');
    _safeDisplay('destino-acervo-tese', 'none');
    _safeDisplay('destino-acervo-global', 'none');
    
    const btnInserir = document.getElementById('btn-inserir-acervo');
    if(btnInserir) btnInserir.disabled = false;

    const topico = typeof topicos !== 'undefined' ? topicos.find(t => t.id === TopicsManager.getActiveTabId()) : null;

    if (_modeloSelecionadoEscopo === 'global') {
        _safeDisplay('destino-acervo-global', 'block');
        if(btnInserir) btnInserir.textContent = '✔ Inserir Globalmente';
    } 
    else if (_modeloSelecionadoEscopo === 'tese') {
        _safeDisplay('destino-acervo-tese', 'block');
        if(btnInserir) btnInserir.textContent = '✔ Inserir na Tese';
        
        const selectTese = document.getElementById('select-destino-acervo-tese');
        const aviso = document.getElementById('aviso-sem-tese');
        
        if(selectTese && aviso && topico) {
            selectTese.innerHTML = '<option value="">Selecione uma Tese existente...</option>';
            const tesesUnicas = [...new Set(topico.anotacoes.filter(a => a.tese && a.tese.trim() !== '').map(a => a.tese))];
            
            if (tesesUnicas.length === 0) {
                selectTese.style.display = 'none';
                aviso.style.display = 'block';
                if(btnInserir) btnInserir.disabled = true;
            } else {
                selectTese.style.display = 'block';
                aviso.style.display = 'none';
                tesesUnicas.forEach(t => selectTese.appendChild(new Option(t, t)));
            }
        }
    } else {
        _safeDisplay('destino-acervo-card', 'block');
        if(btnInserir) btnInserir.textContent = '✔ Inserir no Card';
    }

    _safeDisplay('btn-inserir-acervo', 'block');
}

// ==========================================
// INTERSECTION OBSERVER
// ==========================================
function iniciarObserverDeRolagem() {
    const sentinela = document.getElementById('sentinela-scroll-acervo');
    const container = document.getElementById('lista-acervo-geral');
    if (!sentinela || !container) return;

    if (_observerScrollAcervo) _observerScrollAcervo.disconnect();

    _observerScrollAcervo = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) renderizarProximoLoteAcervo();
    }, { 
        root: container, 
        rootMargin: '100px' // Pré-carrega itens 100px antes da sentinela aparecer
    });

    _observerScrollAcervo.observe(sentinela);
}

// ==========================================
// CICLO DE VIDA: FECHAMENTO DO MODAL
// ==========================================
window.fecharModalAcervo = function() {
    document.getElementById('history-container').classList.remove('pdf-foco-ativo');
    document.getElementById('wizard-backdrop').style.display = 'none';
    document.getElementById('modal-acervo-inserir').style.display = 'none';
    
    // Prevenção Rigorosa de Memory Leaks
    if (_observerScrollAcervo) {
        _observerScrollAcervo.disconnect();
        _observerScrollAcervo = null;
    }
};

window.confirmarInsercaoAcervo = function() {
    if (_modeloSelecionadoNodes.length === 0) return;

    const topicoId = typeof TopicsManager !== 'undefined' ? TopicsManager.getActiveTabId() : null;
    if (!topicoId) return;
    const topico = topicos.find(t => t.id === topicoId);

    // Preparação Imutável de Dados
    const nosParaInjetar = _modeloSelecionadoNodes.map(node => ({
        uuid: 'id-' + crypto.randomUUID(),
        texto: node.texto,
        intencao: node.intencao,
        timestamp: Date.now()
    }));
    
    // VALIDAÇÕES (Sem mutação de estado ainda)
    let arrayDestino = null;

    if (_modeloSelecionadoEscopo === 'global') {
        if (!topico.diretrizesGlobais) topico.diretrizesGlobais = [];
        arrayDestino = topico.diretrizesGlobais;
    } 
    else if (_modeloSelecionadoEscopo === 'tese') {
        const teseEscolhida = document.getElementById('select-destino-acervo-tese').value;
        if (!teseEscolhida) return exibirToast('Selecione uma tese de destino.', 'aviso');
        
        if (!topico.diretrizesPorTese) topico.diretrizesPorTese = {};
        if (!topico.diretrizesPorTese[teseEscolhida]) topico.diretrizesPorTese[teseEscolhida] = [];
        arrayDestino = topico.diretrizesPorTese[teseEscolhida];
    } 
    else {
        const inputVal = document.getElementById('input-destino-acervo-card').value;
        const destinoIdx = parseInt(inputVal, 10) - 1;
        
        if (isNaN(destinoIdx) || destinoIdx < 0 || destinoIdx >= topico.anotacoes.length) {
            return exibirToast('Número de Ideia Principal inválido.', 'erro');
        }
        
        const cardDestino = topico.anotacoes[destinoIdx];
        if (!cardDestino.subAnotacoes) cardDestino.subAnotacoes = [];
        arrayDestino = cardDestino.subAnotacoes;
    }

    // COMMIT TRANSACIONAL (Mutação segura)
    if (arrayDestino) {
        arrayDestino.push(...nosParaInjetar);
        
        if (typeof renderizarTopicos === 'function') renderizarTopicos();
        if (typeof salvarBackupAutomatico === 'function') salvarBackupAutomatico();
        
        window.fecharModalAcervo();
        exibirToast('Modelo injetado com sucesso no nível correto!', 'sucesso');
    }
};

window.alterarEscopoModeloAtual = async function(novoEscopo) {
    if (!_modeloSelecionadoId) return;
    try {
        await AcervoManager.atualizarEscopoDoModelo(_modeloSelecionadoId, novoEscopo);
        exibirToast('Nível hierárquico atualizado.', 'sucesso');
    } catch(e) {
        exibirToast('Erro ao atualizar nível na nuvem.', 'erro');
    }
};

// ==========================================
// EDIÇÃO DE MODELOS DO ACERVO E TAGS
// ==========================================
window.abrirEdicaoModeloAcervo = async function(event, modeloId) {
    if(event) event.stopPropagation(); 
    document.getElementById('modal-acervo-inserir').style.display = 'none';
    _modeloSelecionadoId = modeloId;

    const modelos = await AcervoManager.carregarModelos();
    const modelo = modelos.find(m => m.id === modeloId);
    if(!modelo) return;

    document.getElementById('edit-modelo-nome').textContent = modelo.nome;
    _tagsModeloEmEdicao = modelo.tags ? [...modelo.tags] : [];
    
    const selectEscopo = document.getElementById('select-edicao-escopo');
    if (selectEscopo) selectEscopo.value = modelo.escopo || 'card';
    
    const containerTags = document.getElementById('container-checkboxes-tags');
    containerTags.innerHTML = `
        <div style="position: relative; width: 100%;">
            <input type="text" id="input-busca-tags-modelo" class="topic-select" placeholder="Digite para buscar e vincular uma tag..." 
                oninput="filtrarDropdownTags(this.value)" 
                onfocus="abrirDropdownTags()" 
                onblur="fecharDropdownTags()">
            <div id="dropdown-tags-modelo" class="tags-dropdown-menu" style="display: none;"></div>
        </div>
        <div id="container-tags-selecionadas" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; width: 100%;"></div>
    `;

    renderizarTagsSelecionadas(modeloId);

    const container = document.getElementById('lista-edicao-nos-acervo');
    container.innerHTML = '';

    const listaIntencoes = [
        { val: 'premissa', label: 'Premissa Lógica' }, { val: 'comando', label: 'Comando Direto' },
        { val: 'texto', label: 'Texto Fixo' }, { val: 'nota', label: 'Nota Oculta' },
        { val: 'veredito', label: 'Veredito / Conclusão' }, { val: 'fundamentacao', label: 'Fundamentação Legal' },
        { val: 'refutacao', label: 'Refutação (Mérito)' }, { val: 'preliminar', label: 'Filtro / Prejudicial' }
    ];

    modelo.nos.forEach((no, index) => {
        const box = document.createElement('div');
        box.className = 'acervo-node-edit-box';
        
        const optionsHtml = listaIntencoes.map(i => 
            `<option value="${i.val}" ${no.intencao === i.val ? 'selected' : ''}>${i.label}</option>`
        ).join('');

        const iconClass = `svg-icon-wrapper sub-badge has-intent intencao-${no.intencao} modal-static-badge`;

        box.innerHTML = `
            <div class="${iconClass}">${typeof getIconeAcervoSVG === 'function' ? getIconeAcervoSVG(no.intencao) : '📄'}</div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                <select id="edit-intencao-${modeloId}-${index}" class="topic-select" style="padding: 4px 8px; font-size: 0.75rem; width: fit-content;" onchange="window.atualizarIconeAcervoUI(this)">
                    ${optionsHtml}
                </select>
                <textarea class="acervo-node-edit-textarea" id="edit-no-${modeloId}-${index}" style="width: 100%;">${TopicsManager.escaparHTML(no.texto)}</textarea>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <button class="acervo-action-btn" title="Salvar Alteração" onclick="salvarTextoNoAcervo('${modeloId}', ${index})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button class="acervo-action-btn delete-btn" title="Excluir Nó" onclick="excluirNoAcervo('${modeloId}', ${index})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        container.appendChild(box);
    });

    document.getElementById('modal-editar-modelo-acervo').style.display = 'flex';
};

function renderizarTagsSelecionadas(modeloId) {
    const container = document.getElementById('container-tags-selecionadas');
    container.innerHTML = _tagsModeloEmEdicao.map(tag => `
        <div class="acervo-tag-chip">
            ${TopicsManager.escaparHTML(tag)}
            <span class="chip-remover" onclick="removerTagDoModelo('${TopicsManager.escaparHTML(tag)}', '${modeloId}')">×</span>
        </div>
    `).join('') || '<span style="font-size:0.75rem; color:#888;">Nenhuma tag vinculada.</span>';
}

window.adicionarTagAoModelo = async function(tagStr, modeloId) {
    if (_tagsModeloEmEdicao.includes(tagStr)) return;
    _tagsModeloEmEdicao.push(tagStr);
    renderizarTagsSelecionadas(modeloId);
    document.getElementById('input-busca-tags-modelo').value = '';
    window.fecharDropdownTags();

    try { 
        await AcervoManager.atualizarTagsDoModelo(modeloId, _tagsModeloEmEdicao); 
    } catch (e) { 
        _tagsModeloEmEdicao.pop();
        renderizarTagsSelecionadas(modeloId);
        exibirToast('Erro de rede ao salvar tag.', 'erro'); 
    }
};

window.removerTagDoModelo = async function(tagStr, modeloId) {
    const index = _tagsModeloEmEdicao.indexOf(tagStr);
    if (index === -1) return;
    
    _tagsModeloEmEdicao.splice(index, 1);
    renderizarTagsSelecionadas(modeloId);

    try { 
        await AcervoManager.atualizarTagsDoModelo(modeloId, _tagsModeloEmEdicao); 
    } catch (e) { 
        _tagsModeloEmEdicao.splice(index, 0, tagStr);
        renderizarTagsSelecionadas(modeloId);
        exibirToast('Erro ao remover tag.', 'erro'); 
    }
};

window.abrirDropdownTags = function() { window.filtrarDropdownTags(document.getElementById('input-busca-tags-modelo').value); };
window.fecharDropdownTags = function() { document.getElementById('dropdown-tags-modelo').style.display = 'none'; };

window.filtrarDropdownTags = function(termo) {
    const termoMin = termo.toLowerCase().trim();
    const dropdown = document.getElementById('dropdown-tags-modelo');
    
    const tagsDisponiveis = _tagsGlobais.filter(t => t.toLowerCase().includes(termoMin) && !_tagsModeloEmEdicao.includes(t));

    let html = '';
    if (tagsDisponiveis.length === 0 && !termoMin) {
        html = `<div style="padding:10px 12px; font-size:0.8rem; color:#888;">Nenhuma tag disponível.</div>`;
    } else {
        html += tagsDisponiveis.map(tag => `
            <div class="tag-dropdown-item" data-action="vincular" data-tag="${TopicsManager.escaparHTML(tag)}">+ ${TopicsManager.escaparHTML(tag)}</div>
        `).join('');
    }

    const tagExataExiste = _tagsGlobais.some(t => t.toLowerCase() === termoMin);
    
    if (termoMin && !tagExataExiste && !_tagsModeloEmEdicao.includes(termo)) {
        html += `<div class="tag-dropdown-item criar-nova" data-action="criar" data-tag="${TopicsManager.escaparHTML(termo)}">✨ Criar e vincular nova tag: <strong>${TopicsManager.escaparHTML(termo)}</strong></div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
};

document.addEventListener('mousedown', function(event) {
    const dropdownItem = event.target.closest('.tag-dropdown-item');
    if (!dropdownItem) return;
    event.preventDefault(); 

    const action = dropdownItem.dataset.action;
    const tag = dropdownItem.dataset.tag;

    if (!tag || !_modeloSelecionadoId) return;

    if (action === 'vincular') window.adicionarTagAoModelo(tag, _modeloSelecionadoId);
    else if (action === 'criar') window.criarEAdicionarTagInline(tag);
});

window.criarEAdicionarTagInline = async function(novaTag) {
    const tag = novaTag.trim();
    if(!tag) return;

    _tagsGlobais.push(tag);
    try {
        if(window.AcervoManager && typeof AcervoManager.salvarConfigTags === 'function') {
            await AcervoManager.salvarConfigTags(_tagsGlobais);
        }
        await window.adicionarTagAoModelo(tag, _modeloSelecionadoId);
        exibirToast(`Tag "${tag}" criada e vinculada com sucesso!`, 'sucesso');
    } catch(e) {
        _tagsGlobais = _tagsGlobais.filter(t => t !== tag);
        exibirToast('Falha de conexão. A tag não pôde ser salva.', 'erro');
    }
};

window.abrirModalGerenciarTags = function() {
    document.getElementById('modal-acervo-inserir').style.display = 'none';
    renderizarListaTagsGlobais();
    document.getElementById('modal-gerenciar-tags').style.display = 'flex';
};

window.fecharModalGerenciarTags = function() {
    document.getElementById('modal-gerenciar-tags').style.display = 'none';
    window.abrirModalAcervo();
};

function renderizarListaTagsGlobais() {
    const container = document.getElementById('lista-tags-globais');
    container.innerHTML = _tagsGlobais.map((tag, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fafafa; padding:6px 10px; border:1px solid #eee; border-radius:4px; margin-bottom:4px;">
            <span class="acervo-tag-chip">${TopicsManager.escaparHTML(tag)}</span>
            <div style="display:flex; gap:4px;">
                <button class="acervo-action-btn" onclick="editarTagGlobal(${idx})" title="Renomear Tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="acervo-action-btn delete-btn" onclick="excluirTagGlobal(${idx})" title="Excluir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        </div>
    `).join('') || '<p style="font-size:0.8rem; color:#888;">Nenhuma tag criada.</p>';
}

window.adicionarTagGlobal = async function() {
    const input = document.getElementById('input-nova-tag');
    const valor = input.value.trim();
    if(!valor || _tagsGlobais.includes(valor)) return exibirToast('Tag inválida ou já existe.', 'erro');
    
    _tagsGlobais.push(valor);
    try {
        if(window.AcervoManager && typeof AcervoManager.salvarConfigTags === 'function') await AcervoManager.salvarConfigTags(_tagsGlobais);
        input.value = '';
        renderizarListaTagsGlobais();
    } catch(e) { 
        exibirToast('Erro ao salvar tag.', 'erro'); 
        _tagsGlobais.pop(); 
    }
};

window.editarTagGlobal = async function(idx) {
    const tagAntiga = _tagsGlobais[idx];
    const novoNome = prompt('Renomear tag (atualizará todos os modelos):', tagAntiga);
    if (!novoNome || novoNome.trim() === '' || novoNome.trim() === tagAntiga) return;
    
    const nomeLimpo = novoNome.trim();
    if (_tagsGlobais.includes(nomeLimpo)) return exibirToast('Esta tag já existe.', 'erro');

    _tagsGlobais[idx] = nomeLimpo; 
    try {
        await AcervoManager.salvarConfigTags(_tagsGlobais);
        await AcervoManager.atualizarTagEmTodosModelos(tagAntiga, nomeLimpo);
        renderizarListaTagsGlobais();
        exibirToast('Tag renomeada com sucesso!', 'sucesso');
    } catch(e) { 
        _tagsGlobais[idx] = tagAntiga; 
        exibirToast('Erro ao renomear tag.', 'erro'); 
    }
};

window.excluirTagGlobal = async function(idx) {
    const tagAntiga = _tagsGlobais[idx];
    if(!confirm(`Excluir a tag "${tagAntiga}"?\nEla será removida de todos os modelos que a utilizam.`)) return;
    
    const removida = _tagsGlobais.splice(idx, 1)[0];
    try {
        await AcervoManager.salvarConfigTags(_tagsGlobais);
        await AcervoManager.atualizarTagEmTodosModelos(removida, null); 
        renderizarListaTagsGlobais();
        exibirToast('Tag excluída.', 'sucesso');
    } catch(e) { 
        _tagsGlobais.splice(idx, 0, removida);
        exibirToast('Erro ao excluir tag.', 'erro');
    }
};

window.fecharModalEdicaoAcervo = function() {
    document.getElementById('modal-editar-modelo-acervo').style.display = 'none';
    window.abrirModalAcervo(); 
};

window.salvarTextoNoAcervo = async function(modeloId, nodeIndex) {
    const textarea = document.getElementById(`edit-no-${modeloId}-${nodeIndex}`);
    const seletor = document.getElementById(`edit-intencao-${modeloId}-${nodeIndex}`);
    const novoTexto = textarea.value.trim();
    const novaIntencao = seletor ? seletor.value : 'premissa';

    if(!novoTexto) return exibirToast('O texto não pode ser vazio.', 'aviso');

    try {
        await AcervoManager.atualizarNoDoModelo(modeloId, nodeIndex, { texto: novoTexto, intencao: novaIntencao });
        exibirToast('Atualizado com sucesso!', 'sucesso');
    } catch(e) { 
        exibirToast('Erro ao atualizar na nuvem.', 'erro'); 
    }
};

window.excluirNoAcervo = async function(modeloId, nodeIndex) {
    const modelos = await AcervoManager.carregarModelos();
    const modelo = modelos.find(m => m.id === modeloId);
    if (!modelo) return;

    if (modelo.nos.length === 1) {
        if (!confirm(`ATENÇÃO: Este é o último nó do modelo!\n\nAo excluí-lo, o modelo "${modelo.nome}" será inteiramente apagado do acervo.\nDeseja continuar?`)) return;
        try {
            await AcervoManager.excluirModeloCompleto(modeloId);
            exibirToast('Último nó removido e modelo excluído.', 'sucesso');
            window.fecharModalEdicaoAcervo();
            window.abrirModalAcervo(); 
        } catch(e) { exibirToast('Erro de permissão ou rede ao excluir o modelo.', 'erro'); }
        return; 
    } 

    if (!confirm('Tem certeza que deseja excluir este nó do modelo?')) return;
    try {
        await AcervoManager.removerNoDoModelo(modeloId, nodeIndex);
        exibirToast('Nó excluído com sucesso.', 'sucesso');
        window.abrirEdicaoModeloAcervo(null, modeloId);
    } catch(e) { exibirToast('Erro ao excluir nó.', 'erro'); }
};

window.acionarRenomearModeloAtual = async function() {
    if (!_modeloSelecionadoId) return exibirToast('Nenhum modelo selecionado.', 'erro');
    const nomeElemento = document.getElementById('edit-modelo-nome');
    const nomeAtual = nomeElemento.textContent;
    const novoNome = prompt('Digite o novo nome para este modelo:', nomeAtual);
    
    if (novoNome === null || novoNome.trim() === '' || novoNome.trim() === nomeAtual) return;

    try {
        await AcervoManager.renomearModelo(_modeloSelecionadoId, novoNome.trim());
        exibirToast('Modelo renomeado com sucesso!', 'sucesso');
        nomeElemento.textContent = novoNome.trim();
    } catch(e) { exibirToast('Erro ao renomear modelo na nuvem.', 'erro'); }
};

window.acionarExcluirModeloAtual = async function() {
    if (!_modeloSelecionadoId) return;
    const nomeAtual = document.getElementById('edit-modelo-nome').textContent;
    
    if (!confirm(`ATENÇÃO: Você está prestes a excluir definitivamente o modelo "${nomeAtual}" e todos os seus dados.\n\nEsta ação NÃO pode ser desfeita. Confirmar exclusão?`)) return;

    try {
        await AcervoManager.excluirModeloCompleto(_modeloSelecionadoId);
        exibirToast('Modelo excluído permanentemente.', 'sucesso');
        window.fecharModalEdicaoAcervo(); 
        window.abrirModalAcervo(); 
    } catch(e) { exibirToast('Erro de permissão ou rede ao excluir o modelo.', 'erro'); }
};

// ==========================================
// MÓDULO 3: EXPORTAÇÃO PARA IA (GOVERNANÇA)
// ==========================================

/**
 * Função pura e local para geração de download em memória.
 * Mantém o acervo-controller isolado sem quebrar o Revealing Module do ExportManager.
 */
function _downloadTextoComoArquivo(nomeArquivo, conteudoTexto) {
    const blob = new Blob([conteudoTexto], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', nomeArquivo);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    
    // Limpeza assíncrona segura para evitar memory leaks sem quebrar o download
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 150);
}

window.exportarBaseParaNotebookLM = async function(event) {
    if (!window.AcervoManager) return exibirToast('Conecte-se ao Firebase primeiro.', 'erro');
    
    // Captura segura e imutável do alvo
    const btnExport = event ? event.currentTarget : null;
    let textoOriginal = '';
    
    if (btnExport) {
        textoOriginal = btnExport.innerHTML;
        btnExport.innerHTML = '⌛ Compilando...';
        btnExport.disabled = true;
    }

    try {
        const modelos = await AcervoManager.carregarModelos();
        
        if (!modelos || modelos.length === 0) {
            exibirToast('Seu acervo está vazio. Nada para exportar.', 'aviso');
            return;
        }

        // 1. Geração do Payload Markdown
        let txtConteudo = "=================================================\n";
        txtConteudo += "BASE DE CONHECIMENTO JURIS NOTES - AUDITORIA DE IA\n";
        txtConteudo += "Data de Exportação: " + new Date().toLocaleString() + "\n";
        txtConteudo += "=================================================\n\n";

        modelos.forEach(mod => {
            const tags = (mod.tags && mod.tags.length > 0) ? mod.tags.join(', ') : '[SEM TAGS]';
            const escopo = mod.escopo ? mod.escopo.toUpperCase() : 'CARD';
            
            txtConteudo += `### NOME DO MODELO: ${mod.nome}\n`;
            txtConteudo += `TAGS: ${tags}\n`;
            txtConteudo += `ESCOPO: ${escopo}\n`;
            txtConteudo += `CONTEÚDO (Nós de Ideia):\n`;
            
            if (mod.nos && mod.nos.length > 0) {
                mod.nos.forEach(no => {
                    txtConteudo += `- [${(no.intencao || 'PREMISSA').toUpperCase()}]: ${no.texto}\n`;
                });
            } else {
                txtConteudo += `- [VAZIO]\n`;
            }
            txtConteudo += `\n-------------------------------------------------\n\n`;
        });

        // 2. Aciona Download Seguro
        const dataFormatada = new Date().toISOString().slice(0,10);
        _downloadTextoComoArquivo(`JurisNotes_Acervo_Exportacao_${dataFormatada}.txt`, txtConteudo);

        // 3. Destruição visual de Modais (Bypass de Side-effects)
        // Evitamos chamar as funções originais do sistema para não disparar 'reads' desnecessários no Firebase.
        const modalTags = document.getElementById('modal-gerenciar-tags');
        const modalAcervo = document.getElementById('modal-acervo-inserir');
        const wizardBackdrop = document.getElementById('wizard-backdrop');
        
        if(modalTags) modalTags.style.display = 'none';
        if(modalAcervo) modalAcervo.style.display = 'none';
        if(wizardBackdrop) wizardBackdrop.style.display = 'none';
        
        // 4. Exibição do Prompt
        window.abrirModalPromptNotebookLM();

    } catch (error) {
        console.error("[AcervoController] Erro na exportação:", error);
        exibirToast('Erro ao exportar base de dados.', 'erro');
    } finally {
        // Restaura estado original do botão
        if (btnExport) {
            btnExport.innerHTML = textoOriginal;
            btnExport.disabled = false;
        }
    }
};

window.abrirModalPromptNotebookLM = function() {
    document.getElementById('prompt-notebooklm-backdrop').style.display = 'block';
    document.getElementById('modal-prompt-notebooklm').style.display = 'flex';
};

window.fecharModalPromptNotebookLM = function() {
    document.getElementById('prompt-notebooklm-backdrop').style.display = 'none';
    document.getElementById('modal-prompt-notebooklm').style.display = 'none';
};

window.copiarPromptNotebookLM = function() {
    const textarea = document.getElementById('textarea-prompt-notebooklm');
    if (!textarea) return;
    
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    
    // Fallback de Clipboard protegido
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textarea.value).then(() => {
            exibirToast('Comando copiado! Cole no NotebookLM.', 'sucesso');
        }).catch(err => {
            exibirToast('Falha ao copiar comando.', 'erro');
        });
    } else {
        document.execCommand('copy');
        exibirToast('Comando copiado.', 'sucesso');
    }
};

// ==========================================
// FUNÇÕES DE CONTROLE DE VIEW SWAP (ACERVO)
// ==========================================

window.ativarModoFocoAcervo = function(tituloModelo) {
    document.getElementById('focus-modelo-titulo').textContent = TopicsManager.escaparHTML(tituloModelo);
    
    const listView = document.getElementById('acervo-list-view');
    const focusView = document.getElementById('acervo-focus-view');
    
    // Animação de saída da lista
    listView.style.opacity = '0';
    setTimeout(() => {
        listView.style.display = 'none';
        // Prepara e anima entrada do foco
        focusView.style.display = 'flex';
        // Força reflow mínimo para garantir a animação de entrada
        void focusView.offsetWidth; 
        focusView.classList.add('is-active');
    }, 250); // Sincronizado com CSS
};

window.desativarModoFocoAcervo = function() {
    const listView = document.getElementById('acervo-list-view');
    const focusView = document.getElementById('acervo-focus-view');
    
    // Desativa Tela Cheia por segurança ao voltar
    document.getElementById('modal-acervo-inserir').classList.remove('is-fullscreen');
    
    focusView.classList.remove('is-active');
    focusView.style.opacity = '0';
    setTimeout(() => {
        focusView.style.display = 'none';
        listView.style.display = 'block';
        void listView.offsetWidth;
        listView.style.opacity = '1';
        
        // Limpa estado selecionado (legado)
        document.querySelectorAll('#lista-acervo-geral .acervo-item').forEach(el => el.classList.remove('selected'));
        _modeloSelecionadoId = null;
    }, 250);
};

window.toggleFullscreenAcervo = function() {
    const modal = document.getElementById('modal-acervo-inserir');
    if(modal) modal.classList.toggle('is-fullscreen');
};