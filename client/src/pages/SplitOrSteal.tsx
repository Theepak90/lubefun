import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Flame, Snowflake, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const GAME_CONFIG = {
  houseEdge: 0.04,
  splitChance: 0.60,
  minMultiplier: 1.8,
  maxMultiplier: 2.4,
  suspenseDurationMs: 4000
};

const getEffectiveMultiplierRange = () => ({
  min: GAME_CONFIG.minMultiplier * (1 - GAME_CONFIG.houseEdge),
  max: GAME_CONFIG.maxMultiplier * (1 - GAME_CONFIG.houseEdge)
});

type GameState = "idle" | "running" | "result";

interface FakeWin {
  id: number;
  username: string;
  amount: number;
  outcome: "split" | "steal";
  timestamp: number;
}

const fakeNames = [
  "CryptoKing", "LuckyAce", "DiamondHands", "MoonShot", "WhaleWatch",
  "GoldenRush", "SilverFox", "NeonNinja", "PixelPirate", "ByteBoss",
  "CosmicWin", "TurboGambler", "VegasVibes", "JackpotJoe", "RiskyBiz"
];

function generateFakeWin(): FakeWin {
  const isWin = Math.random() > 0.4;
  return {
    id: Date.now() + Math.random(),
    username: fakeNames[Math.floor(Math.random() * fakeNames.length)] + Math.floor(Math.random() * 999),
    amount: Math.floor(5 + Math.random() * 200),
    outcome: isWin ? "split" : "steal",
    timestamp: Date.now()
  };
}

export default function SplitOrSteal() {
  const { user } = useAuth();
  const { recordResult } = useProfitTracker();
  const { addResult } = useGameHistory();
  const { play: playSound } = useSound();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState<string>("10");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [outcome, setOutcome] = useState<"split" | "steal" | null>(null);
  const [potValue, setPotValue] = useState(0);
  const [payout, setPayout] = useState(0);
  const [multiplierUsed, setMultiplierUsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [streak, setStreak] = useState(0);
  const [fakeWins, setFakeWins] = useState<FakeWin[]>([]);
  const [lastBetAmount, setLastBetAmount] = useState(0);
  
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const potIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const baseAmount = parseFloat(amount || "0");
  const multiplierRange = getEffectiveMultiplierRange();
  const isLocked = gameState === "running";

  const { mutate: placeBet } = useMutation({
    mutationFn: async (data: { betAmount: number }) => {
      const res = await apiRequest("POST", "/api/games/splitsteal", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        setFakeWins(prev => {
          const newWins = [generateFakeWin(), ...prev].slice(0, 5);
          return newWins;
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const playGame = useCallback(() => {
    // Use ref to prevent double-clicks during state transition
    if (gameState !== "idle") {
      console.log('[SplitSteal UI] Blocked - game not idle, state:', gameState);
      return;
    }
    if (baseAmount <= 0) {
      toast({ title: "Invalid bet", description: "Bet must be greater than 0", duration: 2000 });
      return;
    }
    if (baseAmount > (user?.balance || 0)) {
      toast({ title: "Insufficient balance", description: "You don't have enough balance", duration: 2000 });
      return;
    }

    // DEBUG: Log bet and balance before
    console.log('[SplitSteal UI] Starting game:', {
      betAmount: baseAmount,
      balanceBefore: user?.balance
    });

    // Lock UI immediately and set running state
    setGameState("running");
    setOutcome(null);
    setPotValue(0);
    setPayout(0);
    setLastBetAmount(baseAmount);
    setMultiplierUsed(0);
    playSound("flip");

    // Track when the game started for proper timing
    const gameStartTime = Date.now();
    const suspenseDuration = GAME_CONFIG.suspenseDurationMs;

    // Start countdown (4 seconds = 4000ms)
    const totalSeconds = Math.ceil(suspenseDuration / 1000);
    setCountdown(totalSeconds);
    
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    countdownRef.current = countdownInterval;

    // Pot animation
    const finalPot = baseAmount;
    let currentPot = 0;
    const potStep = finalPot / (suspenseDuration / 50);
    
    potIntervalRef.current = setInterval(() => {
      currentPot = Math.min(currentPot + potStep + (Math.random() * potStep * 0.5), finalPot * 1.2);
      setPotValue(currentPot);
    }, 50);

    const currentAmount = baseAmount;

    // Place bet - balance deducted on server immediately
    placeBet({ betAmount: baseAmount }, {
      onSuccess: (data: { outcome: "split" | "steal"; payout: number; multiplier: number; won: boolean; balanceAfter?: number }) => {
        // Store result for reveal
        const result = {
          outcome: data.outcome,
          payout: data.payout,
          multiplier: data.multiplier
        };

        // DEBUG: Log server response
        console.log('[SplitSteal UI] Server response:', {
          outcome: data.outcome,
          multiplier: data.multiplier?.toFixed(4),
          payout: data.payout?.toFixed(2),
          balanceAfter: data.balanceAfter
        });

        // Calculate remaining time to wait based on when game started
        const elapsed = Date.now() - gameStartTime;
        const remainingTime = Math.max(0, suspenseDuration - elapsed);
        
        console.log('[SplitSteal UI] Waiting', remainingTime, 'ms before reveal');

        // Wait for remaining countdown time before revealing
        setTimeout(() => {
          if (potIntervalRef.current) clearInterval(potIntervalRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);

          const isSplit = result.outcome === "split";
          const winAmount = result.payout;
          const multiplier = result.multiplier;
          
          // DEBUG: Log final result
          console.log('[SplitSteal UI] Revealing result:', {
            outcome: result.outcome,
            payout: winAmount,
            multiplier: multiplier
          });

          setPotValue(finalPot);
          setGameState("result");
          setOutcome(result.outcome);
          setPayout(winAmount);
          setMultiplierUsed(multiplier);
          setCountdown(0);

          // Invalidate user query to refresh balance
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });

          if (isSplit) {
            setStreak(prev => prev + 1);
            playSound("win");
            toast({
              title: "SPLIT!",
              description: `You won ${formatCurrency(winAmount)}!`,
              duration: 2000,
            });
          } else {
            setStreak(prev => Math.min(0, prev - 1));
            playSound("lose");
            toast({
              title: "STEAL!",
              description: `The house took ${formatCurrency(currentAmount)}`,
              duration: 2000,
            });
          }

          const profit = isSplit ? winAmount - currentAmount : -currentAmount;
          addResult({
            game: "splitsteal",
            betAmount: currentAmount,
            won: isSplit,
            profit: profit,
            detail: isSplit ? `SPLIT! Won ${multiplier.toFixed(2)}x` : "STEAL - House wins"
          });
          recordResult("splitsteal", currentAmount, winAmount, isSplit);
        }, remainingTime);
      },
      onError: (error) => {
        console.error('[SplitSteal UI] Error:', error);
        if (potIntervalRef.current) clearInterval(potIntervalRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        setGameState("idle");
        setCountdown(0);
        toast({
          title: "Error",
          description: "Failed to place bet. Please try again.",
          duration: 2000,
        });
      }
    });
  }, [baseAmount, user?.balance, gameState, playSound, placeBet, addResult, recordResult, toast, queryClient]);

  const resetGame = () => {
    // DEBUG: Log reset
    console.log('[SplitSteal UI] Resetting game');
    setGameState("idle");
    setOutcome(null);
    setPotValue(0);
    setPayout(0);
    setMultiplierUsed(0);
    setCountdown(0);
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <Label className="text-slate-500">Bet Amount</Label>
                  <span>${parseFloat(amount || "0").toFixed(2)}</span>
                </div>
                
                <div className="flex gap-1 bg-[#0d1419] p-1 rounded-lg border border-[#1a2530]">
                  <Input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="border-none bg-transparent h-9 focus-visible:ring-0 font-mono font-semibold text-white text-sm"
                    min={0.1}
                    step={0.1}
                    max={1000}
                    disabled={isLocked}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={isLocked}
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={isLocked}
                  >
                    2x
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.1, 0.25, 0.5, 1].map((pct) => (
                    <button 
                      key={pct} 
                      className="py-1.5 rounded-md bg-[#1a2530]/50 hover:bg-[#1a2530] text-[10px] font-semibold text-slate-500 hover:text-white transition-all border border-transparent hover:border-[#2a3a4a] disabled:opacity-50"
                      onClick={() => setPercent(pct)}
                      disabled={isLocked}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Potential Win (Split)
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    ${(baseAmount * multiplierRange.min).toFixed(2)} - ${(baseAmount * multiplierRange.max).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Win Chance
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5 flex justify-between">
                  <span className="font-mono font-semibold text-cyan-400 text-sm">
                    ~60% Split
                  </span>
                  <span className="font-mono font-semibold text-red-400 text-sm">
                    ~40% Steal
                  </span>
                </div>
              </div>

              {streak !== 0 && (
                <div className={cn(
                  "mb-5 p-3 rounded-lg border flex items-center gap-2",
                  streak > 0 
                    ? "bg-orange-500/10 border-orange-500/30" 
                    : "bg-blue-500/10 border-blue-500/30"
                )}>
                  {streak > 0 ? (
                    <>
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-semibold text-orange-400">
                        {streak} Win Streak!
                      </span>
                    </>
                  ) : (
                    <>
                      <Snowflake className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold text-blue-400">
                        Cold streak...
                      </span>
                    </>
                  )}
                </div>
              )}

              <Button 
                size="lg" 
                className={cn(
                  "w-full h-12 text-sm font-bold shadow-lg transition-all active:scale-[0.98]",
                  gameState === "result" 
                    ? "bg-cyan-500 hover:bg-cyan-400 shadow-cyan-500/20"
                    : "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-emerald-500/20"
                )} 
                onClick={gameState === "result" ? resetGame : playGame}
                disabled={isLocked || !user || baseAmount > (user?.balance || 0)}
                data-testid="button-play"
              >
                {gameState === "result" ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Play Again
                  </>
                ) : isLocked ? (
                  <>
                    <Zap className="w-4 h-4 mr-2 animate-pulse" />
                    {countdown > 0 ? `${countdown}s...` : "Revealing..."}
                  </>
                ) : user ? (
                  "SPLIT OR STEAL"
                ) : (
                  "Login to Play"
                )}
              </Button>
            </div>

            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[500px]">
              
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <ProfitTrackerWidget gameId="splitsteal" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Provably Fair</span>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {gameState === "idle" && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center gap-6"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 blur-3xl rounded-full" />
                      <div className="relative flex gap-4">
                        <div className="w-32 h-40 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex flex-col items-center justify-center shadow-xl shadow-emerald-500/30">
                          <span className="text-4xl mb-2">🤝</span>
                          <span className="text-lg font-bold text-white">SPLIT</span>
                          <span className="text-xs text-emerald-200">You Win</span>
                        </div>
                        <div className="w-32 h-40 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex flex-col items-center justify-center shadow-xl shadow-red-500/30">
                          <span className="text-4xl mb-2">💀</span>
                          <span className="text-lg font-bold text-white">STEAL</span>
                          <span className="text-xs text-red-200">House Wins</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-400 text-sm text-center max-w-xs">
                      Place your bet and hope for a SPLIT! The house might STEAL it all...
                    </p>
                  </motion.div>
                )}

                {gameState === "running" && (
                  <motion.div
                    key="suspense"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-6"
                  >
                    <motion.div 
                      className="text-6xl font-bold bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      ${potValue.toFixed(2)}
                    </motion.div>
                    
                    <div className="relative w-64 h-64">
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "conic-gradient(from 0deg, #10b981, #06b6d4, #10b981)"
                        }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <div className="absolute inset-2 rounded-full bg-[#0d1419] flex items-center justify-center">
                        <motion.div
                          className="text-4xl"
                          animate={{ 
                            rotateY: [0, 180, 360],
                            scale: [1, 1.2, 1]
                          }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                        >
                          🎰
                        </motion.div>
                      </div>
                    </div>

                    <div className="text-center">
                      {countdown > 0 && (
                        <motion.div
                          className="text-5xl font-bold text-cyan-400 mb-2"
                          key={countdown}
                          initial={{ scale: 1.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          {countdown}
                        </motion.div>
                      )}
                      <motion.p 
                        className="text-slate-400 text-lg font-semibold"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        Split or Steal...?
                      </motion.p>
                    </div>
                  </motion.div>
                )}

                {gameState === "result" && outcome && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="flex flex-col items-center gap-6"
                  >
                    <motion.div
                      className={cn(
                        "w-48 h-48 rounded-3xl flex flex-col items-center justify-center shadow-2xl",
                        outcome === "split" 
                          ? "bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-emerald-500/50"
                          : "bg-gradient-to-br from-red-500 to-orange-500 shadow-red-500/50"
                      )}
                      initial={{ rotateY: 180 }}
                      animate={{ rotateY: 0 }}
                      transition={{ duration: 0.6 }}
                    >
                      <motion.span 
                        className="text-6xl mb-2"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: "spring" }}
                      >
                        {outcome === "split" ? "🤝" : "💀"}
                      </motion.span>
                      <span className="text-2xl font-bold text-white uppercase">
                        {outcome}!
                      </span>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-center"
                    >
                      {outcome === "split" ? (
                        <>
                          <p className="text-3xl font-bold text-emerald-400">
                            +${payout.toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-400 mt-1">
                            You split the pot! ({multiplierUsed.toFixed(2)}x)
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-3xl font-bold text-red-400">
                            -${lastBetAmount.toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-400 mt-1">
                            The house stole your bet!
                          </p>
                        </>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-[#111921]/80 backdrop-blur rounded-lg border border-[#1a2530] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">Live Activity</span>
                  </div>
                  <div className="space-y-1 max-h-20 overflow-hidden">
                    <AnimatePresence>
                      {fakeWins.slice(0, 3).map((win) => (
                        <motion.div
                          key={win.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-slate-400">{win.username}</span>
                          <span className={cn(
                            "font-mono font-semibold",
                            win.outcome === "split" ? "text-emerald-400" : "text-red-400"
                          )}>
                            {win.outcome === "split" ? "+" : "-"}${win.amount.toFixed(2)}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
