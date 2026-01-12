import { db } from "../db";
import { deposits, users, transactions, type Deposit } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateDepositAddress, verifyDepositTransaction, isValidSolanaAddress, checkForDeposits, getTreasuryPublicKey } from "./solanaService";
import crypto from "crypto";

export interface DepositRequest {
  userId: number;
  amount: number;
  currency?: string;
  network?: string;
  idempotencyKey?: string;
}

export interface DepositResponse {
  success: boolean;
  deposit?: Deposit;
  error?: string;
  message?: string;
}

export class DepositServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "DepositServiceError";
  }
}

const MIN_DEPOSIT = 0.01; // Minimum 0.01 SOL
const MAX_DEPOSIT = 10000; // Maximum 10,000 SOL per deposit
const DEPOSIT_EXPIRY_HOURS = 24; // Deposits expire after 24 hours

/**
 * Initiate a deposit request
 * Creates a pending deposit record with a unique deposit address
 */
export async function initiateDeposit(request: DepositRequest): Promise<DepositResponse> {
  // Use testnet if SOLANA_USE_TESTNET is set, otherwise mainnet
  const useTestnet = process.env.SOLANA_USE_TESTNET === "true" || process.env.NODE_ENV === "development";
  const { userId, amount, currency = "SOL", network = useTestnet ? "devnet" : "mainnet", idempotencyKey } = request;

  try {
    // Validate amount
    if (amount < MIN_DEPOSIT) {
      throw new DepositServiceError(`Minimum deposit is ${MIN_DEPOSIT} SOL`, "AMOUNT_TOO_SMALL");
    }
    if (amount > MAX_DEPOSIT) {
      throw new DepositServiceError(`Maximum deposit is ${MAX_DEPOSIT} SOL`, "AMOUNT_TOO_LARGE");
    }

    // Check idempotency
    if (idempotencyKey) {
      const [existing] = await db.select()
        .from(deposits)
        .where(eq(deposits.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        if (existing.userId !== userId) {
          throw new DepositServiceError("Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
        }
        return {
          success: true,
          deposit: existing,
          message: "Deposit already exists",
        };
      }
    }

    // Generate unique deposit address and memo
    const { address, memo } = generateDepositAddress(userId);

    // Set expiry time (24 hours from now)
    const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_HOURS * 60 * 60 * 1000);

    // Create deposit record
    const [deposit] = await db.insert(deposits).values({
      userId,
      amount,
      currency,
      network,
      depositAddress: address,
      memo: memo || undefined,
      status: "PENDING",
      idempotencyKey: idempotencyKey || undefined,
      expiresAt,
    }).returning();

    return {
      success: true,
      deposit,
      message: "Deposit address generated. Send exact amount to complete deposit.",
    };

  } catch (error) {
    if (error instanceof DepositServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in initiateDeposit:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Check and auto-verify pending deposits
 * Scans recent transactions to the treasury address and verifies them
 */
export async function checkPendingDeposits(userId: number): Promise<DepositResponse[]> {
  try {
    // Get all pending deposits for this user
    const pendingDeposits = await db.select()
      .from(deposits)
      .where(and(
        eq(deposits.userId, userId),
        eq(deposits.status, "PENDING")
      ));

    if (pendingDeposits.length === 0) {
      return [];
    }

    const results: DepositResponse[] = [];

    // Get treasury address (all deposits go to the same treasury address)
    const treasuryAddress = getTreasuryPublicKey().toBase58();
    
    // Check for recent deposits to treasury
    const sinceTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const recentDeposits = await checkForDeposits(treasuryAddress, sinceTime);

    // Try to match pending deposits with recent transactions
    for (const deposit of pendingDeposits) {
      // Look for a transaction that matches the expected amount
      const matchingTx = recentDeposits.find(
        tx => Math.abs(tx.amount - deposit.amount) < 0.000001
      );

      if (matchingTx) {
        // Found a matching transaction - verify it
        const verifyResult = await verifyDeposit(deposit.id, userId, matchingTx.signature);
        results.push(verifyResult);
      }
    }

    return results;
  } catch (error) {
    console.error("Error checking pending deposits:", error);
    return [];
  }
}

/**
 * Verify a deposit transaction
 * Checks if the transaction exists and matches the expected amount
 * Credits user balance only if amount matches exactly
 */
export async function verifyDeposit(
  depositId: number,
  userId: number,
  txSignature: string
): Promise<DepositResponse> {
  try {
    // Get deposit record
    const [deposit] = await db.select()
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1);

    if (!deposit) {
      throw new DepositServiceError("Deposit not found", "NOT_FOUND");
    }

    if (deposit.userId !== userId) {
      throw new DepositServiceError("Unauthorized", "UNAUTHORIZED");
    }

    if (deposit.status === "CONFIRMED") {
      return {
        success: true,
        deposit,
        message: "Deposit already confirmed",
      };
    }

    if (deposit.status !== "PENDING") {
      throw new DepositServiceError(`Deposit is ${deposit.status}`, "INVALID_STATUS");
    }

    // Check if deposit expired
    if (deposit.expiresAt && deposit.expiresAt < new Date()) {
      await db.update(deposits)
        .set({ status: "CANCELLED" })
        .where(eq(deposits.id, depositId));
      throw new DepositServiceError("Deposit request expired", "EXPIRED");
    }

    // Verify transaction on-chain
    const verification = await verifyDepositTransaction(
      txSignature,
      deposit.amount,
      deposit.depositAddress
    );

    if (!verification.valid) {
      // Check if amount doesn't match
      if (verification.actualAmount > 0 && Math.abs(verification.actualAmount - deposit.amount) > 0.000001) {
        // Amount mismatch - mark as failed
        await db.update(deposits)
          .set({
            status: "FAILED",
            txHash: txSignature,
            txAmount: verification.actualAmount,
          })
          .where(eq(deposits.id, depositId));

        throw new DepositServiceError(
          `Amount mismatch. Expected: ${deposit.amount} SOL, Received: ${verification.actualAmount.toFixed(6)} SOL`,
          "AMOUNT_MISMATCH"
        );
      }

      throw new DepositServiceError("Transaction verification failed", "VERIFICATION_FAILED");
    }

    // Transaction is valid and amount matches - credit user balance
    const result = await db.transaction(async (tx) => {
      // Check if deposit was already processed (double-check)
      const [currentDeposit] = await tx.select()
        .from(deposits)
        .where(eq(deposits.id, depositId))
        .limit(1);

      if (currentDeposit?.status === "CONFIRMED") {
        return { deposit: currentDeposit, alreadyProcessed: true };
      }

      // Get user
      const [user] = await tx.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new DepositServiceError("User not found", "USER_NOT_FOUND");
      }

      const balanceBefore = user.availableBalance;

      // Update deposit status
      const [updatedDeposit] = await tx.update(deposits)
        .set({
          status: "CONFIRMED",
          txHash: txSignature,
          txAmount: verification.actualAmount,
          confirmedAt: verification.timestamp || new Date(),
        })
        .where(eq(deposits.id, depositId))
        .returning();

      // Credit user balance atomically
      await tx.execute(sql`
        UPDATE users 
        SET available_balance = available_balance + ${deposit.amount},
            balance = balance + ${deposit.amount}
        WHERE id = ${userId}
      `);

      // Record transaction
      await tx.insert(transactions).values({
        userId,
        type: 'deposit',
        amount: deposit.amount,
        balanceBefore,
        balanceAfter: balanceBefore + deposit.amount,
        referenceType: 'deposit',
        referenceId: depositId,
        description: `SOL deposit confirmed - ${txSignature.substring(0, 8)}...`,
      });

      return { deposit: updatedDeposit, alreadyProcessed: false };
    });

    if (result.alreadyProcessed) {
      return {
        success: true,
        deposit: result.deposit,
        message: "Deposit already confirmed",
      };
    }

    return {
      success: true,
      deposit: result.deposit,
      message: "Deposit confirmed and balance credited",
    };

  } catch (error) {
    if (error instanceof DepositServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in verifyDeposit:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Get user's pending deposits
 */
export async function getUserDeposits(userId: number, limit: number = 20): Promise<Deposit[]> {
  return db.select()
    .from(deposits)
    .where(eq(deposits.userId, userId))
    .orderBy(sql`created_at DESC`)
    .limit(limit);
}

/**
 * Get a specific deposit by ID
 */
export async function getDeposit(depositId: number, userId: number): Promise<Deposit | null> {
  const [deposit] = await db.select()
    .from(deposits)
    .where(and(
      eq(deposits.id, depositId),
      eq(deposits.userId, userId)
    ))
    .limit(1);

  return deposit || null;
}

/**
 * Get pending deposit status for a user
 */
export async function getPendingDepositStatus(userId: number): Promise<{ deposit: Deposit | null; needsVerification: boolean }> {
  const [pendingDeposit] = await db.select()
    .from(deposits)
    .where(and(
      eq(deposits.userId, userId),
      eq(deposits.status, "PENDING")
    ))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  return {
    deposit: pendingDeposit || null,
    needsVerification: !!pendingDeposit,
  };
}
