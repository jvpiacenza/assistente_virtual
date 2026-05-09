"use client";

type MessageProps = {
  text: string;
  sender: "user" | "bot";
  timestamp?: string;
};

export default function ChatMessage({ text, sender, timestamp }: MessageProps) {
  const isUser = sender === "user";

  return (
    <div
      className={`flex items-end gap-2.5 ${
        isUser ? "flex-row-reverse animate-slide-in-right" : "flex-row animate-slide-in-left"
      }`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm mb-1">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm mb-1">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      )}

      {/* Bubble */}
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[75%]`}>
        <div
          className={`px-4 py-2.5 shadow-sm text-sm leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white rounded-2xl rounded-br-sm"
              : "bg-slate-100 border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm"
          }`}
          style={{ wordBreak: "break-word" }}
        >
          {/* Render text with line breaks */}
          {text.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < text.split("\n").length - 1 && <br />}
            </span>
          ))}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span className="text-[10px] text-slate-400 mt-1 px-1">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}
