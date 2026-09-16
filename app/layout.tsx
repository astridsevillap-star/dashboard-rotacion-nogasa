import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./auth-gate";

export const metadata: Metadata = {
  title: "Dashboard de Rotación | Nogasa",
  description: "Indicadores de rotación, permanencia y deserción para Gestión de Personas.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
