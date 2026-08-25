// app/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Libre_Franklin, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Handoff v2 typography: Libre Franklin for text, JetBrains Mono for codes,
// figures and uppercase labels.
const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-libre-franklin',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cuadro de Mando de Indicadores · Cuantico',
  description: 'Sistema de Gestión de Calidad ISO 9001',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        className={`${libreFranklin.variable} ${jetbrainsMono.variable} antialiased bg-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
