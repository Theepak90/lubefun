#!/bin/bash
# Database setup script for Replit/local development

echo "🔧 Database Setup Script"
echo "========================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL is not set in environment"
    echo ""
    echo "For Replit:"
    echo "  DATABASE_URL is automatically set when you provision a database"
    echo "  Go to: Database tab → Create Database → PostgreSQL"
    echo ""
    echo "For Local Development:"
    echo "  Set DATABASE_URL in your environment:"
    echo "    export DATABASE_URL='postgresql://user:password@localhost:5432/dbname'"
    echo ""
    echo "  Or create a .env file:"
    echo "    DATABASE_URL=postgresql://user:password@localhost:5432/dbname"
    echo ""
    
    # Check if .env file exists
    if [ -f .env ]; then
        echo "📄 Found .env file, loading it..."
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Check again after loading .env
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ DATABASE_URL still not set. Cannot proceed with migration."
        echo ""
        echo "Please set DATABASE_URL and run this script again."
        exit 1
    fi
fi

echo "✅ DATABASE_URL is set"
echo ""

# Run migration
echo "🔄 Running database migration..."
npm run db:push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📋 Changes applied:"
    echo "  - 'deposits' table created"
    echo "  - User default balance set to 0 (real money)"
    echo ""
    echo "🚀 You can now restart the server with: npm run dev"
else
    echo ""
    echo "❌ Migration failed. Please check the error above."
    exit 1
fi

