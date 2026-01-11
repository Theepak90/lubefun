import { useState, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Gauge, Flame, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";

export default function PressureValve() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [amount, setAmount] = useState<string>("10");
  const [gameState, setGameState] = useState<{
    active: boolean;
    betId?: number;
    betAmount?: number;
    currentMultiplier: number;
    pumpCount: number;
    burstChance: number;
    burst?: boolean;
    lastJump?: number;
  }>({
    active: false,
    currentMultiplier: 1.0,
    pumpCount: 0,
    burstChance: 0.02,
  });
  
  const [isPumping, setIsPumping] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  const { data: activeGame } = useQuery({
    queryKey: ["/api/games/pressure-valve/active"],
    enabled: !!user,
  });

  useEffect(() => {
    if (activeGame?.bet) {
      setGameState({
        active: true,
        betId: activeGame.bet.id,
        betAmount: activeGame.bet.betAmount,
        currentMultiplier: activeGame.currentMultiplier,
        pumpCount: activeGame.pumpCount,
        burstChance: activeGame.burstChance,
      });
    }
  }, [activeGame]);

  const startGame = useMutation({
    mutationFn: async (data: { betAmount: number }) => {
      const res = await apiRequest("POST", api.games.pressureValve.start.path, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setGameState({
        active: true,
        betId: data.bet.id,
        betAmount: data.bet.betAmount,
        currentMultiplier: data.currentMultiplier,
        pumpCount: data.pumpCount,
        burstChance: data.burstChance,
      });
      playSound("bet");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start game",
        variant: "destructive",
      });
    },
  });

  const pumpGame = useMutation({
    mutationFn: async (data: { betId: number }) => {
      const res = await apiRequest("POST", api.games.pressureValve.pump.path, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.burst) {
        playSound("lose");
        setShowBurst(true);
        setTimeout(() => setShowBurst(false), 1500);
        
        recordResult("pressure-valve", gameState.betAmount || 0, 0, false);
        
        toast({
          title: "BURST!",
          description: `The valve burst! You lost ${formatCurrency(gameState.betAmount || 0)}`,
          variant: "destructive",
          duration: 2000,
        });
        
        addResult({
          game: "pressure-valve",
          betAmount: gameState.betAmount || 0,
          won: false,
          profit: -(gameState.betAmount || 0),
          detail: `Burst at ${gameState.currentMultiplier.toFixed(2)}x after ${gameState.pumpCount} pumps`,
        });
        
        setGameState({
          active: false,
          currentMultiplier: 1.0,
          pumpCount: 0,
          burstChance: 0.02,
          burst: true,
        });
      } else {
        playSound("tick");
        setGameState((prev) => ({
          ...prev,
          currentMultiplier: data.currentMultiplier,
          pumpCount: data.pumpCount,
          burstChance: data.burstChance,
          lastJump: data.multiplierJump,
        }));
      }
      setIsPumping(false);
    },
    onError: (error: any) => {
      setIsPumping(false);
      toast({
        title: "Error",
        description: error.message || "Pump failed",
        variant: "destructive",
      });
    },
  });

  const cashoutGame = useMutation({
    mutationFn: async (data: { betId: number }) => {
      const res = await apiRequest("POST", api.games.pressureValve.cashout.path, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      playSound("win");
      
      const profit = data.netPayout - (gameState.betAmount || 0);
      recordResult("pressure-valve", gameState.betAmount || 0, data.netPayout, true);
      
      toast({
        title: "Cashed Out!",
        description: `Won ${formatCurrency(data.netPayout)} at ${data.finalMultiplier.toFixed(2)}x`,
        duration: 2000,
      });
      
      addResult({
        game: "pressure-valve",
        betAmount: gameState.betAmount || 0,
        won: true,
        profit,
        detail: `Cashed out at ${data.finalMultiplier.toFixed(2)}x (${gameState.pumpCount} pumps)`,
      });
      
      setGameState({
        active: false,
        currentMultiplier: 1.0,
        pumpCount: 0,
        burstChance: 0.02,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Cashout failed",
        variant: "destructive",
      });
    },
  });

  const handleStart = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0.1) return;
    startGame.mutate({ betAmount: val });
  };

  const handlePump = () => {
    if (!gameState.active || !gameState.betId || isPumping) return;
    setIsPumping(true);
    pumpGame.mutate({ betId: gameState.betId });
  };

  const handleCashout = () => {
    if (!gameState.active || !gameState.betId || gameState.pumpCount === 0) return;
    cashoutGame.mutate({ betId: gameState.betId });
  };

  const potentialPayout = (gameState.betAmount || parseFloat(amount) || 0) * gameState.currentMultiplier;
  const potentialPayoutAfterFee = potentialPayout * 0.99;

  const getBurstColor = (chance: number) => {
    if (chance < 0.2) return "text-emerald-400";
    if (chance < 0.4) return "text-yellow-400";
    if (chance < 0.6) return "text-orange-400";
    return "text-red-400";
  };

  const getGaugeRotation = () => {
    const maxRotation = 180;
    return Math.min(gameState.burstChance * maxRotation * 1.33, maxRotation);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Gauge className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Pressure Valve</h1>
            <p className="text-slate-400 text-sm">Pump to increase your multiplier - but don't let it burst!</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-[#0d1419] border border-[#1a2530] rounded-xl p-6">
              <div className="flex flex-col items-center justify-center min-h-[400px]">
                <AnimatePresence>
                  {showBurst && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1.5, opacity: 1 }}
                      exit={{ scale: 2, opacity: 0 }}
                      className="absolute z-20"
                    >
                      <Flame className="w-32 h-32 text-red-500" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative mb-8">
                  <motion.div
                    animate={{
                      scale: gameState.active ? [1, 1.05, 1] : 1,
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: gameState.active ? Infinity : 0,
                      repeatType: "reverse",
                    }}
                    className="relative"
                  >
                    <div className={cn(
                      "w-48 h-48 rounded-full border-8 flex items-center justify-center transition-all duration-300",
                      gameState.active 
                        ? gameState.burstChance > 0.5 
                          ? "border-red-500 bg-red-500/20" 
                          : gameState.burstChance > 0.3 
                            ? "border-orange-500 bg-orange-500/20"
                            : "border-emerald-500 bg-emerald-500/20"
                        : "border-slate-600 bg-slate-800/50"
                    )}>
                      <div className="text-center">
                        <motion.div
                          key={gameState.currentMultiplier}
                          initial={{ scale: 1.3 }}
                          animate={{ scale: 1 }}
                          className="text-4xl font-bold text-white"
                        >
                          {gameState.currentMultiplier.toFixed(2)}x
                        </motion.div>
                        <div className="text-slate-400 text-sm mt-1">Multiplier</div>
                      </div>
                    </div>

                    <div
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-12 bg-slate-600 origin-bottom transition-transform duration-300"
                      style={{
                        transform: `translateX(-50%) rotate(${getGaugeRotation() - 90}deg)`,
                      }}
                    >
                      <div className="w-3 h-3 rounded-full bg-red-500 -translate-x-1/2 -translate-y-1" />
                    </div>
                  </motion.div>
                </div>

                <div className="flex gap-8 mb-6 text-center">
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Pumps</div>
                    <div className="text-2xl font-bold text-white">{gameState.pumpCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Burst Risk</div>
                    <div className={cn("text-2xl font-bold", getBurstColor(gameState.burstChance))}>
                      {(gameState.burstChance * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Potential</div>
                    <div className="text-2xl font-bold text-emerald-400">
                      {formatCurrency(potentialPayoutAfterFee)}
                    </div>
                  </div>
                </div>

                {gameState.lastJump && gameState.active && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-emerald-400 text-sm mb-4"
                  >
                    +{gameState.lastJump.toFixed(2)}x jump!
                  </motion.div>
                )}

                {gameState.active ? (
                  <div className="flex gap-4">
                    <Button
                      size="lg"
                      onClick={handlePump}
                      disabled={pumpGame.isPending}
                      className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-12 py-6 text-lg"
                      data-testid="button-pump"
                    >
                      {pumpGame.isPending ? "..." : "PUMP"}
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleCashout}
                      disabled={cashoutGame.isPending || gameState.pumpCount === 0}
                      variant="outline"
                      className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/20 font-bold px-8 py-6 text-lg"
                      data-testid="button-cashout"
                    >
                      CASH OUT
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-slate-400">
                    {gameState.burst ? (
                      <div className="text-red-400 mb-2">The valve burst! Try again.</div>
                    ) : (
                      <div className="mb-2">Set your bet and start pumping!</div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-300">How it works:</strong> Each pump multiplies your bet by 1.4-2.0x but increases burst risk. 
                    Starting at 2%, risk increases ~8% per pump up to 75% max. 1% fee on cashout. Provably fair using server seed + client seed + nonce.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0d1419] border border-[#1a2530] rounded-xl p-4">
              <Label className="text-slate-400 text-xs uppercase tracking-wider">Bet Amount</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-slate-800 border-slate-700"
                  disabled={gameState.active}
                  data-testid="input-bet-amount"
                />
              </div>
              <div className="grid grid-cols-4 gap-1 mt-2">
                {[5, 10, 25, 50].map((val) => (
                  <Button
                    key={val}
                    size="sm"
                    variant="outline"
                    onClick={() => setAmount(String(val))}
                    disabled={gameState.active}
                    className="text-xs"
                    data-testid={`button-preset-${val}`}
                  >
                    ${val}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAmount((prev) => String(Math.max(0.1, parseFloat(prev) / 2)))}
                  disabled={gameState.active}
                  className="text-xs"
                  data-testid="button-half"
                >
                  1/2
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAmount((prev) => String(parseFloat(prev) * 2))}
                  disabled={gameState.active}
                  className="text-xs"
                  data-testid="button-double"
                >
                  2x
                </Button>
              </div>

              {!gameState.active && (
                <Button
                  className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                  onClick={handleStart}
                  disabled={startGame.isPending || !user}
                  data-testid="button-start-game"
                >
                  {startGame.isPending ? "Starting..." : "Start Game"}
                </Button>
              )}

              {user && (
                <div className="mt-3 text-center text-sm text-slate-400">
                  Balance: <span className="text-white font-medium">{formatCurrency(user.balance)}</span>
                </div>
              )}
            </div>

            <ProfitTrackerWidget />
            <RecentResults results={results} onClear={clearHistory} />
            <LiveWins />
          </div>
        </div>
      </div>
    </Layout>
  );
}
