/* ================================================
   firebase-auth.js
   Módulo de integração REAL com Firebase Auth
   ================================================ */
// 1. Importamos as ferramentas do Google (direto da nuvem)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 2. COLE AQUI AS SUAS CHAVES DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDusDV1kmPIB6NomSDGdZ5HFDdcn3iVLSc",
  authDomain: "juris-notes.firebaseapp.com",
  projectId: "juris-notes",
  storageBucket: "juris-notes.firebasestorage.app",
  messagingSenderId: "60876452493",
  appId: "1:60876452493:web:4cffa6d226823aea0ee8c4",
  measurementId: "G-4W0B7832FN"
};

// 3. Inicializamos o Firebase com as suas chaves
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 4. O nosso módulo que conversa com a interface (HTML)
window.FirebaseAuth = (function() {
    'use strict';

    function init() {
        const senhaInput = document.getElementById('login-senha');
        if (senhaInput) {
            senhaInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') realizarLogin();
            });
        }

        // OBSERVER REATIVO: A única fonte de verdade da UI de autenticação
        onAuthStateChanged(auth, (user) => {
            const loadingState = document.getElementById('login-loading-state');
            const formState = document.getElementById('login-form-state');
            const loggedState = document.getElementById('login-logged-state');
            const btnIcon = document.getElementById('btn-login-user');

            if (loadingState) loadingState.style.display = 'none';

            if (user) {
                // Usuário VALIDADO (Seja via login novo ou refresh de página)
                if (formState) formState.style.display = 'none';
                if (loggedState) loggedState.style.display = 'flex';
                
                if (btnIcon) {
                    btnIcon.classList.add('is-logged-in');
                    btnIcon.title = `Conectado como: ${user.email}`;
                }
            } else {
                // Usuário DESLOGADO
                if (loggedState) loggedState.style.display = 'none';
                if (formState) formState.style.display = 'flex';
                
                if (btnIcon) {
                    btnIcon.classList.remove('is-logged-in');
                    btnIcon.title = "Acessar Conta (Firebase)";
                }
            }
        });
    }

    function realizarLogin() {
        const email = document.getElementById('login-email').value.trim();
        const senha = document.getElementById('login-senha').value;
        
        if (!email || !senha) {
            if (window.exibirToast) exibirToast('Preencha e-mail e senha.', 'aviso');
            return;
        }

        signInWithEmailAndPassword(auth, email, senha)
            .then(() => {
                // Sucesso: Apenas limpa a senha e fecha o modal.
                // A troca visual da UI será feita AUTOMATICAMENTE pelo Observer.
                document.getElementById('login-menu').style.display = 'none';
                document.getElementById('login-senha').value = ''; 
                if (window.exibirToast) exibirToast('Conectado à nuvem com sucesso!', 'sucesso');
            })
            .catch((error) => {
                console.error("[Firebase Erro]", error.code, error.message);
                if (error.code === 'auth/invalid-credential') {
                    if (window.exibirToast) exibirToast('E-mail ou senha incorretos.', 'erro');
                } else {
                    if (window.exibirToast) exibirToast('Erro ao tentar conectar.', 'erro');
                }
            });
    }

    function realizarLogout() {
        signOut(auth).then(() => {
            // Sucesso: Apenas fecha o modal. O Observer cuidará de resetar a UI.
            document.getElementById('login-menu').style.display = 'none';
            if (window.exibirToast) exibirToast('Sessão da nuvem encerrada.', 'sucesso');
        }).catch(() => {
            if (window.exibirToast) exibirToast('Erro ao sair da conta.', 'erro');
        });
    }

    return { init, realizarLogin, realizarLogout };
})();

document.addEventListener("DOMContentLoaded", () => {
    FirebaseAuth.init();
});
