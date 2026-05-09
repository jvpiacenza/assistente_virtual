"use client";

import { useState, useEffect, useRef } from "react";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";

type Message = {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: string;
};

const BACKEND_URL = "http://localhost:5000/chat";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  text: "Olá! 👋 Sou o assistente de manutenção de geladeiras. Pode me perguntar sobre barulhos estranhos, problemas de temperatura, vazamentos, consumo de energia e muito mais. Como posso te ajudar hoje?",
  sender: "bot",
  timestamp: formatTime(new Date()),
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const QUICK_QUESTIONS = [
  "Minha geladeira está fazendo barulho",
  "Não está gelando direito",
  "Está vazando água",
  "Está consumindo muita energia",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // sessionId identifica esta conversa no backend (memória de histórico)
  const [sessionId] = useState<string>(() => generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    setError(null);

    // Add user message
    const userMsg: Message = {
      id: generateId(),
      text,
      sender: "user",
      timestamp: formatTime(new Date()),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // sessionId enviado para o backend manter o histórico da conversa
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const botMsg: Message = {
        id: generateId(),
        text: data.reply || "Desculpe, não recebi uma resposta válida.",
        sender: "bot",
        timestamp: formatTime(new Date()),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Erro desconhecido ao contatar o servidor.";

      setError(errorMsg);

      const errorBotMsg: Message = {
        id: generateId(),
        text: "⚠️ Não consegui me conectar ao servidor. Verifique se o backend está rodando em http://localhost:5000.",
        sender: "bot",
        timestamp: formatTime(new Date()),
      };

      setMessages((prev) => [...prev, errorBotMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    sendMessage(question);
  };

  const clearChat = async () => {
    // Limpa o histórico também no backend para esta sessão
    try {
      await fetch("http://localhost:5000/chat/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // Se o backend não responder, apenas limpa o frontend
    }
    setMessages([WELCOME_MESSAGE]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      {/* Chat container */}
      <div className="w-full max-w-2xl flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200"
        style={{ height: "clamp(500px, 85vh, 800px)" }}>

        {/* ── Header ── */}
        <header className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-slate-900 to-blue-900 border-b border-slate-700">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500 bg-opacity-30 border border-blue-400 border-opacity-40 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 8h14M9 3v18"
              />
            </svg>
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-semibold text-base leading-tight tracking-tight">
              Assistente de Geladeiras
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Online · IA disponível</span>
            </div>
          </div>

          {/* Clear button */}
          <button
            onClick={clearChat}
            title="Limpar conversa"
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-white bg-opacity-10 hover:bg-opacity-20 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-200"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </header>

        {/* ── Messages area ── */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 py-5 space-y-4 messages-scroll"
          style={{ backgroundColor: "#fafbfc" }}
        >
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              text={msg.text}
              sender={msg.sender}
              timestamp={msg.timestamp}
            />
          ))}

          {/* Typing indicator */}
          {isTyping && <TypingIndicator />}

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 animate-fade-in">
              <svg
                className="w-4 h-4 text-red-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-xs text-red-600">{error}</span>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Quick questions (shown when only welcome message) ── */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 bg-[#fafbfc] border-t border-slate-100 pt-3">
            <p className="w-full text-xs text-slate-400 font-medium mb-1">
              Perguntas rápidas:
            </p>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                className="text-xs bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full transition-all duration-200 shadow-sm"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* ── Input area ── */}
        <ChatInput onSend={sendMessage} disabled={isTyping} />
      </div>

      {/* Footer note */}
      <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400">
        Conectado em{" "}
        <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500">
          localhost:5000
        </code>
      </p>
    </div>
  );
}