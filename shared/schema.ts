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
  createdAt: timestamp("created_at").defaultNow(),
});

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
