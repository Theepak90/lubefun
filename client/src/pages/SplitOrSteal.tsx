import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Swords, RotateCcw, Bot, User } from "lucide-react";
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
  splitBonus: 0.06,
  suspenseDelayMs: 1500
};

type GameState = "idle" | "deciding" | "suspense" | "result";

interface RoundData {
  roundId: number;
  betAmount: number;
}

interface ResolveResult {
  playerChoice: "split" | "steal";
  aiChoice: "split" | "steal";
  payout: number;
  won: boolean;
  balanceAfter: number;
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
  const [roundData, setRoundData] = useState<RoundData | null>(null);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const baseAmount = parseFloat(amount || "0");
  const isLocked = gameState !== "idle";

  const { mutate: startGame, isPending: isStarting } = useMutation({
    mutationFn: async (data: { betAmount: number }) => {
      const res = await apiRequest("POST", "/api/games/splitsteal/start", data);
      return res.json();
    },
    onSuccess: (data: { roundId: number; betAmount: number; balanceAfter: number }) => {
      setRoundData({ roundId: data.roundId, betAmount: data.betAmount });
      setGameState("deciding");
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      playSound("flip");
    },
    onError: (error) => {
      console.error('[SplitSteal] Start error:', error);
      toast({ title: "Error", description: "Failed to start game", duration: 2000 });
    }
  });

  const { mutate: resolveGame, isPending: isResolving } = useMutation({
    mutationFn: async (data: { roundId: number; playerChoice: "split" | "steal" }) => {
      const res = await apiRequest("POST", "/api/games/splitsteal/resolve", data);
      return res.json();
    },
    onSuccess: (data: ResolveResult) => {
      setTimeout(() => {
        setAiThinking(false);
        setResult(data);
        setGameState("result");
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });

        if (data.won) {
          playSound("win");
          toast({
            title: data.playerChoice === "split" && data.aiChoice === "split" ? "Both Split!" : "You Stole!",
            description: `You won ${formatCurrency(data.payout)}!`,
            duration: 2000,
          });
        } else {
          playSound("lose");
          const message = data.playerChoice === "steal" && data.aiChoice === "steal" 
            ? "Both stole - nobody wins!" 
            : "AI stole your share!";
          toast({
            title: "You Lost!",
            description: message,
            duration: 2000,
          });
        }

        const betAmount = roundData?.betAmount || 0;
        const profit = data.payout - betAmount;
        addResult({
          game: "splitsteal",
          betAmount,
          won: data.won,
          profit,
          detail: `${data.playerChoice.toUpperCase()} vs ${data.aiChoice.toUpperCase()}`
        });
        recordResult("splitsteal", betAmount, data.payout, data.won);
      }, GAME_CONFIG.suspenseDelayMs);
    },
    onError: (error) => {
      console.error('[SplitSteal] Resolve error:', error);
      setAiThinking(false);
      setGameState("idle");
      toast({ title: "Error", description: "Failed to resolve game", duration: 2000 });
    }
  });

  const handleStartGame = useCallback(() => {
    if (gameState !== "idle") return;
    if (baseAmount <= 0) {
      toast({ title: "Invalid bet", description: "Bet must be greater than 0", duration: 2000 });
      return;
    }
    if (baseAmount > (user?.balance || 0)) {
      toast({ title: "Insufficient balance", description: "You don't have enough balance", duration: 2000 });
      return;
    }
    startGame({ betAmount: baseAmount });
  }, [baseAmount, user?.balance, gameState, startGame, toast]);

  const handleChoice = useCallback((choice: "split" | "steal") => {
    if (gameState !== "deciding" || !roundData) return;
    
    setGameState("suspense");
    setAiThinking(true);
    playSound("flip");
    
    resolveGame({ roundId: roundData.roundId, playerChoice: choice });
  }, [gameState, roundData, resolveGame, playSound]);

  const resetGame = () => {
    setGameState("idle");
    setRoundData(null);
    setResult(null);
    setAiThinking(false);
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    const newAmount = Math.floor(user.balance * percent * 100) / 100;
    setAmount(newAmount.toFixed(2));
  };

  const getOutcomeExplanation = () => {
    if (!result) return "";
    const { playerChoice, aiChoice } = result;
    if (playerChoice === "split" && aiChoice === "split") {
      return `Both chose to SPLIT! You get your bet back plus a ${(GAME_CONFIG.splitBonus * 100).toFixed(0)}% bonus.`;
    }
    if (playerChoice === "steal" && aiChoice === "split") {
      return `You STOLE while AI chose SPLIT! You take the entire pot (minus ${(GAME_CONFIG.houseEdge * 100).toFixed(0)}% house edge).`;
    }
    if (playerChoice === "split" && aiChoice === "steal") {
      return `You chose SPLIT but AI STOLE everything! You lost your bet.`;
    }
    return `Both chose to STEAL! When everyone's greedy, nobody wins.`;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Split or Steal
            </h1>
            <p className="text-muted-foreground mt-1">
              Game theory showdown against AI
            </p>
          </div>
          <ProfitTrackerWidget gameId="splitsteal" />
        </div>

        <div className="grid lg:grid-cols-[1fr,320px] gap-6">
          <div className="bg-[#0d1821] rounded-2xl border border-[#1e2a36] overflow-hidden">
            <div className="p-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-8 min-h-[400px] flex flex-col items-center justify-center relative">
                
                <AnimatePresence mode="wait">
                  {gameState === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="text-center space-y-6"
                    >
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-500/50 flex items-center justify-center">
                            <User className="w-10 h-10 text-blue-400" />
                          </div>
                          <span className="mt-2 text-sm text-slate-400">You</span>
                        </div>
                        <span className="text-2xl text-slate-500">VS</span>
                        <div className="flex flex-col items-center">
                          <div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center">
                            <Bot className="w-10 h-10 text-red-400" />
                          </div>
                          <span className="mt-2 text-sm text-slate-400">AI Opponent</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 max-w-md">
                        <p className="text-slate-300 text-lg font-medium">How to Play</p>
                        <div className="text-sm text-slate-400 space-y-1 text-left">
                          <p className="flex gap-2"><Handshake className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> <span><strong>Both SPLIT:</strong> You win {((1 + GAME_CONFIG.splitBonus) * 100).toFixed(0)}% of your bet</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" /> <span><strong>You STEAL, AI SPLITS:</strong> You win {((2 * (1 - GAME_CONFIG.houseEdge)) * 100).toFixed(0)}% of your bet</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> <span><strong>You SPLIT, AI STEALS:</strong> You lose everything</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" /> <span><strong>Both STEAL:</strong> Nobody wins</span></p>
                        </div>
                      </div>

                      <Button
                        onClick={handleStartGame}
                        disabled={isStarting || !user || baseAmount <= 0}
                        size="lg"
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-12 py-6 text-xl font-bold"
                        data-testid="button-start-game"
                      >
                        {isStarting ? "Starting..." : `Play ${formatCurrency(baseAmount)}`}
                      </Button>
                    </motion.div>
                  )}

                  {gameState === "deciding" && (
                    <motion.div
                      key="deciding"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center space-y-8"
                    >
                      <div>
                        <p className="text-2xl font-bold text-white mb-2">Make Your Choice!</p>
                        <p className="text-slate-400">Pot: {formatCurrency((roundData?.betAmount || 0) * 2)}</p>
                      </div>
                      
                      <div className="flex gap-6">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleChoice("split")}
                          className="w-40 h-40 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 border-2 border-green-500/50 flex flex-col items-center justify-center gap-3 hover:border-green-400 hover:bg-green-500/30 transition-all"
                          data-testid="button-split"
                        >
                          <Handshake className="w-16 h-16 text-green-400" />
                          <span className="text-xl font-bold text-green-400">SPLIT</span>
                        </motion.button>
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleChoice("steal")}
                          className="w-40 h-40 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/20 border-2 border-red-500/50 flex flex-col items-center justify-center gap-3 hover:border-red-400 hover:bg-red-500/30 transition-all"
                          data-testid="button-steal"
                        >
                          <Swords className="w-16 h-16 text-red-400" />
                          <span className="text-xl font-bold text-red-400">STEAL</span>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {gameState === "suspense" && (
                    <motion.div
                      key="suspense"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center space-y-6"
                    >
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center">
                            <User className="w-10 h-10 text-blue-400" />
                          </div>
                          <span className="mt-2 text-sm text-blue-400 font-medium">Choice Made</span>
                        </div>
                        <span className="text-2xl text-slate-500">VS</span>
                        <div className="flex flex-col items-center">
                          <motion.div 
                            className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center"
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                          >
                            <Bot className="w-10 h-10 text-red-400" />
                          </motion.div>
                          <span className="mt-2 text-sm text-slate-400">Thinking...</span>
                        </div>
                      </div>
                      
                      <motion.p
                        className="text-xl text-slate-300"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        AI is deciding...
                      </motion.p>
                    </motion.div>
                  )}

                  {gameState === "result" && result && (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center space-y-6"
                    >
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1",
                            result.playerChoice === "split" 
                              ? "bg-green-500/20 border-2 border-green-500" 
                              : "bg-red-500/20 border-2 border-red-500"
                          )}>
                            {result.playerChoice === "split" ? (
                              <Handshake className="w-10 h-10 text-green-400" />
                            ) : (
                              <Swords className="w-10 h-10 text-red-400" />
                            )}
                            <span className={cn(
                              "text-sm font-bold uppercase",
                              result.playerChoice === "split" ? "text-green-400" : "text-red-400"
                            )}>
                              {result.playerChoice}
                            </span>
                          </div>
                          <span className="mt-2 text-sm text-slate-400">You</span>
                        </div>
                        
                        <span className="text-2xl text-slate-500">VS</span>
                        
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1",
                            result.aiChoice === "split" 
                              ? "bg-green-500/20 border-2 border-green-500" 
                              : "bg-red-500/20 border-2 border-red-500"
                          )}>
                            {result.aiChoice === "split" ? (
                              <Handshake className="w-10 h-10 text-green-400" />
                            ) : (
                              <Swords className="w-10 h-10 text-red-400" />
                            )}
                            <span className={cn(
                              "text-sm font-bold uppercase",
                              result.aiChoice === "split" ? "text-green-400" : "text-red-400"
                            )}>
                              {result.aiChoice}
                            </span>
                          </div>
                          <span className="mt-2 text-sm text-slate-400">AI</span>
                        </div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        {result.won ? (
                          <p className="text-4xl font-bold text-green-400">
                            +{formatCurrency(result.payout)}
                          </p>
                        ) : (
                          <p className="text-4xl font-bold text-red-400">
                            -{formatCurrency(roundData?.betAmount || 0)}
                          </p>
                        )}
                        <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
                          {getOutcomeExplanation()}
                        </p>
                      </motion.div>

                      <Button
                        onClick={resetGame}
                        size="lg"
                        className="bg-slate-700 hover:bg-slate-600"
                        data-testid="button-play-again"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Play Again
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0d1821] rounded-xl border border-[#1e2a36] p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-slate-400">Bet Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isLocked}
                      className="pl-7 bg-slate-800/50 border-slate-700"
                      data-testid="input-bet-amount"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[0.1, 0.25, 0.5, 1].map((percent) => (
                    <Button
                      key={percent}
                      variant="outline"
                      size="sm"
                      onClick={() => setPercent(percent)}
                      disabled={isLocked}
                      className="text-xs"
                      data-testid={`button-percent-${percent * 100}`}
                    >
                      {percent === 1 ? "MAX" : `${percent * 100}%`}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Your Balance</span>
                    <span className="text-white font-medium">{formatCurrency(user?.balance || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Pot Value</span>
                    <span className="text-yellow-400 font-medium">
                      {gameState !== "idle" ? formatCurrency((roundData?.betAmount || 0) * 2) : formatCurrency(baseAmount * 2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0d1821] rounded-xl border border-[#1e2a36] p-4">
              <h3 className="font-semibold text-white mb-3">Payouts</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Both Split</span>
                  <span className="text-green-400">{((1 + GAME_CONFIG.splitBonus) * 100).toFixed(0)}% return</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">You Steal, AI Splits</span>
                  <span className="text-yellow-400">{((2 * (1 - GAME_CONFIG.houseEdge)) * 100).toFixed(0)}% return</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">You Split, AI Steals</span>
                  <span className="text-red-400">0% return</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Both Steal</span>
                  <span className="text-slate-500">0% return</span>
                </div>
                <div className="pt-2 border-t border-slate-700 flex justify-between">
                  <span className="text-slate-400">House Edge</span>
                  <span className="text-slate-300">{(GAME_CONFIG.houseEdge * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0d1821] rounded-xl border border-[#1e2a36] p-4">
              <h3 className="font-semibold text-white mb-3">AI Behavior</h3>
              <p className="text-sm text-slate-400">
                The AI learns from your patterns. If you steal often, it may become more defensive. 
                Cooperative players might find a friendlier opponent.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
