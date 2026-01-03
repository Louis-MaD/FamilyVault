# Family Vault - Zero-Knowledge Password Manager

A self-hosted, zero-knowledge password vault with client-side encryption built on Next.js, PostgreSQL, and Prisma.

## Features

- **Zero-Knowledge Architecture**: All encryption happens client-side; the server never sees your passwords
- **Strong Cryptography**: Argon2id key derivation + XChaCha20-Poly1305 encryption
- **2FA Support**: Optional TOTP-based two-factor authentication
- **Audit Logging**: Track all security events
- **Self-Hosted**: Full control over your data
- **Docker Support**: Easy deployment with Docker Compose

## Quick Start

See [SETUP.md](SETUP.md) for detailed setup instructions.

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose (recommended)

### Basic Setup

1. **Generate secure keys:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your generated keys
   ```

3. **Run with Docker:**
   ```bash
   docker-compose up -d --build
   ```

4. **Access the app:**
   Open http://localhost:3000

## Security

This application implements industry-standard security practices:

- Client-side key derivation (Argon2id)
- Client-side encryption (XChaCha20-Poly1305)
- Session token hashing (SHA-256)
- Password hashing (Argon2id)
- HttpOnly, Secure, SameSite cookies
- Audit logging


## Documentation

- [Setup Guide](SETUP.md) - Detailed setup and deployment instructions
- [Architecture](#architecture) - How the zero-knowledge design works

## Architecture

**Client-Side Encryption Flow:**
1. User enters master password
2. Password + salt → Argon2id → Master Key (never leaves browser)
3. Data + Master Key → XChaCha20 → Encrypted payload
4. Server stores only encrypted blobs

**Server Never Knows:**
- Your master password
- Your decrypted vault data
- Your encryption keys

## License

MIT
