import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

// Solana RPC endpoint - use mainnet or devnet
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const SOLANA_DEVNET_URL = "https://api.devnet.solana.com";

// Use devnet for development, mainnet for production
const connection = new Connection(
  process.env.NODE_ENV === "production" ? SOLANA_RPC_URL : SOLANA_DEVNET_URL,
  "confirmed"
);

// Server's Solana wallet (should be stored securely in environment variables)
// In production, load from secure key management system
let serverWallet: Keypair | null = null;

export function getServerWallet(): Keypair {
  if (!serverWallet) {
    const privateKey = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKey) {
      // Generate a new keypair for demo (DO NOT USE IN PRODUCTION)
      console.warn("⚠️  SOLANA_PRIVATE_KEY not set - generating demo keypair. DO NOT USE IN PRODUCTION!");
      serverWallet = Keypair.generate();
    } else {
      // Decode the base58 private key
      const secretKey = bs58.decode(privateKey);
      serverWallet = Keypair.fromSecretKey(secretKey);
    }
  }
  return serverWallet;
}

export function getServerPublicKey(): PublicKey {
  return getServerWallet().publicKey;
}

/**
 * Generate a unique deposit address for a user
 * Using the provided Solana wallet address for all deposits
 */
export function generateDepositAddress(userId: number): string {
  // Use the provided Solana wallet address for deposits
  return "64BsBMK9ysDwgo1fAC8tqemDJozqSVh3zJWtDLG9rwVu";
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
 * Create a withdrawal transaction
 * This creates the transaction but doesn't send it - you'll need to sign and send it
 */
export async function createWithdrawalTransaction(
  toAddress: string,
  amountSOL: number
): Promise<Transaction> {
  if (!isValidSolanaAddress(toAddress)) {
    throw new Error("Invalid Solana address");
  }

  const fromPubkey = getServerPublicKey();
  const toPubkey = new PublicKey(toAddress);
  const amountLamports = amountSOL * LAMPORTS_PER_SOL;

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: amountLamports,
    })
  );

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

/**
 * Send SOL to an address (signed and sent)
 */
export async function sendSol(
  toAddress: string,
  amountSOL: number
): Promise<string> {
  try {
    const transaction = await createWithdrawalTransaction(toAddress, amountSOL);
    const wallet = getServerWallet();
    
    // Sign the transaction
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
    await connection.confirmTransaction(signature, "confirmed");
    
    return signature;
  } catch (error) {
    console.error("Error sending SOL:", error);
    throw new Error(`Failed to send SOL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Monitor deposits to the server wallet
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
      });

      if (tx && tx.meta && tx.meta.err === null) {
        // Check if this transaction received SOL
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;
        const accountIndex = tx.transaction.message.accountKeys.findIndex(
          (key) => key.equals(publicKey)
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
