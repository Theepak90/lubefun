# Database Setup Instructions

## Quick Setup

### For Replit Users:
1. **Provision Database**: Go to the Database tab → Create Database → PostgreSQL
2. **DATABASE_URL is automatically set** - no action needed
3. Run migration: `npm run db:push`
4. Restart server: `npm run dev`

### For Local Development:

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Linux
   sudo apt-get install postgresql
   sudo systemctl start postgresql
   ```

2. **Create Database**:
   ```bash
   createdb lubefun
   ```

3. **Set DATABASE_URL**:
   ```bash
   export DATABASE_URL="postgresql://$(whoami)@localhost:5432/lubefun"
   ```
   
   Or create a `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env and set your DATABASE_URL
   ```

4. **Run Migration**:
   ```bash
   npm run db:push
   ```

5. **Start Server**:
   ```bash
   npm run dev
   ```

## What the Migration Does

- Creates the `deposits` table for tracking SOL deposits
- Updates user default balance to 0 (real money mode)
- Sets up all necessary indexes and constraints

## Verification

After migration, you can verify by:
1. Checking that new users have balance = 0
2. Testing deposit flow: `POST /api/deposit/initiate`
3. Checking database: The `deposits` table should exist

## Troubleshooting

**Error: "DATABASE_URL must be set"**
- Ensure DATABASE_URL is in your environment or .env file
- In Replit: Check that database is provisioned

**Error: "Connection refused"**
- Ensure PostgreSQL is running
- Check DATABASE_URL connection string is correct

**Error: "Database does not exist"**
- Create the database: `createdb lubefun`
- Or update DATABASE_URL to point to existing database

