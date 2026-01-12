import { db } from "../db";
import { users, withdrawals, transactions, WITHDRAWAL_MANUAL_REVIEW_THRESHOLD, DAILY_WITHDRAWAL_LIMIT, type Withdrawal } from "@shared/schema";
import { eq, sql, and, gte } from "drizzle-orm";

export interface WithdrawalRequest {
  userId: number;
  amount: number;
  currency?: string;
  network?: string;
  address?: string;
  idempotencyKey?: string;
}

export interface WithdrawalResponse {
  success: boolean;
  withdrawal?: Withdrawal;
  error?: string;
  message?: string;
}

export class WithdrawalServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "WithdrawalServiceError";
  }
}

const MIN_WITHDRAWAL = 1;
const MAX_WITHDRAWAL_PER_REQUEST = 5000;
const WITHDRAWAL_COOLDOWN_MS = 60 * 1000;

async function checkWithdrawalRateLimits(userId: number, amount: number): Promise<void> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const [user] = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!user) {
    throw new WithdrawalServiceError("User not found", "USER_NOT_FOUND");
  }
  
  let dailyTotal = user.dailyWithdrawalTotal;
  const dailyReset = user.dailyWithdrawalReset;
  
  if (!dailyReset || dailyReset < startOfDay) {
    dailyTotal = 0;
  }
  
  if (dailyTotal + amount > DAILY_WITHDRAWAL_LIMIT) {
    throw new WithdrawalServiceError(
      `Daily withdrawal limit of $${DAILY_WITHDRAWAL_LIMIT} exceeded. Current: $${dailyTotal.toFixed(2)}`,
      "DAILY_LIMIT_EXCEEDED"
    );
  }
  
  const recentWithdrawals = await db.select()
    .from(withdrawals)
    .where(and(
      eq(withdrawals.userId, userId),
      gte(withdrawals.createdAt, new Date(now.getTime() - WITHDRAWAL_COOLDOWN_MS))
    ))
    .limit(1);
  
  if (recentWithdrawals.length > 0) {
    throw new WithdrawalServiceError(
      "Please wait before requesting another withdrawal",
      "COOLDOWN_ACTIVE"
    );
  }
}

async function checkIdempotencyKey(key: string, userId: number): Promise<Withdrawal | null> {
  const [existing] = await db.select()
    .from(withdrawals)
    .where(eq(withdrawals.idempotencyKey, key))
    .limit(1);
  
  if (existing) {
    if (existing.userId !== userId) {
      throw new WithdrawalServiceError("Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
    }
    return existing;
  }
  return null;
}

export async function requestWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResponse> {
  const { userId, amount, currency = "SOL", network = "mainnet", address, idempotencyKey } = request;
  
  try {
    if (idempotencyKey) {
      const existing = await checkIdempotencyKey(idempotencyKey, userId);
      if (existing) {
        return {
          success: true,
          withdrawal: existing,
          message: "Withdrawal already exists",
        };
      }
    }
    
    if (amount < MIN_WITHDRAWAL) {
      throw new WithdrawalServiceError(`Minimum withdrawal is $${MIN_WITHDRAWAL}`, "AMOUNT_TOO_SMALL");
    }
    if (amount > MAX_WITHDRAWAL_PER_REQUEST) {
      throw new WithdrawalServiceError(`Maximum withdrawal per request is $${MAX_WITHDRAWAL_PER_REQUEST}`, "AMOUNT_TOO_LARGE");
    }
    
    await checkWithdrawalRateLimits(userId, amount);
    
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user) {
      throw new WithdrawalServiceError("User not found", "USER_NOT_FOUND");
    }
    
    if (user.availableBalance < amount) {
      throw new WithdrawalServiceError("Insufficient balance", "INSUFFICIENT_BALANCE");
    }
    
    const requiresManualReview = amount >= WITHDRAWAL_MANUAL_REVIEW_THRESHOLD;
    
    const balanceBefore = user.availableBalance;
    
    await db.execute(sql`
      UPDATE users 
      SET available_balance = available_balance - ${amount},
          locked_balance = locked_balance + ${amount},
          balance = balance - ${amount},
          daily_withdrawal_total = CASE 
            WHEN daily_withdrawal_reset IS NULL OR daily_withdrawal_reset < DATE_TRUNC('day', NOW()) 
            THEN ${amount}
            ELSE daily_withdrawal_total + ${amount}
          END,
          daily_withdrawal_reset = CASE 
            WHEN daily_withdrawal_reset IS NULL OR daily_withdrawal_reset < DATE_TRUNC('day', NOW()) 
            THEN NOW()
            ELSE daily_withdrawal_reset
          END
      WHERE id = ${userId}
    `);
    
    const [withdrawal] = await db.insert(withdrawals).values({
      userId,
      amount,
      currency,
      network,
      address,
      status: "PENDING",
      requiresManualReview,
      idempotencyKey,
    }).returning();
    
    await db.insert(transactions).values({
      userId,
      type: 'withdrawal',
      amount: -amount,
      balanceBefore,
      balanceAfter: balanceBefore - amount,
      referenceType: 'withdrawal',
      referenceId: withdrawal.id,
      description: `Withdrawal requested - ${requiresManualReview ? 'pending manual review' : 'processing'}`,
    });
    
    return {
      success: true,
      withdrawal,
      message: requiresManualReview 
        ? "Withdrawal queued for manual review due to amount" 
        : "Withdrawal queued for processing",
    };
    
  } catch (error) {
    if (error instanceof WithdrawalServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in requestWithdrawal:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function approveWithdrawal(
  withdrawalId: number,
  reviewerId: number
): Promise<WithdrawalResponse> {
  try {
    const [withdrawal] = await db.select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);
    
    if (!withdrawal) {
      throw new WithdrawalServiceError("Withdrawal not found", "NOT_FOUND");
    }
    
    if (withdrawal.status !== "PENDING") {
      throw new WithdrawalServiceError(`Withdrawal is ${withdrawal.status}`, "INVALID_STATUS");
    }
    
    const [updated] = await db.update(withdrawals)
      .set({
        status: "APPROVED",
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(withdrawals.id, withdrawalId))
      .returning();
    
    return {
      success: true,
      withdrawal: updated,
      message: "Withdrawal approved, queued for sending",
    };
    
  } catch (error) {
    if (error instanceof WithdrawalServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in approveWithdrawal:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function processApprovedWithdrawals(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  
  const pending = await db.select()
    .from(withdrawals)
    .where(eq(withdrawals.status, "APPROVED"))
    .limit(10);
  
  for (const withdrawal of pending) {
    try {
      await db.update(withdrawals)
        .set({
          status: "SENT",
          processedAt: new Date(),
          txHash: `PLAY_${withdrawal.id}_${Date.now()}`,
        })
        .where(eq(withdrawals.id, withdrawal.id));
      
      await db.execute(sql`
        UPDATE users 
        SET locked_balance = locked_balance - ${withdrawal.amount}
        WHERE id = ${withdrawal.userId}
      `);
      
      processed++;
    } catch (error) {
      console.error(`Failed to process withdrawal ${withdrawal.id}:`, error);
      
      await db.update(withdrawals)
        .set({
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(withdrawals.id, withdrawal.id));
      
      await db.execute(sql`
        UPDATE users 
        SET available_balance = available_balance + ${withdrawal.amount},
            locked_balance = locked_balance - ${withdrawal.amount},
            balance = balance + ${withdrawal.amount}
        WHERE id = ${withdrawal.userId}
      `);
      
      failed++;
    }
  }
  
  return { processed, failed };
}

export async function cancelWithdrawal(
  withdrawalId: number,
  userId: number
): Promise<WithdrawalResponse> {
  try {
    const [withdrawal] = await db.select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);
    
    if (!withdrawal) {
      throw new WithdrawalServiceError("Withdrawal not found", "NOT_FOUND");
    }
    
    if (withdrawal.userId !== userId) {
      throw new WithdrawalServiceError("Unauthorized", "UNAUTHORIZED");
    }
    
    if (withdrawal.status !== "PENDING") {
      throw new WithdrawalServiceError(`Cannot cancel ${withdrawal.status} withdrawal`, "INVALID_STATUS");
    }
    
    const [updated] = await db.update(withdrawals)
      .set({
        status: "CANCELLED",
      })
      .where(eq(withdrawals.id, withdrawalId))
      .returning();
    
    await db.execute(sql`
      UPDATE users 
      SET available_balance = available_balance + ${withdrawal.amount},
          locked_balance = locked_balance - ${withdrawal.amount},
          balance = balance + ${withdrawal.amount}
      WHERE id = ${userId}
    `);
    
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    await db.insert(transactions).values({
      userId,
      type: 'unlock',
      amount: withdrawal.amount,
      balanceBefore: user.availableBalance - withdrawal.amount,
      balanceAfter: user.availableBalance,
      referenceType: 'withdrawal',
      referenceId: withdrawalId,
      description: 'Withdrawal cancelled - funds returned',
    });
    
    return {
      success: true,
      withdrawal: updated,
      message: "Withdrawal cancelled, funds returned",
    };
    
  } catch (error) {
    if (error instanceof WithdrawalServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in cancelWithdrawal:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function getUserWithdrawals(userId: number, limit: number = 20): Promise<Withdrawal[]> {
  return db.select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(sql`created_at DESC`)
    .limit(limit);
}
