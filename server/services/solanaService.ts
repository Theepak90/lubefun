import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "crypto";

// Solana RPC endpoint configuration
// For testing: Use devnet. For production: Use mainnet
const USE_TESTNET = process.env.SOLANA_USE_TESTNET === "true" || process.env.NODE_ENV === "development";
const SOLANA_MAINNET_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const SOLANA_DEVNET_URL = "https://api.devnet.solana.com";

// Use devnet for testing, mainnet for production
const SOLANA_RPC_URL = USE_TESTNET ? SOLANA_DEVNET_URL : SOLANA_MAINNET_URL;
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

console.log(`🔗 Solana Network: ${USE_TESTNET ? "DEVNET (Testing)" : "MAINNET (Production)"}`);
console.log(`🔗 RPC URL: ${SOLANA_RPC_URL}`);

// Treasury wallet (platform wallet) - stores all funds
// Private key should be stored securely in environment variables
let treasuryWallet: Keypair | null = null;

/**
 * Get the treasury wallet (platform wallet that holds all funds)
 * This wallet receives lost bets and pays withdrawals
 */
export function getTreasuryWallet(): Keypair {
  if (!treasuryWallet) {
    const privateKey = process.env.SOLANA_TREASURY_PRIVATE_KEY;
    if (!privateKey) {
      // For testing: generate a test wallet
      if (USE_TESTNET) {
        console.warn("⚠️  SOLANA_TREASURY_PRIVATE_KEY not set - generating test wallet for DEVNET");
        console.warn("⚠️  This is a TEST wallet - funds are on devnet only");
        treasuryWallet = Keypair.generate();
        console.warn(`⚠️  Test treasury address: ${treasuryWallet.publicKey.toBase58()}`);
        console.warn("⚠️  To persist this wallet, set SOLANA_TREASURY_PRIVATE_KEY environment variable");
        console.warn(`⚠️  Export the private key: ${bs58.encode(treasuryWallet.secretKey)}`);
      } else {
        // Production/mainnet - require private key
        throw new Error("SOLANA_TREASURY_PRIVATE_KEY environment variable is required for mainnet operations");
      }
    } else {
      // Decode the base58 private key
      const secretKey = bs58.decode(privateKey);
      treasuryWallet = Keypair.fromSecretKey(secretKey);
      const network = USE_TESTNET ? "DEVNET" : "MAINNET";
      console.log(`✅ Treasury wallet loaded for ${network}: ${treasuryWallet.publicKey.toBase58()}`);
    }
  }
  return treasuryWallet;
}

export function getTreasuryPublicKey(): PublicKey {
  return getTreasuryWallet().publicKey;
}

/**
 * Generate a unique deposit address for a user
 * Uses treasury wallet address with a memo for tracking
 * In production, you could use unique derived addresses per user
 */
export function generateDepositAddress(userId: number, memo?: string): { address: string; memo: string } {
  const treasuryAddress = getTreasuryPublicKey().toBase58();
  
  // Generate a unique memo for this deposit request
  // Format: userId_timestamp_random
  const uniqueMemo = memo || `${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  const network = USE_TESTNET ? "DEVNET" : "MAINNET";
  console.log(`📝 Generated deposit address for user ${userId} on ${network}: ${treasuryAddress}`);
  
  return {
    address: treasuryAddress,
    memo: uniqueMemo,
  };
}

/**
 * Validate a Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check balance of a Solana address
 */
export async function getSolanaBalance(address: string): Promise<number> {
  try {
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
  } catch (error) {
    console.error("Error getting Solana balance:", error);
    throw new Error("Failed to get Solana balance");
  }
}

/**
 * Check if a transaction exists and is confirmed
 */
export async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
    });
    return tx !== null && tx.meta?.err === null;
  } catch (error) {
    console.error("Error verifying transaction:", error);
    return false;
  }
}

/**
 * Verify a deposit transaction
 * Checks if a transaction sent the exact expected amount to the treasury address
 * Returns the actual amount received if transaction is valid
 */
export async function verifyDepositTransaction(
  txSignature: string,
  expectedAmount: number,
  depositAddress: string
): Promise<{ valid: boolean; actualAmount: number; timestamp: Date | null }> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta || tx.meta.err !== null) {
      return { valid: false, actualAmount: 0, timestamp: null };
    }

    const treasuryPubkey = new PublicKey(depositAddress);
    
    // Handle both legacy and versioned transactions
    let accountKeys: PublicKey[];
    if ('accountKeys' in tx.transaction.message) {
      // Legacy transaction
      accountKeys = tx.transaction.message.accountKeys as PublicKey[];
    } else {
      // Versioned transaction - use getAccountKeys()
      accountKeys = tx.transaction.message.getAccountKeys().keySegments().flat();
    }
    
    const accountIndex = accountKeys.findIndex(
      (key: PublicKey) => key.equals(treasuryPubkey)
    );

    if (accountIndex < 0) {
      return { valid: false, actualAmount: 0, timestamp: null };
    }

    // Calculate balance change
    const preBalance = tx.meta.preBalances[accountIndex];
    const postBalance = tx.meta.postBalances[accountIndex];
    const balanceChange = (postBalance - preBalance) / LAMPORTS_PER_SOL;

    // Check if amount matches exactly (with small tolerance for rounding)
    const tolerance = 0.000001; // 0.000001 SOL tolerance
    const amountMatches = Math.abs(balanceChange - expectedAmount) < tolerance;

    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000) : null;

    return {
      valid: amountMatches && balanceChange > 0,
      actualAmount: balanceChange,
      timestamp: blockTime,
    };
  } catch (error) {
    console.error("Error verifying deposit transaction:", error);
    return { valid: false, actualAmount: 0, timestamp: null };
  }
}


/**
 * Send SOL from treasury wallet to an address (signed and sent)
 * This is used for withdrawals - sends real SOL from platform treasury
 */
export async function sendSol(
  toAddress: string,
  amountSOL: number
): Promise<string> {
  try {
    if (!isValidSolanaAddress(toAddress)) {
      throw new Error("Invalid Solana address");
    }

    const fromPubkey = getTreasuryPublicKey();
    const toPubkey = new PublicKey(toAddress);
    const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

    if (amountLamports <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    // Check treasury balance
    const treasuryBalance = await connection.getBalance(fromPubkey);
    if (treasuryBalance < amountLamports) {
      throw new Error(`Insufficient treasury balance. Required: ${amountSOL} SOL, Available: ${treasuryBalance / LAMPORTS_PER_SOL} SOL`);
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amountLamports,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Sign with treasury wallet
    const wallet = getTreasuryWallet();
    transaction.sign(wallet);
    
    // Send the transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );
    
    // Wait for confirmation
    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );
    
    return signature;
  } catch (error) {
    console.error("Error sending SOL:", error);
    throw new Error(`Failed to send SOL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Check for deposits to treasury address
 * Returns all deposits since a given timestamp
 * In production, use webhooks or polling to detect incoming transactions
 */
export async function checkForDeposits(
  address: string,
  sinceTimestamp?: Date
): Promise<Array<{ signature: string; amount: number; timestamp: Date }>> {
  try {
    const publicKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 100,
    });

    const deposits: Array<{ signature: string; amount: number; timestamp: Date }> = [];

    for (const sigInfo of signatures) {
      if (sinceTimestamp && sigInfo.blockTime && sigInfo.blockTime * 1000 < sinceTimestamp.getTime()) {
        continue;
      }

      const tx = await connection.getTransaction(sigInfo.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (tx && tx.meta && tx.meta.err === null) {
        // Handle both legacy and versioned transactions
        let accountKeys: PublicKey[];
        if ('accountKeys' in tx.transaction.message) {
          // Legacy transaction
          accountKeys = tx.transaction.message.accountKeys as PublicKey[];
        } else {
          // Versioned transaction
          accountKeys = tx.transaction.message.getAccountKeys().keySegments().flat();
        }
        
        // Check if this transaction received SOL
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;
        const accountIndex = accountKeys.findIndex(
          (key: PublicKey) => key.equals(publicKey)
        );

        if (accountIndex >= 0) {
          const balanceChange = (postBalances[accountIndex] - preBalances[accountIndex]) / LAMPORTS_PER_SOL;
          if (balanceChange > 0) {
            deposits.push({
              signature: sigInfo.signature,
              amount: balanceChange,
              timestamp: sigInfo.blockTime
                ? new Date(sigInfo.blockTime * 1000)
                : new Date(),
            });
          }
        }
      }
    }

    return deposits;
  } catch (error) {
    console.error("Error checking for deposits:", error);
    throw new Error("Failed to check for deposits");
  }
}
