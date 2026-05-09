import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IA Geladeira — Assistente de Manutenção",
  description:
    "Assistente inteligente especializado em manutenção e diagnóstico de geladeiras.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
