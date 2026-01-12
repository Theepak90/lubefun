#!/usr/bin/env tsx
/**
 * Create deposits table directly using SQL
 */

import { pool } from "../server/db.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createDepositsTable() {
  console.log("🔄 Creating deposits table...\n");

  try {
    const sql = readFileSync(join(__dirname, "create-deposits-table.sql"), "utf-8");
    
    // Split by semicolons and execute each statement
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }

    console.log("✅ Deposits table created successfully!");
    console.log("\n📋 Table structure:");
    console.log("  - deposits table with all required columns");
    console.log("  - Indexes on user_id, status, and idempotency_key");
    console.log("\n✅ Migration complete!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating deposits table:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createDepositsTable();

