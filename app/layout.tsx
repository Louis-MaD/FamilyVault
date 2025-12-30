import React from 'react';
import './globals.css';
import { VaultProvider } from '@/components/VaultContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <VaultProvider>
          {children}
        </VaultProvider>
      </body>
    </html>
  );
}