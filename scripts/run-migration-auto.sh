#!/bin/bash
# Auto-run migration with DATABASE_URL

export DATABASE_URL="postgresql://postgres:cruze%402002@localhost:5432/postgres"

echo "🔄 Running database migration..."
echo ""

# Use expect to handle interactive prompt, or just run and let user confirm
# For now, we'll run it and the user can press Enter to confirm
npm run db:push

