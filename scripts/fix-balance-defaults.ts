#!/usr/bin/env tsx
/**
 * Fix balance defaults in database
 */

import { pool } from "../server/db.js";

async function fixDefaults() {
  try {
    console.log("🔄 Updating balance defaults to 0...");
    
    // Update column defaults
    await pool.query("ALTER TABLE users ALTER COLUMN balance SET DEFAULT 0");
    await pool.query("ALTER TABLE users ALTER COLUMN available_balance SET DEFAULT 0");
    
    console.log("✅ Balance defaults updated to 0");
    console.log("✅ New users will now start with $0.00 balance");
    
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

fixDefaults();

