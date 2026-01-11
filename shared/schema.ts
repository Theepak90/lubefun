import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== GAME CONSTANTS ====================
export const HOUSE_EDGE = 0.04; // 4% house edge
export const RTP = 0.96; // 96% Return to Player
export const MIN_BET = 0.10;
export const MAX_BET = 10000;
export const MAX_PAYOUT = 100000; // Max payout per bet
export const MAX_BETS_PER_MINUTE = 60; // Rate limiting
export const WITHDRAWAL_MANUAL_REVIEW_THRESHOLD = 1000;
export const DAILY_WITHDRAWAL_LIMIT = 10000;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  balance: doublePrecision("balance").default(1000).notNull(), // Deprecated - use availableBalance
  availableBalance: doublePrecision("available_balance").default(1000).notNull(),
  lockedBalance: doublePrecision("locked_balance").default(0).notNull(),
  clientSeed: text("client_seed").notNull(),
  serverSeed: text("server_seed").notNull(), // Current active seed (hidden hash usually shown)
  serverSeedHash: text("server_seed_hash"), // Hash of server seed shown to user
  nonce: integer("nonce").default(0).notNull(),
  lastBonusClaim: timestamp("last_bonus_claim"),
  lastWheelSpin: timestamp("last_wheel_spin"),
  lastDailyReload: timestamp("last_daily_reload"),
  lastWeeklyBonus: timestamp("last_weekly_bonus"),
  lastMonthlyBonus: timestamp("last_monthly_bonus"),
  lastRakebackClaim: timestamp("last_rakeback_claim"),
  lastBetAt: timestamp("last_bet_at"),
  betsThisMinute: integer("bets_this_minute").default(0).notNull(),
  betsMinuteReset: timestamp("bets_minute_reset"),
  dailyWithdrawalTotal: doublePrecision("daily_withdrawal_total").default(0).notNull(),
  dailyWithdrawalReset: timestamp("daily_withdrawal_reset"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== TRANSACTIONS LEDGER ====================
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'bet_wager', 'bet_payout', 'bonus', 'deposit', 'withdrawal', 'lock', 'unlock'
  amount: doublePrecision("amount").notNull(), // Positive for credits, negative for debits
  balanceBefore: doublePrecision("balance_before").notNull(),
  balanceAfter: doublePrecision("balance_after").notNull(),
  referenceType: text("reference_type"), // 'bet', 'withdrawal', 'bonus'
  referenceId: integer("reference_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== IDEMPOTENCY KEYS ====================
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  response: jsonb("response"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ==================== WITHDRAWALS ====================
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").default("PLAY").notNull(),
  network: text("network"),
  address: text("address"),
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, SENT, FAILED, CANCELLED
  requiresManualReview: boolean("requires_manual_review").default(false).notNull(),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  txHash: text("tx_hash"),
  failureReason: text("failure_reason"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
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
  game: text("game").notNull(), // "dice", "coinflip", "mines", etc.
  betAmount: doublePrecision("bet_amount").notNull(),
  payoutMultiplier: doublePrecision("payout_multiplier"),
  payout: doublePrecision("payout").default(0), // Actual payout amount
  profit: doublePrecision("profit"), // Positive for win, negative for loss
  won: boolean("won"),
  
  // Provably Fair Data
  clientSeed: text("client_seed").notNull(),
  serverSeed: text("server_seed").notNull(), // The seed used for this bet (revealed after bet)
  serverSeedHash: text("server_seed_hash"), // Hash shown before bet
  nonce: integer("nonce").notNull(),
  rngProof: text("rng_proof"), // HMAC result for verification
  
  // Game specific state/result
  gameChoice: jsonb("game_choice"), // User's choice (target, side, minesCount, etc.)
  result: jsonb("result").notNull(), // e.g., { roll: 50.5 } or { mines: [1,2,3], revealed: [] }
  active: boolean("active").default(false), // For multi-step games like Mines
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  
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
export type Transaction = typeof transactions.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;

// Withdrawal status enum
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'SENT' | 'FAILED' | 'CANCELLED';

// Transaction type enum
export type TransactionType = 'bet_wager' | 'bet_payout' | 'bonus' | 'deposit' | 'withdrawal' | 'lock' | 'unlock';

// Game Specific Schemas
export const diceBetSchema = z.object({
  betAmount: z.number().min(1),
  target: z.number().min(1).max(99),
  condition: z.enum(["above", "below"]),
});

export const coinflipBetSchema = z.object({
  betAmount: z.number().min(1),
  side: z.enum(["cock", "balls"]),
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

export const rouletteBetSchema = z.object({
  betAmount: z.number().min(0.1),
  betType: z.enum(["red", "black", "odd", "even", "1-18", "19-36", "straight", "1st12", "2nd12", "3rd12", "col1", "col2", "col3"]),
  straightNumber: z.number().min(0).max(36).optional(),
});

export const blackjackDealSchema = z.object({
  betAmount: z.number().min(0.1),
});

export const blackjackActionSchema = z.object({
  betId: z.number(),
});

export const splitStealPlaySchema = z.object({
  betAmount: z.number().min(0.1),
  playerChoice: z.enum(["split", "steal"]),
});

export type SplitStealPlayRequest = z.infer<typeof splitStealPlaySchema>;

export const pressureValveStartSchema = z.object({
  betAmount: z.number().min(0.1),
});

export const pressureValvePumpSchema = z.object({
  betId: z.number(),
});

export const pressureValveCashoutSchema = z.object({
  betId: z.number(),
});

export type PressureValveStartRequest = z.infer<typeof pressureValveStartSchema>;
export type PressureValvePumpRequest = z.infer<typeof pressureValvePumpSchema>;
export type PressureValveCashoutRequest = z.infer<typeof pressureValveCashoutSchema>;

// Roulette Live Round Tables
export const rouletteRounds = pgTable("roulette_rounds", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("betting"), // betting, spinning, results
  bettingEndsAt: timestamp("betting_ends_at").notNull(),
  winningNumber: integer("winning_number"),
  winningColor: text("winning_color"),
  serverSeed: text("server_seed").notNull(),
  serverSeedHash: text("server_seed_hash").notNull(),
  clientSeed: text("client_seed").notNull(),
  nonce: integer("nonce").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const rouletteBets = pgTable("roulette_bets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull(),
  userId: integer("user_id").notNull(),
  betType: text("bet_type").notNull(), // straight, red, black, odd, even, 1-18, 19-36, 1st12, 2nd12, 3rd12, col1, col2, col3
  straightNumber: integer("straight_number"), // 0-36 for straight bets
  amount: doublePrecision("amount").notNull(),
  payout: doublePrecision("payout"),
  won: boolean("won"),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type RouletteRound = typeof rouletteRounds.$inferSelect;
export type RouletteBet = typeof rouletteBets.$inferSelect;

export const liveRouletteBetSchema = z.object({
  betType: z.enum(["straight", "red", "black", "odd", "even", "1-18", "19-36", "1st12", "2nd12", "3rd12", "col1", "col2", "col3"]),
  straightNumber: z.number().min(0).max(36).optional(),
  amount: z.number().min(0.1),
});

export type LiveRouletteBetRequest = z.infer<typeof liveRouletteBetSchema>;

export const rouletteMultiBetSchema = z.object({
  bets: z.array(z.object({
    betType: z.enum(["straight", "red", "black", "odd", "even", "1-18", "19-36", "1st12", "2nd12", "3rd12", "col1", "col2", "col3"]),
    straightNumber: z.number().min(0).max(36).optional(),
    amount: z.number().min(0.1),
  })).min(1),
}).refine((data) => {
  return data.bets.every(bet => 
    bet.betType !== "straight" || (bet.straightNumber !== undefined && bet.straightNumber >= 0 && bet.straightNumber <= 36)
  );
}, { message: "Straight bets require a valid number (0-36)" });

export type RouletteMultiBetRequest = z.infer<typeof rouletteMultiBetSchema>;

export type DiceBetRequest = z.infer<typeof diceBetSchema>;
export type CoinflipBetRequest = z.infer<typeof coinflipBetSchema>;
export type MinesBetRequest = z.infer<typeof minesBetSchema>;
export type PlinkoBetRequest = z.infer<typeof plinkoBetSchema>;
export type RouletteBetRequest = z.infer<typeof rouletteBetSchema>;
export type BlackjackDealRequest = z.infer<typeof blackjackDealSchema>;
export type BlackjackActionRequest = z.infer<typeof blackjackActionSchema>;
