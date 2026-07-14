// --- GERADOR DE ID ESTÁVEL PARA TÓPICOS ---
function generateTopicId() {
    return 'tp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// --- CONSTANTES E ÍCONES ---
const SVG_BALANCE = `<svg class="icon-theme" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px; color: #9a3412;"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>`;

const SVG_DRAG_HANDLE = `<div class="drag-handle" title="Arraste para reordenar">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle>
        <circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle>
    </svg>
</div>`;

const SVG_EDIT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

const SVG_DELETE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

const SVG_INDENT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

const SVG_OUTDENT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

// --- 1. NORMALIZAÇÃO E TRADUTOR FLEXÍVEL ---
function normalizeData(data) {
    const mapping = {
        'temas_vinculantes': ['temas', 'temas_vinculado', 'temas_juridicos', 'vinculantes'],
        'topicos_do_recurso': ['topicos', 'lista_topicos', 'itens_recurso', 'trilha_julgamento'],
        'admissibilidade': ['preliminares', 'admissao', 'dados_processuais']
    };

    const normalized = { ...data };

    for (const [officialKey, aliases] of Object.entries(mapping)) {
        if (!normalized[officialKey]) {
            const foundAlias = aliases.find(alias => data[alias]);
            if (foundAlias) {
                normalized[officialKey] = data[foundAlias];
            }
        }
    }
    return normalized;
}

// --- 2. GERAÇÃO E LIMPEZA ---
async function generatePanel(isInternalGenerator = false) {
    try {
        const inputElement = document.getElementById('json-input');
        const input = inputElement.value;
        let data = JSON.parse(input);

        data = normalizeData(data);

        const processInput = document.getElementById('process-id');
        const partiesInput = document.getElementById('parties-display');

        if (data.processo && data.processo.trim() !== "") {
            processInput.value = data.processo;
            processInput.setAttribute('value', data.processo);
        } else {
            processInput.value = "";
            processInput.setAttribute('value', '');
        }

        if (data.recorrente && data.recorrido && data.recorrente.trim() !== "") {
            const partesTexto = `Partes: ${data.recorrente} x ${data.recorrido}`;
            partiesInput.value = partesTexto;
            partiesInput.setAttribute('value', partesTexto);
        } else {
            partiesInput.value = "";
            partiesInput.setAttribute('value', '');
        }

        renderContent(data);
        
        const btn = document.querySelector('.btn-generate');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "✅ Processando e Baixando...";
            btn.style.backgroundColor = "#16a34a";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
            }, 3000);
        }

        setTimeout(() => {
            downloadBundledHTML(isInternalGenerator);
        }, 500);

    } catch (e) {
        console.error(e);
        alert("Erro no JSON: " + e.message);
    }
}

function limparJSON() {
    const input = document.getElementById('json-input');
    if (input.value.trim() !== "") {
        if (confirm('Deseja realmente limpar todo o texto da caixa de entrada?')) {
            input.value = '';
            input.focus();
        }
    }
}

function renderContent(data) {
    const themePanel = document.getElementById('theme-panel');
    themePanel.innerHTML = '';
    
    if (data.temas_vinculantes && Array.isArray(data.temas_vinculantes)) {
        data.temas_vinculantes.forEach(tema => {
            themePanel.innerHTML += `
                <div class="theme-card-top">
                    <div class="theme-info"><strong>${SVG_BALANCE} ${tema.numero || ''}:</strong> ${tema.descricao || ''}</div>
                    <div style="font-size:0.7rem; background: #fff; padding:2px 6px; border-radius:4px;">${tema.impacto || ''}</div>
                </div>`;
        });
    }

    const admGenContainer = document.getElementById('adm-general');
    admGenContainer.innerHTML = '';
    
    const admData = data.admissibilidade || {};
    const tempValue = admData.tempestividade || '';
    
    // Adicionamos a classe 'completed' direto no estado inicial.
    // O condicional que gerava o bloco .temp-context-note foi removido.
    let admHTML = `
        <div class="tempestividade-wrapper">
            <div class="temp-header">
                <input type="checkbox" class="chk-input" onchange="toggleRow(this);">
                <span class="item-title">Tempestividade e Prazos</span>
            </div>

            <div class="sub-section-divider">
                <label class="toggle-switch-container">
                    <input type="checkbox" id="chk-ed" onchange="toggleForm('form-ed', this.checked)">
                    <span>Embargos de Declaração</span>
                </label>
            </div>
            <div id="form-ed" class="sub-form-row disabled">
                <div class="sub-form-col">
                    <label>Prazo ED</label>
                    <input type="text" class="input-details input-full-width" placeholder="Ex: 05 dias úteis" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data ED — Parte Autora</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data ED — Parte Ré</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
            </div>

            <div class="sub-section-divider">
                <label class="toggle-switch-container">
                    <input type="checkbox" id="chk-ro" checked onchange="toggleForm('form-ro', this.checked)">
                    <span>Recurso Ordinário</span>
                </label>
            </div>
            <div id="form-ro" class="sub-form-row">
                <div class="sub-form-col">
                    <label>Prazo Recursal (Comum)</label>
                    <input type="text" class="input-details input-full-width" placeholder="Ex: 08 dias úteis" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data Recurso — Parte Autora</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data Recurso — Parte Ré</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
            </div>

            <div class="sub-section-divider">
                <label class="toggle-switch-container">
                    <input type="checkbox" id="chk-cr" onchange="toggleForm('form-cr', this.checked)">
                    <span>Contrarrazões</span>
                </label>
            </div>
            <div id="form-cr" class="sub-form-row disabled">
                <div class="sub-form-col">
                    <label>Prazo das Contrarrazões</label>
                    <input type="text" class="input-details input-full-width" placeholder="Ex: 08 dias úteis" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data CR — Parte Autora</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
                <div class="sub-form-col">
                    <label>Data CR — Parte Ré</label>
                    <input type="text" class="input-details input-full-width" placeholder="DD/MM/AAAA" oninput="this.setAttribute('value', this.value);">
                </div>
            </div>
        </div>
    `;
    admHTML += createRowHTML('Preparo Recursal', admData.preparo || '');
    admGenContainer.innerHTML = admHTML;

    const repData = admData.representacao || {};
    
    const repRowMain = document.getElementById('rep-row-main');
    if (repRowMain) {
        repRowMain.classList.add('rep-grid');
    }

    setupRepField('autor', repData.autor_da_acao);
    setupRepField('reu', repData.reu_da_acao);

    const topicContainer = document.getElementById('sortable-list');
    topicContainer.innerHTML = '';
    
    let topicsHTML = '';
    if(data.topicos_do_recurso && Array.isArray(data.topicos_do_recurso)) { 
        data.topicos_do_recurso.forEach(topic => {
            const topicId = generateTopicId();
            let partyClass = 'badge-author'; 
            let partyText = 'AUTOR';
            
            const recorrente = (topic.quem_recorre || '').toUpperCase();
            if(recorrente === 'RÉU DA AÇÃO' || recorrente === 'RÉU') { 
                partyClass = 'badge-defendant'; 
                partyText = 'RÉU'; 
            } else if(recorrente === 'AMBOS') { 
                partyClass = 'badge-joint'; 
                partyText = 'AMBOS'; 
            }

            let themeBadgeHTML = topic.tema_numero ? `<span class="badge-theme-tag">${topic.tema_numero}</span>` : '';

            topicsHTML += `
                <div class="checklist-item" draggable="true" data-topic-id="${topicId}">
                    ${SVG_DRAG_HANDLE}
                    <div class="action-buttons">
                        <button class="btn-icon icon-indent" onclick="toggleSubtopic(this)" title="Transformar em Subtópico">${SVG_INDENT}</button>
                        <button class="btn-icon icon-edit" onclick="editTopicTitle(this)" title="Renomear Tópico">${SVG_EDIT}</button>
                        <button class="btn-icon icon-delete" onclick="if(confirm('Deseja realmente remover este tópico?')) { this.closest('.checklist-item').remove(); updateTreeLines(); }" title="Excluir Tópico">${SVG_DELETE}</button>
                    </div>
                    <input type="checkbox" class="chk-input" onchange="toggleRow(this);">
                    <div class="item-content">
                        <span class="item-title" title="${topic.resumo || ''}" onclick="copyTopicTitle(this)" style="cursor: pointer;">${topic.titulo || ''}</span>
                    </div>
                    ${themeBadgeHTML}
                    <span class="badge ${partyClass}" 
                          onclick="rotateBadge(this);" 
                          title="Clique para alternar entre AUTOR, RÉU e AMBOS">${partyText}</span>
                </div>
            `;
        });
    }
    topicContainer.innerHTML = topicsHTML;
    setupDrag();
    updateTreeLines();
}

let windowAvailableTopics = [];

// 1. OUVINTE DE MENSAGENS GLOBAL
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SYNC_TOPICS') {
        windowAvailableTopics = event.data.topicos || [];
        hydrateReminders(); // Hidrata lembretes antigos garantindo a nova UI
        
        // MOTOR DE AUTO-CURA POR ID (Resolução de Bug de Renomeação)
        const circles = document.querySelectorAll('.topic-circle-indicator');
        circles.forEach(circle => {
            // Se não tem ID, assumimos estado legado/global.
            const topicId = circle.dataset.topicId || 'global';
            
            if (topicId !== 'global') {
                const topicExists = windowAvailableTopics.find(t => t.id === topicId);
                
                if (topicExists) {
                    // Tópico existe: Atualiza Cor E Nome (Caso tenha sido renomeado)
                    circle.style.backgroundColor = topicExists.cor;
                    circle.style.border = '2px solid transparent';
                    circle.style.boxShadow = `0 0 6px ${topicExists.cor}40`;
                    circle.setAttribute('title', topicExists.nome); // Sync do Tooltip
                    circle.setAttribute('style', circle.style.cssText); // Persiste no HTML exportado
                } else {
                    // Tópico apagado: Reverte para estado Global com segurança
                    circle.dataset.topicId = 'global';
                    circle.setAttribute('data-topic-id', 'global');
                    circle.style.backgroundColor = '#ffffff';
                    circle.style.border = '2px solid #cbd5e1';
                    circle.style.boxShadow = 'none';
                    circle.setAttribute('title', 'Global (Todo o Processo)');
                    circle.setAttribute('style', circle.style.cssText); 
                }
            }
        });
    }
    
    if (event.data && event.data.type === 'SCROLL_TO_TASKS') {
        // Busca resiliente pelo título da seção
        const headers = Array.from(document.querySelectorAll('.section-title'));
        const obsTitle = headers.find(el => el.textContent.toLowerCase().includes('observações gerais'));
        
        if (obsTitle) {
            obsTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Feedback visual sutil (pisca o bloco para guiar o olhar)
            const obsContainer = document.getElementById('obs-list');
            if (obsContainer) {
                obsContainer.style.transition = 'box-shadow 0.3s ease';
                obsContainer.style.boxShadow = '0 0 0 2px #3b82f6'; // Azul destaque
                setTimeout(() => obsContainer.style.boxShadow = 'none', 1000);
            }
        }
    }
});

// --- 3. INICIALIZAÇÃO LIMPA E ATUALIZAÇÃO DE LINHAS ---
document.addEventListener('DOMContentLoaded', () => {
    const importer = document.getElementById('json-importer');
    if (!importer || importer.style.display === 'none') {
        setupDrag(); 
        updateTreeLines();
    }
    window.addEventListener('resize', updateTreeLines);
    
    updateTaskCounters();
});

function updateTreeLines() {
    const list = document.getElementById('sortable-list');
    if (!list) return;
    const items = list.querySelectorAll('.checklist-item');
    
    items.forEach(item => item.classList.remove('has-children'));
    
    items.forEach((item, index) => {
        const oldLine = item.querySelector('.tree-line');
        if (oldLine) oldLine.remove();

        if (item.classList.contains('is-subtopic')) {
            const prev = items[index - 1];
            if (prev) {
                prev.classList.add('has-children');

                const line = document.createElement('div');
                line.className = 'tree-line';
                
                const itemRect = item.getBoundingClientRect();
                const prevRect = prev.getBoundingClientRect();
                
                const topOffset = (prevRect.top + prevRect.height / 2) - itemRect.top;
                
                line.style.top = topOffset + 'px';
                line.style.bottom = '50%'; 
                
                item.appendChild(line);
            }
        }
    });
    syncSentenceTopics();
}

// --- 4. HELPERS DE INTERAÇÃO ---
function setupRepField(type, dataObj) {
    if(!dataObj) return;
    const chk = document.getElementById(`chk-rep-${type}`);
    const input = document.getElementById(`input-rep-${type}`);
    
    // Força o checkbox a nascer sempre desmarcado, ignorando o status da IA
    if(chk) chk.checked = false;
    
    if(input && dataObj.obs) {
        input.value = dataObj.obs;
        input.setAttribute('value', dataObj.obs);
    }
    checkRepStatus(); 
}

function checkRepStatus() {
    const chkAutor = document.getElementById('chk-rep-autor');
    const chkReu = document.getElementById('chk-rep-reu');
    const row = document.getElementById('rep-row-main');

    if (chkAutor && chkReu && row) {
        if (chkAutor.checked && chkReu.checked) {
            row.classList.add('completed');
        } else {
            row.classList.remove('completed');
        }
    }
}

function createRowHTML(title, value = '', isCompleted = false) {
    const classCompleted = isCompleted ? 'completed' : '';
    const checkedAttr = isCompleted ? 'checked' : '';
    
    return `
        <div class="checklist-item ${classCompleted}" style="align-items: flex-start; flex-wrap: wrap;">
            <input type="checkbox" class="chk-input" style="margin-top: 5px;" onchange="toggleRow(this);" ${checkedAttr}> 
            <div class="item-content" style="display: block; width: calc(100% - 40px);">
                <div class="item-title" style="margin-bottom: 4px;">${title}</div>
                <div class="input-block-wrapper">
                    <input type="text" class="input-details input-full-width" 
                           value="${value}" 
                           placeholder="Digite observações aqui..."
                           oninput="this.setAttribute('value', this.value);">
                </div>
            </div>
        </div>`;
}

function rotateBadge(el) {
    const states = ['badge-author', 'badge-defendant', 'badge-joint'];
    const texts = ['AUTOR', 'RÉU', 'AMBOS'];
    let currentIdx = states.indexOf(el.classList.contains('badge-defendant') ? 'badge-defendant' : (el.classList.contains('badge-joint') ? 'badge-joint' : 'badge-author'));
    const nextIdx = (currentIdx + 1) % 3;
    el.classList.remove(...states);
    el.classList.add(states[nextIdx]);
    el.innerText = texts[nextIdx];
    syncSentenceTopics(); // propaga a mudança de polo para a seção de Sentenças
}

// ATUALIZAR: Garante que o checkbox funcione em listas ou no wrapper isolado
function toggleRow(chk) {
    const item = chk.closest('.checklist-item') || chk.closest('.tempestividade-wrapper');
    if(item) chk.checked ? item.classList.add('completed') : item.classList.remove('completed');
    
    if(item && item.closest('#obs-list')) updateTaskCounters();
}

// Função moderna de controle de estado visual via classe
window.toggleMainSyncPanel = function(headerEl) {
    const wrapper = headerEl.closest('.sync-accordion-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('is-open');
    }
};

// NOVA FUNÇÃO: Manipulador visual do componente sanfonado
window.toggleSyncItem = function(headerDiv) {
    // Busca os nós relativos dentro do card atual
    const body = headerDiv.nextElementSibling;
    const icon = headerDiv.querySelector('.chevron-icon');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.style.transform = 'rotate(90deg)'; // Seta aponta para baixo
    } else {
        body.style.display = 'none';
        icon.style.transform = 'rotate(0deg)'; // Seta aponta para a direita
    }
};

function editTopicTitle(btn) {
    const contentDiv = btn.closest('.checklist-item').querySelector('.item-content');
    const titleSpan = contentDiv.querySelector('.item-title');
    if (titleSpan) {
        const currentTitle = titleSpan.innerText;
        const currentTooltip = titleSpan.getAttribute('title') || '';
        contentDiv.innerHTML = `<input type="text" class="item-title-input" value="${currentTitle}" data-orig-tooltip="${currentTooltip}" oninput="this.setAttribute('value', this.value);" onblur="saveTopicTitle(this)" onkeypress="if(event.key === 'Enter') this.blur();">`;
        const input = contentDiv.querySelector('.item-title-input');
        input.focus();
    }
}

function saveTopicTitle(input) {
    const newTitle = input.value.trim() || 'Tópico sem nome';
    const originalTooltip = input.getAttribute('data-orig-tooltip') || '';
    const contentDiv = input.closest('.item-content');
    contentDiv.innerHTML = `<span class="item-title" title="${originalTooltip}" onclick="copyTopicTitle(this)" style="cursor: pointer;">${newTitle}</span>`;
    updateTreeLines(); 
}

function toggleSubtopic(btn) {
    const item = btn.closest('.checklist-item');
    const prevItem = item.previousElementSibling;

    if (!item.classList.contains('is-subtopic') && (!prevItem || prevItem.classList.contains('dragging'))) {
        alert("O primeiro item da trilha não pode ser um subtópico.");
        return;
    }

    item.classList.toggle('is-subtopic');

    if(item.classList.contains('is-subtopic')) {
        btn.innerHTML = SVG_OUTDENT;
        btn.title = "Promover a Tópico Principal";
    } else {
        btn.innerHTML = SVG_INDENT;
        btn.title = "Transformar em Subtópico";
    }
    
    updateTreeLines();
}

// 2. HIDRATAÇÃO DE DOM (Retrocompatibilidade)
function hydrateReminders() {
    const obsList = document.getElementById('obs-list');
    if (!obsList) return;

    const items = obsList.querySelectorAll('.checklist-item');
    items.forEach(item => {
        // Se já tem o indicador, ignora
        if (item.querySelector('.topic-circle-indicator')) return;
        
        item.style.position = 'relative'; // Garante contexto para o menu absoluto

        // Cria e injeta o indicador antes do input de texto
        const circle = document.createElement('div');
        circle.className = 'topic-circle-indicator';
        circle.title = 'Global (Todo o Processo)';
        circle.setAttribute('style', 'background-color: #ffffff; border: 2px solid #cbd5e1;');
        circle.onclick = function() { window.openObsTopicSelector(this); };

        // Localiza a div que contém o input text
        const textWrapper = item.querySelector('div[style*="flex:1"]');
        if (textWrapper) {
            item.insertBefore(circle, textWrapper);
        }
    });
}

// 3. ALTERAÇÃO DA CRIAÇÃO DE NOVOS LEMBRETES
function addNewObs() {
    const container = document.getElementById('obs-list');
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.style.position = 'relative'; 
    
    div.innerHTML = `
        <input type="checkbox" class="chk-input" onchange="toggleRow(this);">
        <div class="topic-circle-indicator" title="Global (Todo o Processo)" style="background-color: #ffffff; border: 2px solid #cbd5e1;" onclick="window.openObsTopicSelector(this)"></div>
        <div style="flex:1;">
            <input type="text" class="input-details" placeholder="Escreva o lembrete aqui..." oninput="this.setAttribute('value', this.value);" style="width:100%">
        </div>
        <button onclick="this.parentElement.remove(); updateTaskCounters();" 
                style="border:none; background:none; cursor:pointer; color:#cbd5e1;">✕</button>
    `;
    container.appendChild(div);
    updateTaskCounters();
}

// 4. LÓGICA DO MENU FLUTUANTE DE SELEÇÃO
window.openObsTopicSelector = function(circleEl) {
    // BLINDAGEM 1: Impede que o clique atual vaze e feche o menu instantaneamente
    if (window.event) {
        window.event.stopPropagation();
    }
    
    closeAllObsTopicSelectors();

    const menu = document.createElement('div');
    menu.className = 'obs-topic-selector-menu';
    
    const optionGlobal = document.createElement('div');
    optionGlobal.className = 'obs-topic-option';
    optionGlobal.innerHTML = `<div class="color-dot" style="background: #ffffff; border: 1px solid #ccc;"></div> Global`;
    optionGlobal.addEventListener('click', () => {
        window.applyObsTopic(circleEl, 'global', 'Global (Todo o Processo)', '#ffffff');
    });
    menu.appendChild(optionGlobal);

    if (windowAvailableTopics.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'obs-topic-divider';
        menu.appendChild(divider);

        windowAvailableTopics.forEach(t => {
            const option = document.createElement('div');
            option.className = 'obs-topic-option';
            const safeName = t.nome.replace(/'/g, "\\'");
            option.innerHTML = `<div class="color-dot" style="background: ${t.cor};"></div> ${safeName}`;
            
            option.addEventListener('click', () => {
                window.applyObsTopic(circleEl, t.id, t.nome, t.cor);
            });
            menu.appendChild(option);
        });
    }

    document.body.appendChild(menu);
    
    const rect = circleEl.getBoundingClientRect();
    menu.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    menu.style.left = (rect.left + window.scrollX) + 'px';
    
    // BLINDAGEM 2: Espera 50 milissegundos (imperceptível) antes de ativar a armadilha de fechar
    setTimeout(() => {
        document.addEventListener('click', closeAllObsTopicSelectors);
    }, 50);
};

window.applyObsTopic = function(circleEl, topicId, topicName, topicColor) {
    if (!circleEl) return;
    
    circleEl.dataset.topicId = topicId;
    circleEl.setAttribute('data-topic-id', topicId); 
    
    circleEl.style.backgroundColor = topicColor;
    circleEl.setAttribute('title', topicName);
    
    if (topicId === 'global') {
        circleEl.style.border = '2px solid #cbd5e1';
        circleEl.style.boxShadow = 'none';
    } else {
        circleEl.style.border = '2px solid transparent';
        circleEl.style.boxShadow = `0 0 6px ${topicColor}40`;
    }
    
    circleEl.setAttribute('style', circleEl.style.cssText);
};

window.closeAllObsTopicSelectors = function() {
    const menus = document.querySelectorAll('.obs-topic-selector-menu');
    menus.forEach(menu => menu.remove());
    document.removeEventListener('click', closeAllObsTopicSelectors);
};

function addNewTopic() {
    const container = document.getElementById('sortable-list');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.setAttribute('draggable', 'true');
    div.dataset.topicId = generateTopicId();
    
    div.innerHTML = `
        ${SVG_DRAG_HANDLE}
        <div class="action-buttons">
            <button class="btn-icon icon-indent" onclick="toggleSubtopic(this)" title="Transformar em Subtópico">${SVG_INDENT}</button>
            <button class="btn-icon icon-edit" onclick="editTopicTitle(this)" title="Renomear Tópico">${SVG_EDIT}</button>
            <button class="btn-icon icon-delete" onclick="if(confirm('Deseja realmente remover este tópico?')) { this.closest('.checklist-item').remove(); updateTreeLines(); }" title="Excluir Tópico">${SVG_DELETE}</button>
        </div>
        <input type="checkbox" class="chk-input" onchange="toggleRow(this);">
        <div class="item-content">
            <input type="text" class="item-title-input" placeholder="Digite o nome do tópico..." oninput="this.setAttribute('value', this.value);" onblur="saveTopicTitle(this)" onkeypress="if(event.key === 'Enter') this.blur();">
        </div>
        <span class="badge badge-author" onclick="rotateBadge(this);" title="Clique para alternar entre AUTOR, RÉU e AMBOS">AUTOR</span>
    `;
    
    container.appendChild(div);
    setupDrag(); 
    updateTreeLines();
    
    const novoInput = div.querySelector('.item-title-input');
    if(novoInput) novoInput.focus();
}

// --- 5. EXPORTAÇÃO COMPLETA ---
async function downloadBundledHTML(isInternalGenerator = false) {
    // NOVA LINHA DE SEGURANÇA (Pre-Flight Cleanup)
    if (typeof closeAllObsTopicSelectors === 'function') closeAllObsTopicSelectors();
    
    document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked ? c.setAttribute('checked', 'checked') : c.removeAttribute('checked'));
    document.querySelectorAll('input[type="text"]').forEach(i => i.setAttribute('value', i.value));
    
    const clone = document.documentElement.cloneNode(true);
    
    // HIGIENE DO CLONE (Removendo rastros do gerador e histórico no HTML final)
    const importer = clone.querySelector('#json-importer');
    if(importer) importer.remove();

    const versionBtn = clone.querySelector('#btn-version');
    if(versionBtn) versionBtn.remove();
    
    const versionModal = clone.querySelector('#version-modal');
    if(versionModal) versionModal.remove();
    
    const versionScript = clone.querySelector('script[src*="versions.js"]');
    if(versionScript) versionScript.remove();
    
    const container = clone.querySelector('#panel-container');
    if(container) container.style.display = 'block';

    // Garante que o dossiê exportado nasça com a sanfona fechada, ignorando o Live DOM
    const mainAccordion = clone.querySelector('.sync-accordion-wrapper');
    if (mainAccordion) {
        mainAccordion.classList.remove('is-open');
    }

    try {
        const cssLink = document.getElementById('main-css');
        if (cssLink) {
            try {
                const cssResponse = await fetch(cssLink.href);
                const styleTag = document.createElement('style');
                styleTag.textContent = await cssResponse.text();
                const cloneLink = clone.querySelector('link[href*="style.css"]');
                if(cloneLink) cloneLink.replaceWith(styleTag);
            } catch (err) { console.warn("CSS externo inacessível."); }
        }

        const scriptTag = document.createElement('script');
        try {
            const jsResponse = await fetch('script.js');
            scriptTag.textContent = await jsResponse.text();
        } catch (err) {
            console.warn("Falha ao buscar script.js. Usando fallback inline.");
            scriptTag.textContent = document.scripts[document.scripts.length - 1].textContent;
        }

        const cloneScript = clone.querySelector('script[src*="script.js"]');
        if(cloneScript) cloneScript.replaceWith(scriptTag);

        const finalHTML = clone.outerHTML;

        // RESOLUÇÃO DO CRÍTICO: Comunicação desacoplada para evitar loop de evento
        if (isInternalGenerator && window.parent && window.parent !== window) {
            window.parent.postMessage({ 
                type: 'DOSSIE_GENERATED', 
                html: finalHTML 
            }, '*');
        }

        const blob = new Blob([finalHTML], {type: 'text/html'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');

        const rawProc = document.getElementById('process-id').value;
        const procNum = rawProc.replace(/[^0-9]/g, '');
        const processoSeguro = procNum ? procNum : 'sem_processo';

        a.download = `${yyyy}${mm}${dd}_dossie_${processoSeguro}_${hh}${min}.html`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e) {
        console.error(e);
        alert("Erro ao empacotar arquivo: " + e.message);
    }
}

// --- 6. DRAG & DROP ---
function setupDrag() {
    const list = document.getElementById("sortable-list");
    if (!list) return;
    
    let dragged = null;
    let draggedChildren = [];
    
    list.ondragstart = (e) => { 
        const target = e.target.closest('.checklist-item');
        if (target) {
            dragged = target; 
            dragged.classList.add("dragging"); 
            
            list.classList.add('is-dragging');
            
            draggedChildren = [];
            if (!dragged.classList.contains('is-subtopic')) {
                let next = dragged.nextElementSibling;
                while (next && next.classList.contains('is-subtopic')) {
                    draggedChildren.push(next);
                    next.classList.add("dragging-child"); 
                    next = next.nextElementSibling;
                }
            }
        }
    };
    
    list.ondragend = (e) => { 
        if (dragged) {
            dragged.classList.remove("dragging"); 
            dragged = null;
            
            draggedChildren.forEach(child => child.classList.remove("dragging-child"));
            draggedChildren = [];
            
            list.classList.remove('is-dragging');
            updateTreeLines();
        }
    };
    
    list.ondragover = (e) => {
        e.preventDefault();
        const afterElement = [...list.querySelectorAll(".checklist-item:not(.dragging):not(.dragging-child)")].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        
        if (dragged) {
            if (afterElement == null) {
                list.appendChild(dragged);
            } else {
                list.insertBefore(dragged, afterElement);
            }
            
            let currentRef = dragged;
            draggedChildren.forEach(child => {
                list.insertBefore(child, currentRef.nextSibling);
                currentRef = child;
            });
        }
    };
}

// --- 7. CONTROLE DE VERSÕES E HISTÓRICO ---
// (Funcionalidades legadas de versão removidas para limpeza de dependências do Dossiê)

// --- NOVA SEÇÃO 8: SINCRONIZAÇÃO INTELIGENTE DE SENTENÇAS ---

/**
 * Atualização INCREMENTAL: nunca destrói dados já preenchidos.
 * Usa data-topic-id (na Trilha) e data-sync-id (nas Sentenças) como chave estável.
 * Opera em 3 fases: REMOVER itens obsoletos → CRIAR/ATUALIZAR itens → REORDENAR.
 */
function syncSentenceTopics() {
    // IMPORTANTE: Agora os itens dinâmicos são injetados no CORPO do acordeão.
    const container = document.getElementById('dynamic-sentence-topics-body');
    if (!container) return;

    const trilhaItems = Array.from(
        document.querySelectorAll('#sortable-list .checklist-item')
    );

    const placeholder = container.querySelector('.sync-placeholder');

    // Fase 1 — REMOVER itens obsoletos
    const activeIds = new Set(
        trilhaItems.map(item => item.dataset.topicId).filter(Boolean)
    );
    container.querySelectorAll('.sentence-topic-sync[data-sync-id]').forEach(el => {
        if (!activeIds.has(el.dataset.syncId)) el.remove();
    });

    // Controle do placeholder
    if (trilhaItems.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
        return;
    }
    if (placeholder) placeholder.style.display = 'none';

    // Fase 2 — CRIAR ou ATUALIZAR cada sync item
    trilhaItems.forEach(item => {
        const id = item.dataset.topicId;
        if (!id) return;

        const titleSpan = item.querySelector('.item-title');
        const title = titleSpan ? titleSpan.textContent.trim() : 'Tópico sem nome';
        const isSub = item.classList.contains('is-subtopic');

        const partyBadgeEl = item.querySelector('.badge-author, .badge-defendant, .badge-joint');
        let partyClass = 'badge-author';
        let partyText = 'AUTOR';
        if (partyBadgeEl) {
            if (partyBadgeEl.classList.contains('badge-defendant')) { partyClass = 'badge-defendant'; partyText = 'RÉU'; }
            else if (partyBadgeEl.classList.contains('badge-joint')) { partyClass = 'badge-joint'; partyText = 'AMBOS'; }
            else { partyText = partyBadgeEl.textContent.trim(); }
        }

        let syncItem = container.querySelector(`.sentence-topic-sync[data-sync-id="${id}"]`);

        if (!syncItem) {
            syncItem = document.createElement('div');
            syncItem.className = 'checklist-item sentence-topic-sync';
            syncItem.dataset.syncId = id;
            syncItem.innerHTML = `
                <div class="item-content" style="flex-direction: column; align-items: flex-start; gap: 0; width: 100%;">
                    <div class="sync-header" onclick="toggleSyncItem(this)" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; cursor: pointer; padding: 4px 0;">
                        <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; flex-shrink: 0;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        <span class="sync-title item-title" style="font-size: 0.85rem; flex: 1;"></span>
                        <span class="badge badge-mini-party" style="cursor: default;"></span>
                        <span class="badge badge-procedente" 
                              onclick="event.stopPropagation(); rotateSentenceBadge(this);" 
                              title="Clique para alternar o resultado" 
                              style="margin-left: auto;">PROCEDENTE</span>
                    </div>
                    <div class="sync-item-body" style="display: none; width: 100%; padding-left: 24px; box-sizing: border-box; margin-top: 6px;">
                        <input type="text" class="input-details input-full-width"
                               placeholder="Observações sobre o resultado deste tópico..."
                               oninput="this.setAttribute('value', this.value);">
                    </div>
                </div>
            `;
            container.appendChild(syncItem);
        }

        const titleEl = syncItem.querySelector('.sync-title');
        if (titleEl) titleEl.textContent = title;

        const miniParty = syncItem.querySelector('.badge-mini-party');
        if (miniParty) {
            miniParty.className = `badge badge-mini-party ${partyClass}`;
            miniParty.textContent = partyText;
        }

        syncItem.style.marginLeft = isSub ? '40px' : '0px';
    });

    // Fase 3 — REORDENAR para espelhar a ordem da Trilha
    trilhaItems.forEach(item => {
        const id = item.dataset.topicId;
        if (!id) return;
        const syncItem = container.querySelector(`.sentence-topic-sync[data-sync-id="${id}"]`);
        if (syncItem) container.appendChild(syncItem);
    });
}

/**
 * Ativa ou desativa um bloco de formulário da Tempestividade.
 * CORRIGIDO: usa setAttribute para garantir a captura pelo exportador de HTML.
 */
window.toggleForm = function(formId, isChecked) {
    const form = document.getElementById(formId);
    if (!form) return;

    if (isChecked) {
        form.classList.remove('disabled');
        form.querySelectorAll('input[type="text"]').forEach(input => {
            input.disabled = false;
            // Limpa o marcador 'N/A' tanto na propriedade quanto no atributo
            if (input.value === 'N/A') {
                input.value = '';
                input.setAttribute('value', '');
            }
        });
    } else {
        form.classList.add('disabled');
        form.querySelectorAll('input[type="text"]').forEach(input => {
            input.disabled = true;
            input.value = 'N/A';
            input.setAttribute('value', 'N/A'); // ← garante captura no export
        });
    }
};

// --- 8. NOVAS FUNÇÕES DE ROTAÇÃO DE BADGES (SENTENÇA / EMBARGOS) ---
function rotateSentenceBadge(el) {
    const states = ['badge-procedente', 'badge-parcial', 'badge-improcedente', 'badge-outros'];
    const texts = ['PROCEDENTE', 'PARCIALMENTE PROCEDENTE', 'IMPROCEDENTE', 'OUTROS'];
    
    let currentIdx = states.findIndex(cls => el.classList.contains(cls));
    if (currentIdx === -1) currentIdx = 0; 
    
    const nextIdx = (currentIdx + 1) % states.length;
    
    el.classList.remove(...states);
    el.classList.add(states[nextIdx]);
    el.innerText = texts[nextIdx];
}

// --- 9. RECURSOS COMPLEMENTARES E RESILIENTES ---

function copyToClipboardFallback(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  // Evita scroll no final da página
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('Falha ao copiar via fallback', err);
    }
    document.body.removeChild(textArea);
}

window.copyTopicTitle = function(el) {
    const text = el.innerText;
    
    // Tratamento para ambiente Seguro (HTTPS) vs Local (file://)
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => copyToClipboardFallback(text));
    } else {
        copyToClipboardFallback(text);
    }

    // Feedback visual
    const originalColor = el.style.color;
    el.style.color = '#10b981';
    
    setTimeout(() => {
        el.style.color = originalColor;
    }, 1500);
};

window.triggerSave = async function(btn) {
    if(btn.classList.contains('is-saving')) return;
    btn.classList.add('is-saving');
    
    // UX: Garante que a animação seja percebida antes do thread lock do download
    await new Promise(r => setTimeout(r, 500)); 
    
    await downloadBundledHTML();
    
    btn.classList.remove('is-saving');
    btn.classList.add('save-success');
    
    setTimeout(() => btn.classList.remove('save-success'), 2500);
};

window.updateTaskCounters = function() {
    const obsList = document.getElementById('obs-list');
    if (!obsList) return;
    
    let pending = 0;
    let done = 0;
    obsList.querySelectorAll('.chk-input').forEach(chk => chk.checked ? done++ : pending++);
    
    const pBadge = document.getElementById('task-pending');
    const dBadge = document.getElementById('task-done');
    
    if (pBadge) {
        pBadge.innerText = pending;
        pBadge.style.display = pending > 0 ? 'flex' : 'none'; // Previne poluição visual de zeros
    }
    
    if (dBadge) {
        dBadge.innerText = done;
        dBadge.style.display = done > 0 ? 'flex' : 'none';
    }
};

function rotateSimNaoBadge(el) {
    const states = ['badge-sim', 'badge-nao'];
    const texts = ['SIM', 'NÃO'];
    
    let currentIdx = states.findIndex(cls => el.classList.contains(cls));
    if (currentIdx === -1) currentIdx = 0; 
    
    const nextIdx = (currentIdx + 1) % states.length;
    
    el.classList.remove(...states);
    el.classList.add(states[nextIdx]);
    el.innerText = texts[nextIdx];

    // --- Lógica de Sincronização e Melhoria de UX ---
    const row = el.closest('.checklist-item');
    if (row) {
        const resultBadge = row.querySelector('.badge-resultado-embargo');
        const inputDetails = row.querySelector('.input-details');

        if (states[nextIdx] === 'badge-nao') {
            if (resultBadge) {
                // Guarda o estado atual antes de escurecer
                resultBadge.dataset.prevState = Array.from(resultBadge.classList).find(c => c.startsWith('badge-') && c !== 'badge-resultado-embargo') || 'badge-acolhido';
                resultBadge.dataset.prevText = resultBadge.innerText;
                
                // Aplica o fundo escuro
                resultBadge.className = 'badge badge-resultado-embargo badge-nao-aplica';
                resultBadge.innerText = 'N/A';
            }
            if (inputDetails) {
                // Desabilita o campo de texto
                inputDetails.disabled = true;
                inputDetails.style.opacity = '0.5';
                inputDetails.style.cursor = 'not-allowed';
            }
        } else {
            if (resultBadge) {
                // Restaura o estado salvo ou volta ao padrão
                const prevState = resultBadge.dataset.prevState || 'badge-acolhido';
                const prevText = resultBadge.dataset.prevText || 'ACOLHIDO';
                
                resultBadge.className = `badge badge-resultado-embargo ${prevState}`;
                resultBadge.innerText = prevText;
            }
            if (inputDetails) {
                // Reabilita o campo de texto
                inputDetails.disabled = false;
                inputDetails.style.opacity = '1';
                inputDetails.style.cursor = 'text';
            }
        }
    }
}

function rotateEmbargoBadge(el) {
    // Interrompe a rotação se estiver escurecido/inativo
    if (el.classList.contains('badge-nao-aplica')) return; 

    const states = ['badge-acolhido', 'badge-rejeitado', 'badge-parcial-acolhido'];
    const texts = ['ACOLHIDO', 'REJEITADO', 'PARCIALMENTE ACOLHIDO'];
    
    let currentIdx = states.findIndex(cls => el.classList.contains(cls));
    if (currentIdx === -1) currentIdx = 0; 
    
    const nextIdx = (currentIdx + 1) % states.length;
    
    el.classList.remove(...states);
    el.classList.add(states[nextIdx]);
    el.innerText = texts[nextIdx];
}
