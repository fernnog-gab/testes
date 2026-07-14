/* ================================================
   audio-manager.js
   Módulo de gravação de marcadores de Oitiva.
   ================================================ */
window.AudioManager = (function() {
    'use strict';

    let _deps = {}; // Recebe dependências externas via init()
    let _audioUrl = null;
    let _timeStart = null;
    let _timeEnd = null;
    let _listenerTrechoAtivo = null; // Guarda a referência da função atual do timeupdate
    let _listenerInterrupcao = null; // Guarda eventos nativos (pause/seek) que anulam a reprodução
    let _isInternalNavigation = false; // Flag para prevenir loop infinito
    let _eventosAudioRegistrados = false; // Flag para padrão Idempotent

    /**
     * Máquina de Estado Visual do Ícone de Áudio
     */
    function syncIndicatorState() {
        const audio = document.getElementById('main-audio-player');
        const indicator = document.getElementById('active-audio-indicator');
        if (!indicator || !audio) return;

        const isPanelOpen = isPlayerVisivel();
        const isPlaying = !audio.paused && !audio.ended;

        indicator.classList.remove('playing-audio', 'is-spinning');

        if (isPlaying) {
            indicator.classList.add('playing-audio', 'is-spinning');
        } else if (isPanelOpen) {
            indicator.classList.add('playing-audio');
        }
    }

    /**
     * Registra os ouvintes uma única vez no ciclo de vida do DOM.
     */
    function registrarEventosAudio() {
        if (_eventosAudioRegistrados) return;
        
        const audio = document.getElementById('main-audio-player');
        if (audio) {
            audio.addEventListener('play', syncIndicatorState);
            audio.addEventListener('pause', syncIndicatorState);
            audio.addEventListener('ended', syncIndicatorState);
            _eventosAudioRegistrados = true;
        }
    }

    function isPlayerVisivel() {
        const p = document.getElementById('audio-player-panel');
        return p && p.style.display !== 'none';
    }

    // --- Injeção de Dependências ---
    function init(dependencies) {
        _deps = dependencies;
    }

    function formatTime(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return "--h --' --''";
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        
        return h > 0 ? `${h}h ${m}' ${s}''` : `${m}' ${s}''`;
    }

    async function iniciarSessao() {
        const topicosAtuais = _deps.getTopicos();
        if (!topicosAtuais || topicosAtuais.length === 0) {
            _deps.exibirToast('Crie pelo menos um Tópico Recursal antes de analisar a audiência.', 'aviso');
            return;
        }

        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Áudio da Audiência (MP3/WAV)',
                    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] }
                }]
            });
            const file = await fileHandle.getFile();

            if (_audioUrl) URL.revokeObjectURL(_audioUrl);
            _audioUrl = URL.createObjectURL(file);

            document.getElementById('main-audio-player').src = _audioUrl;
            registrarEventosAudio();
            document.getElementById('active-audio-indicator').style.display = 'flex';

            abrirPlayer();
            _deps.exibirToast('Audiência carregada com sucesso!', 'sucesso');
        } catch (err) {
            if (err.name !== 'AbortError') _deps.exibirToast('Erro ao carregar o arquivo.', 'erro');
        }
    }

    function abrirPlayer() { 
        document.getElementById('audio-player-panel').style.display = 'flex'; 
        
        if (window.toggleModoFoco) window.toggleModoFoco(true);
        
        const indicator = document.getElementById('active-audio-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            indicator.classList.remove('pending-audio');
        }
        
        syncIndicatorState();
        atualizarHistoricoAudio(); 
    }

    function fecharPlayer() { 
        document.getElementById('audio-player-panel').style.display = 'none'; 
        
        if (window.toggleModoFoco) window.toggleModoFoco(false);
        
        syncIndicatorState(); 
    }
    
    function prepararRetomada() {
        const activeIndicator = document.getElementById('active-audio-indicator');
        if (activeIndicator) {
            activeIndicator.style.display = 'flex';
            activeIndicator.classList.add('pending-audio');
        }
        _deps.exibirToast('Áudios detectados na sessão! Clique no microfone pulsante para anexar o arquivo MP3.', 'aviso');
    }

    async function alternarPlayer() {
        if (!_audioUrl) {
            try {
                await solicitarMp3Retomada();
            } catch (e) {
                _deps.exibirToast('Carregamento do arquivo MP3 foi cancelado.', 'aviso');
                return;
            }
            
            if (!_audioUrl) return; 

            const activeIndicator = document.getElementById('active-audio-indicator');
            if (activeIndicator) activeIndicator.classList.remove('pending-audio');
        }
        
        if (!isPlayerVisivel()) {
            if (document.body.dataset.activeTab !== 'leitura') {
                _isInternalNavigation = true;
                if (window.trocarAba) window.trocarAba('leitura');
                _isInternalNavigation = false;
            }
            abrirPlayer();
        } else {
            fecharPlayer();
        }
    }

    function onTabChange(aba) {
        if (_isInternalNavigation) return;
        if (aba !== 'leitura' && isPlayerVisivel()) {
            fecharPlayer();
        }
    }

    function marcarInicio() {
        const audio = document.getElementById('main-audio-player');
        _timeStart = audio.currentTime;
        document.getElementById('audio-marker-start').innerText = `Início: ${formatTime(_timeStart)}`;
        _deps.exibirToast('Início marcado. Avance o áudio e marque o fim.', 'sucesso');
    }

    function marcarFim() {
        const audio = document.getElementById('main-audio-player');
        if (_timeStart === null) {
            _deps.exibirToast('Marque o início do trecho primeiro!', 'aviso');
            return;
        }
        _timeEnd = audio.currentTime;
        if (_timeEnd <= _timeStart) {
            _deps.exibirToast('O fim deve ser maior que o início.', 'erro');
            return;
        }
        document.getElementById('audio-marker-end').innerText = `Fim: ${formatTime(_timeEnd)}`;

        audio.pause();
        abrirModalClassificacao();
    }

    function abrirModalClassificacao() {
        if (window.toggleModoFoco) window.toggleModoFoco(true);
        const selectTopico = document.getElementById('audio-topic-select');
        selectTopico.innerHTML = '<option value="">Selecione o Tópico...</option>';

        const topicosAtuais = _deps.getTopicos();
        topicosAtuais.forEach(t => selectTopico.appendChild(new Option(t.nome, t.id)));

        document.getElementById('audio-speaker-role').value = '';
        document.getElementById('audio-speaker-side-box').style.display = 'none';
        document.getElementById('audio-comment').value = '';
        // CORREÇÃO: ID corrigido de 'audio-transcription' para 'audio-degravacao',
        // alinhado com o ID real do elemento no DOM.
        document.getElementById('audio-degravacao').value = '';

        const backdrop = document.getElementById('wizard-backdrop');
        if (backdrop) backdrop.style.display = 'block';
        document.getElementById('audio-classification-popup').style.display = 'flex';
    }

    function onRoleChange() {
        const role = document.getElementById('audio-speaker-role').value;
        const sideBox = document.getElementById('audio-speaker-side-box');
        if (role === 'Testemunha' || role === 'Advogado') {
            sideBox.style.display = 'block';
        } else {
            sideBox.style.display = 'none';
        }
    }

    // CORREÇÃO: Adicionado optional chaining para evitar TypeError quando nenhum
    // radio button estiver selecionado (querySelector retornaria null).
    function toggleAgrupar() {
        const checkedRadio = document.querySelector('input[name="modo_agrupar_audio"]:checked');
        const agrupar = checkedRadio?.value === 'agrupar';
        document.getElementById('audio-input-ideia').style.display = agrupar ? 'block' : 'none';
    }

    function salvarRecorte() {
        const topicoId = document.getElementById('audio-topic-select').value;
        const role = document.getElementById('audio-speaker-role').value;

        // CORREÇÃO BUG #1: ID corrigido de 'audio-transcription' para 'audio-degravacao'.
        // O elemento correto no DOM tem o id 'audio-degravacao'. O uso de 'audio-transcription'
        // retornava null, causando o TypeError: Cannot read properties of null (reading 'value').
        const transcricao = document.getElementById('audio-degravacao').value.trim();
        const comment = document.getElementById('audio-comment').value.trim();

        if (!topicoId || !role) {
            _deps.exibirToast('Tópico e Orador são obrigatórios.', 'aviso'); return;
        }

        let polo = '';
        let oradorFinal = '';

        if (role === 'Testemunha' || role === 'Advogado') {
            polo = document.getElementById('audio-speaker-side').value;
            oradorFinal = `${role} da ${polo}`;
        } else if (role === 'Preposto') {
            polo = 'Parte Ré';
            oradorFinal = 'Preposto (Parte Ré)';
        } else if (role === 'Juízo') {
            polo = 'Juízo';
            oradorFinal = 'Magistrado / Juízo';
        } else if (role === 'Parte Autora') {
            polo = 'Parte Autora';
            oradorFinal = 'Depoimento Pessoal (Autora)';
        } else if (role === 'Parte Ré') {
            polo = 'Parte Ré';
            oradorFinal = 'Depoimento Pessoal (Ré)';
        }

        let targetIndex = null;
        const checkedRadio = document.querySelector('input[name="modo_agrupar_audio"]:checked');
        if (checkedRadio?.value === 'agrupar') {
            const numero = parseInt(document.getElementById('audio-input-ideia').value, 10);
            const topicosAtuais = _deps.getTopicos();
            const topico = topicosAtuais.find(t => t.id === topicoId);

            if (isNaN(numero) || numero < 1 || numero > topico.anotacoes.length) {
                _deps.exibirToast('Número de agrupamento inválido.', 'erro'); return;
            }
            targetIndex = numero - 1;
        }

        // CORREÇÃO BUG #2: Chave do objeto corrigida de `transcricao: degravacao` para
        // `transcricao: transcricao`. A variável `degravacao` não existia neste escopo,
        // o que causaria um ReferenceError e/ou salvaria o campo com valor undefined.
        const conteudoFormatado = JSON.stringify({
            inicio: _timeStart,
            fim: _timeEnd,
            oradorStr: oradorFinal,
            role: role,
            poloTag: polo,
            labelInicio: formatTime(_timeStart),
            labelFim: formatTime(_timeEnd),
            transcricao: transcricao
        });

        _deps.salvarAnotacao('audio', conteudoFormatado, 'Ata de Audiência / MP3', polo, topicoId, comment, targetIndex);

        cancelarAnotacao(); // Fecha o modal
        
        // Força a pausa da mídia ao concluir o recorte
        const audio = document.getElementById('main-audio-player');
        if (audio && !audio.paused) {
            audio.pause();
        }
        
        fecharPlayer();     // Força o player a minimizar e aciona syncIndicatorState
        atualizarHistoricoAudio(); // Mitiga falha de sincronização apontada no relatório
        _deps.exibirToast('Trecho da oitiva salvo!', 'sucesso');
    }

    function cancelarAnotacao() {
        const playerAberto = isPlayerVisivel();
        
        if (window.toggleModoFoco && playerAberto === false) {
            window.toggleModoFoco(false);
        }

        document.getElementById('audio-classification-popup').style.display = 'none';
        const backdrop = document.getElementById('wizard-backdrop');
        if (backdrop) backdrop.style.display = 'none';

        _timeStart = null; _timeEnd = null;
        document.getElementById('audio-marker-start').innerText = `Início: ${formatTime(null)}`;
        document.getElementById('audio-marker-end').innerText = `Fim: ${formatTime(null)}`;
    }

    function encerrar() {
        if (_audioUrl) {
            URL.revokeObjectURL(_audioUrl);
            _audioUrl = null;
        }
        const player = document.getElementById('main-audio-player');
        if (player) player.src = '';

        const activeIndicator = document.getElementById('active-audio-indicator');
        if (activeIndicator) {
            activeIndicator.style.display = 'none';
            activeIndicator.classList.remove('pending-audio');
        }

        fecharPlayer();
        _timeStart = null;
        _timeEnd = null;
    }

    async function solicitarMp3Retomada() {
        _deps.exibirToast('Anotações de audiência detectadas. Localize o arquivo MP3 correspondente.', 'aviso');
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Áudio da Audiência (MP3/WAV)',
                    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] }
                }]
            });
            const file = await fileHandle.getFile();
            if (_audioUrl) URL.revokeObjectURL(_audioUrl);
            _audioUrl = URL.createObjectURL(file);
            document.getElementById('main-audio-player').src = _audioUrl;
            
            registrarEventosAudio();

            const activeIndicator = document.getElementById('active-audio-indicator');
            if (activeIndicator) activeIndicator.style.display = 'flex';

            abrirPlayer();
            _deps.exibirToast('Áudio restaurado com sucesso!', 'sucesso');
        } catch (err) {
            if (err.name !== 'AbortError') _deps.exibirToast('Erro ao carregar o arquivo MP3.', 'erro');
        }
    }

    /**
     * Função Atômica: Desmonta os "espiões" do player de áudio com segurança.
     * Previne sobreposição de eventos e vazamento de memória.
     */
    function _limparMonitoramentoTrecho(audio) {
        if (_listenerTrechoAtivo) {
            audio.removeEventListener('timeupdate', _listenerTrechoAtivo);
            _listenerTrechoAtivo = null;
        }
        if (_listenerInterrupcao) {
            audio.removeEventListener('pause', _listenerInterrupcao);
            audio.removeEventListener('seeked', _listenerInterrupcao);
            _listenerInterrupcao = null;
        }
    }

    /**
     * Toca um fragmento exato e lida com permissões assíncronas do navegador.
     */
    async function tocarTrecho(inicio, fim) {
        if (!_audioUrl) {
            _deps.exibirToast('Carregue o arquivo MP3 da audiência para ouvir o trecho.', 'aviso');
            await solicitarMp3Retomada();
            if (!_audioUrl) return; // Abortado pelo usuário
        }

        abrirPlayer();
        const audio = document.getElementById('main-audio-player');

        // 1. Limpeza rigorosa de execuções concorrentes (Teardown)
        _limparMonitoramentoTrecho(audio);

        // 2. Prepara o áudio
        audio.currentTime = inicio;

        // 3. Define o observador de interrupção externa (Ex: usuário pausou manualmente)
        _listenerInterrupcao = function() {
            // Se o usuário interagiu, quebramos o "piloto automático"
            _limparMonitoramentoTrecho(audio);
        };
        audio.addEventListener('pause', _listenerInterrupcao);
        audio.addEventListener('seeked', _listenerInterrupcao);

        // 4. Inicia reprodução com proteção contra rejeição de Promessa (Erro de Autoplay)
        audio.play().then(() => {
            // Sucesso: Áudio está tocando. Ativa a vigília de encerramento.
            _listenerTrechoAtivo = function() {
                if (audio.currentTime >= fim) {
                    audio.pause(); // A pausa nativa engatilhará o _listenerInterrupcao que limpa tudo
                    _deps.exibirToast('Reprodução do trecho finalizada.', 'sucesso');
                }
            };
            audio.addEventListener('timeupdate', _listenerTrechoAtivo);
        }).catch((err) => {
            console.error('[AudioManager] Erro ao reproduzir trecho:', err);
            _limparMonitoramentoTrecho(audio); // Aborta as escutas
            _deps.exibirToast('Navegador bloqueou a reprodução. Clique manualmente no Player.', 'erro');
        });
    }

    /**
     * Controlador de evento isolado para atalho de teclado
     */
    function handleJumpKey(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            pularParaTempo();
        }
    }

    /**
     * Calcula o tempo com validação contra NaN (Bug Crítico) e ReadyState
     */
    function pularParaTempo() {
        const h = parseInt(document.getElementById('jump-h').value, 10) || 0;
        const m = parseInt(document.getElementById('jump-m').value, 10) || 0;
        const s = parseInt(document.getElementById('jump-s').value, 10) || 0;
        const totalSegundos = (h * 3600) + (m * 60) + s;
        
        const audio = document.getElementById('main-audio-player');
        
        if (!audio.src || audio.src === window.location.href) {
            _deps.exibirToast('Carregue o áudio primeiro.', 'aviso'); return;
        }

        // Blindagem contra I/O pendente (Causa raiz do Bug NaN)
        if (audio.readyState === 0 || isNaN(audio.duration)) {
            _deps.exibirToast('Aguarde o carregamento do arquivo.', 'aviso'); return;
        }
        
        if (totalSegundos > audio.duration) {
            _deps.exibirToast('Tempo excede a duração do áudio.', 'erro'); return;
        }

        _limparMonitoramentoTrecho(audio); // Teardown limpo

        audio.currentTime = totalSegundos;
        audio.play().catch(() => _deps.exibirToast('Clique no player para liberar reprodução.', 'aviso'));
    }

    /**
     * Constrói o histórico rastreando toda a árvore JSON em memória
     */
    function atualizarHistoricoAudio() {
        const listaEl = document.getElementById('audio-history-list');
        if (!listaEl) return;
        
        const topicosAtuais = _deps.getTopicos();
        const recortes = [];

        topicosAtuais.forEach(topico => {
            topico.anotacoes.forEach(an => {
                if (an.tipo === 'audio') recortes.push(an);
                if (an.itensCorrelacionados) {
                    an.itensCorrelacionados.forEach(c => { if (c.tipo === 'audio') recortes.push(c); });
                }
            });
        });

        if (recortes.length === 0) {
            listaEl.innerHTML = '<p class="popup-label" style="text-align:center;">Nenhum recorte salvo nesta sessão.</p>';
            return;
        }

        let html = '';
        recortes.forEach(r => {
            try {
                const dados = JSON.parse(r.conteudo);
                const titulo = dados.oradorStr || dados.role || 'Orador não idt.';
                const tempo = `${formatTime(dados.inicio)} a ${formatTime(dados.fim)}`;
                const startNum = dados.inicio || 0;
                const endNum = dados.fim || 0;
                
                // Resolução do Bug de Truncamento do texto
                const trunc = (str, n) => (str.length > n) ? str.substring(0, n) + '...' : str;
                const comentarioTexto = r.comentario ? trunc(r.comentario, 30) : 'Sem obs.';

                html += `
                    <div class="audio-history-item" onclick="AudioManager.tocarTrecho(${startNum}, ${endNum})" title="Ouvir trecho salvo">
                        <div style="display:flex; flex-direction:column; gap: 2px;">
                            <span class="hist-title">${titulo}</span>
                            <span style="font-size:0.7rem; color:#888;">${comentarioTexto}</span>
                        </div>
                        <span class="hist-time">${tempo}</span>
                    </div>`;
            } catch(e) {}
        });
        listaEl.innerHTML = html;
    }

    return {
        init, iniciarSessao, abrirPlayer, fecharPlayer, alternarPlayer,
        marcarInicio, marcarFim, onRoleChange, toggleAgrupar,
        salvarRecorte, cancelarAnotacao, encerrar, solicitarMp3Retomada,
        tocarTrecho, pularParaTempo, handleJumpKey, atualizarHistoricoAudio,
        prepararRetomada, formatTime, onTabChange
    };
})();
