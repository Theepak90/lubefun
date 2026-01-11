import { db, pool } from "../db";
import { users, bets, transactions, idempotencyKeys, MIN_BET, MAX_BET, MAX_PAYOUT, MAX_BETS_PER_MINUTE, type User, type Bet } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { computeOutcome, generateServerSeed, hashServerSeed, type GameChoice, type OutcomeResult } from "./computeOutcome";
import crypto from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

export interface BetRequest {
  userId: number;
  gameId: string;
  wager: number;
  choice: GameChoice;
  idempotencyKey?: string;
}

export interface BetResponse {
  success: boolean;
  bet?: Bet;
  outcome?: OutcomeResult;
  error?: string;
  newBalance?: number;
}

export class BetServiceError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "BetServiceError";
  }
}

async function checkIdempotencyKey(key: string, userId: number): Promise<{ exists: boolean; response?: unknown }> {
  const existing = await db.select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);
  
  if (existing.length > 0) {
    const record = existing[0];
    if (record.userId !== userId) {
      throw new BetServiceError("Invalid idempotency key", "INVALID_IDEMPOTENCY_KEY");
    }
    if (record.expiresAt < new Date()) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      return { exists: false };
    }
    return { exists: true, response: record.response };
  }
  return { exists: false };
}

async function storeIdempotencyKey(key: string, userId: number, response: unknown): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(idempotencyKeys).values({
    key,
    userId,
    response,
    expiresAt,
  });
}

async function checkRateLimits(userId: number): Promise<void> {
  const user = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (user.length === 0) {
    throw new BetServiceError("User not found", "USER_NOT_FOUND");
  }
  
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60000);
  
  let betsThisMinute = user[0].betsThisMinute;
  const betsMinuteReset = user[0].betsMinuteReset;
  
  if (!betsMinuteReset || betsMinuteReset < minuteAgo) {
    betsThisMinute = 0;
  }
  
  if (betsThisMinute >= MAX_BETS_PER_MINUTE) {
    throw new BetServiceError(
      `Rate limit exceeded. Maximum ${MAX_BETS_PER_MINUTE} bets per minute.`,
      "RATE_LIMIT_EXCEEDED"
    );
  }
}

async function validateAndLockBalance(userId: number, wager: number): Promise<User> {
  const result = await db.execute(sql`
    UPDATE users 
    SET available_balance = available_balance - ${wager},
        locked_balance = locked_balance + ${wager},
        balance = balance - ${wager}
    WHERE id = ${userId} 
      AND available_balance >= ${wager}
    RETURNING *
  `);
  
  if (result.rows.length === 0) {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      throw new BetServiceError("User not found", "USER_NOT_FOUND");
    }
    throw new BetServiceError("Insufficient balance", "INSUFFICIENT_BALANCE");
  }
  
  return result.rows[0] as User;
}

async function unlockAndCreditPayout(userId: number, wager: number, payout: number): Promise<User> {
  const netChange = payout - wager;
  
  const result = await db.execute(sql`
    UPDATE users 
    SET available_balance = available_balance + ${payout},
        locked_balance = locked_balance - ${wager},
        balance = balance + ${payout}
    WHERE id = ${userId}
    RETURNING *
  `);
  
  return result.rows[0] as User;
}

async function recordTransaction(
  userId: number,
  type: string,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  referenceType?: string,
  referenceId?: number,
  description?: string
): Promise<void> {
  await db.insert(transactions).values({
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceType,
    referenceId,
    description,
  });
}

async function updateRateLimitCounters(userId: number): Promise<void> {
  const now = new Date();
  await db.execute(sql`
    UPDATE users 
    SET bets_this_minute = CASE 
        WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
        THEN 1 
        ELSE bets_this_minute + 1 
      END,
      bets_minute_reset = CASE 
        WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
        THEN NOW() 
        ELSE bets_minute_reset 
      END,
      last_bet_at = NOW()
    WHERE id = ${userId}
  `);
}

export async function placeBet(request: BetRequest): Promise<BetResponse> {
  const { userId, gameId, wager, choice, idempotencyKey } = request;
  
  try {
    if (idempotencyKey) {
      const idempotencyCheck = await checkIdempotencyKey(idempotencyKey, userId);
      if (idempotencyCheck.exists) {
        return idempotencyCheck.response as BetResponse;
      }
    }
    
    if (wager < MIN_BET) {
      throw new BetServiceError(`Minimum bet is $${MIN_BET}`, "BET_TOO_SMALL");
    }
    if (wager > MAX_BET) {
      throw new BetServiceError(`Maximum bet is $${MAX_BET}`, "BET_TOO_LARGE");
    }
    
    await checkRateLimits(userId);
    
    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) {
        throw new BetServiceError("User not found", "USER_NOT_FOUND");
      }
      
      if (userRow.availableBalance < wager) {
        throw new BetServiceError("Insufficient balance", "INSUFFICIENT_BALANCE");
      }
      
      const balanceBefore = userRow.availableBalance;
      const serverSeed = userRow.serverSeed;
      const clientSeed = userRow.clientSeed;
      const nonce = userRow.nonce;
      
      await tx.execute(sql`
        UPDATE users 
        SET available_balance = available_balance - ${wager},
            balance = balance - ${wager},
            nonce = nonce + 1,
            bets_this_minute = CASE 
              WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
              THEN 1 ELSE bets_this_minute + 1 END,
            bets_minute_reset = CASE 
              WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
              THEN NOW() ELSE bets_minute_reset END,
            last_bet_at = NOW()
        WHERE id = ${userId}
      `);
      
      const outcome = computeOutcome(gameId, wager, serverSeed, clientSeed, nonce, choice);
      const cappedPayout = Math.min(outcome.payout, MAX_PAYOUT);
      const profit = cappedPayout - wager;
      
      const [bet] = await tx.insert(bets).values({
        userId,
        game: gameId,
        betAmount: wager,
        payout: cappedPayout,
        payoutMultiplier: outcome.multiplier,
        profit,
        won: outcome.win,
        clientSeed,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        nonce,
        rngProof: outcome.rngProof,
        gameChoice: choice,
        result: outcome.result,
        active: false,
        idempotencyKey,
      }).returning();
      
      if (cappedPayout > 0) {
        await tx.execute(sql`
          UPDATE users 
          SET available_balance = available_balance + ${cappedPayout},
              balance = balance + ${cappedPayout}
          WHERE id = ${userId}
        `);
      }
      
      await tx.insert(transactions).values({
        userId,
        type: 'bet_wager',
        amount: -wager,
        balanceBefore,
        balanceAfter: balanceBefore - wager,
        referenceType: 'bet',
        referenceId: bet.id,
        description: `${gameId} bet placed`,
      });
      
      if (cappedPayout > 0) {
        await tx.insert(transactions).values({
          userId,
          type: 'bet_payout',
          amount: cappedPayout,
          balanceBefore: balanceBefore - wager,
          balanceAfter: balanceBefore - wager + cappedPayout,
          referenceType: 'bet',
          referenceId: bet.id,
          description: `${gameId} ${outcome.win ? 'win' : 'loss'} payout`,
        });
      }
      
      const [finalUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      
      return { bet, outcome, cappedPayout, finalUser };
    });
    
    const response: BetResponse = {
      success: true,
      bet: result.bet,
      outcome: result.outcome,
      newBalance: result.finalUser.availableBalance,
    };
    
    if (idempotencyKey) {
      await storeIdempotencyKey(idempotencyKey, userId, response);
    }
    
    return response;
    
  } catch (error) {
    if (error instanceof BetServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in placeBet:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function startMultiStepGame(request: BetRequest): Promise<BetResponse> {
  const { userId, gameId, wager, choice, idempotencyKey } = request;
  
  try {
    if (idempotencyKey) {
      const idempotencyCheck = await checkIdempotencyKey(idempotencyKey, userId);
      if (idempotencyCheck.exists) {
        return idempotencyCheck.response as BetResponse;
      }
    }
    
    if (wager < MIN_BET) {
      throw new BetServiceError(`Minimum bet is $${MIN_BET}`, "BET_TOO_SMALL");
    }
    if (wager > MAX_BET) {
      throw new BetServiceError(`Maximum bet is $${MAX_BET}`, "BET_TOO_LARGE");
    }
    
    await checkRateLimits(userId);
    
    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) {
        throw new BetServiceError("User not found", "USER_NOT_FOUND");
      }
      
      if (userRow.availableBalance < wager) {
        throw new BetServiceError("Insufficient balance", "INSUFFICIENT_BALANCE");
      }
      
      const balanceBefore = userRow.availableBalance;
      const serverSeed = userRow.serverSeed;
      const clientSeed = userRow.clientSeed;
      const nonce = userRow.nonce;
      
      await tx.execute(sql`
        UPDATE users 
        SET available_balance = available_balance - ${wager},
            locked_balance = locked_balance + ${wager},
            nonce = nonce + 1,
            bets_this_minute = CASE 
              WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
              THEN 1 ELSE bets_this_minute + 1 END,
            bets_minute_reset = CASE 
              WHEN bets_minute_reset IS NULL OR bets_minute_reset < NOW() - INTERVAL '1 minute' 
              THEN NOW() ELSE bets_minute_reset END,
            last_bet_at = NOW()
        WHERE id = ${userId}
      `);
      
      const outcome = computeOutcome(gameId, wager, serverSeed, clientSeed, nonce, choice);
      
      const [bet] = await tx.insert(bets).values({
        userId,
        game: gameId,
        betAmount: wager,
        payout: 0,
        payoutMultiplier: 1,
        profit: 0,
        won: null,
        clientSeed,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        nonce,
        rngProof: outcome.rngProof,
        gameChoice: choice,
        result: outcome.result,
        active: true,
        idempotencyKey,
      }).returning();
      
      await tx.insert(transactions).values({
        userId,
        type: 'bet_wager',
        amount: -wager,
        balanceBefore,
        balanceAfter: balanceBefore - wager,
        referenceType: 'bet',
        referenceId: bet.id,
        description: `${gameId} game started`,
      });
      
      const [updatedUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      
      return { bet, outcome, updatedUser };
    });
    
    const response: BetResponse = {
      success: true,
      bet: result.bet,
      outcome: result.outcome,
      newBalance: result.updatedUser.availableBalance,
    };
    
    if (idempotencyKey) {
      await storeIdempotencyKey(idempotencyKey, userId, response);
    }
    
    return response;
    
  } catch (error) {
    if (error instanceof BetServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in startMultiStepGame:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function cashoutMultiStepGame(
  betId: number,
  userId: number,
  multiplier: number
): Promise<BetResponse> {
  try {
    const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
    
    if (!bet) {
      throw new BetServiceError("Bet not found", "BET_NOT_FOUND");
    }
    if (bet.userId !== userId) {
      throw new BetServiceError("Unauthorized", "UNAUTHORIZED");
    }
    if (!bet.active) {
      throw new BetServiceError("Bet is not active", "BET_NOT_ACTIVE");
    }
    
    const payout = Math.min(bet.betAmount * multiplier, MAX_PAYOUT);
    const profit = payout - bet.betAmount;
    
    const [updatedBet] = await db.update(bets)
      .set({
        active: false,
        won: true,
        payout,
        payoutMultiplier: multiplier,
        profit,
      })
      .where(eq(bets.id, betId))
      .returning();
    
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const balanceBefore = user.availableBalance;
    
    await db.execute(sql`
      UPDATE users 
      SET available_balance = available_balance + ${payout},
          locked_balance = locked_balance - ${bet.betAmount},
          balance = balance + ${payout}
      WHERE id = ${userId}
    `);
    
    await recordTransaction(
      userId,
      'bet_payout',
      payout,
      balanceBefore,
      balanceBefore + payout,
      'bet',
      betId,
      `${bet.game} cashout - ${multiplier}x`
    );
    
    const [finalUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    return {
      success: true,
      bet: updatedBet,
      newBalance: finalUser.availableBalance,
    };
    
  } catch (error) {
    if (error instanceof BetServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in cashoutMultiStepGame:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function loseMultiStepGame(betId: number, userId: number): Promise<BetResponse> {
  try {
    const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
    
    if (!bet) {
      throw new BetServiceError("Bet not found", "BET_NOT_FOUND");
    }
    if (bet.userId !== userId) {
      throw new BetServiceError("Unauthorized", "UNAUTHORIZED");
    }
    if (!bet.active) {
      throw new BetServiceError("Bet is not active", "BET_NOT_ACTIVE");
    }
    
    const [updatedBet] = await db.update(bets)
      .set({
        active: false,
        won: false,
        payout: 0,
        payoutMultiplier: 0,
        profit: -bet.betAmount,
      })
      .where(eq(bets.id, betId))
      .returning();
    
    await db.execute(sql`
      UPDATE users 
      SET locked_balance = locked_balance - ${bet.betAmount}
      WHERE id = ${userId}
    `);
    
    const [finalUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    return {
      success: true,
      bet: updatedBet,
      newBalance: finalUser.availableBalance,
    };
    
  } catch (error) {
    if (error instanceof BetServiceError) {
      return {
        success: false,
        error: error.message,
      };
    }
    console.error("Unexpected error in loseMultiStepGame:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export function generateIdempotencyKey(): string {
  return crypto.randomBytes(16).toString("hex");
}
