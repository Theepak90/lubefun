import { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Swords, RotateCcw, User, Search, Users } from "lucide-react";
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
  matchmakingDelayMs: 1500,
  opponentThinkingDelayMs: 1200
};

const FAKE_USERNAMES = [
  "CryptoKing99", "LuckyDave", "HighRoller_", "xXShadowXx", "DiamondHands",
  "BetMaster", "GoldenAce", "WinnerTakes", "RiskTaker42", "SplitQueen",
  "StealKing", "CoinFlip_Pro", "JackpotJoe", "AllIn_Andy", "PokerFace",
  "BigWinner", "LuckyStar7", "RoyalFlush", "ChipLeader", "HighStakes",
  "TheGambler", "AceOfSpades", "BetBig_Win", "CashKing", "DiceRoller",
  "FortuneSeeker", "GoldRush", "HotStreak", "IceCold", "Jackpot_Hunter",
  "KingOfBets", "LadyLuck", "MoneyMaker", "NightOwl", "OddsBeater",
  "ProfitPro", "QuickDraw", "RiskyBiz", "SlotMachine", "TopDog",
  "UltraWinner", "VegasVibes", "WagerWizard", "Xtreme_Bet", "YoloBets",
  "ZeroFear", "AlphaPlayer", "BraveBet", "ClutchKing", "DareDevil"
];

type GameState = "idle" | "matchmaking" | "waitingForPlayerChoice" | "opponentChoosing" | "result";

interface GameResult {
  playerChoice: "split" | "steal";
  opponentChoice: "split" | "steal";
  payout: number;
  won: boolean;
  balanceAfter: number;
}

function getRandomOpponent(): string {
  return FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)];
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
  const [betAmount, setBetAmount] = useState<number>(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [playerChoice, setPlayerChoice] = useState<"split" | "steal" | null>(null);
  const [opponent, setOpponent] = useState<string>("");

  const baseAmount = parseFloat(amount || "0");

  const { mutate: playGame } = useMutation({
    mutationFn: async (data: { betAmount: number; playerChoice: "split" | "steal" }) => {
      const res = await apiRequest("POST", "/api/games/splitsteal", data);
      return res.json();
    },
    onSuccess: (data: GameResult) => {
      setTimeout(() => {
        setResult(data);
        setGameState("result");
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });

        if (data.won) {
          playSound("win");
          toast({
            title: data.playerChoice === "split" && data.opponentChoice === "split" ? "Both Split!" : "You Stole!",
            description: `You won ${formatCurrency(data.payout)}!`,
            duration: 2000,
          });
        } else {
          playSound("lose");
          const message = data.playerChoice === "steal" && data.opponentChoice === "steal" 
            ? "Both stole - nobody wins!" 
            : `${opponent} stole your share!`;
          toast({
            title: "You Lost!",
            description: message,
            duration: 2000,
          });
        }

        const profit = data.payout - betAmount;
        addResult({
          game: "splitsteal",
          betAmount,
          won: data.won,
          profit,
          detail: `${data.playerChoice.toUpperCase()} vs ${data.opponentChoice.toUpperCase()}`
        });
        recordResult("splitsteal", betAmount, data.payout, data.won);
      }, GAME_CONFIG.opponentThinkingDelayMs);
    },
    onError: (error: Error) => {
      console.error('[SplitSteal] Play error:', error);
      setGameState("idle");
      setPlayerChoice(null);
      toast({ title: "Error", description: error.message || "Failed to play game", duration: 2000 });
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
    
    setBetAmount(baseAmount);
    setOpponent(getRandomOpponent());
    setGameState("matchmaking");
    playSound("flip");

    setTimeout(() => {
      setGameState("waitingForPlayerChoice");
    }, GAME_CONFIG.matchmakingDelayMs);
  }, [baseAmount, user?.balance, gameState, playSound, toast]);

  const handleChoice = useCallback((choice: "split" | "steal") => {
    if (gameState !== "waitingForPlayerChoice") return;
    
    setPlayerChoice(choice);
    setGameState("opponentChoosing");
    playSound("flip");
    
    playGame({ betAmount, playerChoice: choice });
  }, [gameState, betAmount, playGame, playSound]);

  const resetGame = () => {
    setGameState("idle");
    setBetAmount(0);
    setResult(null);
    setPlayerChoice(null);
    setOpponent("");
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    const newAmount = Math.floor(user.balance * percent * 100) / 100;
    setAmount(newAmount.toFixed(2));
  };

  const getOutcomeExplanation = () => {
    if (!result) return "";
    const { playerChoice, opponentChoice } = result;
    if (playerChoice === "split" && opponentChoice === "split") {
      return `Both chose to SPLIT! You get your bet back plus a ${(GAME_CONFIG.splitBonus * 100).toFixed(0)}% bonus.`;
    }
    if (playerChoice === "steal" && opponentChoice === "split") {
      return `You STOLE while ${opponent} chose SPLIT! You take the entire pot.`;
    }
    if (playerChoice === "split" && opponentChoice === "steal") {
      return `You chose SPLIT but ${opponent} STOLE everything! You lost your bet.`;
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
              Trust or betray - you decide
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
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-24 h-24 rounded-full bg-purple-500/20 border-2 border-purple-500/50 flex items-center justify-center">
                          <Users className="w-12 h-12 text-purple-400" />
                        </div>
                        <p className="text-xl text-slate-300 font-medium">Play against another player</p>
                      </div>
                      
                      <div className="space-y-2 max-w-md">
                        <p className="text-slate-300 text-lg font-medium">How to Play</p>
                        <div className="text-sm text-slate-400 space-y-1 text-left">
                          <p className="flex gap-2"><Handshake className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> <span><strong>Both SPLIT:</strong> You win {((1 + GAME_CONFIG.splitBonus) * 100).toFixed(0)}% of your bet</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" /> <span><strong>You STEAL, they SPLIT:</strong> You win {((2 * (1 - GAME_CONFIG.houseEdge)) * 100).toFixed(0)}% of your bet</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> <span><strong>You SPLIT, they STEAL:</strong> You lose everything</span></p>
                          <p className="flex gap-2"><Swords className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" /> <span><strong>Both STEAL:</strong> Nobody wins</span></p>
                        </div>
                      </div>

                      <Button
                        onClick={handleStartGame}
                        disabled={!user || baseAmount <= 0}
                        size="lg"
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-12 py-6 text-xl font-bold"
                        data-testid="button-start-game"
                      >
                        {`Play ${formatCurrency(baseAmount)}`}
                      </Button>
                    </motion.div>
                  )}

                  {gameState === "matchmaking" && (
                    <motion.div
                      key="matchmaking"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center space-y-6"
                    >
                      <motion.div 
                        className="w-24 h-24 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center mx-auto"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Search className="w-12 h-12 text-purple-400" />
                      </motion.div>
                      
                      <div>
                        <motion.p
                          className="text-2xl font-bold text-white"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          Finding player...
                        </motion.p>
                        <p className="text-slate-400 mt-2">Pot: {formatCurrency(betAmount * 2)}</p>
                      </div>
                    </motion.div>
                  )}

                  {gameState === "waitingForPlayerChoice" && (
                    <motion.div
                      key="deciding"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="text-center space-y-6"
                    >
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/50 flex items-center justify-center">
                            <User className="w-8 h-8 text-blue-400" />
                          </div>
                          <span className="mt-2 text-sm text-slate-400">You</span>
                        </div>
                        <span className="text-xl text-slate-500">VS</span>
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-orange-500/20 border-2 border-orange-500/50 flex items-center justify-center">
                            <User className="w-8 h-8 text-orange-400" />
                          </div>
                          <span className="mt-2 text-sm text-orange-400 font-medium">{opponent}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-2xl font-bold text-white mb-2">Make Your Choice!</p>
                        <p className="text-slate-400">Pot: {formatCurrency(betAmount * 2)}</p>
                      </div>
                      
                      <div className="flex gap-6">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleChoice("split")}
                          className="w-36 h-36 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 border-2 border-green-500/50 flex flex-col items-center justify-center gap-3 hover:border-green-400 hover:bg-green-500/30 transition-all"
                          data-testid="button-split"
                        >
                          <Handshake className="w-14 h-14 text-green-400" />
                          <span className="text-lg font-bold text-green-400">SPLIT</span>
                        </motion.button>
                        
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleChoice("steal")}
                          className="w-36 h-36 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/20 border-2 border-red-500/50 flex flex-col items-center justify-center gap-3 hover:border-red-400 hover:bg-red-500/30 transition-all"
                          data-testid="button-steal"
                        >
                          <Swords className="w-14 h-14 text-red-400" />
                          <span className="text-lg font-bold text-red-400">STEAL</span>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {gameState === "opponentChoosing" && (
                    <motion.div
                      key="opponent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center space-y-6"
                    >
                      <div className="flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center border-2",
                            playerChoice === "split" 
                              ? "bg-green-500/20 border-green-500" 
                              : "bg-red-500/20 border-red-500"
                          )}>
                            {playerChoice === "split" ? (
                              <Handshake className="w-8 h-8 text-green-400" />
                            ) : (
                              <Swords className="w-8 h-8 text-red-400" />
                            )}
                          </div>
                          <span className={cn(
                            "mt-2 text-sm font-medium",
                            playerChoice === "split" ? "text-green-400" : "text-red-400"
                          )}>
                            {playerChoice?.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xl text-slate-500">VS</span>
                        <div className="flex flex-col items-center">
                          <motion.div 
                            className="w-16 h-16 rounded-full bg-orange-500/20 border-2 border-orange-500/50 flex items-center justify-center"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                          >
                            <User className="w-8 h-8 text-orange-400" />
                          </motion.div>
                          <span className="mt-2 text-sm text-orange-400">{opponent}</span>
                        </div>
                      </div>
                      
                      <motion.p
                        className="text-xl text-slate-300"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      >
                        {opponent} is choosing...
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
                            "w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1",
                            result.playerChoice === "split" 
                              ? "bg-green-500/20 border-2 border-green-500" 
                              : "bg-red-500/20 border-2 border-red-500"
                          )}>
                            {result.playerChoice === "split" ? (
                              <Handshake className="w-8 h-8 text-green-400" />
                            ) : (
                              <Swords className="w-8 h-8 text-red-400" />
                            )}
                            <span className={cn(
                              "text-xs font-bold uppercase",
                              result.playerChoice === "split" ? "text-green-400" : "text-red-400"
                            )}>
                              {result.playerChoice}
                            </span>
                          </div>
                          <span className="mt-2 text-sm text-slate-400">You</span>
                        </div>
                        
                        <span className="text-xl text-slate-500">VS</span>
                        
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1",
                            result.opponentChoice === "split" 
                              ? "bg-green-500/20 border-2 border-green-500" 
                              : "bg-red-500/20 border-2 border-red-500"
                          )}>
                            {result.opponentChoice === "split" ? (
                              <Handshake className="w-8 h-8 text-green-400" />
                            ) : (
                              <Swords className="w-8 h-8 text-red-400" />
                            )}
                            <span className={cn(
                              "text-xs font-bold uppercase",
                              result.opponentChoice === "split" ? "text-green-400" : "text-red-400"
                            )}>
                              {result.opponentChoice}
                            </span>
                          </div>
                          <span className="mt-2 text-sm text-orange-400">{opponent}</span>
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
                            -{formatCurrency(betAmount)}
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
                      disabled={gameState !== "idle"}
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
                      disabled={gameState !== "idle"}
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
                      {gameState !== "idle" ? formatCurrency(betAmount * 2) : formatCurrency(baseAmount * 2)}
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
                  <span className="text-slate-400">You Steal, They Split</span>
                  <span className="text-yellow-400">{((2 * (1 - GAME_CONFIG.houseEdge)) * 100).toFixed(0)}% return</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">You Split, They Steal</span>
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
              <h3 className="font-semibold text-white mb-3">How It Works</h3>
              <p className="text-sm text-slate-400">
                You'll be matched with another player. Both of you choose to SPLIT or STEAL simultaneously.
                Trust leads to shared rewards, betrayal can pay big - or cost everything.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
