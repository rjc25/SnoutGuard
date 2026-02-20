import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ArchGuard - Architectural Governance Platform',
    template: '%s | ArchGuard',
  },
  description:
    'AI-powered architectural governance for modern engineering teams. Track decisions, enforce standards, and monitor architectural health.',
  keywords: [
    'architecture',
    'governance',
    'code review',
    'architectural decisions',
    'ADR',
    'technical debt',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
