"use client";

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      {/* Bot avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
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

      {/* Typing bubble */}
      <div className="bg-slate-100 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1 font-medium">
            digitando
          </span>
          <span
            className="w-2 h-2 rounded-full bg-blue-400 animate-typing-1"
            style={{ display: "inline-block" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-blue-500 animate-typing-2"
            style={{ display: "inline-block" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-blue-600 animate-typing-3"
            style={{ display: "inline-block" }}
          />
        </div>
      </div>
    </div>
  );
}
