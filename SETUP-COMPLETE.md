# ✅ Database Migration Setup Complete

## What Was Done:
1. ✅ Created database setup script (`scripts/setup-db.sh`)
2. ✅ Created setup documentation (`README-SETUP.md`)
3. ✅ Updated package.json with helper scripts
4. ✅ Server was stopped (ready for restart after migration)

## Next Steps (Choose One):

### Option A: If DATABASE_URL is already set (Replit or your environment)
```bash
npm run db:push
npm run dev
```

### Option B: Set DATABASE_URL first, then migrate
```bash
# For Replit: DATABASE_URL is auto-set, just run:
npm run db:push
npm run dev

# For Local: Set DATABASE_URL first
export DATABASE_URL="postgresql://user:password@localhost:5432/lubefun"
npm run db:push
npm run dev
```

### Option C: Use the setup script
```bash
bash scripts/setup-db.sh
# Then restart: npm run dev
```

## What the Migration Will Do:
- ✅ Create `deposits` table for SOL deposit tracking
- ✅ Update user default balance to 0 (real money mode)
- ✅ Set up all indexes and constraints

## After Migration:
1. Restart the server: `npm run dev`
2. Test deposit flow: Create account → Deposit → Verify
3. Check that new users start with $0.00 balance

## Troubleshooting:
- **"DATABASE_URL must be set"**: Ensure it's in your environment
- **"Connection refused"**: Check PostgreSQL is running
- **"Database does not exist"**: Create it with `createdb lubefun`
