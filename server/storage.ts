import { db } from "./db";
import { users, bets, type User, type InsertUser, type Bet, type InsertBet } from "@shared/schema";
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
  
  updateLastBonusClaim(id: number): Promise<User>;
  updateLastWheelSpin(id: number): Promise<User>;
  updateLastDailyReload(id: number): Promise<User>;
  updateLastWeeklyBonus(id: number): Promise<User>;
  updateLastMonthlyBonus(id: number): Promise<User>;
  updateLastRakebackClaim(id: number): Promise<User>;
  
  getDailyWagerVolume(userId: number, sinceDate: Date): Promise<number>;
  getWagerVolumeSince(userId: number, sinceDate: Date): Promise<number>;
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
}

export const storage = new DatabaseStorage();
