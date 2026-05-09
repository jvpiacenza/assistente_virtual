// ============================================================
//  Chatbot de Manutenção de Geladeiras — Backend
//  Node.js + Express + Ollama (llama3 local)
//  Recursos: memória de conversa + RAG simples
// ============================================================

const express = require('express');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
//  CONFIGURAÇÕES
// ─────────────────────────────────────────────

const OLLAMA_URL  = 'http://localhost:11434/api/chat';
const MODEL       = 'llama3';
const MAX_HISTORY = 10;   // máximo de pares user/assistant mantidos por sessão
const MAX_TOKENS     = 400; // num_predict enviado ao Ollama
const SUMMARY_TURNS  = 4;   // quantas trocas recentes entram no resumo do histórico

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

const knowledgeBase = [
    {
        keywords: ['barulho', 'ruído', 'ronco', 'estralo', 'zumbido', 'bate', 'vibra', 'rangido'],
        content: `
[CONHECIMENTO TÉCNICO — Barulhos e Ruídos]
- Ronco constante: normal do compressor em operação, mas volume excessivo pode indicar compressor desgastado ou suporte solto.
- Estalos esporádicos: dilatação térmica das paredes plásticas — normal.
- Barulho de água/borbulhamento: circulação do gás refrigerante — normal.
- Vibração forte: verifique se a geladeira está nivelada (pés reguláveis); objetos em cima podem amplificar vibração.
- Zumbido alto: possível ventilador sujo ou com pá quebrada; ventilador do condensador com acúmulo de poeira.
- Solução geral: verificar nível, limpar condensador, verificar ventilador e suportes do compressor.`
    },
    {
        keywords: ['não gela', 'não está gelando', 'quente', 'temperatura', 'frio', 'calor', 'morno'],
        content: `
[CONHECIMENTO TÉCNICO — Problemas de Temperatura / Não Gela]
- Termostato defeituoso: não aciona o compressor na temperatura correta.
- Gás refrigerante baixo (falta de gás): necessita recarga por técnico habilitado.
- Compressor com defeito: não pressuriza o gás; exige substituição.
- Borracha de vedação (gaxeta) gasta: ar quente entra, prejudicando o resfriamento.
- Condensador sujo: dissipação de calor prejudicada; limpe as grades traseiras com escova.
- Ventilador interno parado: ar frio não circula; verifique o ventilador do evaporador.
- Geladeira muito cheia ou mal organizada: bloqueia a circulação de ar.
- Temperatura ajustada errada: verifique se o termostato está na posição correta (geralmente 3–4 de 5).`
    },
    {
        keywords: ['vazamento', 'água', 'água no chão', 'acumulo de água', 'poça', 'gotejando', 'pingando'],
        content: `
[CONHECIMENTO TÉCNICO — Vazamento de Água]
- Dreno do degelo entupido: o orifício de escoamento da água do degelo fica no fundo do compartimento; limpe com palito ou seringa com água morna.
- Bandeja de evaporação transbordando: evaporação insuficiente por causa de temperatura ambiente alta ou ventilação ruim na traseira.
- Gaxeta (borracha) danificada: condensação excessiva por entrada de ar úmido.
- Mangueira de degelo desconectada ou rachada: reposição simples.
- Porta mal fechada: verifique se há objetos impedindo o fechamento completo.
- Geladeira fora de nível: água do degelo não escoa corretamente; ajuste os pés.`
    },
    {
        keywords: ['gelo', 'congela', 'congelando tudo', 'excesso de gelo', 'gelo demais', 'freezer', 'degelo'],
        content: `
[CONHECIMENTO TÉCNICO — Excesso de Gelo / Congelamento]
- Termostato muito alto: regule para posição intermediária.
- Sistema de degelo automático com defeito: temporizador, resistência de degelo ou termostato de degelo podem estar falhos.
- Gaxeta com folga: ar úmido entra e forma gelo excessivo no evaporador.
- Porta aberta com frequência: excesso de umidade.
- Geladeira Frost Free: se acumula gelo, o sistema de degelo automático pode ter parado — exige verificação da resistência e timer de degelo.`
    },
    {
        keywords: ['energia', 'conta de luz', 'consumo', 'elétrico', 'gasto', 'kw', 'kwh', 'eficiência'],
        content: `
[CONHECIMENTO TÉCNICO — Consumo de Energia]
- Condensador sujo: compressor trabalha mais para dissipar calor; limpe as grades regularmente.
- Borracha de vedação gasta: ar quente entra e o compressor compensa, aumentando o consumo.
- Abertura excessiva de portas: cada abertura introduz ar quente.
- Alimentos quentes inseridos: evite colocar alimentos quentes; deixe esfriar antes.
- Local de instalação: evite próximo ao fogão, forno ou sol direto; mantenha 15 cm de afastamento da parede.
- Compressor velho ou desgastado: consome mais energia do que o necessário.
- Etiqueta Procel: geladeiras antigas (>10 anos) consomem até 3× mais que modelos atuais classe A.`
    },
    {
        keywords: ['cheiro', 'odor', 'fedor', 'mau cheiro', 'cheiro ruim', 'fedendo'],
        content: `
[CONHECIMENTO TÉCNICO — Odores na Geladeira]
- Alimentos estragados: retire e descarte; limpe internamente com água e bicarbonato de sódio.
- Borracha da porta com mofo: limpe com esponja e solução de água + vinagre branco.
- Dreno de degelo com resíduos: pode acumular bactérias; limpe o dreno e a bandeja.
- Carvão ativado: coloque um recipiente com bicarbonato ou carvão ativado para absorver odores.
- Alimentos sem tampa: sempre tampe ou embale os alimentos armazenados.`
    },
    {
        keywords: ['não liga', 'não funciona', 'desligou', 'apagou', 'sem energia', 'travada', 'parou'],
        content: `
[CONHECIMENTO TÉCNICO — Geladeira Não Liga]
- Verifique a tomada: teste outro aparelho na mesma tomada; verifique o disjuntor.
- Cabo de alimentação: inspecione visualmente por cortes ou danos.
- Protetor térmico do compressor: pode ter desarmado por superaquecimento; aguarde 30 min e tente novamente.
- Termostato em posição OFF: alguns modelos têm posição de desligamento total.
- Placa eletrônica com defeito (em modelos mais modernos): requer diagnóstico técnico.
- Compressor queimado: sem o ruído característico ao ligar pode indicar compressor inativo.`
    },
    {
        keywords: ['porta', 'borracha', 'gaxeta', 'vedação', 'fecha', 'abre', 'ímã'],
        content: `
[CONHECIMENTO TÉCNICO — Porta e Vedação (Gaxeta)]
- Teste da gaxeta: coloque uma folha de papel na porta ao fechar; se sair facilmente, a vedação está comprometida.
- Limpeza: limpe com pano úmido e detergente neutro; evite produtos abrasivos.
- Deformação: gaxetas deformadas podem ser reativadas com secador de cabelo (calor leve) para recuperar flexibilidade.
- Substituição: gaxetas são peças acessíveis e trocadas sem necessidade de técnico na maioria dos modelos.
- Porta desalinhada: ajuste as dobradiças; muitos modelos permitem ajuste simples com chave de fenda.`
    },
    {
        keywords: ['luz', 'lâmpada', 'iluminação', 'led', 'apagou luz', 'luz não acende'],
        content: `
[CONHECIMENTO TÉCNICO — Luz Interna]
- Lâmpada queimada: substitua por lâmpada compatível (LED ou incandescente conforme o modelo).
- Interruptor de porta com defeito: pequeno botão na lateral interna que aciona a luz — pode estar preso ou defeituoso.
- Problema no chicote elétrico interno: menos comum; requer técnico.`
    },
    {
        keywords: ['compressor', 'motor', 'liga desliga', 'ciclo', 'aquece atrás'],
        content: `
[CONHECIMENTO TÉCNICO — Compressor]
- Calor na traseira: normal — o condensador dissipa calor; porém calor excessivo indica condensador sujo ou ventilação insuficiente.
- Liga e desliga muito rápido (curto-ciclo): protetor térmico atuando por superaquecimento, ou gás baixo.
- Compressor não para nunca: termostato defeituoso, ou gás baixo fazendo o sistema trabalhar continuamente.
- Ruído metálico no compressor: desgaste interno — avalie substituição.
- Vida útil média: 10–15 anos; após esse período, falhas são mais frequentes.`
    }
];

/**
 * Busca entradas relevantes na base de conhecimento.
 * Combina a mensagem atual com contexto do histórico para melhorar o recall:
 * ex. "e aquele barulho?" encontra RAG de barulhos mesmo sem a palavra na msg atual.
 * @param {string} userMessage - mensagem atual do usuário
 * @param {Array}  history     - histórico completo da sessão
 */
function searchKnowledgeBase(userMessage, history = []) {
    // Combina mensagem atual + palavras-chave do histórico recente para a busca
    const historyContext = extractContextFromHistory(history);
    const searchText = (userMessage + ' ' + historyContext).toLowerCase();

    const matched = [];

    for (const entry of knowledgeBase) {
        const hits = entry.keywords.filter(kw => searchText.includes(kw));
        if (hits.length > 0) {
            // Peso extra se a keyword bate especificamente na mensagem atual
            const currentHits = entry.keywords.filter(
                kw => userMessage.toLowerCase().includes(kw)
            ).length;
            matched.push({ entry, score: hits.length + currentHits * 2 });
        }
    }

    if (matched.length === 0) return null;

    // Ordena pela pontuação (mais relevante primeiro)
    matched.sort((a, b) => b.score - a.score);

    // Retorna no máximo 2 entradas mais relevantes para não sobrecarregar o contexto
    return matched
        .slice(0, 2)
        .map(m => m.entry.content)
        .join('\n');
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
- Estruture sua resposta com: (1) possível causa, (2) solução sugerida, (3) orientação prática.
- Se o problema exigir técnico especializado, informe isso claramente.
- Não invente informações; se não souber, oriente o cliente a buscar suporte presencial.
- Respostas entre 80 e 200 palavras — nem curtas demais, nem excessivamente longas.
- Não use markdown pesado (sem ###, **, __). Use listas simples com hífen quando necessário.

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
                temperature: 0.65,
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
    const sessionId   = req.body.sessionId || 'default';

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
        const ragContext = isMemory ? null : searchKnowledgeBase(userMessage, historyBefore);

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