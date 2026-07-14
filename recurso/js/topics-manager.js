/* ================================================
   topics-manager.js  —  v2.0
   Gerenciador do Fichário de Tópicos e Anotações
   ================================================ */
window.TopicsManager = (function () {
    'use strict';

    let _activeTopicoCor = '#ffffff';

    // Observer Otimizado (Debounce de ~16ms para agrupar Recalculate Styles)
    let _layoutDebounceTimer = null;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(_layoutDebounceTimer);
        _layoutDebounceTimer = setTimeout(() => {
            requestAnimationFrame(() => {
                const container = document.getElementById('timeline-container');
                if (container) {
                    posicionarNosDeIdeia(container);
                    requestAnimationFrame(() => desenharConexoes());
                }
            });
        }, 16); 
    });

    // Funções Privadas do Zen Mode
    function _ativarZenMode(card) {
        // ARQUITETURA: Uso intencional de Short-Circuit.
        // 1. Tenta achar o container se for um Nó de Ideia (.sub-annotation-item).
        // 2. Fallback: Se for um Card Mestre ou Correlacionado, pega o grupo raiz (.main-card-wrapper).
        const item = card.closest('.sub-annotation-item') || card.closest('.main-card-wrapper');
        const contentArea = document.getElementById('topics-tab-content');
        if (!contentArea || !item) return;

        contentArea.classList.add('zen-mode-ativo');
        item.classList.add('is-zen-focused');
        card.classList.add('zen-focused');

        const scrollContainer = document.getElementById('history-container');
        if (scrollContainer) {
            setTimeout(() => {
                const containerRect = scrollContainer.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                const offset = (cardRect.top - containerRect.top) + scrollContainer.scrollTop 
                               - (scrollContainer.clientHeight / 2) + (cardRect.height / 2);
                scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
            }, 100);
        }
    }

    function _fecharZenModeAtivo() {
        const contentArea = document.getElementById('topics-tab-content');
        if (!contentArea) return;

        contentArea.classList.remove('zen-mode-ativo');
        document.querySelectorAll('.is-zen-focused').forEach(el => el.classList.remove('is-zen-focused'));
        document.querySelectorAll('.zen-focused').forEach(el => {
            el.classList.remove('zen-focused');
            const btn = el.querySelector('.btn-expand-text');
            const txt = el.querySelector('.sub-text-content, .card-texto');
            if (txt && txt.classList.contains('expanded')) {
                txt.classList.remove('expanded');
                if (btn) btn.innerHTML = 'Ler texto completo ▾';
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.querySelector('.zen-focused')) {
            _fecharZenModeAtivo();
            // Restaura o layout com o motor de animação sincronizado
            requestAnimationFrame(() => {
                const container = document.getElementById('timeline-container');
                if (container) {
                    requestAnimationFrame(() => _sincronizarConexoesComAnimacao(container));
                }
            });
        }
    });

    document.addEventListener('click', (e) => {
        const contentArea = document.getElementById('topics-tab-content');
        if (contentArea && contentArea.classList.contains('zen-mode-ativo')) {
            // Alterado de .is-zen-focused para .zen-focused para destravar o fechamento clicando nos fundos esmaecidos
            if (!e.target.closest('.zen-focused') && !e.target.closest('.btn-expand-text')) {
                _fecharZenModeAtivo();
                requestAnimationFrame(() => {
                    const container = document.getElementById('timeline-container');
                    if (container) _sincronizarConexoesComAnimacao(container);
                });
            }
        }
    });

    function obterCorContraste(hex) {
        if (!hex || !hex.startsWith('#')) return '#ffffff';
        let cleanHex = hex.replace('#', '');
        if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(c => c + c).join('');
        const r = parseInt(cleanHex.substr(0, 2), 16);
        const g = parseInt(cleanHex.substr(2, 2), 16);
        const b = parseInt(cleanHex.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#1a1a1a' : '#ffffff';
    }

    /**
     * Sanitizador de HTML — previne XSS ao interpolar dados do usuário
     * em template literals. Escapa os 5 metacaracteres fundamentais do HTML.
     * @param {string} str - String bruta (input do usuário ou dado de backup).
     * @returns {string} String segura para inserção em innerHTML.
     */
    function escaparHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderizarMarkdownSeguro(strEscapada) {
        if (!strEscapada) return '';
        let processado = strEscapada;
        
        // FIX: [\s\S]*? engloba quebras de linha (\n)
        processado = processado.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');
        
        // NOVA SINTAXE: Renderização de Tipografia
        processado = processado.replace(/\[\[size:1\]\]([\s\S]*?)\[\[\/size\]\]/g, '<span class="txt-largo-1">$1</span>');
        processado = processado.replace(/\[\[size:2\]\]([\s\S]*?)\[\[\/size\]\]/g, '<span class="txt-largo-2">$1</span>');
        
        return processado;
    }

    function escurecerCor(hex, fator = 0.65) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.floor(((num >> 16) & 0xFF) * fator));
        const g = Math.min(255, Math.floor(((num >> 8) & 0xFF) * fator));
        const b = Math.min(255, Math.floor((num & 0xFF) * fator));
        return `rgb(${r},${g},${b})`;
    }

    /**
     * Converte cor Hexadecimal para RGBA com segurança.
     * @param {string} hex - Cor em formato hexadecimal (ex: #FF0000)
     * @param {number} alpha - Opacidade (0.0 a 1.0)
     * @returns {string} String CSS válida (rgba ou o fallback original)
     */
    function hexToRgba(hex, alpha = 0.2) {
        if (!hex || !hex.startsWith('#')) return hex;
        
        let c = hex.substring(1).split('');
        if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        
        if (c.length !== 6) return hex;
        
        const num = parseInt(c.join(''), 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    // Paleta Neon / Vibrante para as abas de tópicos e linhas de conexão
    const CORES_TOPICOS = [
        '#00FFFF', // Ciano Neon
        '#FF00FF', // Magenta Neon
        '#39FF14', // Verde Neon
        '#FF3131', // Vermelho Neon
        '#FFFF00', // Amarelo Elétrico
        '#BC13FE', // Roxo Neon
        '#FF1493', // Rosa Choque (Deep Pink)
        '#00FF66', // Verde Primavera (Spring Green)
        '#FF6600', // Laranja Neon
        '#CCFF00', // Limão Elétrico (Electric Lime)
        '#08E8DE', // Teal Brilhante
        '#FF007F', // Rosa Brilhante (Rose Bright)
        '#8A2BE2', // Violeta Azulado
        '#00BFFF', // Azul Céu Profundo
        '#FFD700'  // Ouro Brilhante
    ];

    /**
     * Converte um índice numérico (base-0) em identificador alfabético.
     * Suporta overflow: 0→A, 25→Z, 26→AA, 27→AB, etc.
     * @param {number} idx - Índice da sub-anotação.
     * @returns {string} Identificador de 1 ou 2 letras.
     */
    function gerarLetra(idx) {
        const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (idx < 26) return ABC[idx];
        return ABC[Math.floor(idx / 26) - 1] + ABC[idx % 26];
    }

    function obterIconeIntencao(intencao) {
        switch(intencao) {
            case 'comando': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>`;
            case 'texto': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
            case 'nota': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            case 'fundamentacao': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;
            case 'refutacao': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
            case 'preliminar': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            case 'veredito': return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`;
            case 'premissa':
            default: return `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`;
        }
    }

    function _gerarBtnRevisaoHtml(topicoId, parentIndex, viewSource, localIndex, intencao, isRevisada) {
        if (intencao !== 'nota') return '';
        
        const safeViewSource = String(viewSource).replace(/'/g, "\\'");
        const safeParentIdx = parentIndex === null ? 'null' : parentIndex;
        
        const svgPendente = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        const svgRevisada = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        
        return `<button class="btn-revisao-nota ${isRevisada ? 'revisada' : 'pendente'}" 
                title="${isRevisada ? 'Nota revisada. Clique para desmarcar.' : 'Nota pendente. Clique para marcar como revisada.'}" 
                onclick="toggleRevisaoNotaOculta('${topicoId}', ${safeParentIdx}, '${safeViewSource}', ${localIndex}, event)">
                ${isRevisada ? svgRevisada : svgPendente}
                </button>`;
    }

    let activeTabId = null;

    /**
     * Retorna uma cor da paleta com suporte a módulo (infinitos tópicos).
     */
    function obterCor(index) {
        return CORES_TOPICOS[index % CORES_TOPICOS.length];
    }

    /**
     * Converte a string do polo em uma classe CSS válida.
     */
    function poloParaClasse(polo) {
        return 'tag-' + polo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') 
            .replace(/[^a-z0-9]+/g, '-')     
            .replace(/^-|-$/g, '');          
    }

    /**
     * Motor unificado para construção de cards de áudio.
     * Desacopla o parseamento do JSON do loop principal de renderização.
     */
    function _gerarHtmlCardAudio(anotacao) {
        let htmlConteudo = '';
        let htmlComentario = '';
        
        try {
            const dadosAudio = JSON.parse(anotacao.conteudo);
            
            // Fallback unificado para nomenclatura segura
            const nomePapel = dadosAudio.role || dadosAudio.oradorStr || 'Orador não idt.';
            const classePolo = dadosAudio.poloTag ? poloParaClasse(dadosAudio.poloTag) : 'doc-tag';
            
            let tagVisual = `<span class="polo-tag ${classePolo}">${escaparHTML(nomePapel)}</span>`;
            if ((dadosAudio.role === 'Testemunha' || dadosAudio.role === 'Advogado') && dadosAudio.poloTag) {
                tagVisual = `<span class="polo-tag doc-tag">${escaparHTML(dadosAudio.role)}</span> <span class="polo-tag ${classePolo}">${escaparHTML(dadosAudio.poloTag)}</span>`;
            }

            // Garante extração segura de tempos matemáticos (fallback para 0)
            const inicioNum = dadosAudio.inicio || 0;
            const fimNum = dadosAudio.fim || 0;
            
            const safeFormatTime = (sec) => window.AudioManager?.formatTime ? window.AudioManager.formatTime(sec) : `${Math.floor(sec/60)}' ${Math.floor(sec%60)}''`;

            // Renderiza o cabeçalho com o botão Clickable e Ícone de Play
            htmlConteudo = `
                <div class="card-audio">
                    <div class="audio-icon-box clickable-audio" title="Ouvir este trecho específico" onclick="AudioManager.tocarTrecho(${inicioNum}, ${fimNum})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                    <div class="audio-card-meta">
                        <strong>Oitiva:</strong> ${tagVisual}<br>
                        <span class="audio-time-badge">⏱️ ${safeFormatTime(inicioNum)} a ${safeFormatTime(fimNum)}</span>
                    </div>
                </div>`;

            // PRESERVAÇÃO CRÍTICA: Lógica de Comentários e Degravações
            let comentarios = [];
            if (anotacao.comentario) comentarios.push(`<strong>Contexto:</strong> ${escaparHTML(anotacao.comentario)}`);
            if (dadosAudio.transcricao) {
                comentarios.push(`
                    <div style="display:flex; align-items:flex-start; gap:4px;">
                        <div><strong>Degravação:</strong> <em>"${escaparHTML(dadosAudio.transcricao)}"</em></div>
                        <button class="btn-copy-degravacao" title="Copiar Degravação" onclick="window.copiarDegravacao('${anotacao.topicoIdOrigem || activeTabId}', '${anotacao.uuid || ''}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                `);
            }
            
            if (comentarios.length > 0) {
                htmlComentario = `<div class="card-comentario" style="display:flex; flex-direction:column; gap:6px;">${comentarios.join('<br>')}</div>`;
            }
        } catch (e) {
            htmlConteudo = `<p class="card-texto" style="color:#c62828;">[Erro: metadados do áudio corrompidos]</p>`;
        }
        
        return { htmlConteudo, htmlComentario };
    }

    /**
     * Extrai a referência (meta-texto) do canto superior direito.
     * Para documentos, retorna ID e Folha. Para áudios, retorna os marcadores de tempo.
     */
    function _obterMetaTexto(item) {
        if (item.tipo === 'audio') {
            try {
                const dados = JSON.parse(item.conteudo);
                const safeFormatTime = (sec) => window.AudioManager?.formatTime ? window.AudioManager.formatTime(sec) : `${Math.floor(sec/60)}' ${Math.floor(sec%60)}''`;
                // Retorna exatamente o formato que o usuário quer copiar para a minuta
                return `(⏱️ ${safeFormatTime(dados.inicio)} a ${safeFormatTime(dados.fim)})`;
            } catch (e) {
                return '(Oitiva)';
            }
        }
        
        // Tratamento padrão para documentos e imagens
        const idFormt = item.pjeId ? `Id. ${item.pjeId} - ` : '';
        return item.pagina ? `(${idFormt}fl. ${item.pagina})` : '';
    }

    // Função estática gerarSVGConector removida (substituída pelo motor dinâmico desenharConexoes)

    /**
     * Fábrica de cards no formato de fluxograma alternado.
     * Retorna: card + bloco de sub-anotações (se houver) + conector SVG.
     * Os três fragmentos são irmãos diretos no .timeline-container,
     * garantindo que align-self funcione corretamente nas sub-anotações.
     */
    function criarCard(anotacao, index, arr) {
        const total    = arr.length;
        const numero   = index + 1;
        const tagClass = poloParaClasse(anotacao.polo);
        const metaTexto = _obterMetaTexto(anotacao);

        let htmlConteudo = '';
        let htmlComentario = '';

        if (anotacao.tipo === 'texto') {
            htmlConteudo = `
            <div style="position: relative;">
                <p class="card-texto">"${renderizarMarkdownSeguro(escaparHTML(anotacao.conteudo))}"</p>
                <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                    Ler texto completo ▾
                </button>
            </div>`;
            if (anotacao.comentario) htmlComentario = `<div class="card-comentario"><strong>Observação:</strong> ${escaparHTML(anotacao.comentario)}</div>`;
        } else if (anotacao.tipo === 'imagem') {
            htmlConteudo = `
            <div class="image-resize-wrapper" title="Arraste o canto inferior direito para redimensionar">
                <img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte">
            </div>`;
            if (anotacao.comentario) htmlComentario = `<div class="card-comentario"><strong>Descrição:</strong> ${escaparHTML(anotacao.comentario)}</div>`;
        } else if (anotacao.tipo === 'audio') {
            const audioData = _gerarHtmlCardAudio(anotacao);
            htmlConteudo = audioData.htmlConteudo;
            htmlComentario = audioData.htmlComentario;
        }

        const isLeft     = index % 2 === 0;
        const alignClass = isLeft ? 'align-left' : 'align-right';
        const isLast     = index === total - 1;
        
        const faseDoCard = typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(anotacao.documento) : 4;
        const bgZoneClass = `fase-${faseDoCard}`;

        let bgPoloClass = '';
        if (anotacao.polo === 'Parte Autora') bgPoloClass = 'polo-autora';
        else if (anotacao.polo === 'Parte Ré') bgPoloClass = 'polo-re';
        
        const corTextoBadge = obterCorContraste(_activeTopicoCor);
        
        const docSeguro = anotacao.documento ? escaparHTML(anotacao.documento) : escaparHTML(anotacao.polo);
        const poloSeguro = (anotacao.documento && anotacao.polo) ? escaparHTML(anotacao.polo) : '';
        
        let tagsHtml = `<span class="polo-tag doc-tag">${docSeguro}</span>`;
        if (poloSeguro && poloSeguro !== docSeguro) {
            tagsHtml += ` <span class="polo-tag ${poloParaClasse(anotacao.polo)}">${poloSeguro}</span>`;
        }

        function gerarBarraAcoes(isCorrelacionado, cIdx) {
            // Injeção segura do cIdx no contexto do botão (resolve o bug da falta de índice)
            const ctxCidx = isCorrelacionado && cIdx != null ? `, cIdx: ${cIdx}` : '';
            
            // Verifica o tipo do item na hierarquia correta (principal vs correlacionado)
            const tipoDoItem = isCorrelacionado && cIdx != null ? anotacao.itensCorrelacionados[cIdx].tipo : anotacao.tipo;
            
            // Direciona para a função de edição adequada
            const acaoEditar = isCorrelacionado ? 'editarItemCorrelacionado()' : 'editarAnotacao()';
            
            const btnEditar = (tipoDoItem === 'texto' || tipoDoItem === 'audio') 
                ? `<button title="Editar" onclick="_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}${ctxCidx}}; ${acaoEditar}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>` 
                : '';
            
            const paramMove = isCorrelacionado ? `'${activeTabId}', ${index}, ${cIdx}` : `'${activeTabId}', ${index}, null`;
            
            return `
            <div class="card-actions-bar">
                ${btnEditar}
                <button title="Adicionar Nó de Ideia" onclick="_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}${ctxCidx}}; acionarNovoNoIdeia()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                <button title="Mover / Reordenar" onclick="abrirModalSmartMove(${paramMove})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><polyline points="8 7 12 3 16 7"></polyline><line x1="12" y1="12" x2="12" y2="3"></line></svg></button>
                <button class="delete-btn" title="Excluir" onclick="${isCorrelacionado ? `excluirItemCorrelacionado('${activeTabId}', ${index}, ${cIdx})` : `_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}}; excluirAnotacao()`}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>`;
        }

        // Card Principal (Removido o código morto redundante do wrapper interno)

        // Nós de Ideia (Sub-anotações - Flattening Architecture)
        let htmlSubAnotacoes = '';
        let flatSubAnotacoes = [];
        
        // 1. Achata os nós do Mestre
        if (anotacao.subAnotacoes) {
            flatSubAnotacoes.push(...anotacao.subAnotacoes.map((s, idx) => ({ ...s, viewSource: 'main', localIndex: idx })));
        }
        
        // 2. Achata os nós dos Filhos (Correlacionados)
        if (anotacao.itensCorrelacionados) {
            anotacao.itensCorrelacionados.forEach((item, fIdx) => {
                if (item.subAnotacoes) {
                    flatSubAnotacoes.push(...item.subAnotacoes.map((s, idx) => ({ ...s, viewSource: fIdx, localIndex: idx })));
                }
            });
        }

        if (flatSubAnotacoes.length > 0) {
            const subCardsHTML = flatSubAnotacoes.map((sub, sIdx) => {
                const intencao = sub.intencao || 'premissa';
                const isHasIntent = true; 
                let iconSVG = '';

                if (intencao === 'comando') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>`;
                } else if (intencao === 'texto') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
                } else if (intencao === 'nota') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                } else if (intencao === 'premissa') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`;
                } else if (intencao === 'fundamentacao') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;
                } else if (intencao === 'alegacao') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
                } else if (intencao === 'fundamento_sentenca') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16M4 2h16M6 6v12M10 6v12M14 6v12M18 6v12M2 6h20"></path></svg>`;
                } else if (intencao === 'refutacao') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
                } else if (intencao === 'preliminar') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
                }

                const badgeClass = isHasIntent ? `sub-badge has-intent intencao-${intencao}` : 'sub-badge';
                // Note que o sIdx (índice global flat) continua sendo usado APENAS para gerar a letra alfabética (A, B, C)
                const label = isHasIntent ? `${iconSVG} ${numero}.${gerarLetra(sIdx)}` : `${numero}.${gerarLetra(sIdx)}`;
                
                const textoFormatado = renderizarMarkdownSeguro(escaparHTML(sub.texto));
                
                // Cálculo rigoroso da borda de fase com base na nova estrutura
                let faseSub = faseDoCard;
                if (sub.viewSource !== 'main' && anotacao.itensCorrelacionados) {
                    const cIdx = parseInt(sub.viewSource, 10);
                    if (!isNaN(cIdx) && anotacao.itensCorrelacionados[cIdx]) {
                         faseSub = typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(anotacao.itensCorrelacionados[cIdx].documento) : 4;
                    }
                }
                const bordaFaseClass = `borda-fase-${faseSub}`;

                const isNotaInterna = intencao === 'nota';
                const isRevisada = sub.revisada === true;
                const itemWrapperClass = isNotaInterna ? `sub-annotation-item is-nota-interna ${isRevisada ? 'is-revisada' : 'is-pendente'}` : `sub-annotation-item`;

                return `
                    <div class="${itemWrapperClass}" data-source="${sub.viewSource}">
                        <div class="sub-annotation-card ${bordaFaseClass}">
                            <!-- NOVO CONTRATO AQUI: Passamos viewSource E localIndex antes do event -->
                            <div class="${badgeClass}"
                                 title="Opções desta ideia secundária"
                                 onclick="abrirMenuSubAnotacao('${activeTabId}', ${index}, '${sub.viewSource}', ${sub.localIndex}, event)">
                                ${label}
                            </div>
                            <div class="sub-text-content">${textoFormatado}</div>
                            <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                                Ler texto completo ▾
                            </button>
                            <button class="btn-copiar-zen" onclick="navigator.clipboard.writeText('${escaparHTML(sub.texto).replace(/'/g, "\\'")}')" title="Copiar texto bruto para a área de transferência">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                Copiar Trecho
                            </button>
                            ${_gerarBtnRevisaoHtml(activeTabId, index, sub.viewSource, sub.localIndex, intencao, isRevisada)}
                        </div>
                    </div>`;
            }).join('');

            htmlSubAnotacoes = `<div class="sub-annotations-wrapper">${subCardsHTML}</div>`;
        }

        // NOVO: Processar itens agrupados
        let htmlCorrelacionados = '';
        if (anotacao.itensCorrelacionados && anotacao.itensCorrelacionados.length > 0) {
            htmlCorrelacionados = anotacao.itensCorrelacionados.map((item, cIdx) => {
                const itemTag = poloParaClasse(item.polo);
                const itemMeta = _obterMetaTexto(item);
                
                let cConteudo = '';
                let cComent = '';
                
                if (item.tipo === 'texto') {
                    cConteudo = `
                    <div style="position: relative;">
                        <p class="card-texto">"${renderizarMarkdownSeguro(escaparHTML(item.conteudo))}"</p>
                        <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                            Ler texto completo ▾
                        </button>
                    </div>`;
                    if (item.comentario) cComent = `<div class="card-comentario"><strong>Observação:</strong> ${escaparHTML(item.comentario)}</div>`;
                } else if (item.tipo === 'imagem') {
                    cConteudo = `<div class="image-resize-wrapper" title="Arraste para redimensionar"><img class="card-imagem" src="${item.conteudo}" alt="Agrupamento"></div>`;
                    if (item.comentario) cComent = `<div class="card-comentario"><strong>Descrição:</strong> ${escaparHTML(item.comentario)}</div>`;
                } else if (item.tipo === 'audio') {
                    const audioData = _gerarHtmlCardAudio(item);
                    cConteudo = audioData.htmlConteudo;
                    cComent = audioData.htmlComentario;
                }
                    
                return `
                <div class="correlated-item-wrapper" data-cidx="${cIdx}"
                     draggable="true"
                     ondragstart="DnDManager.dragStart(event, '${activeTabId}', ${index}, ${cIdx})"
                     ondragover="DnDManager.dragOver(event)"
                     ondrop="DnDManager.drop(event, '${activeTabId}', ${index}, ${cIdx})"
                     ondragenter="DnDManager.dragEnter(event)"
                     ondragleave="DnDManager.dragLeave(event)"
                     ondragend="DnDManager.dragEnd(event)">
                    <div class="two-way-arrow-container correlated-drag-handle" title="Arraste para reordenar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l-4-4m4 4l4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="annotation-card correlated-card fase-${typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(item.documento) : 4}">
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">
                                <span class="polo-tag doc-tag">${item.documento ? escaparHTML(item.documento) : escaparHTML(item.polo)}</span>
                                ${(item.documento && item.polo && item.polo !== item.documento) ? `<span class="polo-tag ${itemTag}">${escaparHTML(item.polo)}</span>` : ''}
                            </div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique: Copiar | Shift+Clique: Editar folha | Ctrl+Clique: Ir ao PDF" onclick="handleMetaClick(event, '${activeTabId}', ${index}, true, ${cIdx})">${itemMeta}</span>
                        </div>
                        ${cConteudo}
                        ${cComent}
                        ${gerarBarraAcoes(true, cIdx)}
                    </div>
                </div>`;
            }).join('');
        }

        // Wrapper Master Flex atualizado para envelopar a hierarquia inteira
        const wrapperMaster = `
            <div class="timeline-item-master ${alignClass}" id="timeline-wrapper-${anotacao.uuid || index}">
                <div class="main-card-wrapper" data-uuid="${anotacao.uuid || index}" data-cidx="main"
                     ondragover="DnDManager.dragOver(event)"
                     ondrop="DnDManager.drop(event, '${activeTabId}', ${index}, 'main')"
                     ondragenter="DnDManager.dragEnter(event)"
                     ondragleave="DnDManager.dragLeave(event)">
                    <div class="annotation-number-area">
                        <div class="timeline-number master-drag-handle" 
                             draggable="true"
                             ondragstart="DnDManager.dragStart(event, '${activeTabId}', ${index}, 'main')"
                             ondragend="DnDManager.dragEnd(event)"
                             style="background-color: ${_activeTopicoCor}; color: ${corTextoBadge}; cursor: grab;" 
                             title="Arraste para trocar o Card Mestre, ou Clique para Nomear Tese"
                             onclick="abrirModalTese('${activeTabId}', ${index})">
                            ${numero}
                        </div>
                    </div>
                    <div class="annotation-card ${bgZoneClass} ${bgPoloClass}">
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">${tagsHtml}</div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique: Copiar | Shift+Clique: Editar folha | Ctrl+Clique: Ir ao PDF" onclick="handleMetaClick(event, '${activeTabId}', ${index}, false)">${metaTexto}</span>
                        </div>
                        ${htmlConteudo}
                        ${htmlComentario}
                        ${gerarBarraAcoes(false, null)}
                    </div>
                    ${htmlCorrelacionados}
                </div>
                ${htmlSubAnotacoes}
            </div>`;

        return wrapperMaster; // Sem o conector anexado aqui
    }

    /**
     * Atualiza o índice de marcadores flutuantes com base no tópico ativo.
     * Função idempotente: zera o DOM e reconstrói de forma leve.
     */
    function _atualizarMarcadoresDeIdeia(topico) {
        const listContainer = document.getElementById('idea-markers-list');
        if (!listContainer) return;
        
        // 1. Limpeza de Estado
        listContainer.innerHTML = '';
        
        // 2. Validação de Escopo (Se não há ideias, encerra silenciosamente)
        if (!topico || !topico.anotacoes || topico.anotacoes.length === 0) return;

        // 3. Renderização Dinâmica e Cálculos
        const corTexto = obterCorContraste(_activeTopicoCor);
        
        const fragment = document.createDocumentFragment(); // Otimização de reflow

        topico.anotacoes.forEach((anotacao, index) => {
            const btn = document.createElement('div');
            btn.className = 'fab-idea-marker';
            btn.style.backgroundColor = _activeTopicoCor;
            btn.style.color = corTexto;
            btn.textContent = index + 1;
            
            // UX Rica: Tooltip injeta o título da tese se existir
            const nomeTese = anotacao.tese ? ` - ${escaparHTML(anotacao.tese)}` : '';
            btn.title = `Ir para a Ideia ${index + 1}${nomeTese}`;

            // 4. Feitiçaria Matemática de Scroll (Alerta 1 resolvido)
            btn.onclick = (e) => {
                e.stopPropagation();
                
                const scrollContainer = document.getElementById('history-container');
                const targetId = `timeline-wrapper-${anotacao.uuid || index}`; // Reconciliação via UUID
                const targetElement = document.getElementById(targetId);
                
                if (targetElement && scrollContainer) {
                    // Calcula a posição relativa entre o card alvo e o container que rola, 
                    // somando com a rolagem atual para chegar no Offset absoluto correto.
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const targetRect = targetElement.getBoundingClientRect();
                    
                    // -16px de margem de respiro para o card não colar no topo do teto
                    const offset = (targetRect.top - containerRect.top) + scrollContainer.scrollTop - 16;
                    
                    scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
                }
            };
            
            fragment.appendChild(btn);
        });
        
        // Injeção única no DOM
        listContainer.appendChild(fragment);
    }

    /**
     * Re-renderiza o fichário inteiro.
     */
    function renderizarFichario(topicosArray) {
        const headerEl  = document.getElementById('topics-tabs-header');
        const contentEl = document.getElementById('topics-tab-content');

        if (!headerEl || !contentEl) return;

        // Estado vazio: nenhum tópico criado ainda
        if (topicosArray.length === 0) {
            headerEl.innerHTML = '';
            contentEl.innerHTML = `
                <p class="empty-state">
                    Nenhum tópico criado.<br>
                    Use o botão <strong>+</strong> na barra lateral para criar um Tópico Recursal.
                </p>`;
            contentEl.style.borderTop       = 'none';
            contentEl.style.backgroundColor = 'transparent';
            return;
        }

        // Resiliência: garante que sempre há uma aba ativa válida
        if (!activeTabId || !topicosArray.some(t => t.id === activeTabId)) {
            activeTabId = topicosArray[0].id;
        }

        // 1. Construir as abas do fichário
        headerEl.innerHTML = '';
        topicosArray.forEach(topico => {
            const isActive = topico.id === activeTabId;
            const btn      = document.createElement('div');

            btn.className        = `topic-tab-btn ${isActive ? 'active' : ''}`;
            btn.textContent      = topico.nome;
            btn.title            = topico.nome; 
            btn.style.backgroundColor = topico.cor;

            if (isActive) {
                btn.style.border = `3px solid ${escurecerCor(topico.cor)}`;
                btn.style.borderBottom = 'none';
                btn.style.color = escurecerCor(topico.cor, 0.4);
                contentEl.style.borderTop = `3px solid ${escurecerCor(topico.cor)}`;
            } else {
                btn.style.border = '1px solid #dde3ea';
                btn.style.borderBottom = 'none';
                btn.style.color = '#555';
            }

            btn.onclick = () => {
                activeTabId = topico.id;
                renderizarFichario(topicosArray);
            };

            headerEl.appendChild(btn);
        });

        // 2. Construir o conteúdo do tópico ativo
        const topicoAtivo = topicosArray.find(t => t.id === activeTabId);
        if (!topicoAtivo) return;

        _activeTopicoCor = topicoAtivo.cor;
        const corTextoTese = obterCorContraste(_activeTopicoCor);

        // NOVO: Painel Preâmbulo Estático gerado incondicionalmente
        const preambleHtml = `
            <div class="topic-preamble-panel">
                <div class="preamble-card preamble-alegacao ${!topicoAtivo.alegacoes ? 'is-empty' : ''}" onclick="abrirEdicaoPreambulo('${activeTabId}', 'alegacoes')">
                    
                    <!-- NOVO: Gatilho da IA (Tratamento robusto contra quebras de linha e aspas no HTML) -->
                    <div class="preamble-icon ai-trigger-btn" 
                         title="✨ Inteligência Artificial: Buscar modelos compatíveis" 
                         onclick="event.stopPropagation(); AIRecommendationManager.buscarModelosCompativeis('${activeTabId}', decodeURIComponent('${encodeURIComponent(topicoAtivo.alegacoes || '').replace(/'/g, "%27")}'))">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" class="ai-sparkle" style="display:none; transform-origin: 12px 12px;"></path>
                        </svg>
                    </div>

                    <div class="preamble-content">
                        <span class="preamble-title">Razões Recursais</span>
                        ${topicoAtivo.alegacoes ? renderizarMarkdownSeguro(escaparHTML(topicoAtivo.alegacoes)) : '<span class="preamble-empty">Clique para redigir as alegações recursais...</span>'}
                    </div>
                </div>
                <div class="preamble-card preamble-origem ${!topicoAtivo.fundamentos ? 'is-empty' : ''}" onclick="abrirEdicaoPreambulo('${activeTabId}', 'fundamentos')">
                    <div class="preamble-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 21V7l6-4 6 4v14"></path></svg>
                    </div>
                    <div class="preamble-content">
                        <span class="preamble-title">Fundamentos da Origem</span>
                        ${topicoAtivo.fundamentos ? renderizarMarkdownSeguro(escaparHTML(topicoAtivo.fundamentos)) : '<span class="preamble-empty">Clique para redigir os fundamentos da sentença...</span>'}
                    </div>
                </div>
                <div class="preamble-card preamble-veredito ${!topicoAtivo.veredito ? 'is-empty' : ''}" onclick="abrirEdicaoPreambulo('${activeTabId}', 'veredito')">
                    <div class="preamble-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                    </div>
                    <div class="preamble-content">
                        <span class="preamble-title">Veredito / Conclusão</span>
                        ${topicoAtivo.veredito ? renderizarMarkdownSeguro(escaparHTML(topicoAtivo.veredito)) : '<span class="preamble-empty">Clique para definir o veredito final deste tópico...</span>'}
                    </div>
                </div>
            </div>`;

        let conteudoCentralHtml = '';

        if (topicoAtivo.anotacoes.length === 0) {
            conteudoCentralHtml = `
                <p class="empty-state" style="margin-top: 20px;">
                    A Matriz Dialética está vazia. Adicione extrações das provas.
                </p>`;
        } else {
            let sumarioHtml = '';
            const tesesValidas = topicoAtivo.anotacoes.filter(an => an.tese && an.tese.trim() !== '');
            if (tesesValidas.length > 0) {
                sumarioHtml = `
                <div class="thesis-summary-panel">`;

                topicoAtivo.anotacoes.forEach((an, idx) => {
                    if (an.tese && an.tese.trim() !== '') {
                        const fasesPresentes = new Set();
                        
                        fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(an.documento) : 4);
                        
                        if (an.itensCorrelacionados?.length) {
                            an.itensCorrelacionados.forEach(ic => fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(ic.documento) : 4));
                        }

                        if (an.itensCorrelacionados?.length) {
                            an.itensCorrelacionados.forEach(ic => {
                                if (ic.subAnotacoes && ic.subAnotacoes.length > 0) {
                                    fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(ic.documento) : 4);
                                }
                            });
                        }

                        const cores = [];
                        if(fasesPresentes.has(1)) cores.push('var(--fase-1-bg)');
                        if(fasesPresentes.has(2)) cores.push('var(--fase-2-bg)');
                        if(fasesPresentes.has(3)) cores.push('var(--fase-3-bg)');
                        if(fasesPresentes.has(4)) cores.push('var(--fase-4-bg)');
                        
                        let bgStyle = '';
                        if(cores.length > 0) {
                            const step = 100 / cores.length;
                            const gradients = cores.map((cor, i) => `${cor} ${i * step}%, ${cor} ${(i + 1) * step}%`);
                            bgStyle = `style="background: linear-gradient(to right, ${gradients.join(', ')}), #ffffff;"`; 
                        }

                        const matureClass = fasesPresentes.size === 4 ? 'mature' : '';
                        const txt = escaparHTML(an.tese);

                        sumarioHtml += `
                            <div class="thesis-badge ${matureClass}" onclick="abrirModalTese('${activeTabId}', ${idx})">
                                <div class="thesis-badge-inner" ${bgStyle}>
                                    <span class="num" style="background-color: ${_activeTopicoCor}; color: ${corTextoTese};">${idx + 1}</span> 
                                    <span class="texto-tese">${txt}</span>
                                </div>
                            </div>`;
                    }
                });
                sumarioHtml += '</div>';
            }
            
            // Loop customizado com injeção de Painel de Tese
            let cardsHTML = '';
            let ultimaTeseRenderizada = null;

            topicoAtivo.anotacoes.forEach((an, index) => {
                const teseAtual = an.tese || "Tese Não Nomeada";
                
                if (teseAtual !== ultimaTeseRenderizada) {
                    const diretrizes = (topicoAtivo.diretrizesPorTese && topicoAtivo.diretrizesPorTese[teseAtual]) ? topicoAtivo.diretrizesPorTese[teseAtual] : [];
                    const teseViewSource = `tese:${teseAtual}`;
                    
                    // --- ARQUITETURA DINÂMICA DE CORES DA TESE ---
                    // 1. Aumentamos a intensidade da cor para 15% para ficar mais vivo
                    const rgbaTeseFundo = hexToRgba(_activeTopicoCor, 0.15); 
                    // Usa a cor da aba para a borda
                    const rgbaTeseBorda = hexToRgba(_activeTopicoCor, 0.4);
                    // Cor escura para o título ler bem
                    const corTituloTese = escurecerCor(_activeTopicoCor, 0.6);
                    
                    const tesesHtml = diretrizes.map((d, sIdx) => {
                            const intencao = d.intencao || 'premissa';
                            const iconSVG = obterIconeIntencao(intencao);
                            const isRevisada = d.revisada === true;
                            const itemWrapperClass = intencao === 'nota' ? `sub-annotation-item is-nota-interna ${isRevisada ? 'is-revisada' : 'is-pendente'}` : 'sub-annotation-item';
                            return `
                            <div class="${itemWrapperClass}" data-source="${teseViewSource}">
                                <!-- AQUI O NÓ RECEBE A COR DINÂMICA DA ABA -->
                            <div class="sub-annotation-card" style="border-left: 5px solid ${_activeTopicoCor}; border-color: ${rgbaTeseBorda};">
                                <div class="sub-badge has-intent intencao-${intencao}" 
                                     title="Opções desta diretriz"
                                     onclick="abrirMenuSubAnotacao('${activeTabId}', null, '${teseViewSource.replace(/'/g, "\\'")}', ${sIdx}, event)">
                                     ${iconSVG} T.${sIdx + 1}
                                </div>
                                <div class="sub-text-content">${renderizarMarkdownSeguro(escaparHTML(d.texto))}</div>
                                <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                                    Ler texto completo ▾
                                </button>
                                <button class="btn-copiar-zen" onclick="navigator.clipboard.writeText('${escaparHTML(d.texto).replace(/'/g, "\\'")}')" title="Copiar texto bruto para a área de transferência">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Copiar Trecho
                                </button>
                                ${_gerarBtnRevisaoHtml(activeTabId, null, teseViewSource, sIdx, intencao, isRevisada)}
                            </div>
                        </div>`;
                    }).join('');

                    cardsHTML += `
                    <div class="timeline-item-master align-left nivel-hierarquico">
                        <div class="main-card-wrapper">
                            <div class="annotation-number-area">
                                <!-- ÍCONE COM A COR DA ABA -->
                                <div class="timeline-icon-box" title="Tese" style="background-color: ${_activeTopicoCor}; color: ${corTextoTese};">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle></svg>
                                </div>
                            </div>
                            <!-- CARD COM FUNDO SUAVE DA COR DA ABA -->
                            <div class="annotation-card" style="border-left: 4px solid ${_activeTopicoCor}; background-color: #ffffff; background-image: linear-gradient(${rgbaTeseFundo}, ${rgbaTeseFundo});">
                                <div class="card-header" style="justify-content: space-between; margin-bottom: 0;">
                                    <div class="hierarquia-titulo" style="color: ${corTituloTese}; font-weight: bold;">Tese: ${escaparHTML(teseAtual)}</div>
                                    <div class="card-actions-bar" style="margin-top: 0; padding-top: 0; border-top: none;">
                                        <button title="Adicionar Diretriz à Tese" onclick="adicionarDiretrizEstrutural('tese', '${activeTabId}', '${escaparHTML(teseAtual).replace(/'/g, "\\'")}', event)">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="sub-annotations-wrapper">${tesesHtml}</div>
                    </div>`;
                    
                    ultimaTeseRenderizada = teseAtual;
                }
                
                cardsHTML += criarCard(an, index, topicoAtivo.anotacoes);
            });
            
            // --- RENDERIZAÇÃO: DIRETRIZES GLOBAIS (INCONDICIONAL) ---
            let htmlDiretrizesGlobais = '';
            let globaisHtml = ''; // Guarda os nós de ideia, se existirem

            // Se existirem diretrizes, monta os nós de ideia
            if (topicoAtivo.diretrizesGlobais && topicoAtivo.diretrizesGlobais.length > 0) {
                globaisHtml = topicoAtivo.diretrizesGlobais.map((d, sIdx) => {
                    const intencao = d.intencao || 'premissa';
                    const iconSVG = obterIconeIntencao(intencao);
                    const isRevisada = d.revisada === true;
                    const itemWrapperClass = intencao === 'nota' ? `sub-annotation-item is-nota-interna ${isRevisada ? 'is-revisada' : 'is-pendente'}` : 'sub-annotation-item';
                    return `
                    <div class="${itemWrapperClass}" data-source="global">
                        <div class="sub-annotation-card borda-global">
                            <div class="sub-badge has-intent intencao-${intencao}" 
                                 title="Opções desta diretriz"
                                 onclick="abrirMenuSubAnotacao('${activeTabId}', null, 'global', ${sIdx}, event)">
                                 ${iconSVG} G.${sIdx + 1}
                            </div>
                            <div class="sub-text-content">${renderizarMarkdownSeguro(escaparHTML(d.texto))}</div>
                            <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                                Ler texto completo ▾
                            </button>
                            <button class="btn-copiar-zen" onclick="navigator.clipboard.writeText('${escaparHTML(d.texto).replace(/'/g, "\\'")}')" title="Copiar texto bruto para a área de transferência">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Copiar Trecho
                                </button>
                                ${_gerarBtnRevisaoHtml(activeTabId, null, 'global', sIdx, intencao, isRevisada)}
                            </div>
                        </div>`;
                    }).join('');
            }

            // O CARD MESTRE É RENDERIZADO SEMPRE (Mesmo sem nós de ideia)
            htmlDiretrizesGlobais = `
            <div class="timeline-item-master align-left nivel-hierarquico nivel-global">
                <div class="main-card-wrapper">
                    <div class="annotation-number-area">
                        <div class="timeline-icon-box" title="Diretrizes Globais do Tópico">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        </div>
                    </div>
                    <div class="annotation-card">
                            <div class="card-header" style="justify-content: space-between; margin-bottom: 0;">
                                <div class="hierarquia-titulo">Diretrizes Globais do Tópico</div>
                                <div class="card-actions-bar" style="margin-top: 0; padding-top: 0; border-top: none;">
                                    <button title="Adicionar Diretriz Global" onclick="adicionarDiretrizEstrutural('global', '${activeTabId}', null, event)">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                </div>
                <div class="sub-annotations-wrapper" style="position: relative; min-height: auto;">
                    ${globaisHtml}
                </div>
            </div>`;

            conteudoCentralHtml = sumarioHtml + `
                <div class="timeline-container" id="timeline-container">
                    <svg id="connections-canvas"></svg>
                    ${htmlDiretrizesGlobais}
                    ${cardsHTML}
                </div>`;
        }

        const novoHtml = preambleHtml + conteudoCentralHtml;
            
        // Desconecta o observer antes da árvore antiga ser destruída (Prevenção de Memory Leak)
        if (typeof resizeObserver !== 'undefined') resizeObserver.disconnect();

        // KEYED MORPHING
        if (typeof morphdom !== 'undefined') {
            morphdom(contentEl, `<div id="topics-tab-content" class="topics-content-area" style="${contentEl.style.cssText}">${novoHtml}</div>`, {
                childrenOnly: true,
                getNodeKey: function(node) {
                    if (node.id) return node.id;
                }
            });
        } else {
            contentEl.innerHTML = novoHtml;
        }
            
        requestAnimationFrame(() => {
                // 1. Observer unificado: vigia as mudanças dimensionais de ambos os tipos de cards
                document.querySelectorAll('.sub-text-content, .card-texto').forEach(el => {
                    if (typeof resizeObserver !== 'undefined') resizeObserver.observe(el);
                    
                    // 2. Loop lógico de Truncamento: Ativa o botão apenas se o texto for maior que o limite visual
                    const btn = el.parentElement.querySelector('.btn-expand-text');
                    if (btn && el.scrollHeight > el.clientHeight) {
                        btn.style.display = 'inline-flex';
                        el.classList.add('is-truncated');
                    }
                });

                const historyContainer = document.getElementById('history-container');
                if (historyContainer && typeof resizeObserver !== 'undefined') resizeObserver.observe(historyContainer);
            
            document.querySelectorAll('.image-resize-wrapper').forEach(wrapper => {
                wrapper.addEventListener('mouseup', () => desenharConexoes());
                wrapper.addEventListener('mouseleave', () => desenharConexoes());
            });

            const container = document.getElementById('timeline-container');
            if (container) {
                posicionarNosDeIdeia(container);
                requestAnimationFrame(() => {
                    desenharConexoes();
                });
            }
            
            _atualizarMarcadoresDeIdeia(topicoAtivo);
            atualizarContadorNotasOcultas();
        });
    }

    /**
     * Motor de Posicionamento Absoluto dos Nós de Ideia
     * Evita Layout Thrashing através de leitura em massa (Passe A) seguida de mutação (Passe B)
     */
    function posicionarNosDeIdeia(container) {
        const masterItems = container.querySelectorAll('.timeline-item-master');
        
        masterItems.forEach(master => {
            const mainCard = master.querySelector('.main-card-wrapper > .annotation-card');
            const subWrapper = master.querySelector('.sub-annotations-wrapper');
            const subItems = master.querySelectorAll('.sub-annotation-item');

            if (!mainCard || subItems.length === 0 || !subWrapper) return;

            const wrapperRect = subWrapper.getBoundingClientRect();
            
            // Passe A: Leituras (Evita Layout Thrashing)
            const measurements = Array.from(subItems).map(subItem => {
                const sourceRef = subItem.dataset.source;
                let sourceCard = mainCard;
                if (sourceRef !== 'main') {
                    const correlatedWrapper = master.querySelector(`.correlated-item-wrapper[data-cidx="${sourceRef}"]`);
                    if (correlatedWrapper) sourceCard = correlatedWrapper.querySelector('.annotation-card');
                }
                
                // TRAVA DE SEGURANÇA: Previne o bug de sobreposição ao trocar abas no navegador
                if (sourceCard.offsetHeight === 0) return null;

                return {
                    el: subItem,
                    sourceCenterY: (sourceCard.getBoundingClientRect().top - wrapperRect.top) + (sourceCard.getBoundingClientRect().height / 2),
                    height: subItem.offsetHeight
                };
            }).filter(m => m !== null); // Remove os itens inválidos da contagem

            if (measurements.length === 0) return; // Aborta mutação em views ocultas

            // Passe B: Mutações
            let currentY = 0;
            measurements.forEach(m => {
                let desiredTop = m.sourceCenterY - (m.height / 2);
                if (desiredTop < currentY) desiredTop = currentY;
                
                m.el.style.position = 'absolute';
                m.el.style.top = desiredTop + 'px';
                m.el.style.width = '100%';
                
                currentY = desiredTop + m.height + 16;
            });

            subWrapper.style.minHeight = currentY + 'px';
        });
    }

    /**
     * Motor Dinâmico de Conexões Sinuosas
     * @param {boolean} isZenActive - Indica se o Modo Zen está ativo (injetado para evitar reflows no loop)
     */
    function desenharConexoes(isZenActive = false) {
        const container = document.getElementById('timeline-container');
        const svg = document.getElementById('connections-canvas');
        if (!container || !svg) return;

        const containerRect = container.getBoundingClientRect();
        let svgContent = '';

        // 1. LINHA VERMELHA: Conecta apenas de Grupo a Grupo (Master items fáticos)
        const masterItemsForSpine = Array.from(container.querySelectorAll('.timeline-item-master:not(.nivel-hierarquico)'));

        for (let i = 0; i < masterItemsForSpine.length - 1; i++) {
            const currentGroup = masterItemsForSpine[i];
            const nextGroup = masterItemsForSpine[i + 1];

            const currentCorrelated = currentGroup.querySelectorAll('.correlated-item-wrapper > .annotation-card');
            let cardAtual = currentCorrelated.length > 0 ? currentCorrelated[currentCorrelated.length - 1] : currentGroup.querySelector('.main-card-wrapper > .annotation-card');
            const cardProx = nextGroup.querySelector('.main-card-wrapper > .annotation-card');

            if (!cardAtual || !cardProx) continue;

            const rectAtual = cardAtual.getBoundingClientRect();
            const rectProx = cardProx.getBoundingClientRect();

            const startX = (rectAtual.left + rectAtual.width / 2) - containerRect.left;
            const startY = rectAtual.bottom - containerRect.top;
            const endX = (rectProx.left + rectProx.width / 2) - containerRect.left;
            const endY = rectProx.top - containerRect.top;
            const ctrlY = (startY + endY) / 2;

            svgContent += `<path d="M ${startX},${startY} C ${startX},${ctrlY} ${endX},${ctrlY} ${endX},${endY}" stroke="rgba(26, 58, 92, 0.25)" stroke-width="2" fill="none" stroke-linecap="round" />`;
        }

        // 2. LINHAS TRACEJADAS: Conecta Master aos Sub-itens (Nós de Ideia)
        const masterItems = container.querySelectorAll('.timeline-item-master');
        masterItems.forEach(master => {
            const mainCard = master.querySelector('.main-card-wrapper > .annotation-card');
            const subItems = master.querySelectorAll('.sub-annotation-item');
            if (!mainCard || subItems.length === 0) return;

            const isRightAligned = master.classList.contains('align-right');
            
            subItems.forEach(subItem => {
                const subCard = subItem.querySelector('.sub-annotation-card');
                const subRect = subCard.getBoundingClientRect();
                const sourceRef = subItem.dataset.source;
                
                let sourceCard = mainCard;
                if (sourceRef !== 'main') {
                    const correlatedWrapper = master.querySelector(`.correlated-item-wrapper[data-cidx="${sourceRef}"]`);
                    if (correlatedWrapper) sourceCard = correlatedWrapper.querySelector('.annotation-card');
                }
                const sourceRect = sourceCard.getBoundingClientRect();

                const startX = isRightAligned ? sourceRect.left - containerRect.left : sourceRect.right - containerRect.left;
                const endX = isRightAligned ? subRect.right - containerRect.left : subRect.left - containerRect.left;
                const startY = (sourceRect.top + sourceRect.height / 2) - containerRect.top;
                const endY   = (subRect.top + subRect.height / 2) - containerRect.top;
                const ctrlX  = (startX + endX) / 2;

                // LÓGICA DE UX: Comportamento Visual no Modo Zen
                let strokeColor = "#777";
                let strokeOpacity = "1";
                let strokeWidth = "1.5";
                let dashArray = "5 4";

                if (isZenActive) {
                    if (subItem.classList.contains('is-zen-focused')) {
                        strokeColor = _activeTopicoCor; // Cor da aba ativa
                        strokeWidth = "2.5";
                        dashArray = "none"; // Linha sólida para foco
                    } else {
                        strokeOpacity = "0.15"; // Esmaece os demais para acompanhar o blur do fundo
                    }
                }

                svgContent += `<path d="M ${startX},${startY} C ${ctrlX},${startY} ${ctrlX},${endY} ${endX},${endY}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" opacity="${strokeOpacity}" fill="none" stroke-linecap="round"/>`;
            });
        });

        svg.innerHTML = svgContent;
    }

    /**
     * Motor de Sincronia: Executa o posicionamento UMA vez, e depois 
     * aciona o loop de redesenho SVG passivo por 350ms (acompanhando CSS transition).
     */
    function _sincronizarConexoesComAnimacao(container) {
        // 1. Snapshot Único: Aciona as transições CSS definindo o destino final
        posicionarNosDeIdeia(container);
        
        // 2. Captura o estado Zen uma única vez fora do loop
        const isZenModeActive = document.getElementById('topics-tab-content').classList.contains('zen-mode-ativo');
        
        // 3. Loop de Acompanhamento (Leitura passiva)
        let start = null;
        const duration = 350; // Tempo do CSS transition (0.3s) + 50ms de segurança

        function step(timestamp) {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            
            // Desenha com base nas posições intermediárias calculadas pelo CSS
            desenharConexoes(isZenModeActive);

            if (progress < duration) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    /**
     * Alterna a expansão do texto longo, gerencia o Zen Mode e sincroniza animações
     */
    function toggleTextExpansion(btn) {
        // Busca ascendente resolve o erro de target: pega o card exato, seja mestre ou correlacionado
        const card = btn.closest('.sub-annotation-card, .annotation-card');
        if (!card) return;

        const content = card.querySelector('.sub-text-content, .card-texto');
        if (!content) return;

        const esteCardEstavaFocado = card.classList.contains('zen-focused');
        _fecharZenModeAtivo();

        if (esteCardEstavaFocado) {
            // Estava aberto e o usuário mandou fechar.
            requestAnimationFrame(() => {
                const container = document.getElementById('timeline-container');
                if (container) {
                    // Guarda de layout para ler estado retraído, depois anima
                    requestAnimationFrame(() => _sincronizarConexoesComAnimacao(container));
                }
            });
            return;
        }

        const isExpanded = content.classList.toggle('expanded');
        btn.innerHTML = isExpanded ? 'Ocultar detalhes ▴' : 'Ler texto completo ▾';
        
        // Adiciona as classes do Zen Mode sincronicamente (antes do recálculo)
        if (isExpanded) _ativarZenMode(card);

        // Dispara orquestração de animação com Duplo RAF de segurança
        requestAnimationFrame(() => {
            const container = document.getElementById('timeline-container');
            if (container) {
                requestAnimationFrame(() => _sincronizarConexoesComAnimacao(container));
            }
        });
    }

    let notaOcultaIndexAtual = -1;

    function atualizarContadorNotasOcultas() {
        // Conta quantas div's ganharam a classe de nota interna na renderização atual
        const notas = document.querySelectorAll('.sub-annotation-item.is-nota-interna.is-pendente');
        const trackerContainer = document.getElementById('efficiency-tracker-container'); // Container pai
        const lampTracker = document.getElementById('hidden-notes-tracker');
        const badge = document.getElementById('hidden-notes-badge');
        
        if (!trackerContainer || !lampTracker || !badge) return;

        if (notas.length > 0) {
            trackerContainer.style.display = 'flex'; // Garante que a barra flutuante esteja ativa
            lampTracker.style.display = 'flex';
            badge.textContent = notas.length;
        } else {
            lampTracker.style.display = 'none';
            // Oculta a barra inteira SOMENTE se o cronômetro também não estiver em uso
            const pill = document.getElementById('efficiency-tracker-pill');
            if (pill && pill.style.display === 'none') {
                trackerContainer.style.display = 'none';
            }
        }
        
        // Reseta o estado de navegação (evita out-of-bounds se uma nota for apagada)
        notaOcultaIndexAtual = -1;
    }

    function rolarParaProximaNotaOculta() {
        const notas = document.querySelectorAll('.sub-annotation-item.is-nota-interna.is-pendente');
        if (notas.length === 0) return;

        notaOcultaIndexAtual++;
        if (notaOcultaIndexAtual >= notas.length) notaOcultaIndexAtual = 0; // Loop infinito

        const notaAlvo = notas[notaOcultaIndexAtual];
        const scrollContainer = document.getElementById('history-container');
        
        if (notaAlvo && scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const alvoRect = notaAlvo.getBoundingClientRect();
            
            // Matemática segura: calcula a diferença top/top e adiciona o scrollTop atual
            // Subtrai 30px de margem (respiro) para a nota não grudar no teto do navegador
            const offset = (alvoRect.top - containerRect.top) + scrollContainer.scrollTop - 30;
            
            scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
            
            // Feedback visual tátil de foco (pisca a borda de amarelo)
            const cardInterno = notaAlvo.querySelector('.sub-annotation-card');
            cardInterno.style.transition = 'box-shadow 0.2s, border-color 0.2s';
            cardInterno.style.borderColor = '#ffb300';
            cardInterno.style.boxShadow = '0 0 0 4px rgba(255, 179, 0, 0.3), 4px 4px 0px rgba(0, 0, 0, 0.05)';
            
            setTimeout(() => {
                cardInterno.style.borderColor = ''; // Reseta para regra CSS original
                cardInterno.style.boxShadow = '';
            }, 1200);
        }
    }

    // API pública do módulo
    return {
        obterCor,
        obterCorContraste,
        renderizarFichario,
        getActiveTabId: () => activeTabId,
        setActiveTabId: (id) => { activeTabId = id; },
        escaparHTML,
        toggleTextExpansion,
        hexToRgba,
        rolarParaProximaNotaOculta
    };

})();
