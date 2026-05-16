// ============================================================
//  Chatbot de Manutenção de Geladeiras — Backend
//  Node.js + Express + Ollama (llama3 local)
//  Recursos: memória de conversa + RAG simples
// ============================================================

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
//  CONFIGURAÇÕES
// ─────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'llama3';
const MAX_HISTORY = 10;   // máximo de pares user/assistant mantidos por sessão
const MAX_TOKENS = 400; // num_predict enviado ao Ollama
const SUMMARY_TURNS = 4;   // quantas trocas recentes entram no resumo do histórico

// ─────────────────────────────────────────────
//  ARMAZENAMENTO DE HISTÓRICO (em memória)
//  Estrutura:  { sessionId: [ {role, content}, ... ] }
//  Numa aplicação real isso ficaria em Redis/DB.
// ─────────────────────────────────────────────

const conversationStore = {};

function getHistory(sessionId) {
    if (!conversationStore[sessionId]) {
        conversationStore[sessionId] = [];
    }
    return conversationStore[sessionId];
}

function addToHistory(sessionId, role, content) {
    const history = getHistory(sessionId);
    history.push({ role, content });

    // mantém somente os últimas MAX_HISTORY mensagens (user + assistant)
    if (history.length > MAX_HISTORY * 2) {
        history.splice(0, 2); // remove o par mais antigo
    }
}

function clearHistory(sessionId) {
    conversationStore[sessionId] = [];
}
// ─────────────────────────────────────────────
//  MEMÓRIA — DETECÇÃO DE PERGUNTAS SOBRE O PASSADO
//  Identifica quando o usuário pergunta algo sobre a
//  conversa em si, e não sobre um novo problema técnico.
// ─────────────────────────────────────────────

const MEMORY_TRIGGERS = [
    'qual era', 'o que eu disse', 'o que falei', 'o que eu falei',
    'o que você disse', 'me lembra', 'lembra que', 'falei antes',
    'disse antes', 'mencionei', 'tinha dito', 'tinha falado',
    'problema mesmo', 'qual foi', 'antes eu', 'nossa conversa',
    'repete', 'resume', 'resumo', 'o que conversamos',
    'primeira mensagem', 'começamos', 'perguntei antes', 'recapitula'
];

/**
 * Retorna true se a mensagem parece ser uma pergunta sobre o histórico
 * da conversa, e não sobre um novo problema técnico.
 */
function isMemoryQuestion(message) {
    const lower = message.toLowerCase();
    return MEMORY_TRIGGERS.some(trigger => lower.includes(trigger));
}

// ─────────────────────────────────────────────
//  MEMÓRIA — RESUMO LEGÍVEL DO HISTÓRICO RECENTE
//  Formata as últimas SUMMARY_TURNS trocas em texto
//  simples para ser injetado explicitamente no system prompt.
//  Isso resolve o problema do modelo não "lembrar" o contexto:
//  em vez de apenas passar o histórico como mensagens, a gente
//  injeta um resumo textual direto nas instruções do sistema.
// ─────────────────────────────────────────────

/**
 * Gera um resumo textual das últimas N trocas da conversa.
 * Retorna null se o histórico estiver vazio.
 */
function buildConversationSummary(history) {
    if (!history || history.length === 0) return null;

    // Pega somente as últimas SUMMARY_TURNS * 2 mensagens (pares user/assistant)
    const recent = history.slice(-(SUMMARY_TURNS * 2));

    const lines = recent.map(msg => {
        const label = msg.role === 'user' ? 'Cliente' : 'Assistente';
        // Trunca respostas longas do assistente para não poluir o prompt
        const text = (msg.role === 'assistant' && msg.content.length > 200)
            ? msg.content.substring(0, 200) + '...'
            : msg.content;
        return `${label}: ${text}`;
    });

    return lines.join('\n');
}

// ─────────────────────────────────────────────
//  RAG — BUSCA CONTEXTUAL (mensagem + histórico)
//  Problema anterior: quando o usuário dizia "e aquele barulho?"
//  a busca no RAG falhava porque a palavra-chave estava no histórico,
//  não na mensagem atual. Agora buscamos nos dois.
// ─────────────────────────────────────────────

/**
 * Extrai keywords relevantes das últimas mensagens do histórico
 * para enriquecer a busca no RAG.
 */
function extractContextFromHistory(history) {
    if (!history || history.length === 0) return '';
    // Considera apenas as últimas 3 mensagens do usuário para contexto RAG
    const recentUserMessages = history
        .filter(m => m.role === 'user')
        .slice(-3)
        .map(m => m.content)
        .join(' ');
    return recentUserMessages;
}



// ─────────────────────────────────────────────
//  BASE DE CONHECIMENTO — RAG SIMPLES
//  Cada entrada possui: keywords (para busca) e content (contexto injetado)
// ─────────────────────────────────────────────



/**
 * Busca entradas relevantes na base de conhecimento.
 * Combina a mensagem atual com contexto do histórico para melhorar o recall:
 * ex. "e aquele barulho?" encontra RAG de barulhos mesmo sem a palavra na msg atual.
 * @param {string} userMessage - mensagem atual do usuário
 * @param {Array}  history     - histórico completo da sessão
 */
// Nova função que se comunica com o seu microserviço Python (RAG Semântico)
async function searchKnowledgeBase(userMessage, history = []) {
    // Junta a mensagem atual com o contexto histórico (mesma lógica sua)
    const historyContext = extractContextFromHistory(history);
    const searchText = (userMessage + ' ' + historyContext).trim();

    try {
        // Dispara a busca para o seu Flask em Python na porta 5001
        const response = await fetch('http://localhost:5001/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: searchText, top_k: 1 })
        });

        const data = await response.json();

        // Se encontrou resultados no Python, junta os textos e retorna
        if (data.found && data.results.length > 0) {
            return data.results.map(r => r.chunk).join('\n\n');
        }
        return null;

    } catch (error) {
        console.error('[ERRO RAG] Falha ao contatar microserviço Python na porta 5001:', error.message);
        return null;
    }
}

// ─────────────────────────────────────────────
//  SYSTEM PROMPT BASE
// ─────────────────────────────────────────────

/**
 * Monta o system prompt com três camadas separadas:
 *   1. Instruções de comportamento (sempre presentes)
 *   2. Resumo do histórico recente (injetado quando há conversa anterior)
 *   3. Base de conhecimento RAG (injetada apenas quando pertinente ao problema)
 *
 * Separar memória de RAG resolve a confusão do modelo sobre o que é
 * "o que o cliente disse" vs "o que eu sei tecnicamente".
 *
 * @param {string|null} ragContext          - resultado da busca na base de conhecimento
 * @param {string|null} conversationSummary - resumo textual do histórico recente
 * @param {boolean}     isMemory            - true quando é uma pergunta sobre a conversa
 */
function buildSystemPrompt(ragContext, conversationSummary = null, isMemory = false) {
    const basePrompt = `Você é o assistente técnico da empresa "GelaTech — Soluções em Refrigeração".
Seu papel é diagnosticar problemas em geladeiras e orientar clientes de forma técnica, clara e prática.

REGRAS DE COMPORTAMENTO:
- Responda SEMPRE em português brasileiro.
- Seja técnico, mas use linguagem acessível ao cliente comum.
- Estruture sua resposta curta com: possível causa, solução sugerida, orientação prática.
- Se o problema exigir técnico especializado, informe isso claramente.
- Não invente informações; se não souber, oriente o cliente a buscar suporte presencial.
- Respostas entre 30 a 50 palavras
- Não use markdown pesado (sem ###, **, __). Use listas simples com hífen quando necessário.
- Foque EXCLUSIVAMENTE no sintoma técnico relatado.
- IGNORE informações pessoais irrelevantes antes de resolver o problema informado (como endereço, nome da rua, cidade, etc).
- NUNCA invente sintomas que o cliente não relatou (ex: não fale de conta de luz se o cliente não mencionou energia).

REGRAS SOBRE MEMÓRIA E CONTEXTO:
- Você TEM ACESSO ao histórico completo da conversa (listado abaixo quando disponível).
- Se o cliente perguntar sobre algo que já foi dito, consulte o histórico e responda diretamente.
- Exemplos de perguntas sobre a conversa: "qual era o problema mesmo?", "o que você disse antes?", "me repete a solução".
- Para essas perguntas, NÃO invente — baseie-se APENAS no que consta no histórico.

REGRAS SOBRE A BASE DE CONHECIMENTO (RAG):
- A base de conhecimento técnico é para diagnósticos de problemas da geladeira.
- Use a base de conhecimento quando o cliente relatar um problema técnico.
- NÃO use a base de conhecimento para responder perguntas sobre o histórico da conversa.`;

    let prompt = basePrompt;

    // CAMADA 2: Histórico recente (memória de conversa)
    // Injetado sempre que há histórico, mas especialmente importante em perguntas de memória
    if (conversationSummary) {
        const memoryNote = isMemory
            ? 'O cliente está perguntando sobre esta conversa. Use o histórico abaixo para responder.'
            : 'Use o histórico abaixo para manter coerência e não repetir informações já dadas.';

        prompt += `

══════════════════════════════
HISTÓRICO RECENTE DA CONVERSA:
${conversationSummary}
══════════════════════════════
${memoryNote}`;
    }

    // CAMADA 3: Base de conhecimento RAG (só para problemas técnicos, não para perguntas de memória)
    if (ragContext && !isMemory) {
        prompt += `

──────────────────────────────
BASE DE CONHECIMENTO TÉCNICO (referência prioritária para diagnósticos):
${ragContext}
──────────────────────────────
Use as informações acima para embasar seu diagnóstico.`;
    }

    return prompt;
}

// ─────────────────────────────────────────────
//  FUNÇÃO — CHAMAR O OLLAMA
// ─────────────────────────────────────────────

async function callOllama(systemPrompt, history) {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history
    ];

    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            messages,
            stream: false,
            options: {
                num_predict: MAX_TOKENS,
                temperature: 0.5,
                top_p: 0.9,
                repeat_penalty: 1.1
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama retornou status ${response.status}`);
    }

    const data = await response.json();

    if (!data.message || !data.message.content) {
        throw new Error('Resposta inesperada do Ollama');
    }

    return data.message.content;
}

// ─────────────────────────────────────────────
//  ROTAS
// ─────────────────────────────────────────────

/**
 * POST /chat
 * Body: { message: string, sessionId?: string }
 * Response: { reply: string, sessionId: string }
 */
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message?.trim();
    const sessionId = req.body.sessionId || 'default';

    if (!userMessage) {
        return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
    }

    try {
        // 1. Recupera histórico ANTES de adicionar a nova mensagem
        //    (o histórico não deve incluir a mensagem atual ainda)
        const historyBefore = [...getHistory(sessionId)];

        // 2. Detecta se é uma pergunta sobre a conversa (memória) ou sobre a geladeira (técnico)
        const isMemory = isMemoryQuestion(userMessage);

        // 3. Busca RAG combinando mensagem atual + contexto do histórico
        //    (resolve "e aquele barulho?" sem a palavra no input atual)
        //    Se for pergunta de memória, RAG não é necessário

        const ragContext = isMemory ? null : await searchKnowledgeBase(userMessage, historyBefore);

        console.log("\n[DEBUG RAG] Texto que o Python enviou para o Ollama:");
        console.log(ragContext);
        console.log("--------------------------------------------------\n");

        // 4. Gera resumo legível do histórico recente para injetar no system prompt
        //    Isso é o que garante que "qual era o problema?" funcione corretamente
        const conversationSummary = buildConversationSummary(historyBefore);

        // 5. Monta o system prompt com as três camadas separadas:
        //    instruções base + resumo do histórico + RAG técnico
        const systemPrompt = buildSystemPrompt(ragContext, conversationSummary, isMemory);

        // 6. Adiciona a nova mensagem do usuário ao histórico
        addToHistory(sessionId, 'user', userMessage);
        const history = getHistory(sessionId);

        // 7. Envia para o Ollama com histórico completo + system prompt enriquecido
        const reply = await callOllama(systemPrompt, history);

        // 8. Adiciona a resposta do assistente ao histórico
        addToHistory(sessionId, 'assistant', reply);

        // Log com diagnóstico claro do que foi usado
        const mode = isMemory ? 'MEMÓRIA' : (ragContext ? 'RAG+hist' : 'hist');
        console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Session: ${sessionId} | Modo: ${mode} | User: "${userMessage.substring(0, 55)}..."`);

        res.json({ reply, sessionId });

    } catch (error) {
        console.error('[ERRO /chat]', error.message);

        const clientMessage = error.message.includes('fetch')
            ? 'Não foi possível conectar ao Ollama. Verifique se ele está rodando em http://localhost:11434.'
            : 'Ocorreu um erro interno ao processar sua mensagem.';

        res.status(500).json({ error: clientMessage });
    }
});

/**
 * POST /chat/reset
 * Body: { sessionId?: string }
 * Limpa o histórico de uma sessão
 */
app.post('/chat/reset', (req, res) => {
    const sessionId = req.body.sessionId || 'default';
    clearHistory(sessionId);
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Histórico da sessão "${sessionId}" apagado.`);
    res.json({ message: 'Histórico limpo com sucesso.', sessionId });
});

/**
 * GET /health
 * Verificação simples de que o backend está no ar
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: MODEL, sessions: Object.keys(conversationStore).length });
});

const { SessionsClient } = require('@google-cloud/dialogflow');
const axios = require('axios');

// Configure com o arquivo de credenciais baixado
const dialogflowClient = new SessionsClient({
    keyFilename: './credentials.json'
});

app.post('/dialogflow', async (req, res) => {
    try {
        const body = req.body;
        const userMessage = body.queryResult.queryText;
        const session = body.session; // ex: "projects/gelatech/agent/sessions/123"

        // 🟢 Resposta imediata ao Dialogflow (evita timeout)
        // Resposta imediata VAZIA para que o Dialogflow mostre a resposta padrão da intent
        res.json({
            fulfillmentText: '⏳ Estou analisando seu problema... um momento.',
            fulfillmentMessages: [
                { text: { text: ['⏳ Estou analisando seu problema... um momento.'] } }
            ],
            source: 'GelaTech-Backend'
        });

        // ⚙️ Processamento assíncrono da resposta real
        console.log(`[Dialogflow Async] Processando: "${userMessage}"`);
        const sessionId = session.split('/').pop();

        const historyBefore = [...getHistory(sessionId)];
        const isMemory = isMemoryQuestion(userMessage);
        const ragContext = isMemory ? null : await searchKnowledgeBase(userMessage, historyBefore);
        const conversationSummary = buildConversationSummary(historyBefore);
        const systemPrompt = buildSystemPrompt(ragContext, conversationSummary, isMemory);
        addToHistory(sessionId, 'user', userMessage);
        const history = getHistory(sessionId);
        const botReply = await callOllama(systemPrompt, history);
        addToHistory(sessionId, 'assistant', botReply);

        const eventRequest = {
            session: session,
            queryInput: {
                event: {
                    name: 'assistente_resposta',
                    parameters: {
                        resposta: botReply
                    },
                    languageCode: 'pt-br'   // ← agora DENTRO do evento
                }
            }
        };

        console.log('[Dialogflow] Payload do evento:', JSON.stringify(eventRequest, null, 2));
        
        console.log('[Dialogflow] Enviando evento com resposta:', botReply?.substring(0, 80));
        const [eventResponse] = await dialogflowClient.detectIntent(eventRequest);
        console.log('[Dialogflow] Evento response queryResult:', 
          JSON.stringify(eventResponse.queryResult.fulfillmentText));

    } catch (error) {
        console.error('[Dialogflow Error]', error.message);
        // A resposta inicial já foi enviada com sucesso
    }
});

// ─────────────────────────────────────────────
//  INICIALIZAÇÃO
// ─────────────────────────────────────────────

app.listen(5000, () => {
    console.log('──────────────────────────────────────────');
    console.log('  GelaTech Chatbot — Backend iniciado');
    console.log('  http://localhost:5000');
    console.log(`  Modelo: ${MODEL} via Ollama`);
    console.log('  Recursos: memória de conversa + RAG');
    console.log('──────────────────────────────────────────');
});