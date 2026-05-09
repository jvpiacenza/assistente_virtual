# 🧊 Chatbot de Manutenção de Geladeiras

Interface de chat moderna construída com **Next.js 14 (App Router)**, **React** e **TailwindCSS**.

## 🚀 Como rodar

### Pré-requisitos
- Node.js 18+
- Backend rodando em `http://localhost:5000`

### Instalação

```bash
npm install
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 📁 Estrutura do projeto

```
src/
├── app/
│   ├── globals.css       # Estilos globais + fontes
│   ├── layout.tsx        # Layout raiz
│   └── page.tsx          # Página principal do chat
└── components/
    ├── ChatMessage.tsx   # Balão de mensagem (user/bot)
    ├── ChatInput.tsx     # Campo de input + botão de enviar
    └── TypingIndicator.tsx  # Animação "digitando..."
```

---

## 🔌 Backend esperado

O frontend faz requisições `POST` para:

```
http://localhost:5000/chat
```

**Body enviado:**
```json
{ "message": "texto do usuário" }
```

**Resposta esperada:**
```json
{ "reply": "resposta da IA" }
```

---

## ✨ Funcionalidades

- ✅ Chat com balões de mensagem (usuário à direita, bot à esquerda)
- ✅ Indicador "digitando..." animado
- ✅ Scroll automático para última mensagem
- ✅ Textarea com auto-redimensionamento
- ✅ Envio com Enter ou botão
- ✅ Perguntas rápidas pré-definidas
- ✅ Botão para limpar conversa
- ✅ Tratamento de erros de conexão
- ✅ Design responsivo
- ✅ Animações suaves nas mensagens

---

## 🎨 Design

- Tipografia: **DM Sans** + **DM Mono**
- Cores: Azul (primário) + Slate (neutros)
- Header escuro com gradiente
- Fundo levemente azulado
- Bordas e sombras sutis
