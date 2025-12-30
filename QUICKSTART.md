# Quick Start Guide

## The Prisma 7.x Issue Fix

The error you encountered is because `npx prisma` installed the latest version (7.x) which has breaking changes. Your project uses Prisma 5.10.2.

## Solution: Use Local Prisma

Instead of `npx prisma`, use the npm scripts which use the local version:

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Run the initial migration
npm run prisma:migrate:dev -- --name init

# 3. Generate Prisma Client
npm run prisma:generate
```

## Complete Setup Steps

### 1. Generate Secure Keys

```bash
# Run this 3 times to get 3 different keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You'll get outputs like:
```
a1b2c3d4e5f6...  (use for SESSION_SECRET)
f6e5d4c3b2a1...  (use for SERVER_ENCRYPTION_KEY)
9876543210ab...  (use for database password)
```

### 2. Create .env File

```bash
# Copy the example
cp .env.example .env
```

Edit `.env` and paste your generated keys:

```env
DATABASE_URL=postgresql://vaultuser:9876543210ab@localhost:5432/vaultdb
SESSION_SECRET=a1b2c3d4e5f6...
SERVER_ENCRYPTION_KEY=f6e5d4c3b2a1...
APP_ORIGIN=http://localhost:3000
NODE_ENV=development
```

### 3. Run Migrations

```bash
npm install
npm run prisma:migrate:dev -- --name init
npm run prisma:generate
```

### 4. Start Development Server

```bash
npm run dev
```

Visit: http://localhost:3000

## Docker Deployment

If using Docker instead:

```bash
# Create .env.docker with your keys
cp .env.example .env.docker

# Edit .env.docker with your generated keys

# Start containers
docker-compose --env-file .env.docker up -d --build

# Check logs
docker-compose logs -f app
```

## Available Scripts

```bash
npm run dev                    # Start development server
npm run build                  # Build for production
npm start                      # Start production server
npm run prisma:generate        # Generate Prisma Client
npm run prisma:migrate:dev     # Run migrations (development)
npm run prisma:migrate         # Deploy migrations (production)
npm run prisma:studio          # Open Prisma Studio (DB GUI)
```

## Troubleshooting

### "SESSION_SECRET must be set" error
- Make sure `.env` file exists and has valid SESSION_SECRET (32+ chars)

### "Invalid SERVER_ENCRYPTION_KEY" error
- Must be exactly 64 hex characters (use the generation command above)

### Database connection errors
- Check PostgreSQL is running
- Verify DATABASE_URL in `.env`
- Ensure database exists

### Prisma version mismatch
- Always use `npm run prisma:*` commands, NOT `npx prisma`
- This ensures you use the local version (5.10.2)

## Next Steps

1. Create an account at http://localhost:3000/signup
2. Log in at http://localhost:3000/login
3. Unlock your vault with your master password
4. Start adding passwords securely!

## Security Notes

- Your master password is NEVER sent to the server
- All encryption happens in your browser
- The server only stores encrypted blobs
- Make sure to use strong, unique secrets in production
- Never commit your `.env` file to git
