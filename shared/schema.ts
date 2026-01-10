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

// Lootbox prizes with stable IDs and weights (higher weight = more common)
// Total weight: 100 (for easy percentage calculation)
// Common prizes: 99.5% total ($0.10 - $2.00)
// Big wins: 0.5% total ($5.00 - $100.00) - extremely rare
export const WHEEL_PRIZES = [
  // Common tier - 99.5% combined probability
  { id: "cent_10", label: "$0.10", value: 0.10, weight: 18, rarity: "common" as const },    // 18%
  { id: "cent_20", label: "$0.20", value: 0.20, weight: 16, rarity: "common" as const },    // 16%
  { id: "cent_25", label: "$0.25", value: 0.25, weight: 14, rarity: "common" as const },    // 14%
  { id: "cent_50", label: "$0.50", value: 0.50, weight: 13, rarity: "common" as const },    // 13%
  { id: "cent_75", label: "$0.75", value: 0.75, weight: 12, rarity: "common" as const },    // 12%
  { id: "dollar_1", label: "$1.00", value: 1.00, weight: 10, rarity: "common" as const },   // 10%
  { id: "dollar_1_25", label: "$1.25", value: 1.25, weight: 7, rarity: "common" as const }, // 7%
  { id: "dollar_1_50", label: "$1.50", value: 1.50, weight: 5.5, rarity: "common" as const }, // 5.5%
  { id: "dollar_2", label: "$2.00", value: 2.00, weight: 4, rarity: "common" as const },    // 4%
  // Big wins - 0.5% combined probability (extremely rare)
  { id: "dollar_5", label: "$5.00", value: 5.00, weight: 0.2, rarity: "uncommon" as const },   // 0.2%
  { id: "dollar_7_50", label: "$7.50", value: 7.50, weight: 0.12, rarity: "uncommon" as const }, // 0.12%
  { id: "dollar_10", label: "$10.00", value: 10.00, weight: 0.08, rarity: "rare" as const },   // 0.08%
  { id: "dollar_15", label: "$15.00", value: 15.00, weight: 0.045, rarity: "rare" as const },  // 0.045%
  { id: "dollar_20", label: "$20.00", value: 20.00, weight: 0.03, rarity: "epic" as const },   // 0.03%
  { id: "dollar_75", label: "$75.00", value: 75.00, weight: 0.02, rarity: "epic" as const },   // 0.02%
  { id: "dollar_100", label: "$100.00", value: 100.00, weight: 0.005, rarity: "legendary" as const }, // 0.005%
] as const;

export type PrizeId = typeof WHEEL_PRIZES[number]["id"];

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

export const plinkoBetSchema = z.object({
  betAmount: z.number().min(0.1),
  risk: z.enum(["low", "medium", "high"]),
  rows: z.number().min(8).max(16),
});

export type DiceBetRequest = z.infer<typeof diceBetSchema>;
export type CoinflipBetRequest = z.infer<typeof coinflipBetSchema>;
export type MinesBetRequest = z.infer<typeof minesBetSchema>;
export type PlinkoBetRequest = z.infer<typeof plinkoBetSchema>;
