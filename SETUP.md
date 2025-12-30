# Family Vault - Setup Guide

This guide will help you set up and run the Family Vault password manager securely.

## Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose (for easy deployment)
- OR PostgreSQL (if running without Docker)

## Quick Start with Docker

### 1. Generate Secure Keys

Before running the application, you need to generate secure encryption keys. Run these commands:

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SERVER_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Database Password
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 2. Create Environment File

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and replace the placeholder values with the keys you generated:

```env
# Database Connection
DATABASE_URL=postgresql://vaultuser:YOUR_GENERATED_DB_PASSWORD@localhost:5432/vaultdb

# Session Management
SESSION_SECRET=YOUR_GENERATED_SESSION_SECRET_HERE

# Server-Side Encryption Key
SERVER_ENCRYPTION_KEY=YOUR_GENERATED_SERVER_KEY_HERE

# Application Configuration
APP_ORIGIN=http://localhost:3000
NODE_ENV=development
```

Also create a `.env.docker` file for Docker deployment:

```env
POSTGRES_USER=vaultuser
POSTGRES_PASSWORD=YOUR_GENERATED_DB_PASSWORD
POSTGRES_DB=vaultdb
SESSION_SECRET=YOUR_GENERATED_SESSION_SECRET_HERE
SERVER_ENCRYPTION_KEY=YOUR_GENERATED_SERVER_KEY_HERE
APP_ORIGIN=http://localhost:3000
```

### 3. Start the Application

```bash
# Build and start containers
docker-compose --env-file .env.docker up -d --build

# Check logs
docker-compose logs -f app
```

The application will be available at http://localhost:3000

### 4. Stop the Application

```bash
docker-compose down

# To also remove data volumes (WARNING: This deletes all data)
docker-compose down -v
```

## Manual Setup (Without Docker)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up PostgreSQL

Install PostgreSQL and create a database:

```sql
CREATE DATABASE vaultdb;
CREATE USER vaultuser WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE vaultdb TO vaultuser;
```

### 3. Configure Environment Variables

Follow step 2 from the Docker setup to create your `.env` file.

### 4. Run Database Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start the Application

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## Security Checklist

Before deploying to production, ensure:

- [ ] All environment variables use strong, randomly generated values
- [ ] `SESSION_SECRET` is at least 64 characters (hex)
- [ ] `SERVER_ENCRYPTION_KEY` is exactly 64 characters (hex)
- [ ] Database password is strong and unique
- [ ] `.env` and `.env.docker` files are never committed to git (they're in `.gitignore`)
- [ ] HTTPS is enabled in production (`NODE_ENV=production`)
- [ ] Database backups are configured
- [ ] Firewall rules restrict database access

## Architecture

**Zero-Knowledge Design:**
- User passwords are NEVER sent to the server
- Client-side key derivation using Argon2id
- All vault data is encrypted client-side with XChaCha20-Poly1305
- Server only stores encrypted blobs

**Security Features:**
- Password hashing with Argon2id
- Session tokens hashed with SHA-256 before storage
- Optional 2FA with TOTP
- Audit logging for security events
- HttpOnly, Secure, SameSite cookies

## Troubleshooting

### "SESSION_SECRET must be set" error

Make sure your `.env` file contains a valid `SESSION_SECRET` that is at least 32 characters long.

### "Invalid SERVER_ENCRYPTION_KEY" error

The `SERVER_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters (32 bytes).

### Database connection errors

- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env` matches your database configuration
- Ensure database user has proper permissions

### Prisma errors

```bash
# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Regenerate Prisma client
npx prisma generate
```

## Production Deployment

### Additional Security Measures

1. **Enable HTTPS**: Use a reverse proxy (nginx, Caddy) with SSL certificates
2. **Rate Limiting**: Implement rate limiting on login endpoints
3. **Monitoring**: Set up logging and monitoring
4. **Backups**: Regular encrypted database backups
5. **Updates**: Keep dependencies updated

### Environment Variables for Production

```env
NODE_ENV=production
APP_ORIGIN=https://yourdomain.com
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

## Support

For issues and questions, please check the documentation or create an issue in the repository.
