import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema, plinkoBetSchema, rouletteBetSchema, blackjackDealSchema, blackjackActionSchema, liveRouletteBetSchema, rouletteMultiBetSchema, WHEEL_PRIZES, DAILY_BONUS_AMOUNT, REQUIRED_DAILY_VOLUME, REWARDS_CONFIG, splitStealPlaySchema, pressureValveStartSchema, pressureValvePumpSchema, pressureValveCashoutSchema, MIN_BET, MAX_BET, RTP, HOUSE_EDGE } from "@shared/schema";
import { GAME_CONFIG, getPlinkoMultipliers, PlinkoRisk, ROULETTE_CONFIG, RouletteBetType, getRouletteColor, checkRouletteWin, BLACKJACK_CONFIG } from "@shared/config";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { generateClientSeed, generateServerSeed, getDiceRoll, getCoinflipResult, getMines, getPlinkoPath, getRouletteNumber, getShuffledDeck, calculateHandTotal, getCardValue, getPressureValvePump } from "./fairness";
import { rouletteOrchestrator } from "./rouletteOrchestrator";
import { placeBet, startMultiStepGame, cashoutMultiStepGame, loseMultiStepGame, generateIdempotencyKey } from "./services/betService";
import { computeOutcome, generateMinePositions, checkMineHit, hashServerSeed } from "./services/computeOutcome";
import { requestWithdrawal, cancelWithdrawal, getUserWithdrawals } from "./services/withdrawalService";
import { generateDepositAddress, isValidSolanaAddress, sendSol } from "./services/solanaService";

// === Mines Session Manager ===
// Tracks active mines games per user with auto-timeout to prevent stuck games
class MinesSessionManager {
  private sessions: Map<number, { betId: number; lastActivity: number; timeout: NodeJS.Timeout }> = new Map();
  private readonly TIMEOUT_MS = 60000; // 60 seconds inactivity timeout

  startSession(userId: number, betId: number) {
    // Clear any existing session first
    this.endSession(userId);
    
    const timeout = setTimeout(() => {
      this.handleTimeout(userId, betId);
    }, this.TIMEOUT_MS);
    
    this.sessions.set(userId, { betId, lastActivity: Date.now(), timeout });
  }

  refreshSession(userId: number) {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => {
        this.handleTimeout(userId, session.betId);
      }, this.TIMEOUT_MS);
    }
  }

  endSession(userId: number) {
    const session = this.sessions.get(userId);
    if (session) {
      clearTimeout(session.timeout);
      this.sessions.delete(userId);
    }
  }

  hasActiveSession(userId: number): boolean {
    return this.sessions.has(userId);
  }

  getSession(userId: number): { betId: number } | null {
    const session = this.sessions.get(userId);
    return session ? { betId: session.betId } : null;
  }

  private async handleTimeout(userId: number, betId: number) {
    console.log(`[Mines] Session timeout for user ${userId}, bet ${betId}`);
    try {
      // Force end the game as a loss
      await storage.updateBet(betId, {
        active: false,
        won: false,
        profit: 0
      });
    } catch (err) {
      console.error(`[Mines] Error handling timeout for bet ${betId}:`, err);
    }
    this.sessions.delete(userId);
  }
}

const minesSessionManager = new MinesSessionManager();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === WebSocket Server Setup for Live Roulette ===
  // IMPORTANT: use `noServer` and manually handle upgrades so we don't interfere
  // with Vite's own HMR websocket (also attached to the same `httpServer`).
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      if (url.pathname !== "/ws/roulette") return;

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      // If parsing fails, don't block other upgrade handlers (e.g. Vite HMR).
      return;
    }
  });
  
  wss.on("connection", (ws) => {
    console.log("[WebSocket] Client connected to roulette");
    
    // Send current round state on connection
    const currentState = rouletteOrchestrator.getCurrentRoundState();
    if (currentState) {
      ws.send(JSON.stringify({ type: "round_state", round: currentState }));
    }
    
    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected from roulette");
    });
  });

  // Initialize the roulette orchestrator
  rouletteOrchestrator.initialize(wss);
  
  // === Auth Setup ===
  app.use(session({
    store: storage.sessionStore,
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: app.get("env") === "production" }
  }));
  
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) return done(null, false, { message: "Incorrect username." });
      
      // Check if password is hashed (starts with $2b$) or plain text (for migration)
      const isPasswordValid = user.password.startsWith("$2b$")
        ? await bcrypt.compare(password, user.password)
        : user.password === password; // Fallback for old plain text passwords
      
      if (!isPasswordValid) return done(null, false, { message: "Incorrect password." });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // === Auth Routes ===
  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) return res.status(400).json({ message: "Username exists" });
      
      // Hash password before storing
      const hashedPassword = await bcrypt.hash(input.password, 10);
      
      const user = await storage.createUser({
        username: input.username,
        password: hashedPassword,
        clientSeed: generateClientSeed(),
        serverSeed: generateServerSeed(),
      });
      
      // Don't send password hash to client
      const { password: _, ...userWithoutPassword } = user;
      
      req.login(user, (err) => {
        if (err) throw err;
        res.status(201).json(userWithoutPassword);
      });
    } catch (err) {
      res.status(400).json({ message: "Registration failed" });
    }
  });

  app.post(api.auth.login.path, passport.authenticate("local"), (req, res) => {
    // Don't send password hash to client
    const { password: _, ...userWithoutPassword } = req.user as any;
    res.json(userWithoutPassword);
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.logout(() => {
      res.sendStatus(200);
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // Don't send password hash to client
    const { password: _, ...userWithoutPassword } = req.user as any;
    res.json(userWithoutPassword);
  });

  // === UNIFIED BET ENDPOINT ===
  app.post(api.bet.place.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const parsed = api.bet.place.input.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Invalid bet parameters" });
      }
      
      const { gameType, betAmount, gameData = {} } = parsed.data;
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
      
      // Pass gameData directly as choice - preserve caller intent
      const choice: Record<string, any> = gameData || {};
      
      // Validate required fields per game type
      switch (gameType) {
        case "dice":
          if (typeof choice.target !== "number" || !["above", "below"].includes(choice.condition)) {
            return res.status(400).json({ success: false, error: "Dice requires target (number) and condition (above/below)" });
          }
          break;
        case "coinflip":
          if (!["cock", "balls"].includes(choice.side)) {
            return res.status(400).json({ success: false, error: "Coinflip requires side (cock/balls)" });
          }
          break;
        case "plinko":
          if (!choice.risk) choice.risk = "medium";
          if (!choice.rows) choice.rows = 16;
          break;
        case "roulette":
          if (!choice.betType) {
            return res.status(400).json({ success: false, error: "Roulette requires betType" });
          }
          if (choice.betType === "straight") {
            if (choice.straightNumber === undefined || choice.straightNumber === null || typeof choice.straightNumber !== "number") {
              return res.status(400).json({ success: false, error: "Straight bets require straightNumber (0-36)" });
            }
            if (choice.straightNumber < 0 || choice.straightNumber > 36) {
              return res.status(400).json({ success: false, error: "straightNumber must be between 0 and 36" });
            }
          }
          break;
        case "splitsteal":
          if (!["split", "steal"].includes(choice.playerChoice)) {
            return res.status(400).json({ success: false, error: "Split/Steal requires playerChoice (split/steal)" });
          }
          break;
        case "mines":
          if (!choice.minesCount) choice.minesCount = 3;
          break;
        case "blackjack":
        case "pressurevalve":
          break;
        default:
          return res.status(400).json({ success: false, error: "Unknown game type" });
      }
      
      const result = await placeBet({
        userId: req.user!.id,
        gameId: gameType,
        wager: betAmount,
        choice,
        idempotencyKey,
      });
      
      res.json(result);
    } catch (err) {
      console.error("[Unified Bet] Error:", err);
      res.status(400).json({ success: false, error: "Bet failed" });
    }
  });

  // === RECENT BETS ENDPOINT ===
  app.get(api.bet.recent.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bets = await storage.getUserBets(req.user!.id, 50);
    res.json(bets);
  });

  // === SOLANA DEPOSIT ADDRESS ===
  app.get("/api/solana/deposit-address", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const depositAddress = generateDepositAddress(req.user!.id);
      res.json({
        address: depositAddress,
        network: "mainnet",
        currency: "SOL",
      });
    } catch (err) {
      console.error("[Solana Deposit Address] Error:", err);
      res.status(500).json({ error: "Failed to generate deposit address" });
    }
  });

  // === WITHDRAWAL ENDPOINT ===
  app.post(api.withdraw.request.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const parsed = api.withdraw.request.input.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Invalid withdrawal parameters" });
      }
      
      const { amount, address } = parsed.data;
      
      // Validate Solana address
      if (!isValidSolanaAddress(address)) {
        return res.status(400).json({ success: false, error: "Invalid Solana address" });
      }
      
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
      
      const result = await requestWithdrawal({
        userId: req.user!.id,
        amount,
        address,
        currency: "SOL",
        network: "mainnet",
        idempotencyKey,
      });
      
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      // If withdrawal is approved and doesn't require manual review, process it
      if (result.withdrawal && result.withdrawal.status === "PENDING" && !result.withdrawal.requiresManualReview) {
        try {
          // Send SOL
          const txSignature = await sendSol(address, amount);
          
          // Update withdrawal with transaction hash
          await storage.updateWithdrawal(result.withdrawal.id, {
            status: "SENT",
            txHash: txSignature,
            processedAt: new Date(),
          });
          
          // Unlock balance
          await storage.unlockBalance(req.user!.id, amount);
          
          res.json({
            success: true,
            withdrawalId: result.withdrawal.id,
            status: "SENT",
            txHash: txSignature,
          });
        } catch (solError) {
          console.error("[Solana Withdrawal] Error sending SOL:", solError);
          // Withdrawal is still pending, will be retried
          res.json({
            success: true,
            withdrawalId: result.withdrawal.id,
            status: "PENDING",
            message: "Withdrawal queued, processing...",
          });
        }
      } else {
        res.json({
          success: true,
          withdrawalId: result.withdrawal?.id,
          status: result.withdrawal?.status,
        });
      }
    } catch (err) {
      console.error("[Withdrawal] Error:", err);
      res.status(400).json({ success: false, error: "Withdrawal request failed" });
    }
  });

  app.get(api.withdraw.history.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const withdrawals = await getUserWithdrawals(req.user!.id);
    res.json(withdrawals);
  });

  // === PROVABLY FAIR ENDPOINT ===
  app.get(api.provablyFair.info.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const serverSeedHash = hashServerSeed(user.serverSeed);
    
    res.json({
      serverSeedHash,
      clientSeed: user.clientSeed,
      nonce: user.nonce,
      instructions: `
PROVABLY FAIR VERIFICATION:

Your current server seed is hidden and will be revealed when you rotate it.
The hash above proves the server seed existed before your bets.

To verify a bet:
1. Combine: serverSeed + clientSeed + nonce
2. Generate HMAC-SHA256 hash
3. Convert first 8 hex chars to decimal
4. Divide by 0xFFFFFFFF for 0-1 range
5. Apply game-specific logic

House Edge: 4% (96% RTP)

Games use this formula:
- Dice: roll = (hash / 0xFFFFFFFF) * 101, compare to target
- Coinflip: result = hash < 0.5 ? "heads" : "tails"
- Plinko: each peg = hash for direction
- Roulette: number = (hash / 0xFFFFFFFF) * 37

Your bets are verifiable after the server seed is revealed.
      `.trim(),
    });
  });

  // === User Routes ===
  app.post(api.user.updateSeeds.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { clientSeed } = req.body;
    const user = await storage.updateUserSeeds(req.user!.id, clientSeed);
    res.json(user);
  });

  app.get(api.user.stats.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bets = await storage.getUserBets(req.user!.id, 1000);
    
    const stats = bets.reduce((acc, bet) => ({
      totalBets: acc.totalBets + 1,
      totalWagered: acc.totalWagered + bet.betAmount,
      totalProfit: acc.totalProfit + (bet.profit || 0),
      wins: acc.wins + (bet.won ? 1 : 0),
      losses: acc.losses + (bet.won ? 0 : 1)
    }), { totalBets: 0, totalWagered: 0, totalProfit: 0, wins: 0, losses: 0 });
    
    res.json(stats);
  });

  app.get(api.games.history.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const bets = await storage.getUserBets(req.user!.id);
    res.json(bets);
  });

  // === Game Routes ===
  
  // DICE - Server-authoritative with betService
  app.post(api.games.dice.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const input = diceBetSchema.parse(req.body);
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
      
      const result = await placeBet({
        userId: req.user!.id,
        gameId: "dice",
        wager: input.betAmount,
        choice: {
          target: input.target,
          condition: input.condition,
        },
        idempotencyKey,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({
        ...result.bet,
        newBalance: result.newBalance,
        outcome: result.outcome,
      });
    } catch (err) {
      console.error("[Dice] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // COINFLIP - Server-authoritative with betService
  app.post(api.games.coinflip.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const input = coinflipBetSchema.parse(req.body);
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
      
      const result = await placeBet({
        userId: req.user!.id,
        gameId: "coinflip",
        wager: input.betAmount,
        choice: {
          side: input.side,
        },
        idempotencyKey,
      });
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({
        ...result.bet,
        newBalance: result.newBalance,
        outcome: result.outcome,
      });
    } catch (err) {
      console.error("[Coinflip] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // SPLIT OR STEAL CONFIG - Game Theory Version
  const SPLIT_STEAL_CONFIG = {
    houseEdge: 0.04,      // 4% house edge on steal wins
    splitBonus: 0.06,     // 6% bonus when both split
    baseAiSplitChance: 0.62, // 62% base AI split chance
    historySize: 10,      // Track last 10 player choices
    stealThreshold: 0.60, // If player steals > 60%, AI adapts
  };

  // In-memory player choice history for adaptive AI
  const playerChoiceHistory = new Map<number, ("split" | "steal")[]>();

  // Helper to get adaptive AI split chance based on player history
  function getAdaptiveAiSplitChance(userId: number): number {
    const history = playerChoiceHistory.get(userId) || [];
    if (history.length < 3) return SPLIT_STEAL_CONFIG.baseAiSplitChance;
    
    const stealCount = history.filter(c => c === "steal").length;
    const stealRate = stealCount / history.length;
    
    if (stealRate > SPLIT_STEAL_CONFIG.stealThreshold) {
      return Math.max(0.30, SPLIT_STEAL_CONFIG.baseAiSplitChance - (stealRate - 0.5) * 0.4);
    } else if (stealRate < 0.40) {
      return Math.min(0.80, SPLIT_STEAL_CONFIG.baseAiSplitChance + 0.10);
    }
    return SPLIT_STEAL_CONFIG.baseAiSplitChance;
  }

  // Single endpoint for Split or Steal game
  app.post(api.games.splitsteal.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = splitStealPlaySchema.parse(req.body);
      const { betAmount, playerChoice } = input;
      
      // Validate
      if (betAmount <= 0) return res.status(400).json({ message: "Bet must be greater than 0" });
      if (user.balance < betAmount) return res.status(400).json({ message: "Insufficient balance" });

      console.log('[SplitSteal] Game started:', {
        betAmount,
        playerChoice,
        balanceBefore: user.balance,
        userId: user.id
      });

      // Deduct bet immediately
      await storage.updateUserBalance(user.id, -betAmount);

      // Determine AI choice using provably fair randomness
      const hash = crypto
        .createHmac('sha256', user.serverSeed)
        .update(`${user.clientSeed}:${user.nonce}:splitsteal`)
        .digest('hex');
      
      const roll = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
      const opponentSplitChance = getAdaptiveAiSplitChance(user.id);
      const opponentChoice: "split" | "steal" = roll < opponentSplitChance ? "split" : "steal";

      // Update player history
      const history = playerChoiceHistory.get(user.id) || [];
      history.push(playerChoice);
      if (history.length > SPLIT_STEAL_CONFIG.historySize) history.shift();
      playerChoiceHistory.set(user.id, history);

      // Calculate payout based on game theory matrix
      let payout = 0;
      let won = false;
      let multiplier = 0;

      if (playerChoice === "split" && opponentChoice === "split") {
        multiplier = 1 + SPLIT_STEAL_CONFIG.splitBonus;
        payout = betAmount * multiplier;
        won = true;
      } else if (playerChoice === "steal" && opponentChoice === "split") {
        multiplier = 2 * (1 - SPLIT_STEAL_CONFIG.houseEdge);
        payout = betAmount * multiplier;
        won = true;
      } else if (playerChoice === "split" && opponentChoice === "steal") {
        payout = 0;
        won = false;
      } else {
        payout = 0;
        won = false;
      }

      const profit = payout - betAmount;

      // Increment nonce
      await storage.incrementNonce(user.id);

      // Credit winnings if any
      if (payout > 0) {
        await storage.updateUserBalance(user.id, payout);
      }

      const updatedUser = await storage.getUser(user.id);

      console.log('[SplitSteal] Result:', {
        playerChoice,
        opponentChoice,
        opponentSplitChance: opponentSplitChance.toFixed(2),
        roll: roll.toFixed(4),
        multiplier: multiplier.toFixed(2),
        payout: payout.toFixed(2),
        profit: profit.toFixed(2),
        won,
        balanceAfter: updatedUser?.balance
      });

      const bet = await storage.createBet({
        userId: user.id,
        game: "splitsteal",
        betAmount,
        payoutMultiplier: multiplier,
        profit,
        won,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: { playerChoice, opponentChoice, roll, multiplier },
        active: false
      });

      res.json({
        bet,
        playerChoice,
        opponentChoice,
        payout,
        won,
        balanceAfter: updatedUser?.balance || 0
      });
    } catch (err) {
      console.error('[SplitSteal] Error:', err);
      res.status(400).json({ message: "Failed to play game" });
    }
  });

  // MINES
  
  // GET active mines game (for page load/refresh)
  app.get(api.games.mines.active.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const activeGame = await storage.getActiveMinesBet(user.id);
    if (!activeGame) {
      return res.json(null);
    }
    
    // Ensure session is tracked
    minesSessionManager.startSession(user.id, activeGame.id);
    
    // Mask mines in response
    const responseBet = { 
      ...activeGame, 
      result: { ...(activeGame.result as any), mines: undefined } 
    };
    res.json(responseBet);
  });
  
  app.post(api.games.mines.start.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    // Check for active game in DB
    const activeGame = await storage.getActiveMinesBet(user.id);
    if (activeGame) {
      // Idempotent: return existing game instead of error
      // Also ensure session manager is tracking it
      minesSessionManager.startSession(user.id, activeGame.id);
      const responseBet = { ...activeGame, result: { ...(activeGame.result as any), mines: undefined } };
      return res.json(responseBet);
    }

    try {
      const input = minesBetSchema.parse(req.body);
      if (user.balance < input.betAmount) return res.status(400).json({ message: "Insufficient balance" });

      await storage.updateUserBalance(user.id, -input.betAmount);
      
      const mines = getMines(user.serverSeed, user.clientSeed, user.nonce, input.minesCount);
      const gameNonce = user.nonce;
      await storage.incrementNonce(user.id);

      const bet = await storage.createBet({
        userId: user.id,
        game: "mines",
        betAmount: input.betAmount,
        payoutMultiplier: 1.0,
        profit: 0,
        won: undefined,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: gameNonce,
        result: { 
          minesCount: input.minesCount, 
          mines: mines,
          revealed: [], 
          status: "playing" 
        },
        active: true
      });

      // Start session tracking with timeout
      minesSessionManager.startSession(user.id, bet.id);

      // MASK MINES IN RESPONSE
      const responseBet = { ...bet, result: { ...bet.result as any, mines: undefined } };
      res.json(responseBet);
    } catch (err) {
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  app.post(api.games.mines.reveal.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const bet = await storage.getActiveMinesBet(user.id);
    if (!bet) return res.status(400).json({ message: "No active game" });

    // Refresh session timeout
    minesSessionManager.refreshSession(user.id);

    try {
      const input = minesNextSchema.parse(req.body);
      const result = bet.result as any;
      
      if (result.revealed.includes(input.tileIndex)) {
        return res.status(400).json({ message: "Tile already revealed" });
      }

      const isMine = result.mines.includes(input.tileIndex);
      
      if (isMine) {
        // BOOM - End session
        minesSessionManager.endSession(user.id);
        
        const updatedBet = await storage.updateBet(bet.id, {
          active: false,
          won: false,
          profit: -bet.betAmount,
          result: { ...result, revealed: [...result.revealed, input.tileIndex], status: "lost" }
        });
        res.json(updatedBet);
      } else {
        // SAFE
        const newRevealed = [...result.revealed, input.tileIndex];
        
        let multiplier = 1.0;
        for (let i = 0; i < newRevealed.length; i++) {
          const remainingTiles = 25 - i;
          const remainingSafe = 25 - result.minesCount - i;
          const chance = remainingSafe / remainingTiles;
          multiplier *= (1 / chance);
        }
        
        multiplier = multiplier * GAME_CONFIG.RTP; 
        
        const updatedBet = await storage.updateBet(bet.id, {
          payoutMultiplier: multiplier,
          result: { ...result, revealed: newRevealed, status: "playing" }
        });
        
        const responseBet = { ...updatedBet, result: { ...updatedBet.result as any, mines: undefined } };
        res.json(responseBet);
      }
    } catch (err) {
      res.status(400).json({ message: "Invalid move" });
    }
  });
  
  app.post(api.games.mines.cashout.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const bet = await storage.getActiveMinesBet(user.id);
    if (!bet) return res.status(400).json({ message: "No active game" });
    
    const result = bet.result as any;
    if (result.revealed.length === 0) return res.status(400).json({ message: "Cannot cashout without playing" });
    
    // End session
    minesSessionManager.endSession(user.id);
    
    const payout = bet.betAmount * (bet.payoutMultiplier || 1);
    const profit = payout - bet.betAmount;
    
    await storage.updateUserBalance(user.id, payout);
    
    const updatedBet = await storage.updateBet(bet.id, {
      active: false,
      won: true,
      profit,
      result: { ...result, status: "cashed_out" }
    });
    
    // Include mines in response since game is over
    res.json(updatedBet);
  });

  // PLINKO
  app.post(api.games.plinko.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = plinkoBetSchema.parse(req.body);
      if (user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct balance
      await storage.updateUserBalance(user.id, -input.betAmount);

      // Get provably fair path
      const { path, binIndex } = getPlinkoPath(user.serverSeed, user.clientSeed, user.nonce, input.rows);
      await storage.incrementNonce(user.id);

      // Get multiplier for the bin
      const multipliers = getPlinkoMultipliers(input.risk as PlinkoRisk, input.rows);
      const multiplier = multipliers[binIndex] || 1;

      // Calculate payout
      const payout = input.betAmount * multiplier;
      const profit = payout - input.betAmount;
      const won = profit > 0;

      // Credit winnings
      if (payout > 0) {
        await storage.updateUserBalance(user.id, payout);
      }

      // Create bet record
      const bet = await storage.createBet({
        userId: user.id,
        game: "plinko",
        betAmount: input.betAmount,
        payoutMultiplier: multiplier,
        profit,
        won,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: {
          risk: input.risk,
          rows: input.rows,
          path,
          binIndex,
          multiplier,
        },
        active: false,
      });

      res.json({
        bet,
        path,
        binIndex,
        multiplier,
      });
    } catch (err) {
      console.error("[Plinko] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // ROULETTE
  app.post(api.games.roulette.spin.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = rouletteBetSchema.parse(req.body);
      
      // Validate straight bet has a number
      if (input.betType === "straight" && input.straightNumber === undefined) {
        return res.status(400).json({ message: "Straight bet requires a number" });
      }
      
      if (user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct balance
      await storage.updateUserBalance(user.id, -input.betAmount);

      // Get provably fair result
      const winningNumber = getRouletteNumber(user.serverSeed, user.clientSeed, user.nonce);
      await storage.incrementNonce(user.id);

      const color = getRouletteColor(winningNumber);
      const won = checkRouletteWin(winningNumber, input.betType as RouletteBetType, input.straightNumber);
      
      // Calculate payout
      const multiplier = won ? ROULETTE_CONFIG.PAYOUTS[input.betType as keyof typeof ROULETTE_CONFIG.PAYOUTS] : 0;
      const payout = input.betAmount * multiplier;
      const profit = payout - input.betAmount;

      // Credit winnings
      if (payout > 0) {
        await storage.updateUserBalance(user.id, payout);
      }

      // Create bet record
      const bet = await storage.createBet({
        userId: user.id,
        game: "roulette",
        betAmount: input.betAmount,
        payoutMultiplier: multiplier,
        profit,
        won,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: {
          betType: input.betType,
          straightNumber: input.straightNumber,
          winningNumber,
          color,
        },
        active: false,
      });

      res.json({
        bet,
        winningNumber,
        color,
        won,
        payout,
      });
    } catch (err) {
      console.error("[Roulette] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // ROULETTE MULTI-BET SPIN (instant play with multiple bets)
  app.post(api.games.roulette.spinMulti.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = rouletteMultiBetSchema.parse(req.body);
      
      // Calculate total bet amount
      const totalBet = input.bets.reduce((sum, b) => sum + b.amount, 0);
      
      if (user.balance < totalBet) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct total balance upfront
      await storage.updateUserBalance(user.id, -totalBet);

      // Get single provably fair result for all bets
      const winningNumber = getRouletteNumber(user.serverSeed, user.clientSeed, user.nonce);
      await storage.incrementNonce(user.id);

      const color = getRouletteColor(winningNumber);
      
      // Process each bet
      const results: { betType: string; straightNumber?: number; amount: number; won: boolean; payout: number }[] = [];
      let totalPayout = 0;

      for (const bet of input.bets) {
        const won = checkRouletteWin(winningNumber, bet.betType as RouletteBetType, bet.straightNumber);
        const multiplier = won ? ROULETTE_CONFIG.PAYOUTS[bet.betType as keyof typeof ROULETTE_CONFIG.PAYOUTS] : 0;
        const payout = bet.amount * multiplier;
        
        results.push({
          betType: bet.betType,
          straightNumber: bet.straightNumber,
          amount: bet.amount,
          won,
          payout,
        });
        
        totalPayout += payout;
      }

      // Credit total winnings
      if (totalPayout > 0) {
        await storage.updateUserBalance(user.id, totalPayout);
      }

      const profit = totalPayout - totalBet;

      // Create single bet record for the spin
      await storage.createBet({
        userId: user.id,
        game: "roulette",
        betAmount: totalBet,
        payoutMultiplier: totalPayout / totalBet || 0,
        profit,
        won: totalPayout > 0,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: {
          winningNumber,
          color,
          bets: results,
        },
        active: false,
      });

      res.json({
        winningNumber,
        color,
        totalBet,
        totalPayout,
        profit,
        results,
      });
    } catch (err) {
      console.error("[Roulette Multi] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // LIVE ROULETTE ENDPOINTS
  
  // Get current round state
  app.get(api.games.roulette.live.current.path, async (req, res) => {
    const roundState = rouletteOrchestrator.getCurrentRoundState();
    if (!roundState) {
      return res.status(503).json({ message: "Roulette not ready" });
    }
    res.json(roundState);
  });
  
  // Place a bet on current round
  app.post(api.games.roulette.live.placeBet.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = liveRouletteBetSchema.parse(req.body);
      
      // Validate straight bet has a number
      if (input.betType === "straight" && input.straightNumber === undefined) {
        return res.status(400).json({ success: false, message: "Straight bet requires a number" });
      }
      
      const result = await rouletteOrchestrator.placeBet(
        user.id,
        input.betType,
        input.amount,
        input.straightNumber
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      res.json(result);
    } catch (err) {
      console.error("[Live Roulette] Error:", err);
      res.status(400).json({ success: false, message: "Failed to place bet" });
    }
  });
  
  // Get user's bets for current round
  app.get(api.games.roulette.live.myBets.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const roundState = rouletteOrchestrator.getCurrentRoundState();
    if (!roundState) {
      return res.json([]);
    }
    
    const bets = await storage.getUserRouletteBetsForRound(req.user!.id, roundState.roundId);
    res.json(bets);
  });

  // BLACKJACK
  
  // Helper: Play dealer's hand according to standard rules (stand on soft 17)
  function playDealerHand(deck: number[], dealerCards: number[], deckPointer: number): { dealerCards: number[], dealerTotal: number, deckPointer: number } {
    let pointer = deckPointer;
    const cards = [...dealerCards];
    
    while (true) {
      const { total, soft } = calculateHandTotal(cards);
      
      // Dealer stands on 17+ (including soft 17 since DEALER_STANDS_ON_SOFT_17 is true)
      if (total >= 17) {
        if (BLACKJACK_CONFIG.DEALER_STANDS_ON_SOFT_17 || !soft || total > 17) {
          return { dealerCards: cards, dealerTotal: total, deckPointer: pointer };
        }
      }
      
      // Dealer hits
      cards.push(deck[pointer]);
      pointer++;
    }
  }
  
  // Helper: Determine outcome and payout
  function determineOutcome(playerTotal: number, dealerTotal: number, playerBlackjack: boolean, dealerBlackjack: boolean): { outcome: string, multiplier: number } {
    if (playerBlackjack && dealerBlackjack) {
      return { outcome: "push", multiplier: BLACKJACK_CONFIG.PUSH_PAYOUT };
    }
    if (playerBlackjack) {
      return { outcome: "blackjack", multiplier: BLACKJACK_CONFIG.BLACKJACK_PAYOUT };
    }
    if (dealerBlackjack) {
      return { outcome: "lose", multiplier: 0 };
    }
    if (playerTotal > 21) {
      return { outcome: "lose", multiplier: 0 };
    }
    if (dealerTotal > 21) {
      return { outcome: "win", multiplier: BLACKJACK_CONFIG.WIN_PAYOUT };
    }
    if (playerTotal > dealerTotal) {
      return { outcome: "win", multiplier: BLACKJACK_CONFIG.WIN_PAYOUT };
    }
    if (playerTotal < dealerTotal) {
      return { outcome: "lose", multiplier: 0 };
    }
    return { outcome: "push", multiplier: BLACKJACK_CONFIG.PUSH_PAYOUT };
  }

  // Helper: Evaluate Perfect Pairs side bet
  // Returns multiplier as total return (includes stake), e.g., 26 = 25:1 odds
  function evaluatePerfectPairs(card1: number, card2: number): { result: string | null, multiplier: number } {
    const rank1 = Math.floor(card1 / 4);
    const rank2 = Math.floor(card2 / 4);
    const suit1 = card1 % 4;
    const suit2 = card2 % 4;
    
    if (rank1 !== rank2) {
      return { result: null, multiplier: 0 };
    }
    
    // Same rank - it's a pair
    if (suit1 === suit2) {
      return { result: "Perfect Pair", multiplier: 26 }; // 25:1 odds
    }
    
    // Check if same color (0,2 are black, 1,3 are red)
    const color1 = suit1 % 2;
    const color2 = suit2 % 2;
    if (color1 === color2) {
      return { result: "Colored Pair", multiplier: 13 }; // 12:1 odds
    }
    
    return { result: "Mixed Pair", multiplier: 7 }; // 6:1 odds
  }
  
  // Helper: Evaluate 21+3 side bet (player's 2 cards + dealer upcard)
  // Returns multiplier as total return (includes stake)
  function evaluate21Plus3(card1: number, card2: number, dealerUpcard: number): { result: string | null, multiplier: number } {
    const cards = [card1, card2, dealerUpcard];
    const ranks = cards.map(c => Math.floor(c / 4));
    const suits = cards.map(c => c % 4);
    
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    const allSameSuit = suits[0] === suits[1] && suits[1] === suits[2];
    const allSameRank = ranks[0] === ranks[1] && ranks[1] === ranks[2];
    
    // Check for straight (consecutive ranks)
    const isSequential = (sortedRanks[1] === sortedRanks[0] + 1 && sortedRanks[2] === sortedRanks[1] + 1) ||
                         // Ace-2-3 straight (Ace is 0, 2 is 1, 3 is 2)
                         (sortedRanks[0] === 0 && sortedRanks[1] === 1 && sortedRanks[2] === 2) ||
                         // Q-K-A straight (Q is 10, K is 11, A is 0)
                         (sortedRanks[0] === 0 && sortedRanks[1] === 10 && sortedRanks[2] === 11);
    
    // Suited trips (three of a kind, same suit) - highest priority
    if (allSameRank && allSameSuit) {
      return { result: "Suited Trips", multiplier: 101 }; // 100:1 odds
    }
    
    // Straight flush
    if (isSequential && allSameSuit) {
      return { result: "Straight Flush", multiplier: 41 }; // 40:1 odds
    }
    
    // Three of a kind
    if (allSameRank) {
      return { result: "Three of a Kind", multiplier: 31 }; // 30:1 odds
    }
    
    // Straight
    if (isSequential) {
      return { result: "Straight", multiplier: 11 }; // 10:1 odds
    }
    
    // Flush
    if (allSameSuit) {
      return { result: "Flush", multiplier: 6 }; // 5:1 odds
    }
    
    return { result: null, multiplier: 0 };
  }

  // Helper: Strip sensitive data from bet before sending to client
  function sanitizeBetForClient(bet: any): any {
    if (!bet) return bet;
    const { result, ...rest } = bet;
    if (!result) return bet;
    // Remove deck from result, keep only safe fields
    const { deck, deckPointer, ...safeResult } = result;
    return { ...rest, result: safeResult };
  }

  // GET active blackjack hand
  app.get(api.games.blackjack.active.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const bet = await storage.getActiveBlackjackBet(req.user!.id);
    
    if (!bet) {
      return res.json({
        bet: null,
        playerCards: [],
        dealerCards: [],
        playerTotal: 0,
        dealerShowing: 0,
        status: "betting",
        canDouble: false,
      });
    }
    
    const result = bet.result as any;
    const { total: playerTotal } = calculateHandTotal(result.playerCards);
    const dealerShowing = result.dealerCards.length > 0 ? getCardValue(result.dealerCards[1]) : 0;
    
    res.json({
      bet: sanitizeBetForClient(bet),
      playerCards: result.playerCards,
      dealerCards: [result.dealerCards[1]], // Only show second card (first is hole card)
      playerTotal,
      dealerShowing,
      status: result.status,
      canDouble: result.playerCards.length === 2 && result.status === "playing",
    });
  });

  // DEAL - Start a new hand
  app.post(api.games.blackjack.deal.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      // Check for existing active hand
      const existingBet = await storage.getActiveBlackjackBet(user.id);
      if (existingBet) {
        return res.status(400).json({ message: "You already have an active hand" });
      }

      const input = blackjackDealSchema.parse(req.body);
      
      // Calculate total bet including side bets
      const sideBets = input.sideBets || { perfectPairs: 0, twentyOnePlus3: 0 };
      const totalBet = input.betAmount + sideBets.perfectPairs + sideBets.twentyOnePlus3;
      
      if (user.balance < totalBet) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct total bet
      await storage.updateUserBalance(user.id, -totalBet);

      // Generate shuffled deck
      const deck = getShuffledDeck(user.serverSeed, user.clientSeed, user.nonce);
      await storage.incrementNonce(user.id);

      // Deal cards: player, dealer, player, dealer
      const playerCards = [deck[0], deck[2]];
      const dealerCards = [deck[1], deck[3]];
      let deckPointer = 4;

      const { total: playerTotal } = calculateHandTotal(playerCards);
      const { total: dealerTotal } = calculateHandTotal(dealerCards);
      
      const playerBlackjack = playerTotal === 21 && playerCards.length === 2;
      const dealerBlackjack = dealerTotal === 21 && dealerCards.length === 2;

      // Evaluate side bets (settle immediately after deal)
      let sideBetResults: { 
        perfectPairs?: { result: string | null, payout: number },
        twentyOnePlus3?: { result: string | null, payout: number }
      } = {};
      let sideBetPayout = 0;
      
      if (sideBets.perfectPairs > 0) {
        const ppResult = evaluatePerfectPairs(playerCards[0], playerCards[1]);
        // Multiplier is total return (includes stake), e.g., 26 means 25:1 odds
        const ppPayout = sideBets.perfectPairs * ppResult.multiplier;
        sideBetResults.perfectPairs = { result: ppResult.result, payout: ppPayout };
        sideBetPayout += ppPayout;
      }
      
      if (sideBets.twentyOnePlus3 > 0) {
        // Dealer upcard is the second dealer card (index 1)
        const t3Result = evaluate21Plus3(playerCards[0], playerCards[1], dealerCards[1]);
        // Multiplier is total return (includes stake)
        const t3Payout = sideBets.twentyOnePlus3 * t3Result.multiplier;
        sideBetResults.twentyOnePlus3 = { result: t3Result.result, payout: t3Payout };
        sideBetPayout += t3Payout;
      }
      
      // Pay out side bet winnings immediately
      if (sideBetPayout > 0) {
        await storage.updateUserBalance(user.id, sideBetPayout);
      }

      let status = "playing";
      let outcome: string | undefined;
      let payout = 0;

      // Check for immediate blackjacks
      if (playerBlackjack || dealerBlackjack) {
        status = "completed";
        const result = determineOutcome(playerTotal, dealerTotal, playerBlackjack, dealerBlackjack);
        outcome = result.outcome;
        payout = input.betAmount * result.multiplier;
        
        if (payout > 0) {
          await storage.updateUserBalance(user.id, payout);
        }
      }

      const bet = await storage.createBet({
        userId: user.id,
        game: "blackjack",
        betAmount: input.betAmount,
        payoutMultiplier: status === "completed" ? (payout / input.betAmount) : 1,
        profit: status === "completed" ? payout - input.betAmount : 0,
        won: status === "completed" ? (outcome === "win" || outcome === "blackjack") : false,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: {
          deck,
          deckPointer,
          playerCards,
          dealerCards,
          status,
          outcome,
          doubled: false,
          sideBets,
          sideBetResults,
        },
        active: status !== "completed",
      });

      res.json({
        bet: sanitizeBetForClient(bet),
        playerCards,
        dealerCards: status === "completed" ? dealerCards : [dealerCards[1]], // Show hole card if complete
        playerTotal,
        dealerShowing: getCardValue(dealerCards[1]),
        status,
        canDouble: status === "playing",
        outcome,
        payout,
        sideBetResults,
        sideBetPayout,
      });
    } catch (err) {
      console.error("[Blackjack Deal] Error:", err);
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // HIT - Draw a card
  app.post(api.games.blackjack.hit.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = blackjackActionSchema.parse(req.body);
      const bet = await storage.getBet(input.betId);
      
      if (!bet || bet.userId !== user.id || !bet.active || bet.game !== "blackjack") {
        return res.status(400).json({ message: "No active blackjack hand" });
      }

      const result = bet.result as any;
      if (result.status !== "playing") {
        return res.status(400).json({ message: "Cannot hit - hand is not in play" });
      }

      // Draw card
      const newCard = result.deck[result.deckPointer];
      const playerCards = [...result.playerCards, newCard];
      const deckPointer = result.deckPointer + 1;

      const { total: playerTotal } = calculateHandTotal(playerCards);
      
      let status = "playing";
      let outcome: string | undefined;
      let payout: number | undefined;

      if (playerTotal > 21) {
        // Bust
        status = "completed";
        outcome = "lose";
        payout = 0;
      } else if (playerTotal === 21) {
        // Auto-stand on 21
        status = "dealer_turn";
      }

      // If player busts or gets 21, complete the hand
      if (status === "completed" || status === "dealer_turn") {
        if (status === "dealer_turn") {
          // Play dealer's hand
          const dealerResult = playDealerHand(result.deck, result.dealerCards, deckPointer);
          const { outcome: finalOutcome, multiplier } = determineOutcome(playerTotal, dealerResult.dealerTotal, false, false);
          
          outcome = finalOutcome;
          payout = bet.betAmount * multiplier;
          status = "completed";
          
          if (payout > 0) {
            await storage.updateUserBalance(user.id, payout);
          }

          const updatedBet = await storage.updateBet(bet.id, {
            active: false,
            won: outcome === "win",
            profit: payout - bet.betAmount,
            payoutMultiplier: multiplier,
            result: {
              ...result,
              playerCards,
              dealerCards: dealerResult.dealerCards,
              deckPointer: dealerResult.deckPointer,
              status: "completed",
              outcome,
            },
          });

          return res.json({
            bet: sanitizeBetForClient(updatedBet),
            playerCards,
            dealerCards: dealerResult.dealerCards,
            playerTotal,
            dealerTotal: dealerResult.dealerTotal,
            status: "completed",
            outcome,
            payout,
          });
        }

        // Player busted
        const updatedBet = await storage.updateBet(bet.id, {
          active: false,
          won: false,
          profit: -bet.betAmount,
          payoutMultiplier: 0,
          result: {
            ...result,
            playerCards,
            deckPointer,
            status: "completed",
            outcome: "lose",
          },
        });

        return res.json({
          bet: sanitizeBetForClient(updatedBet),
          playerCards,
          dealerCards: result.dealerCards,
          playerTotal,
          status: "completed",
          outcome: "lose",
          payout: 0,
        });
      }

      // Still playing
      const updatedBet = await storage.updateBet(bet.id, {
        result: {
          ...result,
          playerCards,
          deckPointer,
        },
      });

      res.json({
        bet: sanitizeBetForClient(updatedBet),
        playerCards,
        dealerCards: [result.dealerCards[1]],
        playerTotal,
        status: "playing",
      });
    } catch (err) {
      console.error("[Blackjack Hit] Error:", err);
      res.status(400).json({ message: "Invalid action" });
    }
  });

  // STAND - End player turn
  app.post(api.games.blackjack.stand.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = blackjackActionSchema.parse(req.body);
      const bet = await storage.getBet(input.betId);
      
      if (!bet || bet.userId !== user.id || !bet.active || bet.game !== "blackjack") {
        return res.status(400).json({ message: "No active blackjack hand" });
      }

      const result = bet.result as any;
      if (result.status !== "playing") {
        return res.status(400).json({ message: "Cannot stand - hand is not in play" });
      }

      const { total: playerTotal } = calculateHandTotal(result.playerCards);
      
      // Play dealer's hand
      const dealerResult = playDealerHand(result.deck, result.dealerCards, result.deckPointer);
      const { outcome, multiplier } = determineOutcome(playerTotal, dealerResult.dealerTotal, false, false);
      
      const payout = bet.betAmount * multiplier;
      
      if (payout > 0) {
        await storage.updateUserBalance(user.id, payout);
      }

      const updatedBet = await storage.updateBet(bet.id, {
        active: false,
        won: outcome === "win",
        profit: payout - bet.betAmount,
        payoutMultiplier: multiplier,
        result: {
          ...result,
          dealerCards: dealerResult.dealerCards,
          deckPointer: dealerResult.deckPointer,
          status: "completed",
          outcome,
        },
      });

      res.json({
        bet: sanitizeBetForClient(updatedBet),
        playerCards: result.playerCards,
        dealerCards: dealerResult.dealerCards,
        playerTotal,
        dealerTotal: dealerResult.dealerTotal,
        status: "completed",
        outcome,
        payout,
      });
    } catch (err) {
      console.error("[Blackjack Stand] Error:", err);
      res.status(400).json({ message: "Invalid action" });
    }
  });

  // DOUBLE - Double bet, take one card, stand
  app.post(api.games.blackjack.double.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = blackjackActionSchema.parse(req.body);
      const bet = await storage.getBet(input.betId);
      
      if (!bet || bet.userId !== user.id || !bet.active || bet.game !== "blackjack") {
        return res.status(400).json({ message: "No active blackjack hand" });
      }

      const result = bet.result as any;
      if (result.status !== "playing" || result.playerCards.length !== 2) {
        return res.status(400).json({ message: "Cannot double - only allowed on first action" });
      }

      if (user.balance < bet.betAmount) {
        return res.status(400).json({ message: "Insufficient balance to double" });
      }

      // Deduct additional bet
      await storage.updateUserBalance(user.id, -bet.betAmount);
      const totalBet = bet.betAmount * 2;

      // Draw one card
      const newCard = result.deck[result.deckPointer];
      const playerCards = [...result.playerCards, newCard];
      let deckPointer = result.deckPointer + 1;

      const { total: playerTotal } = calculateHandTotal(playerCards);
      
      let outcome: string;
      let payout: number;

      if (playerTotal > 21) {
        // Bust
        outcome = "lose";
        payout = 0;
      } else {
        // Play dealer's hand
        const dealerResult = playDealerHand(result.deck, result.dealerCards, deckPointer);
        deckPointer = dealerResult.deckPointer;
        
        const finalResult = determineOutcome(playerTotal, dealerResult.dealerTotal, false, false);
        outcome = finalResult.outcome;
        payout = totalBet * finalResult.multiplier;
        
        result.dealerCards = dealerResult.dealerCards;
      }

      if (payout > 0) {
        await storage.updateUserBalance(user.id, payout);
      }

      const updatedBet = await storage.updateBet(bet.id, {
        betAmount: totalBet,
        active: false,
        won: outcome === "win",
        profit: payout - totalBet,
        payoutMultiplier: payout / totalBet,
        result: {
          ...result,
          playerCards,
          deckPointer,
          status: "completed",
          outcome,
          doubled: true,
        },
      });

      const { total: dealerTotal } = calculateHandTotal(result.dealerCards);

      res.json({
        bet: sanitizeBetForClient(updatedBet),
        playerCards,
        dealerCards: result.dealerCards,
        playerTotal,
        dealerTotal,
        status: "completed",
        outcome,
        payout,
      });
    } catch (err) {
      console.error("[Blackjack Double] Error:", err);
      res.status(400).json({ message: "Invalid action" });
    }
  });

  // === Rewards Routes ===
  
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  
  function canClaimBonus(lastClaim: Date | null): boolean {
    if (!lastClaim) return true;
    return Date.now() - new Date(lastClaim).getTime() >= TWENTY_FOUR_HOURS;
  }
  
  function getNextClaimTime(lastClaim: Date | null): string | null {
    if (!lastClaim) return null;
    const nextTime = new Date(lastClaim).getTime() + TWENTY_FOUR_HOURS;
    if (Date.now() >= nextTime) return null;
    return new Date(nextTime).toISOString();
  }
  
  function spinWheelWeighted(): number {
    const totalWeight = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    const rawRandom = Math.random();
    let random = rawRandom * totalWeight;
    
    console.log(`[Wheel] Total weight: ${totalWeight}, Raw random: ${rawRandom.toFixed(6)}, Scaled random: ${random.toFixed(4)}`);
    
    for (let i = 0; i < WHEEL_PRIZES.length; i++) {
      random -= WHEEL_PRIZES[i].weight;
      if (random <= 0) {
        console.log(`[Wheel] Selected index ${i}: ${WHEEL_PRIZES[i].id} (${WHEEL_PRIZES[i].label})`);
        return i;
      }
    }
    console.log(`[Wheel] Fallback to index 0`);
    return 0;
  }
  
  function getStartOfToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }
  
  function getStartOfYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }
  
  app.get(api.rewards.bonusStatus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const todayStart = getStartOfToday();
    const yesterdayStart = getStartOfYesterday();
    
    const todayVolume = await storage.getDailyWagerVolume(user.id, todayStart);
    const yesterdayVolume = await storage.getDailyWagerVolume(user.id, yesterdayStart);
    const yesterdayOnlyVolume = yesterdayVolume - todayVolume;
    
    const timeBasedCanClaim = canClaimBonus(user.lastBonusClaim);
    const volumeRequirementMet = !user.lastBonusClaim || yesterdayOnlyVolume >= REQUIRED_DAILY_VOLUME;
    
    res.json({
      canClaim: timeBasedCanClaim && volumeRequirementMet,
      nextClaimTime: getNextClaimTime(user.lastBonusClaim),
      bonusAmount: DAILY_BONUS_AMOUNT,
      requiredVolume: REQUIRED_DAILY_VOLUME,
      todayVolume,
      volumeRequirementMet,
      volumeProgress: Math.min(100, (todayVolume / REQUIRED_DAILY_VOLUME) * 100),
    });
  });
  
  app.post(api.rewards.claimBonus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    if (!canClaimBonus(user.lastBonusClaim)) {
      return res.status(400).json({ message: "Bonus already claimed today" });
    }
    
    const todayStart = getStartOfToday();
    const yesterdayStart = getStartOfYesterday();
    const yesterdayVolume = await storage.getDailyWagerVolume(user.id, yesterdayStart);
    const todayVolume = await storage.getDailyWagerVolume(user.id, todayStart);
    const yesterdayOnlyVolume = yesterdayVolume - todayVolume;
    
    if (user.lastBonusClaim && yesterdayOnlyVolume < REQUIRED_DAILY_VOLUME) {
      return res.status(400).json({ 
        message: `Play volume requirement not met. You wagered $${yesterdayOnlyVolume.toFixed(2)} yesterday but need $${REQUIRED_DAILY_VOLUME}.`
      });
    }
    
    await storage.updateLastBonusClaim(user.id);
    const updatedUser = await storage.updateUserBalance(user.id, DAILY_BONUS_AMOUNT);
    
    res.json({
      success: true,
      amount: DAILY_BONUS_AMOUNT,
      newBalance: updatedUser.balance,
    });
  });
  
  app.get(api.rewards.wheelStatus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    res.json({
      canSpin: canClaimBonus(user.lastWheelSpin),
      nextSpinTime: getNextClaimTime(user.lastWheelSpin),
    });
  });
  
  app.post(api.rewards.spinWheel.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    if (!canClaimBonus(user.lastWheelSpin)) {
      return res.status(400).json({ message: "Wheel already spun today" });
    }
    
    const prizeIndex = spinWheelWeighted();
    const prize = WHEEL_PRIZES[prizeIndex];
    
    const userAfterSpin = await storage.updateLastWheelSpin(user.id);
    const updatedUser = await storage.updateUserBalance(user.id, prize.value);
    
    const cooldownEndsAt = getNextClaimTime(userAfterSpin.lastWheelSpin) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`[Lootbox] User ${user.id} won prize: id=${prize.id}, label=${prize.label}, value=${prize.value}`);
    
    res.json({
      success: true,
      prizeId: prize.id,
      prizeLabel: prize.label,
      prizeValue: prize.value,
      newBalance: updatedUser.balance,
      cooldownEndsAt,
    });
  });
  
  // Helper for cooldown checks
  function canClaimWithCooldown(lastClaim: Date | null, cooldownMs: number): boolean {
    if (!lastClaim) return true;
    return Date.now() - new Date(lastClaim).getTime() >= cooldownMs;
  }
  
  function getNextClaimTimeWithCooldown(lastClaim: Date | null, cooldownMs: number): string | null {
    if (!lastClaim) return null;
    const nextTime = new Date(lastClaim).getTime() + cooldownMs;
    if (Date.now() >= nextTime) return null;
    return new Date(nextTime).toISOString();
  }
  
  // All Rewards Status endpoint
  app.get(api.rewards.allStatus.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const todayStart = getStartOfToday();
    const yesterdayStart = getStartOfYesterday();
    const todayVolume = await storage.getDailyWagerVolume(user.id, todayStart);
    const yesterdayVolume = await storage.getDailyWagerVolume(user.id, yesterdayStart);
    const yesterdayOnlyVolume = yesterdayVolume - todayVolume;
    
    // Rakeback calculation
    const lastRakebackDate = user.lastRakebackClaim || user.createdAt || new Date(0);
    const wagerSinceRakeback = await storage.getWagerVolumeSince(user.id, lastRakebackDate);
    const rakebackAmount = Math.floor(wagerSinceRakeback * REWARDS_CONFIG.rakeback.percentage * 100) / 100;
    
    // Daily bonus can only be claimed if cooldown passed AND (first claim OR yesterday volume met)
    const dailyBonusCooldownMet = canClaimWithCooldown(user.lastBonusClaim, REWARDS_CONFIG.dailyBonus.cooldownMs);
    const dailyBonusVolumeRequirementMet = !user.lastBonusClaim || yesterdayOnlyVolume >= REQUIRED_DAILY_VOLUME;
    
    res.json({
      dailyReload: {
        canClaim: canClaimWithCooldown(user.lastDailyReload, REWARDS_CONFIG.dailyReload.cooldownMs),
        nextClaimTime: getNextClaimTimeWithCooldown(user.lastDailyReload, REWARDS_CONFIG.dailyReload.cooldownMs),
        amount: REWARDS_CONFIG.dailyReload.amount,
        label: REWARDS_CONFIG.dailyReload.label,
        description: REWARDS_CONFIG.dailyReload.description,
      },
      dailyBonus: {
        canClaim: dailyBonusCooldownMet && dailyBonusVolumeRequirementMet,
        nextClaimTime: getNextClaimTimeWithCooldown(user.lastBonusClaim, REWARDS_CONFIG.dailyBonus.cooldownMs),
        amount: REWARDS_CONFIG.dailyBonus.amount,
        label: REWARDS_CONFIG.dailyBonus.label,
        description: REWARDS_CONFIG.dailyBonus.description,
        volumeProgress: Math.min(100, (todayVolume / REQUIRED_DAILY_VOLUME) * 100),
      },
      weeklyBonus: {
        canClaim: canClaimWithCooldown(user.lastWeeklyBonus, REWARDS_CONFIG.weeklyBonus.cooldownMs),
        nextClaimTime: getNextClaimTimeWithCooldown(user.lastWeeklyBonus, REWARDS_CONFIG.weeklyBonus.cooldownMs),
        amount: REWARDS_CONFIG.weeklyBonus.amount,
        label: REWARDS_CONFIG.weeklyBonus.label,
        description: REWARDS_CONFIG.weeklyBonus.description,
      },
      monthlyBonus: {
        canClaim: canClaimWithCooldown(user.lastMonthlyBonus, REWARDS_CONFIG.monthlyBonus.cooldownMs),
        nextClaimTime: getNextClaimTimeWithCooldown(user.lastMonthlyBonus, REWARDS_CONFIG.monthlyBonus.cooldownMs),
        amount: REWARDS_CONFIG.monthlyBonus.amount,
        label: REWARDS_CONFIG.monthlyBonus.label,
        description: REWARDS_CONFIG.monthlyBonus.description,
      },
      rakeback: {
        canClaim: canClaimWithCooldown(user.lastRakebackClaim, REWARDS_CONFIG.rakeback.cooldownMs) && rakebackAmount > 0,
        nextClaimTime: getNextClaimTimeWithCooldown(user.lastRakebackClaim, REWARDS_CONFIG.rakeback.cooldownMs),
        amount: rakebackAmount,
        label: REWARDS_CONFIG.rakeback.label,
        description: REWARDS_CONFIG.rakeback.description,
        wagerVolume: wagerSinceRakeback,
      },
    });
  });
  
  // Claim any reward type
  app.post("/api/rewards/claim/:type", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const { type } = req.params;
    
    let amount = 0;
    let lastClaim: Date | null = null;
    let cooldownMs = 0;
    let updateFn: ((id: number) => Promise<any>) | null = null;
    
    switch (type) {
      case "dailyReload":
        lastClaim = user.lastDailyReload;
        cooldownMs = REWARDS_CONFIG.dailyReload.cooldownMs;
        amount = REWARDS_CONFIG.dailyReload.amount;
        updateFn = storage.updateLastDailyReload.bind(storage);
        break;
      case "dailyBonus": {
        lastClaim = user.lastBonusClaim;
        cooldownMs = REWARDS_CONFIG.dailyBonus.cooldownMs;
        amount = REWARDS_CONFIG.dailyBonus.amount;
        updateFn = storage.updateLastBonusClaim.bind(storage);
        
        // Check volume requirement for daily bonus (first claim is free)
        if (user.lastBonusClaim) {
          const yesterdayStart = getStartOfYesterday();
          const todayStart = getStartOfToday();
          const yesterdayVolume = await storage.getDailyWagerVolume(user.id, yesterdayStart);
          const todayVolume = await storage.getDailyWagerVolume(user.id, todayStart);
          const yesterdayOnlyVolume = yesterdayVolume - todayVolume;
          
          if (yesterdayOnlyVolume < REQUIRED_DAILY_VOLUME) {
            return res.status(400).json({ 
              message: `Play volume requirement not met. You wagered $${yesterdayOnlyVolume.toFixed(2)} yesterday but need $${REQUIRED_DAILY_VOLUME}.`
            });
          }
        }
        break;
      }
      case "weeklyBonus":
        lastClaim = user.lastWeeklyBonus;
        cooldownMs = REWARDS_CONFIG.weeklyBonus.cooldownMs;
        amount = REWARDS_CONFIG.weeklyBonus.amount;
        updateFn = storage.updateLastWeeklyBonus.bind(storage);
        break;
      case "monthlyBonus":
        lastClaim = user.lastMonthlyBonus;
        cooldownMs = REWARDS_CONFIG.monthlyBonus.cooldownMs;
        amount = REWARDS_CONFIG.monthlyBonus.amount;
        updateFn = storage.updateLastMonthlyBonus.bind(storage);
        break;
      case "rakeback":
        lastClaim = user.lastRakebackClaim;
        cooldownMs = REWARDS_CONFIG.rakeback.cooldownMs;
        const lastRakebackDate = user.lastRakebackClaim || user.createdAt || new Date(0);
        const wagerSinceRakeback = await storage.getWagerVolumeSince(user.id, lastRakebackDate);
        amount = Math.floor(wagerSinceRakeback * REWARDS_CONFIG.rakeback.percentage * 100) / 100;
        updateFn = storage.updateLastRakebackClaim.bind(storage);
        if (amount <= 0) {
          return res.status(400).json({ message: "No rakeback to claim. Play some games first!" });
        }
        break;
      default:
        return res.status(400).json({ message: "Invalid reward type" });
    }
    
    if (!canClaimWithCooldown(lastClaim, cooldownMs)) {
      return res.status(400).json({ message: "Reward not available yet" });
    }
    
    await updateFn!(user.id);
    const updatedUser = await storage.updateUserBalance(user.id, amount);
    
    res.json({
      success: true,
      amount,
      newBalance: updatedUser.balance,
    });
  });

  // === PRESSURE VALVE GAME ===
  const PRESSURE_VALVE_CASHOUT_FEE = 0.01; // 1% fee on cashout
  
  // Calculate burst chance for a given pump number
  function getBurstChance(pumpNumber: number): number {
    const baseChance = 0.02; // 2%
    const rampRate = 0.08; // 8% per pump
    const maxChance = 0.75; // 75% max
    return Math.min(baseChance + (pumpNumber * rampRate), maxChance);
  }
  
  // Start a new Pressure Valve game
  app.post(api.games.pressureValve.start.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    try {
      const input = pressureValveStartSchema.parse(req.body);
      if (user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      
      // Check for existing active game
      const activeBet = await storage.getActiveBet(user.id, "pressure-valve");
      if (activeBet) {
        return res.status(400).json({ message: "Active game in progress. Finish it first." });
      }
      
      // Deduct balance
      await storage.updateUserBalance(user.id, -input.betAmount);
      
      // Create the bet with initial state
      const bet = await storage.createBet({
        userId: user.id,
        game: "pressure-valve",
        betAmount: input.betAmount,
        payoutMultiplier: 1.0,
        profit: null,
        won: null,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: { 
          currentMultiplier: 1.0, 
          pumpCount: 0, 
          pumpHistory: [],
          startNonce: user.nonce 
        },
        active: true,
      });
      
      res.json({
        bet,
        currentMultiplier: 1.0,
        pumpCount: 0,
        burstChance: getBurstChance(0),
      });
    } catch (err) {
      res.status(400).json({ message: "Invalid bet" });
    }
  });
  
  // Pump - try to increase multiplier
  app.post(api.games.pressureValve.pump.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    try {
      const input = pressureValvePumpSchema.parse(req.body);
      const bet = await storage.getBet(input.betId);
      
      if (!bet || bet.userId !== user.id) {
        return res.status(400).json({ message: "Bet not found" });
      }
      if (!bet.active) {
        return res.status(400).json({ message: "Game already finished" });
      }
      
      const result = bet.result as { 
        currentMultiplier: number; 
        pumpCount: number; 
        pumpHistory: Array<{ multiplierJump: number; burst: boolean }>; 
        startNonce: number 
      };
      
      // Calculate the nonce for this pump
      const pumpNonce = result.startNonce + result.pumpCount + 1;
      
      // Get pump result using provably fair function
      const pumpResult = getPressureValvePump(
        bet.serverSeed,
        bet.clientSeed,
        pumpNonce,
        result.pumpCount
      );
      
      // Update pump history
      const newPumpHistory = [...result.pumpHistory, { 
        multiplierJump: pumpResult.multiplierJump, 
        burst: pumpResult.burst 
      }];
      
      if (pumpResult.burst) {
        // BURST - Player loses everything
        const updatedBet = await storage.updateBet(bet.id, {
          active: false,
          won: false,
          profit: -bet.betAmount,
          payoutMultiplier: 0,
          result: {
            ...result,
            currentMultiplier: 0,
            pumpCount: result.pumpCount + 1,
            pumpHistory: newPumpHistory,
            burst: true,
            finalMultiplier: result.currentMultiplier,
          },
        });
        
        // Increment nonce
        await storage.incrementNonce(user.id);
        
        res.json({
          bet: updatedBet,
          burst: true,
          currentMultiplier: 0,
          multiplierJump: 0,
          pumpCount: result.pumpCount + 1,
          burstChance: getBurstChance(result.pumpCount),
          payout: 0,
        });
      } else {
        // SUCCESS - Increase multiplier
        const newMultiplier = result.currentMultiplier * pumpResult.multiplierJump;
        const newPumpCount = result.pumpCount + 1;
        
        const updatedBet = await storage.updateBet(bet.id, {
          payoutMultiplier: newMultiplier,
          result: {
            ...result,
            currentMultiplier: newMultiplier,
            pumpCount: newPumpCount,
            pumpHistory: newPumpHistory,
          },
        });
        
        // Increment nonce
        await storage.incrementNonce(user.id);
        
        res.json({
          bet: updatedBet,
          burst: false,
          currentMultiplier: Math.round(newMultiplier * 100) / 100,
          multiplierJump: pumpResult.multiplierJump,
          pumpCount: newPumpCount,
          burstChance: getBurstChance(newPumpCount),
        });
      }
    } catch (err) {
      res.status(400).json({ message: "Pump failed" });
    }
  });
  
  // Cashout
  app.post(api.games.pressureValve.cashout.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    try {
      const input = pressureValveCashoutSchema.parse(req.body);
      const bet = await storage.getBet(input.betId);
      
      if (!bet || bet.userId !== user.id) {
        return res.status(400).json({ message: "Bet not found" });
      }
      if (!bet.active) {
        return res.status(400).json({ message: "Game already finished" });
      }
      
      const result = bet.result as { currentMultiplier: number; pumpCount: number; pumpHistory: any[] };
      
      if (result.pumpCount === 0) {
        return res.status(400).json({ message: "Must pump at least once before cashing out" });
      }
      
      // Calculate payout with 1% fee
      const grossPayout = bet.betAmount * result.currentMultiplier;
      const fee = grossPayout * PRESSURE_VALVE_CASHOUT_FEE;
      const netPayout = grossPayout - fee;
      const profit = netPayout - bet.betAmount;
      
      // Update balance
      await storage.updateUserBalance(user.id, netPayout);
      
      // Update bet
      const updatedBet = await storage.updateBet(bet.id, {
        active: false,
        won: true,
        profit,
        payoutMultiplier: result.currentMultiplier,
        result: {
          ...result,
          cashedOut: true,
          grossPayout,
          fee,
          netPayout,
        },
      });
      
      res.json({
        bet: updatedBet,
        payout: netPayout,
        finalMultiplier: result.currentMultiplier,
        netPayout,
      });
    } catch (err) {
      res.status(400).json({ message: "Cashout failed" });
    }
  });
  
  // Get active game
  app.get(api.games.pressureValve.active.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const activeBet = await storage.getActiveBet(user.id, "pressure-valve");
    
    if (!activeBet) {
      return res.json({
        bet: null,
        currentMultiplier: 1.0,
        pumpCount: 0,
        burstChance: getBurstChance(0),
      });
    }
    
    const result = activeBet.result as { currentMultiplier: number; pumpCount: number };
    
    res.json({
      bet: activeBet,
      currentMultiplier: result.currentMultiplier,
      pumpCount: result.pumpCount,
      burstChance: getBurstChance(result.pumpCount),
    });
  });

  // Seed Data
  const existingUser = await storage.getUserByUsername("demo");
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash("password", 10);
    const demoUser = await storage.createUser({
      username: "demo",
      password: hashedPassword,
      clientSeed: generateClientSeed(),
      serverSeed: generateServerSeed(),
    });
    await storage.updateUserBalance(demoUser.id, 5000); // Give extra balance
    console.log("Seeded demo user");
  }

  return httpServer;
}
