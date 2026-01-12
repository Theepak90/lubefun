import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { useMinesGame } from "@/hooks/use-games";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, Gem, Skull, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useToast } from "@/hooks/use-toast";

export default function Mines() {
  const { start, reveal, cashout } = useMinesGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("10");
  const [minesCount, setMinesCount] = useState<string>("3");
  const [gameState, setGameState] = useState<{
    active: boolean;
    betId?: number;
    revealed: number[];
    mines?: number[];
    profit: number;
    multiplier: number;
    isCashout?: boolean;
    explodedIndex?: number;
  }>({
    active: false,
    revealed: [],
    profit: 0,
    multiplier: 1.0
  });
  const [isShaking, setIsShaking] = useState(false);
  const [showWinPulse, setShowWinPulse] = useState(false);

  const calculateMultiplier = (revealedCount: number, mines: number) => {
    let multiplier = 1;
    for(let i=0; i<revealedCount; i++) {
      multiplier *= (25 - i) / (25 - mines - i);
    }
    return multiplier * GAME_CONFIG.RTP;
  };

  const calculatePotentialProfit = (bet: number, revealedCount: number, mines: number) => {
    return bet * calculateMultiplier(revealedCount, mines) - bet;
  };

  const handleBet = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0.1) return;
    
    playSound("bet");
    start.mutate({ betAmount: val, minesCount: parseInt(minesCount) }, {
      onSuccess: (data: any) => {
        setGameState({
          active: true,
          betId: data.id,
          revealed: [],
          profit: 0,
          multiplier: 1.0
        });
      }
    });
  };

  const handleTileClick = (index: number) => {
    if (!gameState.active || gameState.revealed.includes(index) || reveal.isPending) return;
    
    // Optimistically reveal the tile immediately
    setGameState(prev => ({
      ...prev,
      revealed: [...prev.revealed, index],
    }));
    
    reveal.mutate({ betId: gameState.betId!, tileIndex: index }, {
      onSuccess: (data: any) => {
        if (!data || data.active === false) {
          setGameState(prev => ({
            ...prev,
            active: false,
            mines: data?.result?.mines,
            explodedIndex: index
          }));
          
          if (data) {
            playSound("lose");
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            
            recordResult("mines", data.betAmount, 0, false);
            
            toast({
              title: "You lost",
              description: `Lost ${formatCurrency(data.betAmount)} (profit ${formatCurrency(-data.betAmount)})`,
              duration: 1500,
            });
            
            addResult({
              game: "mines",
              betAmount: data.betAmount,
              won: false,
              profit: -data.betAmount,
              detail: `Hit mine after ${data.result.revealed.length - 1} gems`
            });
          }
        } else {
          playSound("tick");
          
          setGameState(prev => ({
            ...prev,
            profit: calculatePotentialProfit(data.betAmount, data.result.revealed.length, parseInt(minesCount)),
            multiplier: calculateMultiplier(data.result.revealed.length, parseInt(minesCount))
          }));
        }
      },
      onError: () => {
        setGameState(prev => ({
          ...prev,
          revealed: prev.revealed.filter(i => i !== index)
        }));
      }
    });
  };

  const handleCashout = () => {
    if (!gameState.active || !gameState.betId) return;
    
    cashout.mutate({ betId: gameState.betId }, {
      onSuccess: (data: any) => {
        setGameState(prev => ({
          ...prev,
          active: false,
          mines: data.result.mines,
          isCashout: true
        }));
        
        playSound("win");
        setShowWinPulse(true);
        setTimeout(() => setShowWinPulse(false), 600);
        
        const payout = data.betAmount + data.profit;
        recordResult("mines", data.betAmount, payout, true);
        
        toast({
          title: "You won!",
          description: `Won ${formatCurrency(payout)} (profit ${formatCurrency(data.profit)})`,
          duration: 1500,
        });
        
        addResult({
          game: "mines",
          betAmount: data.betAmount,
          won: true,
          profit: data.profit,
          detail: `Cashed out with ${data.result.revealed.length} gems (${data.payoutMultiplier.toFixed(2)}x)`
        });
      }
    });
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
        {/* Single unified game frame */}
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
              {/* Manual/Auto Tabs */}
              <div className="flex bg-[#0d1419] rounded-lg p-1 mb-5 border border-[#1a2530]">
                <button className="flex-1 py-2 rounded-md text-xs font-semibold bg-[#1a2530] text-white">
                  Manual
                </button>
                <button className="flex-1 py-2 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors">
                  Auto
                </button>
              </div>

              {/* Bet Amount */}
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
                    min={1}
                    max={1000}
                    disabled={gameState.active}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={gameState.active}
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={gameState.active}
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
                      disabled={gameState.active}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mines Count */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Mines
                </Label>
                <Select 
                  value={minesCount} 
                  onValueChange={setMinesCount} 
                  disabled={gameState.active}
                >
                  <SelectTrigger className="h-9 bg-[#0d1419] border-[#1a2530] text-white font-semibold">
                    <SelectValue placeholder="Select mines" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111921] border-[#1a2530]">
                    {[1, 2, 3, 4, 5, 10, 15, 20, 24].map(num => (
                      <SelectItem key={num} value={num.toString()} className="text-white hover:bg-[#1a2530]">
                        {num} {num === 1 ? 'Mine' : 'Mines'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Current Profit (when game active) */}
              {gameState.active && (
                <div className="space-y-2 mb-5">
                  <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Current Profit
                  </Label>
                  <div className="bg-[#0d1419] border border-emerald-500/30 rounded-lg px-3 py-2.5">
                    <span className="font-mono font-semibold text-emerald-400 text-sm">
                      +${gameState.profit.toFixed(2)} ({gameState.multiplier.toFixed(2)}x)
                    </span>
                  </div>
                </div>
              )}

              {/* Place Bet / Cashout Button */}
              {gameState.active ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]" 
                  onClick={handleCashout}
                  disabled={cashout.isPending || gameState.revealed.length === 0}
                  data-testid="button-cashout"
                >
                  {cashout.isPending ? "Cashing out..." : `Cashout $${(parseFloat(amount) + gameState.profit).toFixed(2)}`}
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={handleBet}
                  disabled={start.isPending || !user || parseFloat(amount) > (user?.balance || 0)}
                  data-testid="button-place-bet"
                >
                  {start.isPending ? "Starting..." : user ? "Place Bet" : "Login to Play"}
                </Button>
              )}
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[520px]">
              
              {/* Fair Play Badge + Profit Tracker */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <ProfitTrackerWidget gameId="mines" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Game Grid */}
              <motion.div 
                className={cn(
                  "grid grid-cols-5 gap-2 sm:gap-3 w-full max-w-[400px] relative",
                  showWinPulse && "ring-2 ring-emerald-500/50 rounded-xl"
                )}
                animate={isShaking ? { 
                  x: [0, -8, 8, -6, 6, -4, 4, 0],
                  transition: { duration: 0.5 }
                } : {}}
              >
                {showWinPulse && (
                  <motion.div 
                    className="absolute inset-0 bg-emerald-500/10 rounded-xl pointer-events-none"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: [0, 0.5, 0], scale: [0.95, 1.02, 1] }}
                    transition={{ duration: 0.6 }}
                  />
                )}
                {Array.from({ length: 25 }).map((_, i) => {
                  const isRevealed = gameState.revealed.includes(i);
                  const isMine = !gameState.active && gameState.mines?.includes(i);
                  const isExploded = i === gameState.explodedIndex;
                  const isSafeRevealed = !gameState.active && !isMine && !isRevealed;

                  return (
                    <motion.button
                      key={i}
                      whileHover={gameState.active && !isRevealed ? { scale: 1.05 } : {}}
                      whileTap={gameState.active && !isRevealed ? { scale: 0.95 } : {}}
                      onClick={() => handleTileClick(i)}
                      disabled={!gameState.active || isRevealed}
                      className={cn(
                        "aspect-square rounded-xl relative shadow-lg transition-all duration-100",
                        "bg-[#1a2530] border border-[#2a3a4a]",
                        gameState.active && !isRevealed && "hover:bg-[#1e2a38] hover:border-emerald-500/50 cursor-pointer",
                        isRevealed && "bg-[#111921] border-emerald-500/30",
                        isExploded && "bg-red-500/20 border-red-500",
                        isMine && !isExploded && "bg-[#1a2530]/50 opacity-60",
                        isSafeRevealed && "bg-[#1a2530]/30 opacity-40"
                      )}
                      data-testid={`tile-${i}`}
                    >
                      <AnimatePresence>
                        {isRevealed && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <Gem className="w-1/2 h-1/2 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          </motion.div>
                        )}
                        
                        {isMine && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            {isExploded ? (
                              <Skull className="w-1/2 h-1/2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                            ) : (
                              <Bomb className="w-1/2 h-1/2 text-slate-500" />
                            )}
                          </motion.div>
                        )}

                        {isSafeRevealed && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 0.8, opacity: 0.4 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <Gem className="w-1/2 h-1/2 text-slate-600" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </motion.div>

              {/* Bottom Stats Row */}
              <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-[400px]">
                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Next Multiplier
                  </label>
                  <Input 
                    type="text"
                    value={`${calculateMultiplier(gameState.revealed.length + 1, parseInt(minesCount)).toFixed(4)}x`}
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                  />
                </div>

                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Gems Found
                  </label>
                  <Input 
                    type="text"
                    value={`${gameState.revealed.length} / ${25 - parseInt(minesCount)}`}
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="mines"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
