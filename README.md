# 🧊 GelaTech – Chatbot de Manutenção de Geladeiras

Chatbot inteligente com memória de conversa e busca em base de conhecimento (RAG).  
Frontend **Next.js 14 + TailwindCSS**, backend **Node.js + Express**, LLM local **Ollama (llama3)** e **Python** para embeddings semânticos.

---

## 📦 Tecnologias

- **Frontend:** Next.js 14, React, TailwindCSS  
- **Backend:** Node.js, Express  
- **IA:** Ollama (modelo llama3)  
- **RAG:** Python, Flask, sentence-transformers  
- **Integração extra:** Dialogflow ES (via ngrok)

---

## 📁 Estrutura

ASSISTENTE_VIRTUAL/
├── backend/
│ ├── server.js # API principal (porta 5000)
│ ├── embed_service.py # Serviço Flask de embeddings (porta 5001)
│ ├── knowledge_base.py # Base de conhecimento (CHUNKS)
│ └── package.json
├── frontend/
│ ├── src/
│ │ ├── app/ # page.tsx, layout.tsx, globals.css
│ │ └── components/ # ChatMessage, ChatInput, TypingIndicator
│ └── package.json
└── README.md


---

## 🚀 Instalação e execução

### 1. Pré‑requisitos

- Node.js 18+
- Python 3.9+
- [Ollama](https://ollama.com) instalado e rodando
- Modelo llama3 baixado: `ollama pull llama3`

### 2. Instalar dependências

```bash
# Backend Node.js
cd backend
npm install
npx nodemon server.js

# Frontend Next.js
cd ../frontend
npm install
npm run dev

# Python (microserviço de embeddings)
cd ../backend
pip install flask sentence-transformers numpy
python embed_service.py
