/* ================================================
   pje-parser.js
   Módulo de Inteligência para Leitura do Sumário PJe
   Arquitetura Refatorada: Resiliência Vetorial e Heurística Reversa
   ================================================ */
window.PjeParser = (function () {
    'use strict';

    // Utilitário de sanitização de strings (Remove acentos e padroniza)
    const normalizeString = (str) => {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    };

    /**
     * Escaneia o PDF de trás para frente extraindo atalhos estratégicos.
     * @param {Object} pdfDoc - Instância PDF.js
     * @returns {Promise<Object>} - Ex: { contestacao: 15, sentenca: 120 }
     */
    async function mapearAtalhos(pdfDoc) {
        let atalhos = { contestacao: null, contestacaoRe2: null, sentenca: null };
        let contestacoesEncontradas = [];
        
        const maxPaginasScan = Math.min(40, pdfDoc.numPages); // Margem de segurança ampliada
        
        // Lemos de trás para frente. 
        // Achar "SUMÁRIO" significa que chegamos ao TOPO/INÍCIO da tabela.
        let reachedSummaryStart = false;

        for (let i = pdfDoc.numPages; i > pdfDoc.numPages - maxPaginasScan; i--) {
            try {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const fullTextNormal = normalizeString(textContent.items.map(t => t.str).join(' '));

                // Validação de segurança: se a página não tem características de índice, pula.
                if (!fullTextNormal.includes('DOCUMENTO') && !fullTextNormal.includes('TIPO') && !fullTextNormal.includes('SUMARIO')) {
                    // Se já tínhamos começado a ler o sumário e agora não achamos nada, 
                    // provavelmente saímos da tabela.
                    if (reachedSummaryStart) break; 
                    continue; 
                }

                if (fullTextNormal.includes('SUMARIO')) {
                    reachedSummaryStart = true; // Marcadador de que esta é a primeira página do sumário
                }

                const annotations = await page.getAnnotations();
                const linkAnns = annotations.filter(a => a.subtype === 'Link' && a.dest);

                // Agrupamento de texto pelo Eixo Y com precisão de escala
                const linhas = {};
                textContent.items.forEach(item => {
                    const y = Math.round(item.transform[5]); 
                    const height = Math.abs(item.transform[3]); // Altura real do caractere

                    if (!linhas[y]) linhas[y] = { texto: '', alturaReferencia: height };
                    linhas[y].texto += item.str + ' ';
                    linhas[y].alturaReferencia = Math.max(linhas[y].alturaReferencia, height);
                });

                // Análise das linhas encontradas
                for (const [yStr, dadosLinha] of Object.entries(linhas)) {
                    const y = parseInt(yStr);
                    const textoLinha = normalizeString(dadosLinha.texto);
                    let alvoEncontrado = null;

                    // Busca focada em padrões exatos para evitar falsos positivos
                    if (textoLinha.includes('CONTESTACAO')) {
                        alvoEncontrado = 'contestacao';
                    } else if (textoLinha.includes('SENTENCA') || textoLinha.includes('ACORDAO')) {
                        alvoEncontrado = 'sentenca';
                    }

                    if (alvoEncontrado) {
                        // Cálculo de Tolerância Dinâmica Baseado na Altura da Fonte (aprox. 75% da altura)
                        const tolerancia = dadosLinha.alturaReferencia * 0.75;

                        const link = linkAnns.find(a => {
                            const [, ly, , uy] = a.rect; 
                            return y >= Math.min(ly, uy) - tolerancia && y <= Math.max(ly, uy) + tolerancia;
                        });

                        if (link) {
                            let destino = link.dest;
                            if (typeof destino === 'string') {
                                destino = await pdfDoc.getDestination(destino);
                            }
                            
                            if (Array.isArray(destino)) {
                                const pageRef = destino[0];
                                let numPaginaTarget = null;
                                
                                if (typeof pageRef === 'object' && pageRef !== null) {
                                    numPaginaTarget = (await pdfDoc.getPageIndex(pageRef)) + 1;
                                } else if (Number.isInteger(pageRef)) {
                                    numPaginaTarget = pageRef + 1;
                                }
                                
                                if (numPaginaTarget) {
                                    if (alvoEncontrado === 'sentenca' && !atalhos.sentenca) {
                                        atalhos.sentenca = numPaginaTarget;
                                    } else if (alvoEncontrado === 'contestacao') {
                                        if (!contestacoesEncontradas.includes(numPaginaTarget)) {
                                            contestacoesEncontradas.push(numPaginaTarget);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // CONDICIONAL DE FUGA OTIMIZADA
                if (contestacoesEncontradas.length >= 2 && atalhos.sentenca) break;
                
                // Condição de Saída 2: Lendo de trás pra frente, achamos o cabeçalho principal "SUMÁRIO", 
                // indicando que a tabela acabou nesta página (o início dela).
                if (reachedSummaryStart) break;

            } catch (err) {
                console.warn(`[PjeParser] Falha silenciosa na leitura da página ${i}:`, err);
            }
        }
        
        // ATRIBUIÇÃO FINAL COM ORDENAÇÃO
        contestacoesEncontradas.sort((a, b) => a - b);
        if (contestacoesEncontradas.length > 0) atalhos.contestacao = contestacoesEncontradas[0];
        if (contestacoesEncontradas.length > 1) atalhos.contestacaoRe2 = contestacoesEncontradas[1];

        return atalhos;
    }

    return { mapearAtalhos };
})();
