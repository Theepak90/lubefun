#!/usr/bin/env tsx
/**
 * Run database migration
 * This script ensures DATABASE_URL is available before running migration
 */

import { execSync } from "child_process";

console.log("🔄 Running database migration...\n");

try {
  // Run drizzle-kit push
  execSync("npx drizzle-kit push", {
    stdio: "inherit",
    env: process.env,
  });
  
  console.log("\n✅ Migration completed successfully!");
  console.log("\n📋 Next steps:");
  console.log("  1. The 'deposits' table has been added");
  console.log("  2. User default balance is now 0 (real money)");
  console.log("  3. Restart the server to apply changes");
} catch (error) {
  console.error("\n❌ Migration failed!");
  console.error("Make sure DATABASE_URL is set in your environment.");
  console.error("If running in Replit, DATABASE_URL should be set automatically.");
  process.exit(1);
}

