/* ================================================
   ai-recommendation-service.js
   Módulo de Integração com IA (Groq API) Padrão BYOK
   ================================================ */
window.AIRecommendationManager = (function() {
    'use strict';

    const STORAGE_KEY = 'juris_groq_api_key';
    const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Trocado para modelo rápido e sem tags <think>

    function _obterChaveAPI() {
        let key = localStorage.getItem(STORAGE_KEY);
        if (!key) {
            key = prompt('🔑 Integração IA: Insira sua API Key da Groq para habilitar a recomendação inteligente de modelos.\n\n(Ela será salva localmente no seu navegador).');
            if (key && key.trim().length > 10) {
                localStorage.setItem(STORAGE_KEY, key.trim());
            } else {
                return null;
            }
        }
        return key;
    }

    async function buscarModelosCompativeis(topicoId, textoAlegacoes) {
        if (!textoAlegacoes || textoAlegacoes.trim() === '') return window.exibirToast?.('Redija as Razões Recursais primeiro.', 'aviso');
        
        const apiKey = _obterChaveAPI();
        if (!apiKey) return;

        const modelos = await AcervoManager.carregarModelos();
        if (modelos.length === 0) return window.exibirToast?.('Seu acervo está vazio.', 'aviso');

        // PAYLOAD OTIMIZADO: Apenas ID e Título
        const catalogoComprimido = modelos.map(m => `ID: ${m.id} | Título: ${m.nome}`).join("\n");

        const btnIcon = document.querySelector('.preamble-alegacao .ai-trigger-btn');
        if (btnIcon) btnIcon.classList.add('is-thinking');
        if (window.exibirToast) exibirToast('IA analisando o Acervo...', 'info');

        try {
            const prompt = `Atue como um indexador jurídico. Analise a tese e encontre os modelos compatíveis.
TESE: "${textoAlegacoes}"

ACERVO:
${catalogoComprimido}

REGRA ESTABELECIDA:
Se houver modelos compatíveis, responda OBRIGATORIAMENTE no formato exato: [IDs: mod-xxx, mod-yyy]
Se NÃO houver NENHUM modelo compatível com o tema, responda OBRIGATORIAMENTE: [IDs: NENHUM]`;

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: GROQ_MODEL, 
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 800 // Permitimos o raciocínio completo do modelo para evitar truncation
                })
            });

            if (!response.ok) throw new Error("Falha na API da IA.");

            const data = await response.json();
            const respostaBruta = data?.choices?.[0]?.message?.content || "";

            // EXTRAÇÃO BLINDADA: Busca por "NENHUM" dentro do padrão
            if (respostaBruta.includes("NENHUM")) {
                if (window.exibirToast) exibirToast('Nenhum modelo de alta afinidade encontrado.', 'aviso');
                return; 
            }

            // EXTRAÇÃO BLINDADA: Coleta apenas os IDs no padrão 'mod-[qualquer coisa permitida no Firebase]'
            const idsExtraidos = respostaBruta.match(/mod-[a-zA-Z0-9_-]+/g);

            if (!idsExtraidos || idsExtraidos.length === 0) {
                if (window.exibirToast) exibirToast('Nenhum modelo foi classificado como compatível.', 'aviso');
                return;
            }

            console.log("[Juris IA] Recomendações:", idsExtraidos);

            // Abre a UI no Modo IA
            if (typeof aplicarFiltroIAAcervo === 'function') {
                aplicarFiltroIAAcervo(idsExtraidos);
                if (window.exibirToast) exibirToast('Filtro de Inteligência Artificial aplicado ✨', 'sucesso');
            }

        } catch (error) {
            console.error("[Juris IA Error]", error);
            if (window.exibirToast) exibirToast('Falha na comunicação com a Inteligência Artificial.', 'erro');
        } finally {
            if (btnIcon) btnIcon.classList.remove('is-thinking');
        }
    }

    // Limpar chave manualmente, se necessário no futuro
    function resetarCredenciais() {
        localStorage.removeItem(STORAGE_KEY);
        if (window.exibirToast) exibirToast('Credenciais da IA resetadas.', 'sucesso');
    }

    return { buscarModelosCompativeis, resetarCredenciais };
})();