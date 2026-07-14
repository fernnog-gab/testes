/* ================================================
   app-core.js
   ORQUESTRADOR CENTRAL E INFRAESTRUTURA DA APLICAÇÃO
   ================================================ */

/* ================================================
   MÓDULO DA SPLASH SCREEN (GERENCIADOR DE ESTADO E EVENT LOOP)
   ================================================ */
window.SplashScreenManager = (function() {
    let splashEl = null;
    let textEl = null;
    const DEFAULT_TEXT = "Organizar ideias. Fazer justiça.";
    let initialLoadPromise = null;

    function init() {
        splashEl = document.getElementById('juris-splash');
        textEl = document.getElementById('splash-dynamic-text');
        initialLoadPromise = new Promise(resolve => setTimeout(resolve, 1500));
    }

    async function showWithYield(mensagem = DEFAULT_TEXT) {
        if (!splashEl) return;
        if (textEl) textEl.textContent = mensagem;
        splashEl.classList.remove('is-hidden');
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 50); 
                });
            });
        });
    }

    function hide() {
        if (splashEl) splashEl.classList.add('is-hidden');
    }

    async function hideInitialLoad() {
        if (initialLoadPromise) await initialLoadPromise;
        hide();
    }

    return { init, showWithYield, hide, hideInitialLoad };
})();

/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO (ORQUESTRADOR)
   ================================================ */
let topicos              = [];     
let modoRetomada         = false;  
let _encerrarTimer       = null;   
let _encerrarConfirmando = false;  
let _sessaoPossuiAudio   = false;  

let _tempHighlightState = {
    rects: null,
    paginaFisica: null
};

/* ================================================
   MOTOR GLOBAL DE SINCRONIZAÇÃO (Ponte)
   ================================================ */
window.sincronizarHighlightsGerais = function() {
    if (window.PdfEngine) window.PdfEngine.sincronizarHighlightsGerais();
};

/* ================================================
   MOTOR DE HIGIENIZAÇÃO DE TEXTO (JURIS UTILS)
   ================================================ */
window.JurisUtils = window.JurisUtils || {};

window.JurisUtils.limparTextoPDF = function(texto) {
    if (!texto || typeof texto !== 'string') return '';
    return texto
        // 1. Remove APENAS hifens de divisão silábica (entre letras Unicode).
        // Protege listas (- item) e nomenclaturas mistas (art. 10-A)
        .replace(/([\p{L}])-\r?\n\s*([\p{L}])/gu, '$1$2')
        // 2. Emenda linhas quebradas simples. 
        // Protege parágrafos reais (preserva \n\n ou \r\n\r\n)
        .replace(/([^\n\r])\r?\n([^\n\r])/g, '$1 $2')
        // 3. Colapsa espaços duplos ou múltiplos criados durante a junção
        .replace(/ {2,}/g, ' ')
        .trim();
};

/* ================================================
   CONTROLE DE INTERFACE DE AUTENTICAÇÃO
   ================================================ */
window.toggleLoginMenu = function(event) {
    event.stopPropagation();
    const menu = document.getElementById('login-menu');
    const jurisMenu = document.getElementById('juris-menu');
    const isVisible = menu.style.display === 'flex';
    
    if (jurisMenu && jurisMenu.style.display === 'flex') {
        jurisMenu.style.display = 'none';
    }
    
    if (!isVisible) {
        menu.style.display = 'flex';
        const rect = event.currentTarget.getBoundingClientRect();
        menu.style.left = (rect.right + 12) + 'px';
        menu.style.top = rect.top + 'px';
        setTimeout(() => document.getElementById('login-email').focus(), 50);
    } else {
        menu.style.display = 'none';
    }
};

/* ================================================
   MÓDULO DE ATALHOS FLUTUANTES (SHORTCUT MANAGER)
   ================================================ */
window.ShortcutManager = (function() {
    let state = { favorito: null, recursoAutora: null, recursoReu: null, recursoReu2: null, contestacao: null, contestacaoRe2: null, sentenca: null };
    let currentEditingType = null;
    
    const colors = { favorito: 'is-active-favorito', recursoAutora: 'is-active-autora', recursoReu: 'is-active-re', recursoReu2: 'is-active-re2', contestacao: 'is-active-re', contestacaoRe2: 'is-active-re2', sentenca: 'is-active-juizo' };
    const rotulos = { favorito: 'Favorito (Coringa)', recursoAutora: 'Recurso (Autora)', recursoReu: 'Recurso (Ré 1)', recursoReu2: 'Recurso (Ré 2)', contestacao: 'Contestação (Ré 1)', contestacaoRe2: 'Contestação (Ré 2)', sentenca: 'Sentença/Acórdão' };

    function updateUI() {
        Object.keys(state).forEach(type => {
            const btn = document.getElementById(getFabId(type));
            if (!btn) return;
            
            btn.classList.remove('is-empty', 'is-active-favorito', 'is-active-autora', 'is-active-re', 'is-active-re2', 'is-active-juizo');
            
            if (state[type] === null) {
                btn.classList.add('is-empty');
                btn.title = `Marcar página: ${rotulos[type]}`;
            } else {
                btn.classList.add(colors[type]);
                btn.title = `${rotulos[type]} (Pág. ${state[type]})\n[Shift + Clique] para editar`;
            }
        });
    }

    function handleClick(type, event) {
        if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
            exibirToast('Carregue um documento primeiro.', 'aviso'); return;
        }
        if (state[type] === null || event.shiftKey) {
            abrirModal(type);
        } else {
            PdfEngine.goToPage(state[type]);
        }
    }

    function abrirModal(type) {
        currentEditingType = type;
        document.getElementById('shortcut-modal-title').textContent = `Página para: ${rotulos[type]}`;
        const input = document.getElementById('shortcut-page-input');
        input.value = state[type] || '';
        
        document.getElementById('shortcut-modal-backdrop').style.display = 'block';
        document.getElementById('shortcut-modal').style.display = 'flex';
        setTimeout(() => input.focus(), 50);
    }

    function fecharModal() {
        currentEditingType = null;
        document.getElementById('shortcut-modal-backdrop').style.display = 'none';
        document.getElementById('shortcut-modal').style.display = 'none';
    }

    async function salvarModal() {
        if (!currentEditingType) return;
        const val = document.getElementById('shortcut-page-input').value.trim();
        const parsed = parseInt(val, 10);
        
        if (val === '') {
            state[currentEditingType] = null;
            exibirToast('Atalho removido.', 'sucesso');
        } else if (!isNaN(parsed) && parsed > 0) {
            state[currentEditingType] = parsed;
            exibirToast('Atalho salvo com sucesso!', 'sucesso');
        } else {
            exibirToast('Número de página inválido.', 'erro');
            return;
        }
        
        fecharModal();
        updateUI();
        if (typeof salvarBackupAutomatico === 'function') await salvarBackupAutomatico();
    }

    function getFabId(type) {
        const map = { favorito: 'fab-favorito', recursoAutora: 'fab-recurso-autora', recursoReu: 'fab-recurso-re', recursoReu2: 'fab-recurso-re2', contestacao: 'fab-contestacao', contestacaoRe2: 'fab-contestacao-re2', sentenca: 'fab-sentenca' };
        return map[type];
    }

    return { 
        handleClick, updateUI, fecharModal, salvarModal,
        getState: () => state,
        setState: (newState) => { if (newState) { state = { ...state, ...newState }; updateUI(); } },
        reset: () => { state = { favorito: null, recursoAutora: null, recursoReu: null, recursoReu2: null, contestacao: null, contestacaoRe2: null, sentenca: null }; updateUI(); },
        toggleVisibility: (show) => {
            Object.keys(state).forEach(type => {
                const btn = document.getElementById(getFabId(type));
                if (btn) btn.style.display = show ? 'flex' : 'none';
            });
        }
    };
})();

/* ================================================
   INICIALIZAÇÃO E INJEÇÃO DE DEPENDÊNCIAS
   ================================================ */
document.addEventListener("DOMContentLoaded", () => {
    document.body.dataset.activeTab = 'leitura';
    SplashScreenManager.init();
    
    if (window.TimeTrackerManager) {
        TimeTrackerManager.init({ getTopicos: () => topicos });
    }
    
    if (window.PdfEngine) {
        PdfEngine.init({
            getTopicos: () => topicos,
            exibirToast: exibirToast,
            atualizarDisplayPaginador: atualizarDisplayPaginador,
            validarPdf: (buffer) => BackupManager.validarPdf(buffer),
            iniciarSessaoBackup: (name, buffer) => BackupManager.iniciarSessao(name, buffer),
            habilitarFerramentas: habilitarFerramentasDeTrabalho,
            onProcessoIdentificado: (numeroCurto) => {
                const tagProcesso = document.getElementById('tag-numero-processo');
                if (tagProcesso) {
                    tagProcesso.textContent = numeroCurto;
                    tagProcesso.style.display = 'inline-block';
                    tagProcesso.title = 'Clique para copiar';
                    tagProcesso.classList.add('tag-clicavel-copia');

                    // Clone profundo para prevenir vazamento de memória com listeners acumulados
                    const novaTag = tagProcesso.cloneNode(true);
                    tagProcesso.parentNode.replaceChild(novaTag, tagProcesso);

                    // Evento de clique com Fallback de Clipboard
                    novaTag.addEventListener('click', async () => {
                        try {
                            if (navigator.clipboard && window.isSecureContext) {
                                await navigator.clipboard.writeText(numeroCurto);
                            } else {
                                // Fallback para ambientes sem contexto seguro (ex: file://)
                                const textArea = document.createElement("textarea");
                                textArea.value = numeroCurto;
                                textArea.style.position = "fixed";
                                textArea.style.opacity = "0";
                                document.body.appendChild(textArea);
                                textArea.focus();
                                textArea.select();
                                const executou = document.execCommand('copy');
                                document.body.removeChild(textArea);
                                if (!executou) throw new Error("Comando legado falhou");
                            }
                            exibirToast(`Processo ${numeroCurto} copiado!`, 'sucesso');
                        } catch (err) {
                            console.warn("Erro no Clipboard API:", err);
                            exibirToast('Seu navegador bloqueou a cópia. Copie manualmente.', 'erro');
                        }
                    });
                }
                // Define o nome de backup padrão SEM o sufixo arbitrário "_backup"
                window._nomeArquivoSugerido = `${numeroCurto}.json`;
            },
            onPdfCarregado: async (isRetomada) => {
                if (isRetomada) {
                    modoRetomada = false;
                    trocarAba('leitura');
                    exibirToast('PDF validado e carregado. Sessão retomada com sucesso. ✓');
                    
                    if (_sessaoPossuiAudio && typeof window.AudioManager?.prepararRetomada === 'function') {
                        window.AudioManager.prepararRetomada();
                    }
                } else {
                    trocarAba('leitura');
                    console.log("[JURIS LOG] PDF renderizado. Exibindo modal de backup.");
                    document.getElementById('backup-modal-backdrop').style.display = 'block';
                    document.getElementById('modal-ativar-backup').style.display = 'flex';

                    if (window.PjeParser && window.PdfEngine && PdfEngine.getPdfDoc()) {
                        exibirToast('Analisando sumário do processo em segundo plano...', 'aviso');
                        PjeParser.mapearAtalhos(PdfEngine.getPdfDoc())
                            .then(async (atalhos) => {
                                if (atalhos.contestacao || atalhos.contestacaoRe2 || atalhos.sentenca) {
                                    window.ShortcutManager.setState({
                                        contestacao: atalhos.contestacao || null,
                                        contestacaoRe2: atalhos.contestacaoRe2 || null,
                                        sentenca: atalhos.sentenca || null
                                    });
                                    window.ShortcutManager.toggleVisibility(true);
                                    if (typeof salvarBackupAutomatico === 'function') {
                                        await salvarBackupAutomatico();
                                    }
                                    exibirToast('Atalhos da Contestação/Sentença preenchidos com sucesso!', 'sucesso');
                                } else {
                                    exibirToast('Análise concluída: Sumário padrão não encontrado.', 'aviso');
                                }
                            })
                            .catch(e => console.warn('[Juris Notes] Erro não-bloqueante no Parser PJe:', e));
                    }
                }
            }
        });
    }

    const savedThemeProcesso = localStorage.getItem('theme-processo') || 'jasmine';
    const savedThemeAnotacoes = localStorage.getItem('theme-anotacoes') || 'white';
    document.body.classList.add(`theme-processo-${savedThemeProcesso}`);
    document.body.classList.add(`theme-anotacoes-${savedThemeAnotacoes}`);

    if (window.AudioManager) AudioManager.init({ getTopicos: () => topicos, exibirToast, salvarAnotacao });
    if (window.ExportManager) ExportManager.init({ getTopicos: () => topicos, exibirToast, getActiveTabId: () => TopicsManager.getActiveTabId() });

    const historyContainer = document.getElementById('history-container');
    if (historyContainer) historyContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
    
    const pdfContainer = document.getElementById('pdf-container');
    if (pdfContainer) {
        pdfContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
        pdfContainer.addEventListener('click', (e) => {
            const linkAncorado = e.target.closest('.linkAnnotation a');
            if (linkAncorado && !e.defaultPrevented) {
                console.error('🔴 ALERTA: O PDF.js rejeitou a vinculação do evento! O clique vazou.');
                e.preventDefault(); 
            }
        }, true);
    }

    SplashScreenManager.hideInitialLoad();
});

/* ================================================
   GERENCIAMENTO DE INTERFACE E SCROLL DISPATCHER
   ================================================ */
function atualizarDisplayPaginador(pageNum) {
    if (window.PdfEngine && PdfEngine.getCurrentPage() === pageNum) {
        const displayLabel = PdfEngine.getDisplayLabel(pageNum);
        document.getElementById('current-page-display').textContent = displayLabel;
    }
}

window.aplicarTema = function(alvo, tema) { 
    const regex = alvo === 'processo' ? /^theme-processo-/ : /^theme-anotacoes-/;
    document.body.className = document.body.className.split(' ').filter(c => !regex.test(c)).join(' ');
    document.body.classList.add(`theme-${alvo}-${tema}`);
    localStorage.setItem(`theme-${alvo}`, tema);
    
    const menu = document.getElementById('juris-menu');
    if (menu) menu.style.display = 'none';
    exibirToast(`Fundo ${tema === 'white' ? 'Branco' : 'Jasmine'} aplicado a ${alvo}.`, 'sucesso');
};

function getActiveScrollContainer() {
    return document.getElementById('tab-leitura').classList.contains('active') 
        ? document.getElementById('pdf-container') 
        : document.getElementById('history-container');
}

window.toggleModoFoco = function(ativar) {
    const pdfWrapper = document.getElementById('pdf-wrapper');
    if (!pdfWrapper) return;
    if (ativar) pdfWrapper.classList.add('pdf-foco-ativo');
    else pdfWrapper.classList.remove('pdf-foco-ativo');
};

function trocarAba(aba) {
    document.body.dataset.activeTab = aba;

    document.getElementById('pdf-container').style.display     = aba === 'leitura'   ? 'flex'  : 'none';
    document.getElementById('history-container').style.display = aba === 'historico' ? 'block' : 'none';
    document.getElementById('tab-leitura').classList.toggle('active',   aba === 'leitura');
    document.getElementById('tab-historico').classList.toggle('active', aba === 'historico');

    const isAnotacoes = (aba === 'historico' && topicos.length > 0);
    const isLeitura   = (aba === 'leitura');
    
    const btnExportar = document.getElementById('btn-exportar-topico');
    if (btnExportar) btnExportar.style.display = isAnotacoes ? 'flex' : 'none';

    // GERENCIAMENTO DA VISIBILIDADE DO GERADOR DE CONTEXTO
    const btnGerador = document.getElementById('btn-gerador-contexto');
    if (btnGerador) btnGerador.style.display = isAnotacoes ? 'flex' : 'none';
    
    const btnAcervo = document.getElementById('btn-acervo-modelos');
    if (btnAcervo) btnAcervo.style.display = isAnotacoes ? 'flex' : 'none';

    const btnTexto = document.getElementById('btn-ferramenta-texto');
    if (btnTexto) btnTexto.style.display = isLeitura ? 'flex' : 'none';

    const btnRecorte = document.getElementById('btn-ferramenta-recorte');
    if (btnRecorte) btnRecorte.style.display = isLeitura ? 'flex' : 'none';

    const btnExtrator = document.getElementById('btn-ferramenta-extrator');
    if (btnExtrator) btnExtrator.style.display = isLeitura ? 'flex' : 'none';

    const fabContainer = document.getElementById('scroll-fab-container');
    if (fabContainer) {
        fabContainer.style.display = 'flex';
        setTimeout(checkScrollFabState, 60);
    }

    if (window.ShortcutManager) {
        const temPdf = (window.PdfEngine && PdfEngine.getPdfDoc());
        window.ShortcutManager.toggleVisibility(aba === 'leitura' && temPdf);
    }

    if (window.AudioManager && typeof window.AudioManager.onTabChange === 'function') {
        window.AudioManager.onTabChange(aba);
    }

    if (window.TimeTrackerManager) {
        TimeTrackerManager.toggleVisibility();
    }

    // [NOVO] Reavalia o botão ao trocar o contexto visual (Aba)
    if (window.atualizarStatusBotaoExtrator) window.atualizarStatusBotaoExtrator();
}

function checkScrollFabState() {
    const hc     = getActiveScrollContainer();
    const btnTop = document.getElementById('btn-scroll-top');
    const btnBot = document.getElementById('btn-scroll-bottom');
    if (!hc || !btnTop || !btnBot) return;

    const scrollable = hc.scrollHeight > hc.clientHeight + 10;
    const atTop      = hc.scrollTop < 50;
    const atBottom   = hc.scrollTop + hc.clientHeight >= hc.scrollHeight - 30;

    btnTop.classList.toggle('is-hidden', atTop);
    btnBot.classList.toggle('is-hidden', !scrollable || atBottom);
}

function rolarParaTopo() {
    const hc = getActiveScrollContainer();
    if (hc) hc.scrollTo({ top: 0, behavior: 'smooth' });
}

function rolarParaFinal() {
    const hc = getActiveScrollContainer();
    if (hc) hc.scrollTo({ top: hc.scrollHeight, behavior: 'smooth' });
}

function exibirToast(mensagem, tipo = 'sucesso', iconeSvgString = null) {
    const toast = document.getElementById('toast-feedback');
    
    if (iconeSvgString) {
        toast.innerHTML = `${iconeSvgString}<span class="toast-text"></span>`;
        toast.querySelector('.toast-text').textContent = mensagem;
    } else {
        toast.innerHTML = '';
        toast.textContent = mensagem;
    }

    toast.className = `toast-feedback toast-${tipo} visivel`;
    clearTimeout(toast._timer);
    
    const tempoExibicao = tipo === 'aviso' ? 4000 : 2800;
    toast._timer = setTimeout(() => {
        toast.classList.remove('visivel');
        setTimeout(() => toast.innerHTML = '', 300);
    }, tempoExibicao);
}

function atualizarStatusBackup(texto, ativa = false) {
    if (texto.includes('Restaurada') || texto.includes('Erro')) {
        exibirToast(`Sistema: ${texto}`, ativa ? 'sucesso' : 'erro');
    }
}

function habilitarFerramentasDeTrabalho() {
    ['btn-ferramenta-recorte', 'btn-ferramenta-texto', 'btn-novo-topico', 'btn-encerrar-sessao', 'btn-ferramenta-audio', 'btn-balanca-justica', 'btn-ferramenta-extrator']
        .forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });
    
    if (window.ShortcutManager && document.getElementById('tab-leitura').classList.contains('active')) {
        window.ShortcutManager.toggleVisibility(true);
        window.ShortcutManager.updateUI();
    }
}

function encerrarSessao() {
    const btn = document.getElementById('btn-encerrar-sessao');

    if (!_encerrarConfirmando) {
        _encerrarConfirmando = true;
        btn.classList.add('confirmando');
        btn.title = 'Clique novamente para confirmar';
        exibirToast('Clique novamente no botão para confirmar o encerramento da sessão.', 'aviso');
        _encerrarTimer = setTimeout(() => {
            _encerrarConfirmando = false;
            btn.classList.remove('confirmando');
            btn.title = 'Encerrar Sessão';
        }, 3000);
        return;
    }

    clearTimeout(_encerrarTimer);
    _encerrarConfirmando = false;

    if (typeof modoRecorteAtivo !== 'undefined' && modoRecorteAtivo) desativarOverlayRecorte();
    if (typeof fecharTudoWizard === 'function') fecharTudoWizard();
    if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
    if (window.AudioManager) window.AudioManager.encerrar();
    if (window.TimeTrackerManager) window.TimeTrackerManager.parar();

    topicos      = [];
    modoRetomada = false;
    sessionStorage.removeItem('juris_active_session');
    
    if (window.PdfEngine) window.PdfEngine.encerrar();
    BackupManager.encerrar();
    if (window.ShortcutManager) window.ShortcutManager.reset();

    if (window.BalancaManager) {
        window.BalancaManager.resetarEstado(); // Limpa iframe, contadores e estilos amarelos
    }

    const wrapper = document.getElementById('pdf-wrapper');
    wrapper.innerHTML     = '';
    wrapper.style.display = 'none';
    document.getElementById('pdf-placeholder').style.display = 'flex';
    document.getElementById('floating-page-panel').style.display = 'none';
    document.getElementById('btn-exportar-topico').style.display = 'none';
    document.getElementById('current-page-display').textContent  = '1';
    document.getElementById('pdf-upload').value = '';

    // NOVO: Limpeza de Estado do Número do Processo (Evitar State Leak)
    const tagProcesso = document.getElementById('tag-numero-processo');
    if (tagProcesso) {
        tagProcesso.textContent = '';
        tagProcesso.style.display = 'none';
    }
    window._nomeArquivoSugerido = null;

    ['btn-ferramenta-recorte', 'btn-ferramenta-texto', 'btn-novo-topico', 'btn-encerrar-sessao', 'btn-ferramenta-audio', 'btn-ferramenta-extrator']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = true;
                el.classList.remove('confirmando', 'ativo');
            }
        });
    btn.title = 'Encerrar Sessão';

    renderizarTopicos();
    atualizarStatusBackup('Aguardando...', false);
    trocarAba('leitura');
    exibirToast('Sessão encerrada. Sistema pronto para novo processo.', 'sucesso');
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS E PROCESSO
   ================================================ */
async function retomarProcesso() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Arquivo de Backup', accept: { 'application/json': ['.json'] } }]
        });

        await window.SplashScreenManager.showWithYield("Restaurando mapa mental...");

        let pacote;
        try {
            pacote = await BackupManager.carregarJson(handle);
        } catch {
            window.SplashScreenManager.hide();
            exibirToast('O arquivo selecionado não é um backup válido ou está corrompido.', 'erro');
            return;
        }

        const permissao = await handle.requestPermission({ mode: 'readwrite' });

        topicos      = pacote.dados;
        modoRetomada = true;
        _sessaoPossuiAudio = pacote.metadata.possuiAudio ?? false;

        renderizarTopicos();
        habilitarFerramentasDeTrabalho();
        trocarAba('historico');
        window.SplashScreenManager.hide();

        const isLegado = pacote.metadata.versaoApp === '1.0';
        const msgHash  = isLegado ? ' Backup legado.' : ' O PDF será validado por SHA-256.';

        atualizarStatusBackup(permissao === 'granted' ? 'Sessão Restaurada ✓' : 'Restaurada (sem auto-save)', true);
        exibirToast(`Anotações restauradas.${msgHash} Selecione agora o PDF do processo.`);

        document.getElementById('pdf-upload').click();
    } catch (err) {
        if (window.SplashScreenManager) window.SplashScreenManager.hide();
        modoRetomada = false;
        if (err.name !== 'AbortError') exibirToast('Erro ao restaurar a sessão.', 'erro');
    }
}

async function salvarBackupAutomatico() {
    if (!BackupManager.isAtivo()) return;
    try {
        await BackupManager.salvar(topicos);
    } catch (err) {
        exibirToast('Não foi possível atualizar o backup automático.', 'aviso');
    }
}

async function novoProcesso(event) {
    if ((topicos.length > 0 || (window.PdfEngine && PdfEngine.getPdfDoc())) && !modoRetomada) {
        const continuar = confirm('Iniciar um novo processo irá apagar as anotações em memória não salvas.\nDeseja continuar?');
        if (!continuar) {
            event.target.value = '';
            return;
        }
        if (window.AudioManager) window.AudioManager.encerrar();
        topicos = [];
        BackupManager.encerrar(); 
        if (window.ShortcutManager) window.ShortcutManager.reset();
        renderizarTopicos();
        atualizarStatusBackup('Aguardando...');
    }

    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
        exibirToast('Selecione um arquivo PDF válido.', 'erro');
        return;
    }
    
    window._nomeArquivoSugerido = file.name.replace(/\.[^/.]+$/, "").toLowerCase() + ".json";

    if (window.PdfEngine) {
        await window.SplashScreenManager.showWithYield("Processando arquivo PDF...");
        console.log("[JURIS LOG] Iniciando leitura do PDF:", file.name);
        await PdfEngine.carregarPDF(file, modoRetomada);
        window.SplashScreenManager.hide();
    }
}

/* ================================================
   GESTÃO DE TÓPICOS E ANOTAÇÕES E ACERVO
   ================================================ */

function verificarAcervoEmSegundoPlano(nomeTopico) {
    const agendarTarefaBackground = window.requestIdleCallback || ((cb, opts) => setTimeout(cb, opts?.timeout ?? 1));
    
    agendarTarefaBackground(async () => {
        if (typeof window.AcervoManager === 'undefined') return;
        
        try {
            const modelos = await AcervoManager.carregarModelos();
            if (!modelos || modelos.length === 0) return;
            
            const nomeTopicoMin = nomeTopico.toLowerCase();
            const modelosEncontrados = [];
            const tagsGatilho = new Set();
            
            modelos.forEach(mod => {
                if (mod.tags) {
                    const tagMatch = mod.tags.find(tag => nomeTopicoMin.includes(tag.toLowerCase()));
                    if (tagMatch) {
                        modelosEncontrados.push(mod);
                        tagsGatilho.add(tagMatch); 
                    }
                }
            });
            
            if (modelosEncontrados.length > 0) {
                const quantidade = modelosEncontrados.length;
                let mensagem = "";
                
                if (quantidade === 1) {
                    mensagem = `💡 Dica: Encontramos o modelo "${modelosEncontrados[0].nome}" relacionado a este tópico.`;
                } else {
                    const expressoes = Array.from(tagsGatilho).join(', ');
                    mensagem = `💡 Dica: Encontramos ${quantidade} modelos no acervo baseados na expressão (${expressoes}).`;
                }
                
                const DURACAO_TOAST_ORIGINAL_MS = 2800; 
                const MARGEM_SEGURANCA_MS = 400;
                
                setTimeout(() => {
                    exibirToast(mensagem, 'info');
                }, DURACAO_TOAST_ORIGINAL_MS + MARGEM_SEGURANCA_MS);
            }
            
        } catch (error) {
            console.warn("[Juris Notes] Verificação de acervo em background falhou:", error);
        }
    }, { timeout: 5000 });
}

function criarTopicoPrompt() {
    const nome = prompt('Digite o nome do Tópico Recursal:\n(ex: Admissibilidade, Mérito — Dano Moral, Honorários)');
    if (!nome || !nome.trim()) return;

    const nomeLimpo  = nome.trim();
    const duplicado  = topicos.some(t => t.nome.toLowerCase() === nomeLimpo.toLowerCase());

    if (duplicado) {
        exibirToast(`Já existe um tópico com o nome "${nomeLimpo}".`, 'aviso');
        return;
    }

    const cor = TopicsManager.obterCor(topicos.length);
    topicos.push({ id: 'topico-' + Date.now(), nome: nomeLimpo, cor, anotacoes: [] });

    renderizarTopicos();
    salvarBackupAutomatico();
    trocarAba('historico');
    exibirToast(`Tópico "${nomeLimpo}" criado.`);
    
    // Dispara a verificação de acervo de forma não bloqueante
    verificarAcervoEmSegundoPlano(nomeLimpo);
}

function renderizarTopicos() {
    TopicsManager.renderizarFichario(topicos);
    // [NOVO] Garante coerência visual após re-renderizações (ex: restauração de backup)
    if (window.atualizarStatusBotaoExtrator) window.atualizarStatusBotaoExtrator();
    
    // NOVO: Broadcast seguro enviando a variável EXPLICITAMENTE (Injeção de Dependência)
    if (window.BalancaManager && typeof window.BalancaManager.sincronizarTopicos === 'function') {
        window.BalancaManager.sincronizarTopicos(topicos);
    }
}

function capturarTrechoSelecionado() {
    const selection = window.getSelection();
    
    // [NOVO] Executa o Data Sanitization Pipeline antes de validar o length
    let selecaoTexto = selection.toString().trim();
    selecaoTexto = window.JurisUtils.limparTextoPDF(selecaoTexto);

    if (selecaoTexto.length <= 5) {
        exibirToast('Selecione um trecho válido no documento.', 'aviso');
        return;
    }

    const node = selection.anchorNode;
    if (!node) return;

    const element = node.nodeType === 3 ? node.parentNode : node;
    const pageContainer = element.closest('.pdf-page-container');

    if (!pageContainer) {
        exibirToast('A seleção deve estar dentro do PDF.', 'aviso');
        return;
    }

    const anchorPage = parseInt(pageContainer.dataset.pageNumber, 10);
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const containerRect = pageContainer.getBoundingClientRect();

    _tempHighlightState.rects = rects.map(r => ({
        top: r.top - containerRect.top,
        left: r.left - containerRect.left,
        width: r.width,
        height: r.height
    }));
    _tempHighlightState.paginaFisica = anchorPage;

    if (typeof exibirPopupClassificacao === 'function') {
        exibirPopupClassificacao('texto', selecaoTexto, rects[0].left, rects[0].bottom + 10, anchorPage);
    }
}

function identificarFaseMetodologica(docNome) {
    if (!docNome) return 4; 
    if (typeof DOC_CONFIG !== 'undefined') {
        const conf = DOC_CONFIG.find(d => d.label === docNome);
        if (conf) return conf.fase;
    }
    const upper = docNome.toUpperCase();
    if (upper.includes('RECURSO') || upper.includes('CONTRARRAZÕES')) return 1;
    if (upper.includes('INICIAL') || upper.includes('CONTEST') || upper.includes('IMPUGNAÇÃO')) return 2;
    if (upper.includes('SENTENÇA') || upper.includes('ACÓRDÃO') || upper.includes('DECISÃO') || upper.includes('EMBARGOS')) return 3;
    return 4; 
}

/**
 * Exclui um marco de extração com segurança de estado e atualiza a UI.
 */
window.excluirMarcadorExtracao = function(topicoId, docTipo, fronteira) {
    const fronteiraLabel = fronteira === 'inicio' ? 'INÍCIO' : 'FIM';
    if (!confirm(`Deseja apagar o marcador de ${fronteiraLabel} deste documento?`)) return;

    const topico = topicos.find(t => t.id === topicoId);
    if (!topico || !topico.marcosExtracao) return;

    // Mutação Segura: Filtra o array preservando imutabilidade estrutural
    topico.marcosExtracao = topico.marcosExtracao.filter(m => !(m.docTipo === docTipo && m.fronteira === fronteira));

    exibirToast(`Marcador de ${fronteiraLabel} excluído.`, 'sucesso');
    
    // Atualização em Cascata (Assíncrona para não bloquear a UI)
    requestAnimationFrame(() => {
        if (typeof salvarBackupAutomatico === 'function') salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
        if (window.atualizarStatusBotaoExtrator) window.atualizarStatusBotaoExtrator();
        // Re-renderiza o painel atualizado
        if (window.ExportManager && typeof window.ExportManager.abrirPainelExportacao === 'function') {
            window.ExportManager.abrirPainelExportacao();
        }
    });
};

async function salvarAnotacao(tipo, conteudo, documento, polo, topicoId, comentario = '', targetParentIndex = null, anchorPageOverride = null) {
    const capturedHighlights = (tipo === 'texto' || tipo === 'imagem') && _tempHighlightState.rects 
        ? structuredClone(_tempHighlightState.rects) : null;
    const capturedPagina = _tempHighlightState.paginaFisica;

    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    const pageTarget = anchorPageOverride || (capturedPagina ? capturedPagina : (window.PdfEngine ? PdfEngine.getCurrentPage() : 1));
    let metaDaPagina = { pjeId: null, flsNum: null };
    
    if (window.PdfEngine) {
        metaDaPagina = await PdfEngine.extrairMetadadosDaPagina(pageTarget);
    }
    
    const novaExtracao = {
        uuid: 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36),
        tipo,
        documento,
        polo,
        pagina: window.PdfEngine ? PdfEngine.obterRotuloPagina(pageTarget) : pageTarget, 
        paginaFisica: pageTarget, 
        timestamp: Date.now(),
        conteudo: conteudo,
        pjeId: metaDaPagina.pjeId,
        comentario: comentario
    };

    if (capturedHighlights) novaExtracao.highlightRects = capturedHighlights;

    const faseNova = identificarFaseMetodologica(documento);

    if (targetParentIndex !== null && targetParentIndex !== '') {
        const parentNode = topicoAlvo.anotacoes[targetParentIndex];
        if (!parentNode.itensCorrelacionados) parentNode.itensCorrelacionados = [];
        parentNode.itensCorrelacionados.push(novaExtracao);
        exibirToast(`Item agrupado à Ideia ${parseInt(targetParentIndex) + 1}.`);
    } else {
        novaExtracao.subAnotacoes = [];
        novaExtracao.itensCorrelacionados = [];
        
        const temFase2 = topicoAlvo.anotacoes.some(a => identificarFaseMetodologica(a.documento) === 2);
        if (faseNova === 3 && !temFase2) {
            exibirToast("Atenção: Você avançou para a Sentença. Já verificou a Inicial/Contestação?", "aviso");
        } else {
            exibirToast(`Anotação salva em "${topicoAlvo.nome}".`);
        }

        let insertIndex = topicoAlvo.anotacoes.length;
        for (let i = 0; i < topicoAlvo.anotacoes.length; i++) {
            if (identificarFaseMetodologica(topicoAlvo.anotacoes[i].documento) > faseNova) {
                insertIndex = i;
                break;
            }
        }
        topicoAlvo.anotacoes.splice(insertIndex, 0, novaExtracao);
    }

    if (capturedHighlights && capturedPagina) {
        if (window.getSelection) window.getSelection().removeAllRanges();
    }
    
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    renderizarTopicos();
    salvarBackupAutomatico();
}

/* ================================================
   NAVEGAÇÃO E UTILITÁRIOS DA INTERFACE
   ================================================ */
window.navegarParaAnotacao = function(topicoId, anotacaoIndex) {
    if (!document.getElementById('tab-historico').classList.contains('active')) {
        trocarAba('historico');
    }

    if (window.TopicsManager && TopicsManager.getActiveTabId() !== topicoId) {
        TopicsManager.setActiveTabId(topicoId);
        renderizarTopicos(); 
    }

    exibirToast('Localizando anotação no fichário...');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const scrollContainer = document.getElementById('history-container');
            const topicoTarget = topicos.find(t => t.id === topicoId);
            const uuidTarget = topicoTarget && topicoTarget.anotacoes[anotacaoIndex] ? topicoTarget.anotacoes[anotacaoIndex].uuid : null;
            const targetId = uuidTarget ? `timeline-wrapper-${uuidTarget}` : `timeline-wrapper-${anotacaoIndex}`;
            const targetElement = document.getElementById(targetId);

            if (!targetElement) {
                exibirToast('Não foi possível localizar o card alvo. Ele pode ter sido excluído.', 'erro');
                return;
            }

            if (scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const targetRect = targetElement.getBoundingClientRect();
                const offset = (targetRect.top - containerRect.top) + scrollContainer.scrollTop - 16;
                
                scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });

                const card = targetElement.querySelector('.main-card-wrapper > .annotation-card');
                if (card) {
                    card.classList.remove('card-flash-focus');
                    void card.offsetWidth; 
                    card.classList.add('card-flash-focus');
                }
            }
        });
    });
};

function irParaPagina() {
    const input = document.getElementById('goto-page-input');
    const termoBusca = input.value.trim().toLowerCase();
    
    if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
        exibirToast('Carregue um documento primeiro.', 'aviso');
        return;
    }
    
    if (!termoBusca) return;

    const targetPage = PdfEngine.resolverPagina(termoBusca);

    if (targetPage) {
        PdfEngine.goToPage(targetPage);
        input.value = '';
    } else {
        exibirToast(`Página não encontrada. Digite um número ou rótulo válido.`, 'erro');
    }
}

document.getElementById('goto-page-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') irParaPagina();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
        if (typeof cancelarRecorteWizard === 'function') cancelarRecorteWizard();
    }
});

document.addEventListener('click', function (e) {
    const popup = document.getElementById('classification-popup');
    if (popup && popup.style.display === 'flex' && !popup.contains(e.target) && !e.target.closest('.icon-btn')) {
        if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
    }
    const menu = document.getElementById('annotation-context-menu');
    if (menu) menu.style.display = 'none';

    const menuSub = document.getElementById('sub-annotation-context-menu');
    if (menuSub) menuSub.style.display = 'none';

    const menuJuris = document.getElementById('juris-menu');
    if (menuJuris && menuJuris.style.display === 'flex' && !menuJuris.contains(e.target) && !e.target.closest('.sidebar-logo-container')) {
        menuJuris.style.display = 'none';
    }

    const loginMenu = document.getElementById('login-menu');
    if (loginMenu && loginMenu.style.display === 'flex' && !loginMenu.contains(e.target) && !e.target.closest('#btn-login-user')) {
        loginMenu.style.display = 'none';
    }
});

/* ================================================
   MENU JURIS NOTES E GESTÃO DE ABAS
   ================================================ */
function abrirMenuJuris(event) {
    event.stopPropagation();
    const menu = document.getElementById('juris-menu');
    menu.style.display = 'flex';
    menu.style.left = (event.clientX + 10) + 'px';
    menu.style.top = (event.clientY + 20) + 'px';
}

function abrirModalGerenciarAbas() {
    document.getElementById('juris-menu').style.display = 'none';
    const container = document.getElementById('lista-abas-gerenciador');
    container.innerHTML = '';

    if(topicos.length === 0) {
        container.innerHTML = '<p class="popup-label" style="text-align:center;">Nenhuma aba criada.</p>';
    } else {
        let htmlAcumulado = '';
        topicos.forEach((t, index) => {
            const nomeSeguro = TopicsManager.escaparHTML(t.nome);
            htmlAcumulado += `
                <div class="aba-manager-item" draggable="true" 
                     data-index="${index}"
                     ondragstart="AbaDnD.start(event)"
                     ondragover="AbaDnD.over(event)"
                     ondrop="AbaDnD.drop(event)"
                     ondragenter="AbaDnD.enter(event)"
                     ondragleave="AbaDnD.leave(event)"
                     ondragend="AbaDnD.end(event)"
                     style="cursor: grab; transition: opacity 0.2s;">
                    <span class="aba-manager-nome" title="${nomeSeguro}">
                        <span style="color:#ccc; margin-right:6px; font-size:1.1rem; vertical-align: middle;">⋮⋮</span> ${nomeSeguro}
                    </span>
                    <div class="aba-manager-actions">
                        <button class="ann-action-btn" title="Editar Nome" onclick="renomearAba('${t.id}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="ann-action-btn ann-action-delete" title="Excluir Aba" onclick="solicitarExclusaoAba(this, '${t.id}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>`;
        });
        container.innerHTML = htmlAcumulado;
    }

    document.getElementById('abas-modal-backdrop').style.display = 'block';
    document.getElementById('modal-gerenciar-abas').style.display = 'flex';
}

function fecharModalGerenciarAbas() {
    document.getElementById('abas-modal-backdrop').style.display = 'none';
    document.getElementById('modal-gerenciar-abas').style.display = 'none';
}

function renomearAba(id) {
    const topico = topicos.find(t => t.id === id);
    if (!topico) return;
    const novoNome = prompt('Digite o novo nome para a aba:', topico.nome);
    if (novoNome && novoNome.trim() !== '') {
        topico.nome = novoNome.trim();
        renderizarTopicos();
        salvarBackupAutomatico();
        abrirModalGerenciarAbas(); 
        exibirToast('Aba renomeada com sucesso!', 'sucesso');
    }
}

function solicitarExclusaoAba(btnEl, id) {
    if (btnEl.dataset.confirming === "true") {
        topicos = topicos.filter(t => t.id !== id);
        renderizarTopicos();
        salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
        abrirModalGerenciarAbas(); 
        exibirToast('Aba excluída.', 'sucesso');
    } else {
        btnEl.dataset.confirming = "true";
        const svgOriginal = btnEl.innerHTML;
        btnEl.innerHTML = "<span style='font-size:0.75rem; font-weight:bold;'>Confirma?</span>";
        btnEl.style.color = "#c62828";
        btnEl.style.backgroundColor = "#ffebee";
        
        setTimeout(() => {
            if (document.body.contains(btnEl)) {
                btnEl.dataset.confirming = "false";
                btnEl.innerHTML = svgOriginal;
                btnEl.style.color = "";
                btnEl.style.backgroundColor = "";
            }
        }, 3500);
    }
}

window.handleMetaClick = function(event, topicoId, index, isCorrelated = false, cIdx = null) {
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const anotacao = isCorrelated 
        ? topico.anotacoes[index].itensCorrelacionados[cIdx] 
        : topico.anotacoes[index];

    if (event.shiftKey) {
        const novaPagina = prompt(`Editar folha (Atual: ${anotacao.pagina || 'vazio'}):`, anotacao.pagina || '');
        if (novaPagina !== null) {
            anotacao.pagina = novaPagina;
            renderizarTopicos();
            salvarBackupAutomatico();
            exibirToast('Numeração de página atualizada!', 'sucesso');
        }

    } else if (event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation(); 

        const targetPage = anotacao.paginaFisica;

        if (!targetPage || isNaN(targetPage)) {
            exibirToast('Esta anotação foi capturada em uma versão antiga e não possui âncora física.', 'aviso');
            return;
        }

        if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
            exibirToast('Carregue o PDF do processo para acessar a folha correspondente.', 'aviso');
            return;
        }

        const isAbaProcessoAtiva = document.getElementById('tab-leitura').classList.contains('active');
        if (!isAbaProcessoAtiva) {
            trocarAba('leitura');
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                PdfEngine.goToPage(targetPage);
            });
        });

    } else {
        let textoParaCopiar = event.target.innerText;

        if (anotacao.tipo === 'audio') {
            try {
                const dados = JSON.parse(anotacao.conteudo);
                textoParaCopiar = `(${dados.labelInicio} a ${dados.labelFim} da gravação da audiência)`;
            } catch (e) {
                console.warn("[Juris Notes] Falha ao processar metadados de áudio.", e);
            }
        }

        navigator.clipboard.writeText(textoParaCopiar).then(() => {
            exibirToast('Referência copiada para a área de transferência.', 'sucesso');
        }).catch(() => {
            exibirToast('Falha ao copiar texto.', 'erro');
        });
    }
};

function abrirModalAjuda() {
    const menuJuris = document.getElementById('juris-menu');
    if (menuJuris) menuJuris.style.display = 'none';
    document.getElementById('ajuda-modal-backdrop').style.display = 'block';
    document.getElementById('modal-ajuda-intencoes').style.display = 'flex';
}

function fecharModalAjuda() {
    document.getElementById('ajuda-modal-backdrop').style.display = 'none';
    document.getElementById('modal-ajuda-intencoes').style.display = 'none';
}

window.AbaDnD = {
    draggedIndex: null,
    start: function(e) {
        this.draggedIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
    },
    over: function(e) { 
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move'; 
    },
    enter: function(e) { 
        const item = e.currentTarget;
        item._dragCount = (item._dragCount || 0) + 1;
        item.style.borderTop = '3px dashed var(--trt-blue-mid)';
    },
    leave: function(e) { 
        const item = e.currentTarget;
        item._dragCount = (item._dragCount || 1) - 1;
        if (item._dragCount <= 0) {
            item.style.borderTop = '1px solid var(--border-color)';
            item._dragCount = 0;
        }
    },
    drop: function(e) {
        e.preventDefault();
        const targetElement = e.currentTarget.closest('.aba-manager-item');
        if (!targetElement) return;
        
        const targetIndex = parseInt(targetElement.dataset.index);
        if (this.draggedIndex === targetIndex) return;

        const [movido] = topicos.splice(this.draggedIndex, 1);
        topicos.splice(targetIndex, 0, movido);

        renderizarTopicos();
        salvarBackupAutomatico();
        exibirToast('Abas reordenadas com sucesso!', 'sucesso');
    },
    end: function(e) {
        e.currentTarget.style.opacity = '1';
        document.querySelectorAll('.aba-manager-item').forEach(el => {
            el.style.borderTop = '1px solid var(--border-color)';
            el._dragCount = 0;
        });
        if (typeof abrirModalGerenciarAbas === 'function') abrirModalGerenciarAbas(); 
    }
};

window.addEventListener('pageshow', (event) => {
    if (event.persisted && window.TopicsManager && topicos.length > 0) {
        TopicsManager.renderizarFichario(topicos);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (sessionStorage.getItem('juris_active_session') === 'true' && topicos.length === 0) {
            exibirToast('O navegador suspendeu esta aba e limpou a memória. Clique em "Retomar Processo" para carregar seu arquivo de backup.', 'erro');
            sessionStorage.removeItem('juris_active_session'); 
            return;
        }

        // Recuperação ativa e cirúrgica dos Canvases (Sem layout thrashing O(N))
        if (window.PdfEngine && window.PdfEngine.getPdfDoc && PdfEngine.getPdfDoc() && topicos.length > 0) {
            console.log("[JURIS LOG] Retornou à aba. Reconstruindo contexto das páginas na viewport...");
            // O(1) restrito às páginas ativas (Tracking via Set)
            PdfEngine.forcarReRenderizacaoVisiveis();
            
            // Re-renderização leve e síncrona do UI pararelo
            if(window.TopicsManager) TopicsManager.renderizarFichario(topicos);
        }
    }
});

/* ================================================
   CRIAÇÃO EXPLÍCITA DE BACKUP (Resolve erro de ativação)
   ================================================ */
async function acionarCriacaoBackup() {
    console.log("[JURIS LOG] Usuário clicou em criar backup. Iniciando FileSystem API...");
    
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: window._nomeArquivoSugerido || 'backup_processo.json',
            types: [{ description: 'Arquivo de Backup Juris Notes', accept: { 'application/json': ['.json'] } }]
        });
        
        console.log("[JURIS LOG] Permissão concedida pelo usuário. Handle capturado.");
        
        BackupManager.setFileHandle(handle);
        atualizarStatusBackup('Sessão Ativa ✓', true);
        sessionStorage.setItem('juris_active_session', 'true');
        
        await salvarBackupAutomatico();
        
        document.getElementById('backup-modal-backdrop').style.display = 'none';
        document.getElementById('modal-ativar-backup').style.display = 'none';
        exibirToast('Backup ancorado! Salvamento automático ativado.', 'sucesso');
        
    } catch (err) {
        console.error("[JURIS LOG FATAL] Falha ao criar arquivo de backup:");
        console.error("Nome do Erro:", err.name);
        console.error("Mensagem:", err.message);
        
        if (err.name === 'AbortError') {
            console.log("[JURIS LOG] O usuário cancelou a janela de salvar.");
            exibirToast('Você cancelou a criação do backup. Clique novamente para tentar.', 'aviso');
        } else if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            exibirToast('O navegador bloqueou a gravação. Verifique as permissões de download.', 'erro');
        } else {
            exibirToast('Erro desconhecido ao tentar criar o arquivo.', 'erro');
        }
    }
}

/* ================================================
   MÓDULO DE MEDIÇÃO DE EFICIÊNCIA (TIME TRACKER)
   ================================================ */
window.TimeTrackerManager = (function() {
    let _getTopicos = () => []; 
    
    let isHabilitado = false;
    let isRodando = false;
    let tempoSegundos = 0;
    let intervaloId = null;
    let complexidadeAtual = null;
    let marcosAtingidos = { excelente: false, bom: false, cautela: false };

    const limites = {
        simples: [45 * 60, 60 * 60, 90 * 60],
        medio: [60 * 60, 90 * 60, 105 * 60],
        complexo: [90 * 60, 120 * 60, 150 * 60]
    };

    function init(deps) {
        if (deps && typeof deps.getTopicos === 'function') {
            _getTopicos = deps.getTopicos;
        }
        
        // CORREÇÃO: Lê a posição da chavinha assim que o aplicativo inicia
        const toggleEl = document.getElementById('toggle-cronometro');
        if (toggleEl) {
            isHabilitado = toggleEl.checked;
        }
    }

    function toggleVisibility(fromToggle = false) {
        if (fromToggle) {
            const toggleEl = document.getElementById('toggle-cronometro');
            if (toggleEl) isHabilitado = toggleEl.checked;
        }
        
        const container = document.getElementById('efficiency-tracker-container');
        const isHistorico = document.body.dataset.activeTab === 'historico';
        const temTopico = _getTopicos().length > 0;
        
        const deveExibir = isHabilitado && isHistorico && temTopico;
        
        container.style.display = deveExibir ? 'flex' : 'none';
        if (deveExibir) sincronizarCor();
    }

    function handleClick() {
        document.getElementById('modal-tracker-backdrop').style.display = 'block';
        document.getElementById('modal-tracker-config').style.display = 'block';
        
        const svgIcon = isRodando 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; margin-right:6px; vertical-align:middle;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px; height:18px; margin-right:6px; vertical-align:middle;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';

        document.getElementById('tracker-modal-title').innerHTML = `${svgIcon} ${isRodando ? 'Pausar / Encerrar' : 'Iniciar Contagem'}`;
        document.getElementById('tracker-start-step').style.display = isRodando ? 'none' : 'block';
        document.getElementById('tracker-stop-step').style.display = isRodando ? 'block' : 'none';
    }

    function fecharModal() {
        document.getElementById('modal-tracker-backdrop').style.display = 'none';
        document.getElementById('modal-tracker-config').style.display = 'none';
    }

    function iniciar() {
        complexidadeAtual = document.getElementById('tracker-complexity-select').value;
        marcosAtingidos = { excelente: false, bom: false, cautela: false };
        isRodando = true;
        fecharModal();
        
        sincronizarCor();
        document.getElementById('efficiency-tracker-dot').classList.add('pulsing');
        
        const pill = document.getElementById('efficiency-tracker-pill');
        if (pill) pill.classList.remove('milestone-1', 'milestone-2', 'milestone-3');
        
        if (intervaloId) clearInterval(intervaloId);
        intervaloId = setInterval(tick, 1000);

        exibirToast(`Cronômetro ativado. Foco na análise!`, 'info');
    }

    function parar() {
        isRodando = false;
        if (intervaloId) clearInterval(intervaloId);
        fecharModal();
        
        const dot = document.getElementById('efficiency-tracker-dot');
        const pill = document.getElementById('efficiency-tracker-pill');
        
        if(dot) {
            dot.classList.remove('pulsing');
            dot.style.backgroundColor = '#ccc';
            dot.style.boxShadow = 'none';
        }
        
        if(pill) {
            pill.classList.remove('milestone-1', 'milestone-2', 'milestone-3');
        }
        
        const tempoFinal = document.getElementById('efficiency-tracker-time').textContent;
        exibirToast(`Tópico concluído. Tempo de tela: ${tempoFinal}`, 'sucesso');
        
        tempoSegundos = 0;
        atualizarDisplay();
    }

    function tick() {
        tempoSegundos++;
        atualizarDisplay();
        verificarMarcos();
    }

    function atualizarDisplay() {
        const timeEl = document.getElementById('efficiency-tracker-time');
        if(!timeEl) return;

        const h = Math.floor(tempoSegundos / 3600);
        const m = Math.floor((tempoSegundos % 3600) / 60);
        const s = tempoSegundos % 60;
        
        let texto = '';
        if (h > 0) texto += `${h.toString().padStart(2, '0')}:`;
        texto += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        timeEl.textContent = texto;
    }

    function verificarMarcos() {
        if (!complexidadeAtual) return;
        const metas = limites[complexidadeAtual];
        const pill = document.getElementById('efficiency-tracker-pill');
        if (!pill) return;

        if (tempoSegundos === metas[0] && !marcosAtingidos.excelente) {
            pill.classList.add('milestone-1');
            marcosAtingidos.excelente = true;
        } 
        else if (tempoSegundos === metas[1] && !marcosAtingidos.bom) {
            pill.classList.remove('milestone-1');
            pill.classList.add('milestone-2');
            marcosAtingidos.bom = true;
        } 
        else if (tempoSegundos === metas[2] && !marcosAtingidos.cautela) {
            pill.classList.remove('milestone-2');
            pill.classList.add('milestone-3');
            marcosAtingidos.cautela = true;
        }
    }

    function sincronizarCor() {
        if (!isHabilitado) return;
        
        const topicosData = _getTopicos();
        const activeTabId = typeof TopicsManager !== 'undefined' ? TopicsManager.getActiveTabId() : null;
        let cor = '#ccc'; 
        
        if (activeTabId && topicosData.length > 0) {
            const topico = topicosData.find(t => t.id === activeTabId);
            if (topico && topico.cor) cor = topico.cor;
        }

        const pill = document.getElementById('efficiency-tracker-pill');
        const dot = document.getElementById('efficiency-tracker-dot');
        
        if (pill) {
            pill.style.setProperty('--tracker-color', cor);
        }

        if (isRodando && dot) {
            dot.style.backgroundColor = cor;
            dot.style.boxShadow = `0 0 8px ${cor}`;
        }
    }

    return { init, toggleVisibility, handleClick, fecharModal, iniciar, parar, sincronizarCor };
})();

/* ================================================
   [NOVO] Validador de Estado do Extrator (Escopo: Tópico Ativo)
   ================================================ */
window.atualizarStatusBotaoExtrator = function() {
    const btn = document.getElementById('btn-ferramenta-extrator');
    if (!btn) return;

    // Remove o destaque caso não haja aba ativa
    const activeTabId = typeof TopicsManager !== 'undefined' ? TopicsManager.getActiveTabId() : null;
    if (!activeTabId) {
        btn.classList.remove('extrator-completo');
        return;
    }

    const topico = topicos.find(t => t.id === activeTabId);
    if (!topico || !topico.marcosExtracao || topico.marcosExtracao.length === 0) {
        btn.classList.remove('extrator-completo');
        return;
    }

    // Flags para espelhar a exata regra do gerador de payload da IA
    let hasSentencaInicio = false, hasSentencaFim = false;
    let hasRecursoInicio = false, hasRecursoFim = false;

    topico.marcosExtracao.forEach(m => {
        // A lógica espelha: if (docTipo === 'sentenca') { ... } else { /* é recurso */ }
        if (m.docTipo === 'sentenca') {
            if (m.fronteira === 'inicio') hasSentencaInicio = true;
            if (m.fronteira === 'fim') hasSentencaFim = true;
        } else {
            if (m.fronteira === 'inicio') hasRecursoInicio = true;
            if (m.fronteira === 'fim') hasRecursoFim = true;
        }
    });

    if (hasSentencaInicio && hasSentencaFim && hasRecursoInicio && hasRecursoFim) {
        btn.classList.add('extrator-completo');
        btn.title = 'Contexto Completo! (Sentença e Recurso mapeados)';
    } else {
        btn.classList.remove('extrator-completo');
        btn.title = 'Alfinete de Extração (Marcar Início/Fim para IA)';
    }
};