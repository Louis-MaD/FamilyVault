import React from 'react';
import { createRoot } from 'react-dom/client';
import { FileText, Terminal, Database, Shield } from 'lucide-react';

// This is a placeholder for the Browser Preview because the actual app
// is a Next.js Full Stack app that requires Docker/Node server to run.
const PreviewPlaceholder = () => {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Family Vault</h1>
      <div style={{ padding: '1rem', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', marginBottom: '2rem' }}>
        <h2 style={{ color: '#0369a1', fontWeight: 'bold', marginBottom: '0.5rem' }}>Full Stack Project Generated</h2>
        <p style={{ color: '#0c4a6e' }}>
          This repository contains a complete <strong>Next.js + Postgres + Prisma</strong> application.
          The browser preview cannot run the server-side code (Docker, Database, API Routes).
        </p>
      </div>

      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>How to Run</h3>
      <div style={{ backgroundColor: '#1e293b', color: '#e2e8f0', padding: '1.5rem', borderRadius: '0.5rem', fontFamily: 'monospace', overflowX: 'auto' }}>
        <p className="mb-2"># 1. Download files</p>
        <p className="mb-4"># 2. Set up environment</p>
        <p className="mb-2">cp .env.example .env</p>
        <p className="mb-4"># (Fill in SESSION_SECRET and SERVER_ENCRYPTION_KEY)</p>
        <p className="mb-2"># 3. Start with Docker</p>
        <p>docker-compose up -d --build</p>
      </div>

      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '2rem', marginBottom: '1rem' }}>Architecture</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <Shield style={{ marginBottom: '0.5rem', color: '#059669' }} />
          <div style={{ fontWeight: 'bold' }}>Zero Knowledge</div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Client-side encryption using Argon2id & XChaCha20.</div>
        </div>
        <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <Database style={{ marginBottom: '0.5rem', color: '#2563eb' }} />
          <div style={{ fontWeight: 'bold' }}>Postgres + Prisma</div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Full relational DB with migrations.</div>
        </div>
        <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
          <Terminal style={{ marginBottom: '0.5rem', color: '#d97706' }} />
          <div style={{ fontWeight: 'bold' }}>Dockerized</div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Ready for local deployment (Raspberry Pi compatible).</div>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<PreviewPlaceholder />);
