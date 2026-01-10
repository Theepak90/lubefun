import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  balance: doublePrecision("balance").default(1000).notNull(), // Play money
  clientSeed: text("client_seed").notNull(),
  serverSeed: text("server_seed").notNull(), // Current active seed (hidden hash usually shown)
  nonce: integer("nonce").default(0).notNull(),
  lastBonusClaim: timestamp("last_bonus_claim"),
  lastWheelSpin: timestamp("last_wheel_spin"),
  lastDailyReload: timestamp("last_daily_reload"),
  lastWeeklyBonus: timestamp("last_weekly_bonus"),
  lastMonthlyBonus: timestamp("last_monthly_bonus"),
  lastRakebackClaim: timestamp("last_rakeback_claim"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Wheel prizes with weights (higher weight = more common)
export const WHEEL_PRIZES = [
  { label: "1¢", value: 0.01, weight: 35 },
  { label: "2¢", value: 0.02, weight: 25 },
  { label: "3¢", value: 0.03, weight: 20 },
  { label: "5¢", value: 0.05, weight: 12 },
  { label: "$5", value: 5, weight: 5 },
  { label: "$50", value: 50, weight: 2 },
  { label: "$500", value: 500, weight: 0.8 },
  { label: "$1000", value: 1000, weight: 0.2 },
] as const;

export const DAILY_BONUS_AMOUNT = 10; // $10 daily bonus
export const REQUIRED_DAILY_VOLUME = 50; // Must wager $50 to unlock next day's bonus

// Rewards Configuration
export const REWARDS_CONFIG = {
  dailyReload: {
    amount: 5,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    label: "Daily Reload",
    description: "Free credits every day",
  },
  dailyBonus: {
    amount: 10,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    label: "Daily Bonus",
    description: "Login bonus with play volume requirement",
  },
  weeklyBonus: {
    amount: 50,
    cooldownMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    label: "Weekly Bonus",
    description: "Claim once per week",
  },
  monthlyBonus: {
    amount: 200,
    cooldownMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    label: "Monthly Bonus",
    description: "Big monthly reward",
  },
  rakeback: {
    percentage: 0.05, // 5% of wagered amount
    cooldownMs: 24 * 60 * 60 * 1000, // Can claim once per day
    label: "Rakeback",
    description: "5% back on your wagers",
  },
} as const;

export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  game: text("game").notNull(), // "dice", "coinflip", "mines"
  betAmount: doublePrecision("bet_amount").notNull(),
  payoutMultiplier: doublePrecision("payout_multiplier"),
  profit: doublePrecision("profit"), // Positive for win, negative for loss
  won: boolean("won"),
  
  // Provably Fair Data
  clientSeed: text("client_seed").notNull(),
  serverSeed: text("server_seed").notNull(), // The seed used for this bet
  nonce: integer("nonce").notNull(),
  
  // Game specific state/result
  result: jsonb("result").notNull(), // e.g., { roll: 50.5 } or { mines: [1,2,3], revealed: [] }
  active: boolean("active").default(false), // For multi-step games like Mines
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertBetSchema = createInsertSchema(bets).pick({
  game: true,
  betAmount: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Bet = typeof bets.$inferSelect;
export type InsertBet = z.infer<typeof insertBetSchema>;

// Game Specific Schemas
export const diceBetSchema = z.object({
  betAmount: z.number().min(1),
  target: z.number().min(1).max(99),
  condition: z.enum(["above", "below"]),
});

export const coinflipBetSchema = z.object({
  betAmount: z.number().min(1),
  side: z.enum(["heads", "tails"]),
});

export const minesBetSchema = z.object({
  betAmount: z.number().min(1),
  minesCount: z.number().min(1).max(24),
});

export const minesNextSchema = z.object({
  betId: z.number(),
  tileIndex: z.number().min(0).max(24),
});

export const minesCashoutSchema = z.object({
  betId: z.number(),
});

export type DiceBetRequest = z.infer<typeof diceBetSchema>;
export type CoinflipBetRequest = z.infer<typeof coinflipBetSchema>;
export type MinesBetRequest = z.infer<typeof minesBetSchema>;
