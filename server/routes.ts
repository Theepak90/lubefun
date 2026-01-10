import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema, WHEEL_PRIZES, DAILY_BONUS_AMOUNT, REQUIRED_DAILY_VOLUME, REWARDS_CONFIG } from "@shared/schema";
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
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < WHEEL_PRIZES.length; i++) {
      random -= WHEEL_PRIZES[i].weight;
      if (random <= 0) return i;
    }
    return 0; // Fallback
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
    
    await storage.updateLastWheelSpin(user.id);
    const updatedUser = await storage.updateUserBalance(user.id, prize.value);
    
    res.json({
      success: true,
      prizeIndex,
      prizeLabel: prize.label,
      prizeValue: prize.value,
      newBalance: updatedUser.balance,
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
