import { app, auth } from './firebase-auth.js'; 
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, arrayUnion, query, orderBy, getDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);

window.AcervoManager = (function() {
    let modelosEmCache = [];

    function getUserId() {
        return auth.currentUser ? auth.currentUser.uid : null;
    }

    // HELPER 1: Geração de ID seguro e resiliente (Fallback para HTTP local)
    function _gerarIdSeguro(prefixo = 'mod-') {
        try {
            return prefixo + crypto.randomUUID();
        } catch (e) {
            console.warn("[AcervoManager] API Web Crypto indisponível. Usando fallback matemático.");
            return prefixo + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
        }
    }

    // HELPER 2: Dicionário de Erros Isolado (Evita string matching na UI)
    function _processarErroFirebase(erro, contexto) {
        console.error(`[AcervoManager] Falha em: ${contexto}`, erro);
        
        let msgUsuario = "Ocorreu um erro desconhecido ao comunicar com a nuvem.";
        
        // Mapeamento estrito baseado em código imutável do Firebase
        switch (erro.code) {
            case 'permission-denied':
                msgUsuario = "Acesso negado. Verifique as regras de segurança do banco de dados.";
                break;
            case 'unavailable':
            case 'network-request-failed':
                msgUsuario = "Sem conexão com a internet. Verifique sua rede e tente novamente.";
                break;
            case 'unauthenticated':
                msgUsuario = "Sua sessão expirou. Por favor, atualize a página e faça login novamente.";
                break;
        }

        // Lança um erro customizado que o app.js consiga ler de forma padronizada
        const erroTratado = new Error(msgUsuario);
        erroTratado.isCustom = true;
        throw erroTratado;
    }

    // HELPER NOVO: Lê a identidade do HTML para saber onde estamos rodando.
    // Retorna 'ro' como proteção caso a meta tag seja esquecida.
    function _getModuloAtual() {
        const metaTag = document.querySelector('meta[name="juris-module"]');
        return metaTag ? metaTag.content : 'ro';
    }

    async function salvarNovoModelo(nome, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado. Faça login.");

        const modeloId = _gerarIdSeguro();
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };
        const moduloContexto = _getModuloAtual();

        try {
            await setDoc(docRef, { 
                nome: nome, 
                criadoEm: Date.now(), 
                nos: [noLimpo],
                modulo: moduloContexto,
                escopo: noOriginal.escopoOriginal || 'card'
            });
            modelosEmCache = []; 
            return modeloId;
        } catch (e) {
            _processarErroFirebase(e, 'salvarNovoModelo (setDoc)');
        }
    }

    async function adicionarNoAModelo(modeloId, noOriginal) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado. Faça login.");

        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        const noLimpo = { intencao: noOriginal.intencao || 'premissa', texto: noOriginal.texto || '', timestamp: Date.now() };

        try {
            await updateDoc(docRef, { nos: arrayUnion(noLimpo), atualizadoEm: Date.now() });
            modelosEmCache = []; 
        } catch (e) {
             _processarErroFirebase(e, 'adicionarNoAModelo (updateDoc)');
        }
    }

    async function carregarModelos() {
        const uid = getUserId();
        if (!uid) return [];
        if (modelosEmCache.length > 0) return modelosEmCache;

        const q = query(collection(db, "usuarios", uid, "acervo"), orderBy("nome", "asc"));
        const querySnapshot = await getDocs(q);
        
        const modelos = [];
        const moduloContexto = _getModuloAtual(); // Qual painel está aberto?

        querySnapshot.forEach((docSnap) => {
            // TRAVA DE SEGURANÇA: Ignora o nosso arquivo de tags na listagem de modelos
            if (docSnap.id === "--CONFIG-TAGS--") return;
            
            const dadosModelo = docSnap.data();
            
            // TRATAMENTO DE RETROCOMPATIBILIDADE: 
            // Modelos antigos que não têm a propriedade 'modulo' assumem o valor 'ro'.
            // Evita que o usuário perca dados legado.
            const moduloDoModelo = dadosModelo.modulo || 'ro'; 

            // FILTRAGEM CLIENT-SIDE:
            // Compara o carimbo do modelo com a porta da sala. Se bater, mostra.
            if (moduloDoModelo === moduloContexto) {
                modelos.push({ id: docSnap.id, ...dadosModelo });
            }
        });
        
        modelosEmCache = modelos;
        return modelos;
    }

    // Funções Seguras de Escrita Direta (Bypassing Cache)
    async function atualizarNoDoModelo(modeloId, nodeIndex, dadosAtualizados) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        
        // 1. Fetch da fonte de verdade em tempo real
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error("Modelo não encontrado na nuvem.");
        
        const dadosModelo = docSnap.data();
        if (!dadosModelo.nos || !dadosModelo.nos[nodeIndex]) return;

        // 2. Mutação Segura
        dadosModelo.nos[nodeIndex] = { ...dadosModelo.nos[nodeIndex], ...dadosAtualizados };
        
        // 3. Update e Invalidação de Cache
        await updateDoc(docRef, { nos: dadosModelo.nos, atualizadoEm: Date.now() });
        modelosEmCache = []; 
    }

    async function removerNoDoModelo(modeloId, nodeIndex) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        
        // 1. Fetch da fonte de verdade
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error("Modelo não encontrado na nuvem.");
        
        const dadosModelo = docSnap.data();
        if (!dadosModelo.nos) return;

        // 2. Remoção do nó alvo
        dadosModelo.nos.splice(nodeIndex, 1); 
        
        // 3. Update e Invalidação de Cache
        await updateDoc(docRef, { nos: dadosModelo.nos, atualizadoEm: Date.now() });
        modelosEmCache = []; 
    }

    async function renomearModelo(modeloId, novoNome) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        await updateDoc(docRef, { nome: novoNome, atualizadoEm: Date.now() });
        modelosEmCache = []; // Invalidação agressiva de cache
    }

    async function excluirModeloCompleto(modeloId) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        await deleteDoc(docRef);
        modelosEmCache = []; // Invalidação agressiva de cache
    }

    async function salvarConfigTags(tagsArray) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        // MUDANÇA: Agora salva dentro da coleção 'acervo' para herdar suas permissões
        const docRef = doc(db, "usuarios", uid, "acervo", "--CONFIG-TAGS--");
        await setDoc(docRef, { lista: tagsArray, atualizadoEm: Date.now() });
    }

    async function carregarConfigTags() {
        const uid = getUserId();
        if (!uid) return [];
        
        // MUDANÇA: Lê do novo caminho autorizado
        const docRef = doc(db, "usuarios", uid, "acervo", "--CONFIG-TAGS--");
        const docSnap = await getDoc(docRef);
        return docSnap.exists() && docSnap.data().lista ? docSnap.data().lista : [];
    }

    async function atualizarTagEmTodosModelos(tagAntiga, tagNova) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        
        const modelos = await carregarModelos();
        const batch = writeBatch(db); // Transação Atômica Segura
        let operacoes = 0;

        modelos.forEach(mod => {
            if (mod.tags && mod.tags.includes(tagAntiga)) {
                let novasTags = mod.tags;
                if (tagNova === null) {
                    novasTags = mod.tags.filter(t => t !== tagAntiga); // Exclusão
                } else {
                    novasTags = mod.tags.map(t => t === tagAntiga ? tagNova : t); // Renomeação
                }
                const docRef = doc(db, "usuarios", uid, "acervo", mod.id);
                batch.update(docRef, { tags: novasTags });
                operacoes++;
            }
        });

        if (operacoes > 0) {
            await batch.commit();
            modelosEmCache = []; // Limpa cache
        }
    }

    async function atualizarTagsDoModelo(modeloId, tagsMarcadas) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        await updateDoc(docRef, { tags: tagsMarcadas, atualizadoEm: Date.now() });
        modelosEmCache = [];
    }

    async function atualizarEscopoDoModelo(modeloId, novoEscopo) {
        const uid = getUserId();
        if (!uid) throw new Error("Usuário não autenticado.");
        const docRef = doc(db, "usuarios", uid, "acervo", modeloId);
        await updateDoc(docRef, { escopo: novoEscopo, atualizadoEm: Date.now() });
        modelosEmCache = [];
    }

    return { 
        salvarNovoModelo, 
        adicionarNoAModelo, 
        carregarModelos, 
        atualizarNoDoModelo, 
        removerNoDoModelo,
        renomearModelo,
        excluirModeloCompleto,
        salvarConfigTags,
        carregarConfigTags,
        atualizarTagEmTodosModelos,
        atualizarTagsDoModelo,
        atualizarEscopoDoModelo
    };
})();
