import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema } from "@shared/schema";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { generateClientSeed, generateServerSeed, getDiceRoll, getCoinflipResult, getMines } from "./fairness";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
      
      // Multiplier Calc
      // Win chance: 
      // if below 50: win range is 0-49.99 (50%). Multiplier = 99 / 50 = 1.98
      // Edge is usually 1%. Stake is 99 / Chance.
      
      const winChance = input.condition === "above" ? (100 - input.target) : input.target;
      const multiplier = 99 / winChance; 
      
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

      const multiplier = 1.98; // Standard 2x with edge
      
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
        
        // Add 1% edge
        multiplier = multiplier * 0.99; 
        
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
