/* ================================================
   backup-manager.js — v2.1
   Gerenciador de Sessão e Integridade de Backup

   Padrão de módulo IIFE: estado privado inacessível
   externamente; app.js consome apenas window.BackupManager.*
   DEVE ser carregado ANTES de app.js no HTML.
   ================================================ */
window.BackupManager = (function () {
    'use strict';

    /* ── Estado Privado ──────────────────────────────── */
    let _processoId  = null;   // Nome-base canônico do arquivo (sem extensão, minúsculas)
    let _pdfHash     = null;   // Hash SHA-256 hex do binário do PDF (o "cadeado")
    let _fileHandle  = null;   // FileSystemFileHandle do .json de backup ativo

    /* ── Utilitários Privados ────────────────────────── */

    /**
     * Calcula o hash SHA-256 de um ArrayBuffer.
     * Usa SubtleCrypto (API nativa do Chromium — sem dependências externas).
     * Não detacha nem consome o buffer; pode ser reusado após a chamada.
     * @param {ArrayBuffer} buffer
     * @returns {Promise<string>} Hash em hexadecimal (64 caracteres)
     */
    async function _calcularHash(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Extrai o identificador canônico do processo a partir do nome do arquivo.
     * Remove a extensão e normaliza para minúsculas, eliminando falsos-negativos
     * causados por variações de casing entre sistemas operacionais.
     *
     * Exemplos:
     *   "Processo_0001597-85.2024.5.23.0005.pdf" → "processo_0001597-85.2024.5.23.0005"
     *   "Processo_0001597-85.2024.5.23.0005.json" → "processo_0001597-85.2024.5.23.0005"
     *
     * @param {string} nomeArquivo
     * @returns {string}
     */
    function _extrairId(nomeArquivo) {
        return nomeArquivo.replace(/\.[^/.]+$/, '').toLowerCase();
    }

    /**
     * Serializa o payload completo do backup (metadata + dados).
     * @param {Array} topicos  Array topicos[] do estado global de app.js
     * @returns {string} JSON formatado com 2 espaços de indentação
     */
    function _empacotar(topicos) {
        const possuiAudio = topicos.some(t =>
            t.anotacoes.some(a =>
                a.tipo === 'audio' ||
                (a.itensCorrelacionados && a.itensCorrelacionados.some(ic => ic.tipo === 'audio'))
            )
        );
        const atalhosCapturados = window.ShortcutManager ? window.ShortcutManager.getState() : null;
        return JSON.stringify({
            metadata: {
                processoId:        _processoId,
                pdfHash:           _pdfHash,
                possuiAudio:       possuiAudio,
                balancaHtml:       window.BalancaManager ? window.BalancaManager.getHtmlState() : null,
                versaoApp:         '7.0', // MARCO DA NOVA ARQUITETURA E LIMPEZA DE VEREDITO
                ultimaAtualizacao: Date.now(),
                atalhosPdf:        atalhosCapturados
            },
            dados: topicos
        }, null, 2);
    }

    /**
     * Parser retrocompatível: suporta o formato legado v1.0 (array puro)
     * e o formato atual v2.x (objeto com metadata + dados).
     * Garante que backups criados antes desta versão continuem funcionando.
     * Lança um erro descritivo se o conteúdo não for reconhecido.
     *
     * @param {string} textoJson  Conteúdo bruto do arquivo .json
     * @returns {{ metadata: object, dados: Array }}
     */
    function _gerarUUID() {
        return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    function _desempacotar(textoJson) {
        const obj = JSON.parse(textoJson); // SyntaxError se JSON inválido
        let pacote = obj;
        
        // Formato legado v1.0: array puro de tópicos (sem metadata)
        if (Array.isArray(obj)) {
            pacote = {
                metadata: { processoId: null, pdfHash: null, versaoApp: '1.0' },
                dados:    obj
            };
        } else if (!obj || typeof obj !== 'object' || !Array.isArray(obj.dados)) {
            throw new Error('Estrutura de backup não reconhecida.');
        }

        // MUDANÇA ARQUITETURAL: Migração Silenciosa de Nós de Ideia (v3.0)
        if (pacote.metadata.versaoApp !== '3.0') {
            pacote.dados.forEach(topico => {
                topico.anotacoes.forEach(anotacao => {
                    // 1. Inicializa a mochila dos filhos
                    if (anotacao.itensCorrelacionados) {
                        anotacao.itensCorrelacionados.forEach(item => {
                            if (!item.subAnotacoes) item.subAnotacoes = [];
                        });
                    }
                    
                    // 2. Realoca os nós perdidos no mestre
                    if (anotacao.subAnotacoes && anotacao.subAnotacoes.length > 0) {
                        const nosDoMestre = [];
                        anotacao.subAnotacoes.forEach(sub => {
                            if (sub.sourceRef !== undefined && sub.sourceRef !== 'main') {
                                const cIdx = parseInt(sub.sourceRef, 10);
                                if (!isNaN(cIdx) && anotacao.itensCorrelacionados && anotacao.itensCorrelacionados[cIdx]) {
                                    delete sub.sourceRef; 
                                    anotacao.itensCorrelacionados[cIdx].subAnotacoes.push(sub);
                                } else {
                                    nosDoMestre.push(sub); // Fallback caso filho não exista
                                }
                            } else {
                                delete sub.sourceRef;
                                nosDoMestre.push(sub);
                            }
                        });
                        anotacao.subAnotacoes = nosDoMestre;
                    }
                });
            });
        }
        
        // MUDANÇA ARQUITETURAL: Normalização de UUIDs (v4.0 Keyed Morphing)
        // Garante que todo dado legado ganhe uma chave única persistente.
        pacote.dados.forEach(topico => {
            if (!topico.uuid) topico.uuid = _gerarUUID();
            
            topico.anotacoes.forEach(anotacao => {
                if (!anotacao.uuid) anotacao.uuid = _gerarUUID();
                
                if (anotacao.itensCorrelacionados) {
                    anotacao.itensCorrelacionados.forEach(item => {
                        if (!item.uuid) item.uuid = _gerarUUID();
                        if (item.subAnotacoes) item.subAnotacoes.forEach(sub => { if (!sub.uuid) sub.uuid = _gerarUUID(); });
                    });
                }
                if (anotacao.subAnotacoes) {
                    anotacao.subAnotacoes.forEach(sub => { if (!sub.uuid) sub.uuid = _gerarUUID(); });
                }
            });
        });
        
        // MUDANÇA ARQUITETURAL: Migração de Razões Recursais e Fundamentos para o Topo (v5.0/6.0) e Normalização de Diretrizes (v7.0)
        pacote.dados.forEach(topico => {
            // Inicializa propriedades se não existirem
            if (topico.alegacoes === undefined) topico.alegacoes = '';
            if (topico.fundamentos === undefined) topico.fundamentos = '';
            if (topico.diretrizesGlobais === undefined) topico.diretrizesGlobais = [];
            if (topico.diretrizesPorTese === undefined) topico.diretrizesPorTese = {};

            let extraiuAlegacoes = [];
            let extraiuFundamentos = [];

            // Função auxiliar para varrer e extirpar nós antigos
            const limparNosLegados = (listaNos) => {
                if (!listaNos) return listaNos;
                return listaNos.filter(sub => {
                    if (!sub.uuid) sub.uuid = _gerarUUID(); // Garante UUID (Keyed Morphing)

                    if (sub.intencao === 'alegacao') {
                        extraiuAlegacoes.push(sub.texto);
                        return false; // Remove do array original
                    }
                    if (sub.intencao === 'fundamento_sentenca') {
                        extraiuFundamentos.push(sub.texto);
                        return false; // Remove do array original
                    }
                    // NORMALIZAÇÃO: Move intenções globais para o Root do Tópico
                    if (['fundamentacao', 'preliminar', 'veredito'].includes(sub.intencao)) {
                        topico.diretrizesGlobais.push(sub);
                        return false; // Remove do array original local
                    }
                    return true; // Mantém as outras intenções na prova
                });
            };

            topico.anotacoes.forEach(anotacao => {
                anotacao.subAnotacoes = limparNosLegados(anotacao.subAnotacoes);
                if (anotacao.itensCorrelacionados) {
                    anotacao.itensCorrelacionados.forEach(item => {
                        item.subAnotacoes = limparNosLegados(item.subAnotacoes);
                    });
                }
            });

            // Se encontrou dados legados, promove para as propriedades de topo
            if (extraiuAlegacoes.length > 0 && !topico.alegacoes) {
                topico.alegacoes = extraiuAlegacoes.join('\n\n');
            }
            if (extraiuFundamentos.length > 0 && !topico.fundamentos) {
                topico.fundamentos = extraiuFundamentos.join('\n\n');
            }
        });

        return pacote;
    }

    /* ── API Pública ─────────────────────────────────── */

    /**
     * Registra uma nova sessão a partir do PDF selecionado.
     * Calcula o hash SHA-256 do binário — este hash é o "cadeado" que
     * será gravado no JSON e verificado em toda retomada futura.
     *
     * @param {string}      nomeArquivo  Nome original do arquivo (ex: "Processo_0001.pdf")
     * @param {ArrayBuffer} arrayBuffer  Binário completo do PDF (do FileReader)
     */
    async function iniciarSessao(nomeArquivo, arrayBuffer) {
        _processoId = _extrairId(nomeArquivo);
        _pdfHash    = await _calcularHash(arrayBuffer);
        _fileHandle = null; // Preenchido por setFileHandle() após showSaveFilePicker()
    }

    /**
     * Lê, valida e desempacota um arquivo de backup JSON.
     * Popula _processoId e _pdfHash a partir do metadata encontrado.
     * Lança um erro (para a UI tratar) se o arquivo não for um backup válido.
     *
     * @param {FileSystemFileHandle} handle  Handle obtido por showOpenFilePicker()
     * @returns {Promise<{ metadata: object, dados: Array }>}
     */
    async function carregarJson(handle) {
        const arquivo = await handle.getFile();
        const texto   = await arquivo.text();
        const pacote  = _desempacotar(texto); // Lança erro se estrutura inválida

        // Restaura metadados no estado privado
        _processoId  = pacote.metadata.processoId;
        _pdfHash     = pacote.metadata.pdfHash;
        _fileHandle  = handle;

        if (window.ShortcutManager) {
            if (pacote.metadata.atalhosPdf) {
                window.ShortcutManager.setState(pacote.metadata.atalhosPdf);
            } else {
                window.ShortcutManager.reset();
            }
        }
        
        if (window.BalancaManager) {
            window.BalancaManager.restoreHtmlState(pacote.metadata.balancaHtml || null);
        }

        return pacote;
    }

    /**
     * Valida se o PDF apresentado corresponde ao hash registrado no backup.
     * Se não há hash gravado (backup legado v1.0), aceita qualquer PDF
     * em modo de confiança — o UI deve informar o usuário desta diferença.
     *
     * @param {ArrayBuffer} arrayBuffer  Binário do PDF a validar
     * @returns {Promise<boolean>}
     */
    async function validarPdf(arrayBuffer) {
        if (!_pdfHash) {
            // Backup legado: hash não registrado — modo de confiança
            return true;
        }
        const hashCalculado = await _calcularHash(arrayBuffer);
        return hashCalculado === _pdfHash;
    }

    /**
     * Serializa topicos[] e grava no arquivo de backup ativo.
     * Silencioso em caso de sucesso; lança erro para a UI tratar falhas.
     *
     * @param {Array} topicos  Array topicos[] do estado global de app.js
     */
    async function salvar(topicos) {
        if (!_fileHandle) {
            console.warn('BackupManager.salvar(): nenhum arquivo de backup ativo.');
            return;
        }
        const writable = await _fileHandle.createWritable();
        await writable.write(_empacotar(topicos));
        await writable.close();
    }

    /**
     * Encerra a sessão, zerando completamente o estado privado.
     * Chamado por encerrarSessao() e novoProcesso() em app.js.
     */
    function encerrar() {
        _processoId = null;
        _pdfHash    = null;
        _fileHandle = null;
    }

    /* ── Getters e Setter ────────────────────────────── */
    function getProcessoId()       { return _processoId; }
    function isAtivo()             { return _fileHandle !== null; }

    /**
     * Registra o FileSystemFileHandle obtido por showSaveFilePicker().
     * Separado de iniciarSessao() pois o diálogo pode ser cancelado pelo usuário.
     * @param {FileSystemFileHandle} handle
     */
    function setFileHandle(handle) { _fileHandle = handle; }

    /* ── Exportação da API ───────────────────────────── */
    return {
        iniciarSessao,
        carregarJson,
        validarPdf,
        salvar,
        encerrar,
        getProcessoId,
        isAtivo,
        setFileHandle
    };
})();
