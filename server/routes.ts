import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema, plinkoBetSchema, rouletteBetSchema, blackjackDealSchema, blackjackActionSchema, liveRouletteBetSchema, rouletteMultiBetSchema, WHEEL_PRIZES, DAILY_BONUS_AMOUNT, REQUIRED_DAILY_VOLUME, REWARDS_CONFIG, splitStealPlaySchema, pressureValveStartSchema, pressureValvePumpSchema, pressureValveCashoutSchema } from "@shared/schema";
import { GAME_CONFIG, getPlinkoMultipliers, PlinkoRisk, ROULETTE_CONFIG, RouletteBetType, getRouletteColor, checkRouletteWin, BLACKJACK_CONFIG } from "@shared/config";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { generateClientSeed, generateServerSeed, getDiceRoll, getCoinflipResult, getMines, getPlinkoPath, getRouletteNumber, getShuffledDeck, calculateHandTotal, getCardValue, getPressureValvePump } from "./fairness";
import { rouletteOrchestrator } from "./rouletteOrchestrator";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === WebSocket Server Setup for Live Roulette ===
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/roulette" });
  
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
      // In real app: bcrypt.compare(password, user.password)
      if (user.password !== password) return done(null, false, { message: "Incorrect password." });
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
      
      const user = await storage.createUser({
        ...input,
        clientSeed: generateClientSeed(),
        serverSeed: generateServerSeed(),
      });
      
      req.login(user, (err) => {
        if (err) throw err;
        res.status(201).json(user);
      });
    } catch (err) {
      res.status(400).json({ message: "Registration failed" });
    }
  });

  app.post(api.auth.login.path, passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.logout(() => {
      res.sendStatus(200);
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
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
  
  // DICE
  app.post(api.games.dice.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    try {
      const input = diceBetSchema.parse(req.body);
      if (user.balance < input.betAmount) return res.status(400).json({ message: "Insufficient balance" });
      
      // Multiplier Calc with configurable house edge
      // RTP = 1 - HOUSE_EDGE (e.g., 98% RTP with 2% edge)
      // Multiplier = (100 / winChance) * RTP
      
      const winChance = input.condition === "above" ? (100 - input.target) : input.target;
      const baseMultiplier = 100 / winChance;
      const multiplier = baseMultiplier * GAME_CONFIG.RTP; 
      
      // Deduct balance
      await storage.updateUserBalance(user.id, -input.betAmount);
      
      // Calculate Result
      const roll = getDiceRoll(user.serverSeed, user.clientSeed, user.nonce);
      await storage.incrementNonce(user.id);
      
      const won = input.condition === "above" ? roll > input.target : roll < input.target;
      const profit = won ? (input.betAmount * multiplier) - input.betAmount : -input.betAmount;
      const payout = won ? (input.betAmount * multiplier) : 0;
      
      if (won) {
        await storage.updateUserBalance(user.id, payout);
      }
      
      const bet = await storage.createBet({
        userId: user.id,
        game: "dice",
        betAmount: input.betAmount,
        payoutMultiplier: multiplier,
        profit,
        won,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: { roll, target: input.target, condition: input.condition },
        active: false
      });
      
      res.json(bet);
    } catch (err) {
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  // COINFLIP
  app.post(api.games.coinflip.play.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);

    try {
      const input = coinflipBetSchema.parse(req.body);
      if (user.balance < input.betAmount) return res.status(400).json({ message: "Insufficient balance" });

      // Coinflip: 50% chance, 2x base payout with house edge
      const multiplier = 2 * GAME_CONFIG.RTP; // e.g., 1.96 with 2% edge
      
      await storage.updateUserBalance(user.id, -input.betAmount);
      
      const result = getCoinflipResult(user.serverSeed, user.clientSeed, user.nonce);
      await storage.incrementNonce(user.id);
      
      const won = result === input.side;
      const profit = won ? (input.betAmount * multiplier) - input.betAmount : -input.betAmount;
      const payout = won ? (input.betAmount * multiplier) : 0;

      if (won) {
        await storage.updateUserBalance(user.id, payout);
      }

      const bet = await storage.createBet({
        userId: user.id,
        game: "coinflip",
        betAmount: input.betAmount,
        payoutMultiplier: multiplier,
        profit,
        won,
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: user.nonce,
        result: { flip: result, chosen: input.side },
        active: false
      });

      res.json(bet);
    } catch (err) {
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
  app.post(api.games.mines.start.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(401);
    
    const activeGame = await storage.getActiveMinesBet(user.id);
    if (activeGame) return res.status(400).json({ message: "Game already active" });

    try {
      const input = minesBetSchema.parse(req.body);
      if (user.balance < input.betAmount) return res.status(400).json({ message: "Insufficient balance" });

      await storage.updateUserBalance(user.id, -input.betAmount);
      
      const mines = getMines(user.serverSeed, user.clientSeed, user.nonce, input.minesCount);
      // Don't increment nonce yet! Wait until game over.
      // Actually, nonce is usually incremented per Game Request or per Game Start?
      // Stake usually increments per Game Start.
      // So we use current nonce for the game, then increment.
      const gameNonce = user.nonce;
      await storage.incrementNonce(user.id);

      const bet = await storage.createBet({
        userId: user.id,
        game: "mines",
        betAmount: input.betAmount,
        payoutMultiplier: 1.0,
        profit: 0,
        won: undefined, // Pending
        clientSeed: user.clientSeed,
        serverSeed: user.serverSeed,
        nonce: gameNonce,
        result: { 
          minesCount: input.minesCount, 
          mines: mines, // Store mines (server side only technically, but here in DB). 
                        // In API response we MUST mask this!
          revealed: [], 
          status: "playing" 
        },
        active: true
      });

      // MASK MINES IN RESPONSE
      const responseBet = { ...bet, result: { ...bet.result as any, mines: undefined } }; // Don't show mines
      res.json(responseBet);
    } catch (err) {
      res.status(400).json({ message: "Invalid bet" });
    }
  });

  app.post(api.games.mines.reveal.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = await storage.getUser(req.user!.id);
    
    const bet = await storage.getActiveMinesBet(user!.id);
    if (!bet) return res.status(400).json({ message: "No active game" });

    try {
      const input = minesNextSchema.parse(req.body);
      const result = bet.result as any;
      
      if (result.revealed.includes(input.tileIndex)) {
        return res.status(400).json({ message: "Tile already revealed" });
      }

      const isMine = result.mines.includes(input.tileIndex);
      
      if (isMine) {
        // BOOM
        const updatedBet = await storage.updateBet(bet.id, {
          active: false,
          won: false,
          profit: -bet.betAmount,
          result: { ...result, revealed: [...result.revealed, input.tileIndex], status: "lost" } // Now we show mines? Logic in frontend usually reveals all.
        });
        res.json(updatedBet); // Send back full bet with mines (client can verify)
      } else {
        // SAFE
        const newRevealed = [...result.revealed, input.tileIndex];
        
        // Calculate new multiplier
        // Formula: 25 / (25 - mines - revealed_count + 1) ? 
        // Standard Mines Multiplier logic.
        // Simplification: Standard formula is complicated. 
        // We'll calculate cumulative probability.
        // Chance to hit safe = (25 - mines - current_revealed) / (25 - current_revealed)
        // Multiplier *= 1 / Chance
        
        let multiplier = 1.0;
        for (let i = 0; i < newRevealed.length; i++) {
          const remainingTiles = 25 - i;
          const remainingSafe = 25 - result.minesCount - i;
          const chance = remainingSafe / remainingTiles;
          multiplier *= (1 / chance);
        }
        
        // Apply configurable house edge
        multiplier = multiplier * GAME_CONFIG.RTP; 
        
        const updatedBet = await storage.updateBet(bet.id, {
          payoutMultiplier: multiplier,
          result: { ...result, revealed: newRevealed, status: "playing" }
        });
        
        // MASK MINES
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
    
    const bet = await storage.getActiveMinesBet(user!.id);
    if (!bet) return res.status(400).json({ message: "No active game" });
    
    const result = bet.result as any;
    if (result.revealed.length === 0) return res.status(400).json({ message: "Cannot cashout without playing" });
    
    const payout = bet.betAmount * (bet.payoutMultiplier || 1);
    const profit = payout - bet.betAmount;
    
    await storage.updateUserBalance(user!.id, payout);
    
    const updatedBet = await storage.updateBet(bet.id, {
      active: false,
      won: true,
      profit,
      result: { ...result, status: "cashed_out" }
    });
    
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
      if (user.balance < input.betAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Deduct bet
      await storage.updateUserBalance(user.id, -input.betAmount);

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
    const demoUser = await storage.createUser({
      username: "demo",
      password: "password",
      clientSeed: generateClientSeed(),
      serverSeed: generateServerSeed(),
    });
    await storage.updateUserBalance(demoUser.id, 5000); // Give extra balance
    console.log("Seeded demo user");
  }

  return httpServer;
}
