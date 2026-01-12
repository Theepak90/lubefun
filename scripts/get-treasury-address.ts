#!/usr/bin/env tsx
/**
 * Get the treasury wallet address for testing
 */

import { getTreasuryPublicKey, getTreasuryWallet } from "../server/services/solanaService.js";
import bs58 from "bs58";

try {
  const wallet = getTreasuryWallet();
  const address = wallet.publicKey.toBase58();
  const privateKey = bs58.encode(wallet.secretKey);
  
  console.log("\n📋 Treasury Wallet Information:");
  console.log("=" .repeat(50));
  console.log(`Address: ${address}`);
  console.log(`\nPrivate Key (base58): ${privateKey}`);
  console.log("\n⚠️  KEEP THIS PRIVATE KEY SECURE!");
  console.log("⚠️  Save it as SOLANA_TREASURY_PRIVATE_KEY environment variable");
  console.log("\n💡 To get test SOL:");
  console.log(`   1. Visit: https://faucet.solana.com`);
  console.log(`   2. Enter address: ${address}`);
  console.log(`   3. Request test SOL (devnet only)`);
  console.log("=" .repeat(50));
  
  process.exit(0);
} catch (error: any) {
  console.error("Error:", error.message);
  process.exit(1);
}

