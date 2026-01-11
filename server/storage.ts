import { db } from "./db";
import { users, bets, rouletteRounds, rouletteBets, type User, type InsertUser, type Bet, type InsertBet, type RouletteRound, type RouletteBet } from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { clientSeed: string; serverSeed: string }): Promise<User>;
  updateUserBalance(id: number, amount: number): Promise<User>;
  updateUserSeeds(id: number, clientSeed: string): Promise<User>;
  incrementNonce(id: number): Promise<void>;
  
  createBet(bet: Partial<Bet>): Promise<Bet>;
  updateBet(id: number, updates: Partial<Bet>): Promise<Bet>;
  getBet(id: number): Promise<Bet | undefined>;
  getUserBets(userId: number, limit?: number): Promise<Bet[]>;
  getActiveMinesBet(userId: number): Promise<Bet | undefined>;
  getActiveBlackjackBet(userId: number): Promise<Bet | undefined>;
  getActiveBet(userId: number, game: string): Promise<Bet | undefined>;
  
  updateLastBonusClaim(id: number): Promise<User>;
  updateLastWheelSpin(id: number): Promise<User>;
  updateLastDailyReload(id: number): Promise<User>;
  updateLastWeeklyBonus(id: number): Promise<User>;
  updateLastMonthlyBonus(id: number): Promise<User>;
  updateLastRakebackClaim(id: number): Promise<User>;
  
  getDailyWagerVolume(userId: number, sinceDate: Date): Promise<number>;
  getWagerVolumeSince(userId: number, sinceDate: Date): Promise<number>;
  
  // Roulette Round Methods
  createRouletteRound(round: Partial<RouletteRound>): Promise<RouletteRound>;
  getCurrentRouletteRound(): Promise<RouletteRound | undefined>;
  updateRouletteRound(id: number, updates: Partial<RouletteRound>): Promise<RouletteRound>;
  getRecentRouletteRounds(limit?: number): Promise<RouletteRound[]>;
  
  // Roulette Bet Methods
  createRouletteBet(bet: Partial<RouletteBet>): Promise<RouletteBet>;
  getRouletteBetsByRound(roundId: number): Promise<RouletteBet[]>;
  getUserRouletteBetsForRound(userId: number, roundId: number): Promise<RouletteBet[]>;
  updateRouletteBet(id: number, updates: Partial<RouletteBet>): Promise<RouletteBet>;
  resolveRouletteBets(roundId: number, winningNumber: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser & { clientSeed: string; serverSeed: string }): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserBalance(id: number, amount: number): Promise<User> {
    // In a real app, use transactions or increments. 
    // Here we just fetch and update for simplicity, but careful with race conditions.
    // Better: UPDATE users SET balance = balance + amount WHERE id = id
    // Drizzle doesn't have a simple increment method yet without sql operator
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new Error("User not found");
    
    const [updated] = await db.update(users)
      .set({ balance: user.balance + amount })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async updateUserSeeds(id: number, clientSeed: string): Promise<User> {
    const [updated] = await db.update(users)
      .set({ clientSeed, nonce: 0 }) // Reset nonce on seed change
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async incrementNonce(id: number): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (user) {
      await db.update(users).set({ nonce: user.nonce + 1 }).where(eq(users.id, id));
    }
  }

  async createBet(bet: Partial<Bet>): Promise<Bet> {
    const [newBet] = await db.insert(bets).values(bet as any).returning();
    return newBet;
  }
  
  async updateBet(id: number, updates: Partial<Bet>): Promise<Bet> {
    const [updated] = await db.update(bets).set(updates).where(eq(bets.id, id)).returning();
    return updated;
  }
  
  async getBet(id: number): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets).where(eq(bets.id, id));
    return bet;
  }

  async getUserBets(userId: number, limit = 50): Promise<Bet[]> {
    return db.select().from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.createdAt))
      .limit(limit);
  }
  
  async getActiveMinesBet(userId: number): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets)
      .where(and(
        eq(bets.userId, userId),
        eq(bets.game, 'mines'),
        eq(bets.active, true)
      ))
      .limit(1);
    return bet;
  }
  
  async getActiveBlackjackBet(userId: number): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets)
      .where(and(
        eq(bets.userId, userId),
        eq(bets.game, 'blackjack'),
        eq(bets.active, true)
      ))
      .limit(1);
    return bet;
  }
  
  async getActiveBet(userId: number, game: string): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets)
      .where(and(
        eq(bets.userId, userId),
        eq(bets.game, game),
        eq(bets.active, true)
      ))
      .limit(1);
    return bet;
  }
  
  async updateLastBonusClaim(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastBonusClaim: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async updateLastWheelSpin(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastWheelSpin: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async getDailyWagerVolume(userId: number, sinceDate: Date): Promise<number> {
    const result = await db.select({
      total: sql<number>`COALESCE(SUM(${bets.betAmount}), 0)`
    })
    .from(bets)
    .where(and(
      eq(bets.userId, userId),
      gte(bets.createdAt, sinceDate)
    ));
    
    return Number(result[0]?.total || 0);
  }
  
  async getWagerVolumeSince(userId: number, sinceDate: Date): Promise<number> {
    const result = await db.select({
      total: sql<number>`COALESCE(SUM(${bets.betAmount}), 0)`
    })
    .from(bets)
    .where(and(
      eq(bets.userId, userId),
      gte(bets.createdAt, sinceDate)
    ));
    
    return Number(result[0]?.total || 0);
  }
  
  async updateLastDailyReload(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastDailyReload: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async updateLastWeeklyBonus(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastWeeklyBonus: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async updateLastMonthlyBonus(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastMonthlyBonus: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  async updateLastRakebackClaim(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ lastRakebackClaim: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
  
  // Roulette Round Methods
  async createRouletteRound(round: Partial<RouletteRound>): Promise<RouletteRound> {
    const [newRound] = await db.insert(rouletteRounds).values(round as any).returning();
    return newRound;
  }
  
  async getCurrentRouletteRound(): Promise<RouletteRound | undefined> {
    const [round] = await db.select().from(rouletteRounds)
      .where(eq(rouletteRounds.status, "betting"))
      .orderBy(desc(rouletteRounds.createdAt))
      .limit(1);
    return round;
  }
  
  async updateRouletteRound(id: number, updates: Partial<RouletteRound>): Promise<RouletteRound> {
    const [updated] = await db.update(rouletteRounds)
      .set(updates)
      .where(eq(rouletteRounds.id, id))
      .returning();
    return updated;
  }
  
  async getRecentRouletteRounds(limit = 12): Promise<RouletteRound[]> {
    return db.select().from(rouletteRounds)
      .where(eq(rouletteRounds.status, "results"))
      .orderBy(desc(rouletteRounds.resolvedAt))
      .limit(limit);
  }
  
  // Roulette Bet Methods
  async createRouletteBet(bet: Partial<RouletteBet>): Promise<RouletteBet> {
    const [newBet] = await db.insert(rouletteBets).values(bet as any).returning();
    return newBet;
  }
  
  async getRouletteBetsByRound(roundId: number): Promise<RouletteBet[]> {
    return db.select().from(rouletteBets)
      .where(eq(rouletteBets.roundId, roundId));
  }
  
  async getUserRouletteBetsForRound(userId: number, roundId: number): Promise<RouletteBet[]> {
    return db.select().from(rouletteBets)
      .where(and(
        eq(rouletteBets.userId, userId),
        eq(rouletteBets.roundId, roundId)
      ));
  }
  
  async updateRouletteBet(id: number, updates: Partial<RouletteBet>): Promise<RouletteBet> {
    const [updated] = await db.update(rouletteBets)
      .set(updates)
      .where(eq(rouletteBets.id, id))
      .returning();
    return updated;
  }
  
  async resolveRouletteBets(roundId: number, winningNumber: number): Promise<void> {
    const allBets = await this.getRouletteBetsByRound(roundId);
    
    for (const bet of allBets) {
      const { won, multiplier } = this.checkRouletteBetWin(bet.betType, bet.straightNumber, winningNumber);
      const payout = won ? bet.amount * multiplier : 0;
      
      await this.updateRouletteBet(bet.id, {
        won,
        payout,
        resolved: true,
      });
      
      if (payout > 0) {
        await this.updateUserBalance(bet.userId, payout);
      }
    }
  }
  
  private checkRouletteBetWin(betType: string, straightNumber: number | null, winningNumber: number): { won: boolean; multiplier: number } {
    const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    
    switch (betType) {
      case "straight":
        return { won: winningNumber === straightNumber, multiplier: 36 };
      case "red":
        return { won: RED_NUMBERS.includes(winningNumber), multiplier: 2 };
      case "black":
        return { won: winningNumber > 0 && !RED_NUMBERS.includes(winningNumber), multiplier: 2 };
      case "odd":
        return { won: winningNumber > 0 && winningNumber % 2 === 1, multiplier: 2 };
      case "even":
        return { won: winningNumber > 0 && winningNumber % 2 === 0, multiplier: 2 };
      case "1-18":
        return { won: winningNumber >= 1 && winningNumber <= 18, multiplier: 2 };
      case "19-36":
        return { won: winningNumber >= 19 && winningNumber <= 36, multiplier: 2 };
      case "1st12":
        return { won: winningNumber >= 1 && winningNumber <= 12, multiplier: 3 };
      case "2nd12":
        return { won: winningNumber >= 13 && winningNumber <= 24, multiplier: 3 };
      case "3rd12":
        return { won: winningNumber >= 25 && winningNumber <= 36, multiplier: 3 };
      case "col1":
        return { won: winningNumber > 0 && winningNumber % 3 === 1, multiplier: 3 };
      case "col2":
        return { won: winningNumber > 0 && winningNumber % 3 === 2, multiplier: 3 };
      case "col3":
        return { won: winningNumber > 0 && winningNumber % 3 === 0, multiplier: 3 };
      default:
        return { won: false, multiplier: 0 };
    }
  }
}

export const storage = new DatabaseStorage();
