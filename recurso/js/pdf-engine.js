/* ================================================
   MOTOR DE RENDERIZAÇÃO DE PDF E METADADOS
   Módulo isolado para gestão do PDF.js, Canvas e DOM do Inteiro Teor
   ================================================ */
window.PdfEngine = (function () {
    'use strict';

    // Estado Privado do Motor
    let _pdfDoc = null;
    let _currentPage = 1;
    let _pageLabelsGlobais = null;
    const _pageMetadataCache = new Map();
    let _pdfRenderObserver = null;
    let _pdfReadTracker = null;
    let _pdfDestroyObserver = null;
    const _activePages = new Set();

    // Dependências Injetadas pelo app.js (Inversão de Controle)
    let _deps = {
        getTopicos: () => [],
        exibirToast: () => {},
        atualizarDisplayPaginador: () => {},
        validarPdf: async () => true,
        iniciarSessaoBackup: async () => {},
        habilitarFerramentas: () => {},
        onPdfCarregado: async () => {}
    };

    function init(dependencies) {
        _deps = { ..._deps, ...dependencies };
    }

    /* ================================================
       MOCK COMPLETO DO LINKSERVICE (Compatível PDF.js V4)
       ================================================ */
    const jurisLinkService = {
        externalLinkEnabled: true,
        externalLinkRel: 'noopener noreferrer nofollow',
        externalLinkTarget: 2,
        
        goToDestination: async function(dest) {
            console.group('🔵 [Diagnóstico LinkService] Gatilho Acionado!');
            if (!_pdfDoc) {
                console.error('Falha: Documento PDF não está disponível no escopo.');
                console.groupEnd();
                return;
            }
            try {
                let explicitDest = dest;
                if (typeof dest === 'string') {
                    explicitDest = await _pdfDoc.getDestination(dest);
                }
                if (Array.isArray(explicitDest)) {
                    const pageRef = explicitDest[0];
                    let pageNum;
                    
                    if (typeof pageRef === 'object' && pageRef !== null) {
                        const pageIndex = await _pdfDoc.getPageIndex(pageRef);
                        pageNum = pageIndex + 1; 
                    } else if (Number.isInteger(pageRef)) {
                        pageNum = pageRef + 1;
                    }
                    if (pageNum) this.goTo(pageNum);
                }
            } catch (e) {
                console.error('Exceção crítica na resolução do link:', e);
            }
            console.groupEnd();
        },
        
        goTo: function(pageNum) {
            const pageContainer = document.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
            const scrollContainer = document.getElementById('pdf-container');
            
            if (pageContainer && scrollContainer) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const pageRect = pageContainer.getBoundingClientRect();
                const targetScrollTop = scrollContainer.scrollTop + (pageRect.top - containerRect.top) - 16;
                
                scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'auto' });
                _deps.exibirToast(`Acessando fl. ${pageNum} via sumário.`, 'sucesso');
            } else {
                _deps.exibirToast('Página alvo não encontrada no DOM.', 'erro');
            }
        },
        
        getDestinationHash: function(dest) { return ''; },
        getAnchorUrl: function(hash) { return ''; },
        setDocument: function(doc) {},
        executeNamedAction: function(action) { console.log('[JurisNotes] Ação interna:', action); }
    };

    /* ================================================
       METADADOS E BUSCA DE PÁGINAS
       ================================================ */
    function getDisplayLabel(pageNum) {
        const meta = _pageMetadataCache.get(pageNum);
        if (meta && meta.flsNum) return meta.flsNum;
        if (_pageLabelsGlobais && _pageLabelsGlobais[pageNum - 1]) return _pageLabelsGlobais[pageNum - 1];
        return pageNum;
    }

    function obterRotuloPagina(paginaFisica) {
        return getDisplayLabel(paginaFisica);
    }

    function resolverPagina(termoBusca) {
        let pageNum = parseInt(termoBusca, 10);
        let encontradoNoCache = false;
        
        for (const [key, value] of _pageMetadataCache.entries()) {
            if (value.flsNum === termoBusca) {
                pageNum = key;
                encontradoNoCache = true;
                break;
            }
        }

        if (!encontradoNoCache && _pageLabelsGlobais) {
            const indexEncontrado = _pageLabelsGlobais.findIndex(label => 
                label && label.toString().trim().toLowerCase() === termoBusca
            );
            if (indexEncontrado !== -1) {
                pageNum = indexEncontrado + 1;
            }
        }

        if (isNaN(pageNum) || pageNum < 1 || pageNum > _pdfDoc.numPages) {
            return null;
        }
        return pageNum;
    }

    async function extrairMetadadosDaPagina(pageNum, textContentPreCarregado = null) {
        if (_pageMetadataCache.has(pageNum)) return _pageMetadataCache.get(pageNum);
        
        try {
            const page = await _pdfDoc.getPage(pageNum);
            const textContent = textContentPreCarregado || await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const items = textContent.items;

            const fullTextNormal = items.map(item => item.str).join(' ');
            const regexPje = /\d{2}:\d{2}:\d{2}\s*-\s*([a-f0-9]{7,})\b/i;
            const matchPje = fullTextNormal.match(regexPje);
            const pjeId = matchPje ? matchPje[1].toLowerCase() : null;
            
            const topRightItems = items.filter(item => {
                const x = item.transform[4]; 
                const y = item.transform[5]; 
                return x > (viewport.width * 0.4) && y > (viewport.height * 0.6);
            });

            const topRightText = topRightItems.map(item => item.str).join(' ');
            const regexFlsRigida = /\bfls\.?\s*:\s*(\d+)\b/i;
            const matchFls = topRightText.match(regexFlsRigida);
            const flsNum = matchFls ? matchFls[1] : null;

            const resultado = { pjeId, flsNum };
            _pageMetadataCache.set(pageNum, resultado);
            
            return resultado;
        } catch (err) {
            console.error('Falha ao extrair metadados físicos da página:', err);
            return { pjeId: null, flsNum: null };
        }
    }

    /* ================================================
       EXTRAÇÃO MATEMÁTICA DE TEXTO POR REGIÃO (ALFINETE)
       ================================================ */
    
    // Função utilitária para liberar a Main Thread (macro-task)
    const _yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    async function extrairTextoPorRegiao(marcoInicio, marcoFim, onProgress = null) {
        if (!_pdfDoc) return "";
        
        // LOCK DE INTEGRIDADE: Captura a instância atual do documento
        const targetPdfInstance = _pdfDoc;
        let textoExtraido = "";
        
        const pInicio = Math.min(marcoInicio.pagina, marcoFim.pagina);
        const pFim = Math.max(marcoInicio.pagina, marcoFim.pagina);
        
        // Garante que o Y Inicial corresponde à página inicial correta (caso o usuário inverta a ordem de marcação)
        const yInicioDOM = (pInicio === marcoInicio.pagina) ? marcoInicio.offsetY : marcoFim.offsetY;
        const yFimDOM = (pFim === marcoFim.pagina) ? marcoFim.offsetY : marcoInicio.offsetY;
        
        const totalPaginas = (pFim - pInicio) + 1;
        
        // Inicia o cronômetro para o Time Budget
        let lastYieldTime = performance.now();
        const TIME_BUDGET_MS = 40; // Limiar de bloqueio aceitável

        for (let i = pInicio; i <= pFim; i++) {
            // VALIDAÇÃO DE ESTADO: Verifica se o usuário trocou o PDF durante um yield
            if (_pdfDoc !== targetPdfInstance) {
                throw new Error("CONCURRENCY_VIOLATION: O documento original foi alterado durante a extração.");
            }

            const page = await _pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // Mesma escala do renderizador visual
            const textContent = await page.getTextContent();
            
            // CONVERSÃO CIENTÍFICA: PDF.js 'y' cresce de baixo pra cima. 
            const pdfTopBound = (i === pInicio) ? (viewport.height - yInicioDOM) : viewport.height;
            const pdfBottomBound = (i === pFim) ? (viewport.height - yFimDOM) : 0;

            let textoPagina = textContent.items
                .filter(item => {
                    const textY = item.transform[5];
                    // Aceita texto que está ABAIXO do limite superior e ACIMA do limite inferior
                    return textY <= pdfTopBound && textY >= pdfBottomBound;
                })
                .map(item => item.str)
                .join(' ');
                
            textoExtraido += textoPagina + " \n\n ";

            if (onProgress) {
                try {
                    const atual = (i - pInicio) + 1;
                    onProgress(atual, totalPaginas);
                } catch (e) {
                    console.warn("[PdfEngine] Erro silenciado no callback de progresso UI.", e);
                }
            }

            // GESTÃO DE PERFORMANCE: Só cede o controle se estourou o orçamento de tempo
            if (performance.now() - lastYieldTime > TIME_BUDGET_MS) {
                await _yieldToMain();
                lastYieldTime = performance.now(); // Reseta o cronômetro
            }
        }
        return textoExtraido;
    }

    /* ================================================
       CARREGAMENTO DE ARQUIVO E RENDERIZAÇÃO
       ================================================ */
    async function carregarPDF(file, isRetomada) {
        if (!file) return;

        const fileReader = new FileReader();

        fileReader.onload = async function () {
            const arrayBuffer = this.result;

            if (isRetomada) {
                const hashValido = await _deps.validarPdf(arrayBuffer);
                if (!hashValido) {
                    _deps.exibirToast('PDF incorreto ou corrompido para este processo. Selecione o arquivo correto.', 'erro');
                    const uploadInput = document.getElementById('pdf-upload');
                    uploadInput.value = '';
                    setTimeout(() => uploadInput.click(), 1500);
                    return;
                }
            }

            if (!isRetomada) {
                await _deps.iniciarSessaoBackup(file.name, arrayBuffer);
            }

            const typedarray = new Uint8Array(arrayBuffer);

            pdfjsLib.getDocument(typedarray).promise
                .then(async pdf => {
                    _pdfDoc = pdf;
                    document.getElementById('total-page-display').textContent = pdf.numPages;

                    try {
                        _pageLabelsGlobais = await pdf.getPageLabels();
                    } catch (e) {
                        _pageLabelsGlobais = null;
                    }

                    _deps.habilitarFerramentas();

                    const wrapper = document.getElementById('pdf-wrapper');
                    wrapper.innerHTML = '';
                    wrapper.style.display = 'flex';
                    document.getElementById('pdf-placeholder').style.display = 'none';
                    document.getElementById('floating-page-panel').style.display = 'flex';

                    if (_pdfRenderObserver) _pdfRenderObserver.disconnect();
                    if (_pdfDestroyObserver) _pdfDestroyObserver.disconnect();
                    _activePages.clear();

                    // Observer 1: Renderiza cedo (800px)
                    _pdfRenderObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting && entry.target.dataset.loaded === 'false') {
                                const pageNum = parseInt(entry.target.dataset.pageNumber);
                                renderizarPaginaElemento(pageNum, entry.target);
                                entry.target.dataset.loaded = 'true';
                            }
                        });
                    }, { root: document.getElementById('pdf-container'), rootMargin: '800px 0px', threshold: 0 });

                    // Observer 2: Destrói tarde (Histerese de 3000px)
                    _pdfDestroyObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            const container = entry.target;
                            if (entry.isIntersecting) {
                                _activePages.add(container);
                            } else {
                                _activePages.delete(container);
                                if (container.dataset.loaded === 'true') {
                                    descarregarPaginaElemento(container);
                                    container.dataset.loaded = 'false';
                                }
                            }
                        });
                    }, { root: document.getElementById('pdf-container'), rootMargin: '3000px 0px', threshold: 0 });

                    if (_pdfReadTracker) _pdfReadTracker.disconnect();
                    _pdfReadTracker = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const pageNum = parseInt(entry.target.dataset.pageNumber);
                                _currentPage = pageNum;
                                _deps.atualizarDisplayPaginador(pageNum);
                            }
                        });
                    }, { root: document.getElementById('pdf-container'), rootMargin: '-15% 0px -80% 0px', threshold: 0 });

                    const firstPage = await pdf.getPage(1);
                    const viewportCSS = firstPage.getViewport({ scale: 1.5 });

                    try {
                        const textContentFirstPage = await firstPage.getTextContent();
                        // 1. Higieniza o texto (remove espaços para evitar erros de leitura do PDF)
                        const rawString = textContentFirstPage.items.map(item => item.str).join('');
                        const sanitizedString = rawString.replace(/\s+/g, '');

                        // 2. Regex atualizada para capturar 3 grupos: Sequencial, Dígito e Ano
                    const cnjRegex = /(\d{7})[-]?(\d{2})\.?(\d{4})\.?\d\.?\d{2}\.?\d{4}/;
                    const match = sanitizedString.match(cnjRegex);

                    if (match && typeof _deps.onProcessoIdentificado === 'function') {
                        // Modificação: Em vez de parseInt, aplicamos slice(-4) na string de 7 dígitos.
                        // Isso preserva os zeros necessários para formar 4 casas decimais.
                        const sequencialLimpo = match[1].slice(-4); 
                        const digito = match[2];
                        const ano = match[3];

                        // Monta o formato ultra-curto (Ex: 0541-68.2025)
                        const numeroUltraCurto = `${sequencialLimpo}-${digito}.${ano}`; 
                        
                        _deps.onProcessoIdentificado(numeroUltraCurto);
                    }
                    } catch (err) {
                        console.warn("[Juris Notes] Falha ao tentar capturar o número do processo na capa.", err);
                    }

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const pageContainer = document.createElement('div');
                        pageContainer.className = 'pdf-page-container';
                        pageContainer.dataset.pageNumber = i;
                        pageContainer.dataset.loaded = 'false';
                        pageContainer.style.cssText = `
                            width: ${viewportCSS.width}px;
                            height: ${viewportCSS.height}px;
                            position: relative;
                            margin-bottom: 24px;
                            background-color: var(--pdf-bg-color);
                            box-shadow: var(--shadow-md);
                        `;
                        wrapper.appendChild(pageContainer);
                        
                        _pdfRenderObserver.observe(pageContainer);
                        _pdfDestroyObserver.observe(pageContainer);
                        _pdfReadTracker.observe(pageContainer);
                    }

                    await _deps.onPdfCarregado(isRetomada);
                })
                .catch(err => {
                    console.error('Erro ao processar PDF:', err);
                    _deps.exibirToast('Erro ao ler o PDF. Verifique a integridade do arquivo.', 'erro');
                });
        };

        fileReader.readAsArrayBuffer(file);
    }

    async function renderizarPaginaElemento(num, container) {
        if (!_pdfDoc) return;

        if (container._renderTask) container._renderTask.cancel();
        container.innerHTML = '';

        const page = await _pdfDoc.getPage(num);
        container._pdfPageRef = page; // Salva referência para GC granular
        const dpr = window.devicePixelRatio || 1;
        const scale = 1.5;
        const viewport = page.getViewport({ scale: scale });

        container.style.width = Math.floor(viewport.width) + 'px';
        container.style.height = Math.floor(viewport.height) + 'px';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';
        container.appendChild(canvas);

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.setProperty('--scale-factor', viewport.scale);
        container.appendChild(textLayer);

        container._renderTask = page.render({
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        });

        try {
            await container._renderTask.promise;
            
            const textContent = await page.getTextContent();
            const tl = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport: viewport
            });
            await tl.render();

            const highlightLayerDiv = document.createElement('div');
            highlightLayerDiv.className = 'highlightLayer';
            highlightLayerDiv.style.setProperty('--scale-factor', viewport.scale);
            container.appendChild(highlightLayerDiv);

            _renderizarHighlightsDaPagina(num, highlightLayerDiv);

            if (!_pageMetadataCache.has(num)) {
                extrairMetadadosDaPagina(num, textContent).then(() => {
                    _deps.atualizarDisplayPaginador(num);
                });
            }

            const annotationData = await page.getAnnotations();
            if (annotationData && annotationData.length > 0 && container.contains(textLayer)) {
                const annotationLayerDiv = document.createElement('div');
                annotationLayerDiv.className = 'annotationLayer';
                annotationLayerDiv.style.setProperty('--scale-factor', viewport.scale);
                container.appendChild(annotationLayerDiv);

                const annotationLayer = new pdfjsLib.AnnotationLayer({
                    page: page,
                    viewport: viewport,
                    div: annotationLayerDiv,
                    linkService: jurisLinkService,
                    renderInteractiveForms: false 
                });

                await annotationLayer.render({ 
                    annotations: annotationData,
                    viewport: viewport, 
                    intent: 'display',
                    linkService: jurisLinkService 
                });
            }
        } catch (err) {
            if (err.name !== 'RenderingCancelledException') {
                console.error('Erro ao renderizar página PDF:', err);
            }
        } finally {
            container._renderTask = null;
        }
    }

    /* ================================================
       HIGHLIGHTS E MARCAÇÕES (DOM ISOLADO)
       ================================================ */
    function _renderizarHighlightsDaPagina(pageNum, highlightLayerDiv) {
        highlightLayerDiv.innerHTML = ''; 
        const topicos = _deps.getTopicos();
        
        topicos.forEach(topico => {
            const borderCor = topico.cor;

            const desenharMarcacoes = (itens, parentIndex) => {
                if (!itens) return;
                itens.forEach((item, idx) => {
                    const numIdeia = (parentIndex !== undefined ? parentIndex : idx) + 1;

                    if ((item.tipo === 'texto' || item.tipo === 'imagem') && item.paginaFisica === pageNum && item.highlightRects && item.highlightRects.length > 0) {
                        const firstRect = item.highlightRects[0];
                        const badge = document.createElement('div');
                        badge.className = 'pdf-annotation-badge';
                        badge.style.backgroundColor = topico.cor;
                        if (window.TopicsManager && typeof window.TopicsManager.obterCorContraste === 'function') {
                            badge.style.color = window.TopicsManager.obterCorContraste(topico.cor);
                        }
                        badge.innerText = numIdeia;

                        if (item.tipo === 'texto') {
                            item.highlightRects.forEach(rect => {
                                const marker = document.createElement('div');
                                marker.className = 'pdf-highlight-rect';
                                marker.style.top = rect.top + 'px';
                                marker.style.left = rect.left + 'px';
                                marker.style.width = rect.width + 'px';
                                marker.style.height = rect.height + 'px';
                                marker.style.borderBottom = `2.5px solid ${borderCor}`;
                                highlightLayerDiv.appendChild(marker);
                            });
                            badge.style.top = (firstRect.top + (firstRect.height / 2)) + 'px';
                            badge.style.transform = 'translateY(-50%)'; 
                        } else if (item.tipo === 'imagem') {
                            item.highlightRects.forEach(rect => {
                                const marker = document.createElement('div');
                                marker.className = 'pdf-highlight-rect';
                                marker.style.top = rect.top + 'px';
                                marker.style.left = rect.left + 'px';
                                marker.style.width = rect.width + 'px';
                                marker.style.height = rect.height + 'px';
                                marker.style.border = `1.5px dashed ${borderCor}`;
                                highlightLayerDiv.appendChild(marker);
                            });
                            badge.style.top = firstRect.top + 'px';
                            badge.style.right = 'auto';
                            badge.style.left = Math.max(4, firstRect.left - 28) + 'px';
                        }
                        
                        badge.addEventListener('mouseenter', (e) => {
                            const tooltip = document.getElementById('quick-intent-tooltip');
                        if (!tooltip) return;
                        tooltip.innerHTML = `<strong>Tópico Vinculado</strong>${topico.nome}<br><span style="font-size:0.75rem; color:#aab; display:block; margin-top:4px;">(Ctrl + Clique para acessar a anotação)</span>`;
                        tooltip.style.display = 'block';
                        tooltip.classList.remove('visible');
                        
                        let x = e.clientX + 15;
                        let y = e.clientY + 15;
                        const rect = tooltip.getBoundingClientRect();
                        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
                        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 15;
                        
                        tooltip.style.left = `${x}px`;
                        tooltip.style.top = `${y}px`;
                        requestAnimationFrame(() => tooltip.classList.add('visible'));
                    });
                    
                    badge.addEventListener('mouseleave', () => {
                        const tooltip = document.getElementById('quick-intent-tooltip');
                        if (tooltip) {
                            tooltip.classList.remove('visible');
                            setTimeout(() => { tooltip.style.display = 'none'; }, 200);
                        }
                    });

                    // Gatilho de Viagem (Navegação Reversa)
                    badge.addEventListener('click', (e) => {
                        if (e.ctrlKey && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation(); // Bloqueia propagação p/ o container e popups indesejados
                            
                            if (window.navegarParaAnotacao) {
                                const indiceDestino = parentIndex !== undefined ? parentIndex : idx;
                                window.navegarParaAnotacao(topico.id, indiceDestino);
                            }
                        }
                    });

                    highlightLayerDiv.appendChild(badge);
                    }
                    if (item.itensCorrelacionados) {
                        desenharMarcacoes(item.itensCorrelacionados, parentIndex !== undefined ? parentIndex : idx);
                    }
                });
            };
            desenharMarcacoes(topico.anotacoes);

        // [NOVO] Renderização dos Alfinetes de Extração (Dumb Components)
        if (topico.marcosExtracao && topico.marcosExtracao.length > 0) {
            topico.marcosExtracao.forEach(marco => {
                if (marco.pagina === pageNum) {
                    const pin = document.createElement('div');
                    pin.className = 'pdf-extrator-pin'; 
                    pin.style.top = marco.offsetY + 'px';
                    pin.style.borderColor = topico.cor; 
                    pin.style.color = topico.cor; 
                    
                    // DATA-ATTRIBUTES para a Event Delegation (Performance)
                    pin.dataset.tooltipFronteira = marco.fronteira;
                    pin.dataset.tooltipDoc = marco.docTipo;
                    pin.dataset.tooltipTopico = topico.nome;

                    pin.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 11.78L20.24 16H13v6l-1 2-1-2v-6H3.76L8 11.78V4h1V2h6v2h1v7.78z"></path></svg>`;

                    highlightLayerDiv.appendChild(pin);
                }
            });
        }
    });
}

    function sincronizarHighlightsGerais() {
        document.querySelectorAll('.pdf-page-container').forEach(container => {
            if (container.dataset.loaded === 'true') {
                const pageNum = parseInt(container.dataset.pageNumber);
                const highlightLayerDiv = container.querySelector('.highlightLayer');
                if (highlightLayerDiv) {
                    _renderizarHighlightsDaPagina(pageNum, highlightLayerDiv);
                }
            }
        });
    }

    /* ================================================
       OTIMIZAÇÃO DE MEMÓRIA (GARBAGE COLLECTION) E RECUPERAÇÃO
       ================================================ */
    function descarregarPaginaElemento(container) {
        if (container._renderTask) {
            container._renderTask.cancel();
            container._renderTask = null;
        }
        container.innerHTML = '';
        
        // Limpeza granular O(1) de cache na API do PDF.js 
        // (Libera Memória VRAM e Bitmap sem destruir o Parser Global)
        if (container._pdfPageRef && typeof container._pdfPageRef.cleanup === 'function') {
            try { container._pdfPageRef.cleanup(); } catch(e){}
            container._pdfPageRef = null;
        }
    }

    function forcarReRenderizacaoVisiveis() {
        if (!_pdfDoc) return;
        // Travessia assintótica de O(N=4000) reduzida para O(K=~15)
        _activePages.forEach(container => {
            const canvas = container.querySelector('canvas');
            // Se o navegador ceifou o contexto do Canvas na suspensão da aba
            if (!canvas || canvas.width === 0) {
                descarregarPaginaElemento(container);
                renderizarPaginaElemento(parseInt(container.dataset.pageNumber), container);
                container.dataset.loaded = 'true';
            }
        });
    }

    function encerrar() {
        if (_pdfRenderObserver) {
            _pdfRenderObserver.disconnect();
            _pdfRenderObserver = null;
        }
        if (_pdfDestroyObserver) {
            _pdfDestroyObserver.disconnect();
            _pdfDestroyObserver = null;
        }
        if (_pdfReadTracker) {
            _pdfReadTracker.disconnect();
            _pdfReadTracker = null;
        }
        _activePages.clear();
        _pdfDoc = null;
        _pageLabelsGlobais = null;
        _pageMetadataCache.clear();
        _currentPage = 1;
    }

    return {
            init,
            carregarPDF,
            sincronizarHighlightsGerais,
            obterRotuloPagina,
            getDisplayLabel,
            extrairMetadadosDaPagina,
            extrairTextoPorRegiao,
            resolverPagina,
            goToPage: jurisLinkService.goTo,
            getPdfDoc: () => _pdfDoc,
            getCurrentPage: () => _currentPage,
            forcarReRenderizacaoVisiveis,
            encerrar
        };
    })();