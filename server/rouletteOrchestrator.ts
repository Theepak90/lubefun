import { WebSocket, WebSocketServer } from "ws";
import { storage } from "./storage";
import { generateServerSeed, generateClientSeed, getRouletteNumber } from "./fairness";
import { getRouletteColor } from "@shared/config";
import crypto from "crypto";

export interface RoundState {
  roundId: number;
  status: "betting" | "spinning" | "results";
  countdown: number;
  bettingEndsAt: number;
  winningNumber?: number;
  winningColor?: string;
  recentNumbers: { number: number; color: string }[];
}

type RoundStatus = "betting" | "spinning" | "results";

const BETTING_DURATION = 10000; // 10 seconds
const SPINNING_DURATION = 4000; // 4 seconds for animation
const RESULTS_DURATION = 3000; // 3 seconds to show results

class RouletteOrchestrator {
  private wss: WebSocketServer | null = null;
  private currentRound: RoundState | null = null;
  private roundTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private recentNumbers: { number: number; color: string }[] = [];
  private roundNonce = 0;

  async initialize(wss: WebSocketServer) {
    this.wss = wss;
    
    // Load recent numbers from database
    const recentRounds = await storage.getRecentRouletteRounds(12);
    this.recentNumbers = recentRounds
      .filter(r => r.winningNumber !== null)
      .map(r => ({
        number: r.winningNumber!,
        color: r.winningColor || getRouletteColor(r.winningNumber!)
      }));

    console.log("[Roulette] Orchestrator initialized");
    this.startNewRound();
  }

  private broadcast(data: any) {
    if (!this.wss) return;
    const message = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  async startNewRound() {
    const serverSeed = generateServerSeed();
    const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    const clientSeed = generateClientSeed();
    const bettingEndsAt = Date.now() + BETTING_DURATION;
    
    this.roundNonce++;

    try {
      const round = await storage.createRouletteRound({
        status: "betting",
        bettingEndsAt: new Date(bettingEndsAt),
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: this.roundNonce,
      });

      this.currentRound = {
        roundId: round.id,
        status: "betting",
        countdown: BETTING_DURATION,
        bettingEndsAt,
        recentNumbers: this.recentNumbers,
      };

      console.log(`[Roulette] Round ${round.id} started - Betting for ${BETTING_DURATION / 1000}s`);
      
      this.broadcast({
        type: "round_start",
        round: this.currentRound,
      });

      // Start countdown tick
      this.startCountdownTick();

      // Schedule end of betting
      this.roundTimer = setTimeout(() => {
        this.endBettingPhase();
      }, BETTING_DURATION);
    } catch (error) {
      console.error("[Roulette] Error starting round:", error);
      // Retry after a short delay
      setTimeout(() => this.startNewRound(), 2000);
    }
  }

  private startCountdownTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    
    this.tickTimer = setInterval(() => {
      if (!this.currentRound || this.currentRound.status !== "betting") {
        if (this.tickTimer) clearInterval(this.tickTimer);
        return;
      }

      const remaining = Math.max(0, this.currentRound.bettingEndsAt - Date.now());
      this.currentRound.countdown = remaining;

      this.broadcast({
        type: "countdown",
        countdown: remaining,
        roundId: this.currentRound.roundId,
      });
    }, 250);
  }

  private async endBettingPhase() {
    if (!this.currentRound) return;
    if (this.tickTimer) clearInterval(this.tickTimer);

    this.currentRound.status = "spinning";
    this.currentRound.countdown = 0;

    // Get round from database for seeds
    const roundData = await storage.updateRouletteRound(this.currentRound.roundId, {
      status: "spinning",
    });

    // Generate winning number using provably fair RNG
    const winningNumber = getRouletteNumber(
      roundData.serverSeed,
      roundData.clientSeed,
      roundData.nonce
    );
    const winningColor = getRouletteColor(winningNumber);

    this.currentRound.winningNumber = winningNumber;
    this.currentRound.winningColor = winningColor;

    console.log(`[Roulette] Round ${this.currentRound.roundId} spinning - Result: ${winningNumber} ${winningColor}`);

    this.broadcast({
      type: "spinning",
      roundId: this.currentRound.roundId,
      winningNumber,
      winningColor,
    });

    // After spinning animation, show results
    setTimeout(() => {
      this.showResults(winningNumber, winningColor);
    }, SPINNING_DURATION);
  }

  private async showResults(winningNumber: number, winningColor: string) {
    if (!this.currentRound) return;

    this.currentRound.status = "results";

    // Update round in database
    await storage.updateRouletteRound(this.currentRound.roundId, {
      status: "results",
      winningNumber,
      winningColor,
      resolvedAt: new Date(),
    });

    // Resolve all bets for this round
    await storage.resolveRouletteBets(this.currentRound.roundId, winningNumber);

    // Add to recent numbers
    this.recentNumbers.unshift({ number: winningNumber, color: winningColor });
    if (this.recentNumbers.length > 12) {
      this.recentNumbers = this.recentNumbers.slice(0, 12);
    }

    console.log(`[Roulette] Round ${this.currentRound.roundId} complete - ${winningNumber} ${winningColor}`);

    this.broadcast({
      type: "results",
      roundId: this.currentRound.roundId,
      winningNumber,
      winningColor,
      recentNumbers: this.recentNumbers,
    });

    // Start next round after results display
    setTimeout(() => {
      this.startNewRound();
    }, RESULTS_DURATION);
  }

  getCurrentRoundState(): RoundState | null {
    if (!this.currentRound) return null;
    
    // Update countdown based on current time
    if (this.currentRound.status === "betting") {
      this.currentRound.countdown = Math.max(0, this.currentRound.bettingEndsAt - Date.now());
    }
    
    return {
      ...this.currentRound,
      recentNumbers: this.recentNumbers,
    };
  }

  async placeBet(
    userId: number,
    betType: string,
    amount: number,
    straightNumber?: number
  ): Promise<{ success: boolean; message?: string; betId?: number }> {
    if (!this.currentRound || this.currentRound.status !== "betting") {
      return { success: false, message: "Bets are closed" };
    }

    // Check time remaining
    const remaining = this.currentRound.bettingEndsAt - Date.now();
    if (remaining <= 0) {
      return { success: false, message: "Bets are closed" };
    }

    try {
      // Check user balance
      const user = await storage.getUser(userId);
      if (!user || !user.availableBalance || user.availableBalance < amount) {
        return { 
          success: false, 
          message: `Insufficient balance. Available: $${user?.availableBalance?.toFixed(2) || '0.00'}, Required: $${amount.toFixed(2)}` 
        };
      }

      // Deduct balance immediately
      await storage.updateUserBalance(userId, -amount);

      // Create the bet
      const bet = await storage.createRouletteBet({
        roundId: this.currentRound.roundId,
        userId,
        betType,
        straightNumber: betType === "straight" ? straightNumber : null,
        amount,
      });

      console.log(`[Roulette] Bet placed: User ${userId} - ${betType} ${straightNumber ?? ""} $${amount}`);

      return { success: true, betId: bet.id };
    } catch (error) {
      console.error("[Roulette] Error placing bet:", error);
      return { success: false, message: "Failed to place bet" };
    }
  }

  getRecentNumbers(): { number: number; color: string }[] {
    return this.recentNumbers;
  }
}

export const rouletteOrchestrator = new RouletteOrchestrator();
