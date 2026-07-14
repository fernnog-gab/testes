/* ================================================
   store.js
   Gerenciamento de Estado Centralizado (Redux-Pattern)
   Prepara a base para remoção das mutações do array global.
   ================================================ */
window.Store = (function() {
    'use strict';
    
    let state = { topicos: [], activeTabId: null };
    const subscribers = [];
    
    // Middleware Central para Side Effects Impuros
    function applyMiddlewares(action, oldState, newState) {
        const mutatingActions = ['ADD_ITEM', 'DELETE_ITEM', 'UPDATE_ITEM', 'REORDER_ITEM', 'LOAD_BACKUP'];
        
        if (mutatingActions.includes(action.type)) {
            // Emissão segura assíncrona (não bloqueia a renderização e o Diffing)
            setTimeout(() => {
                if (window.salvarBackupAutomatico) window.salvarBackupAutomatico();
                if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
            }, 0);
        }
    }

    function dispatch(action) {
        const oldState = state;
        const newState = structuredClone(state); // Imutabilidade Robusta via v8

        switch (action.type) {
            case 'LOAD_BACKUP':
                newState.topicos = action.payload;
                break;
                
            case 'SET_TAB':
                newState.activeTabId = action.payload;
                break;
                
            case 'ADD_THESIS_DIRECTIVE': {
                const { topicoId, teseNome, noIdeia } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    if (!topico.diretrizesPorTese) topico.diretrizesPorTese = {};
                    if (!topico.diretrizesPorTese[teseNome]) topico.diretrizesPorTese[teseNome] = [];
                    noIdeia.uuid = noIdeia.uuid || 'id-' + crypto.randomUUID();
                    topico.diretrizesPorTese[teseNome].push(noIdeia);
                }
                break;
            }
                
            case 'DELETE_THESIS_DIRECTIVE': {
                const { topicoId, teseNome, uuid } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico && topico.diretrizesPorTese && topico.diretrizesPorTese[teseNome]) {
                    topico.diretrizesPorTese[teseNome] = topico.diretrizesPorTese[teseNome].filter(n => n.uuid !== uuid);
                }
                break;
            }
                
            case 'ADD_GLOBAL_DIRECTIVE': {
                const { topicoId, noIdeia } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    if (!topico.diretrizesGlobais) topico.diretrizesGlobais = [];
                    noIdeia.uuid = noIdeia.uuid || 'id-' + crypto.randomUUID();
                    topico.diretrizesGlobais.push(noIdeia);
                }
                break;
            }
                
            case 'DELETE_GLOBAL_DIRECTIVE': {
                const { topicoId, uuid } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico && topico.diretrizesGlobais) {
                    topico.diretrizesGlobais = topico.diretrizesGlobais.filter(n => n.uuid !== uuid);
                }
                break;
            }

            case 'DELETE_ITEM':
                // Transição: Quando a App usar o Store ativamente, a deleção será via UUID.
                // Exemplo: t.anotacoes = t.anotacoes.filter(a => a.uuid !== action.payload.uuid);
                const { topicoId, index } = action.payload;
                const topico = newState.topicos.find(t => t.id === topicoId);
                if (topico) {
                    topico.anotacoes.splice(index, 1);
                }
                
                // Mapeamento transitório para refletir no array global antigo
                if (window.topicos) {
                    const topGlobal = window.topicos.find(t => t.id === topicoId);
                    if (topGlobal) topGlobal.anotacoes.splice(index, 1);
                }
                break;
        }

        state = newState;
        applyMiddlewares(action, oldState, newState);
        
        // Notifica views inscritas
        subscribers.forEach(sub => sub(state));
    }

    return { 
        getState: () => state, 
        dispatch, 
        subscribe: (fn) => subscribers.push(fn) 
    };
})();
