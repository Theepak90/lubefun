import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { useMinesGame } from "@/hooks/use-games";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, Gem, Skull, Shield, Info, X } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "@/lib/queryClient";

const GRID_SIZE = 25;

interface GameState {
  active: boolean;
  betId?: number;
  betAmount?: number;
  revealed: number[];
  mines?: number[];
  minesCount: number;
  multiplier: number;
  explodedIndex?: number;
  isCashout?: boolean;
}

const initialGameState: GameState = {
  active: false,
  revealed: [],
  minesCount: 3,
  multiplier: 1.0
};

export default function Mines() {
  const { start, reveal, cashout } = useMinesGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState<string>("10");
  const [minesCount, setMinesCount] = useState<number>(3);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isShaking, setIsShaking] = useState(false);
  const [showWinPulse, setShowWinPulse] = useState(false);
  const [winPopup, setWinPopup] = useState<{ show: boolean; amount: number; profit: number } | null>(null);
  const pendingClickRef = useRef<boolean>(false);

  const safeSpots = GRID_SIZE - minesCount;

  const { data: activeGame, isLoading: isLoadingActive } = useQuery<any>({
    queryKey: ['/api/games/mines/active'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (activeGame && activeGame.active) {
      const result = activeGame.result as any;
      setGameState({
        active: true,
        betId: activeGame.id,
        betAmount: activeGame.betAmount,
        revealed: result?.revealed || [],
        minesCount: result?.minesCount || 3,
        multiplier: activeGame.payoutMultiplier || 1.0,
        mines: undefined
      });
      setMinesCount(result?.minesCount || 3);
      setAmount(activeGame.betAmount.toString());
    } else if (activeGame === null && !gameState.mines) {
      setGameState(prev => prev.active ? initialGameState : prev);
    }
  }, [activeGame]);

  const calculateMultiplier = (revealedCount: number, mines: number) => {
    let multiplier = 1;
    for(let i = 0; i < revealedCount; i++) {
      multiplier *= (GRID_SIZE - i) / (GRID_SIZE - mines - i);
    }
    return multiplier * GAME_CONFIG.RTP;
  };

  const calculatePotentialProfit = (bet: number, revealedCount: number, mines: number) => {
    return bet * calculateMultiplier(revealedCount, mines) - bet;
  };

  const handleBet = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0.1) return;
    
    setWinPopup(null);
    setGameState(initialGameState);
    
    playSound("bet");
    start.mutate({ betAmount: val, minesCount: minesCount }, {
      onSuccess: (data: any) => {
        const result = data.result as any;
        setGameState({
          active: true,
          betId: data.id,
          betAmount: data.betAmount,
          revealed: result?.revealed || [],
          minesCount: result?.minesCount || minesCount,
          multiplier: 1.0,
          mines: undefined
        });
        queryClient.invalidateQueries({ queryKey: ['/api/games/mines/active'] });
      }
    });
  };

  const handleTileClick = (index: number) => {
    if (!gameState.active) return;
    if (gameState.revealed.includes(index)) return;
    if (pendingClickRef.current || reveal.isPending) return;
    
    pendingClickRef.current = true;
    playSound("minesClick");
    
    reveal.mutate({ betId: gameState.betId!, tileIndex: index }, {
      onSuccess: (data: any) => {
        pendingClickRef.current = false;
        const result = data.result as any;
        
        if (!data.active) {
          const isMine = result.mines?.includes(index);
          
          setGameState(prev => ({
            ...prev,
            active: false,
            revealed: result.revealed || prev.revealed,
            mines: result.mines,
            explodedIndex: isMine ? index : undefined,
            multiplier: data.payoutMultiplier || prev.multiplier
          }));
          
          if (isMine) {
            playSound("lose");
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            
            recordResult("mines", data.betAmount, 0, false);
            
            addResult({
              game: "mines",
              betAmount: data.betAmount,
              won: false,
              profit: -data.betAmount,
              detail: `Hit mine after ${(result.revealed?.length || 1) - 1} gems`
            });
          }
          
          queryClient.invalidateQueries({ queryKey: ['/api/games/mines/active'] });
        } else {
          playSound("tick");
          
          setGameState(prev => ({
            ...prev,
            revealed: result.revealed || prev.revealed,
            multiplier: data.payoutMultiplier || 1.0
          }));
        }
      },
      onError: () => {
        pendingClickRef.current = false;
      }
    });
  };

  const handleCashout = () => {
    if (!gameState.active || !gameState.betId) return;
    if (cashout.isPending) return;
    
    cashout.mutate({ betId: gameState.betId }, {
      onSuccess: (data: any) => {
        const result = data.result as any;
        
        setGameState(prev => ({
          ...prev,
          active: false,
          mines: result.mines,
          isCashout: true,
          multiplier: data.payoutMultiplier
        }));
        
        playSound("win");
        setShowWinPulse(true);
        setTimeout(() => setShowWinPulse(false), 600);
        
        const payout = data.betAmount + data.profit;
        recordResult("mines", data.betAmount, payout, true);
        
        setWinPopup({ show: true, amount: payout, profit: data.profit });
        
        addResult({
          game: "mines",
          betAmount: data.betAmount,
          won: true,
          profit: data.profit,
          detail: `Cashed out with ${result.revealed?.length || 0} gems (${data.payoutMultiplier?.toFixed(2) || '1.00'}x)`
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/games/mines/active'] });
      }
    });
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));
  const setMax = () => user && setAmount(user.balance.toFixed(2));

  const currentProfit = gameState.betAmount 
    ? calculatePotentialProfit(gameState.betAmount, gameState.revealed.length, gameState.minesCount)
    : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-[#0f1923] rounded-xl overflow-hidden border border-[#1a2c38]">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Panel - Controls */}
            <div className="lg:w-72 shrink-0 bg-[#0f1923] border-b lg:border-b-0 lg:border-r border-[#1a2c38] p-4">
              
              {/* Manual/Auto Toggle */}
              <div className="flex bg-[#1a2c38] rounded-full p-1 mb-6">
                <button className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-[#2f4553] text-white transition-all">
                  Manual
                </button>
                <button className="flex-1 py-2.5 rounded-full text-sm font-semibold text-[#5b7a8a] hover:text-white transition-colors">
                  Auto
                </button>
              </div>

              {/* Bet Amount */}
              <div className="space-y-2 mb-6">
                <Label className="text-xs text-[#5b7a8a] font-medium">Bet Amount</Label>
                <div className="flex bg-[#0d1a22] rounded-md border border-[#1a2c38] overflow-hidden">
                  <div className="flex items-center px-3 text-[#5b7a8a] text-sm">$</div>
                  <Input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="border-none bg-transparent h-10 focus-visible:ring-0 font-semibold text-white flex-1"
                    min={0.1}
                    disabled={gameState.active}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="px-3 h-10 text-xs font-medium text-[#5b7a8a] hover:text-white hover:bg-[#1a2c38] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={gameState.active}
                  >
                    ½
                  </button>
                  <button 
                    className="px-3 h-10 text-xs font-medium text-[#5b7a8a] hover:text-white hover:bg-[#1a2c38] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={gameState.active}
                  >
                    2×
                  </button>
                  <button 
                    className="px-3 h-10 text-xs font-medium text-[#5b7a8a] hover:text-white hover:bg-[#1a2c38] transition-all disabled:opacity-50"
                    onClick={setMax}
                    disabled={gameState.active}
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Number of Mines - Slider */}
              <div className="space-y-3 mb-6">
                <Label className="text-xs text-[#5b7a8a] font-medium">Number of Mines</Label>
                <div className="flex items-center gap-3 bg-[#1a2c38] rounded-lg p-3">
                  <div className="flex items-center gap-1.5">
                    <Gem className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-bold text-white">{GRID_SIZE - (gameState.active ? gameState.minesCount : minesCount)}</span>
                  </div>
                  <Slider
                    value={[gameState.active ? gameState.minesCount : minesCount]}
                    onValueChange={(val) => !gameState.active && setMinesCount(val[0])}
                    min={1}
                    max={24}
                    step={1}
                    disabled={gameState.active}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{gameState.active ? gameState.minesCount : minesCount}</span>
                    <Bomb className="w-4 h-4 text-red-500" />
                  </div>
                </div>
              </div>

              {/* Current Profit (when game active) */}
              {gameState.active && (
                <div className="space-y-2 mb-6 p-3 bg-[#1a2c38] rounded-lg border border-emerald-500/30">
                  <div className="text-xs text-[#5b7a8a] font-medium">Potential Win</div>
                  <div className="text-lg font-bold text-emerald-400">
                    ${((gameState.betAmount || 0) + currentProfit).toFixed(2)}
                    <span className="text-sm ml-2 text-emerald-300/70">({gameState.multiplier.toFixed(2)}×)</span>
                  </div>
                </div>
              )}

              {/* Play Button */}
              {gameState.active ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-base font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-md" 
                  onClick={handleCashout}
                  disabled={cashout.isPending || gameState.revealed.length === 0}
                  data-testid="button-cashout"
                >
                  {cashout.isPending ? "Cashing out..." : `Cashout $${((gameState.betAmount || 0) + currentProfit).toFixed(2)}`}
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-base font-bold bg-[#00e701] hover:bg-[#00c701] text-black rounded-md" 
                  onClick={handleBet}
                  disabled={start.isPending || isLoadingActive || !user || parseFloat(amount) > (user?.balance || 0)}
                  data-testid="button-place-bet"
                >
                  {start.isPending ? "Starting..." : isLoadingActive ? "Loading..." : user ? "Play" : "Login to Play"}
                </Button>
              )}

              {!user && (
                <p className="text-center text-xs text-[#5b7a8a] mt-3">
                  Enter a bet amount to start real play
                </p>
              )}
            </div>

            {/* Right Panel - Game Grid */}
            <div className="flex-1 p-4 lg:p-8 bg-[#0a1218] relative">
              
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#5b7a8a]" />
                  <div className="flex items-center gap-1.5">
                    <Bomb className="w-4 h-4 text-cyan-400" />
                    <span className="text-white font-semibold">Mines</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ProfitTrackerWidget gameId="mines" />
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2c38] rounded-full">
                    <Shield className="w-3.5 h-3.5 text-[#00e701]" />
                    <span className="text-xs font-medium text-[#00e701]">Fair Play</span>
                  </div>
                </div>
              </div>

              {/* Win Popup */}
              <AnimatePresence>
                {winPopup?.show && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm rounded-xl"
                  >
                    <motion.div
                      initial={{ y: 20 }}
                      animate={{ y: 0 }}
                      className="bg-gradient-to-b from-[#1a2c38] to-[#0f1923] border border-emerald-500/50 rounded-2xl p-8 text-center shadow-2xl shadow-emerald-500/20 max-w-sm mx-4 relative"
                    >
                      <button
                        onClick={() => setWinPopup(null)}
                        className="absolute top-4 right-4 text-[#5b7a8a] hover:text-white transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-full flex items-center justify-center"
                      >
                        <Gem className="w-10 h-10 text-white" />
                      </motion.div>
                      
                      <h2 className="text-2xl font-bold text-white mb-2">You Won!</h2>
                      
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-4xl font-bold text-emerald-400 mb-2"
                      >
                        ${winPopup.amount.toFixed(2)}
                      </motion.div>
                      
                      <p className="text-[#5b7a8a] text-sm mb-6">
                        Profit: <span className="text-emerald-400">+${winPopup.profit.toFixed(2)}</span>
                      </p>
                      
                      <Button
                        onClick={() => setWinPopup(null)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold"
                      >
                        Play Again
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Game Grid */}
              <div className="flex items-center justify-center">
                <motion.div 
                  className={cn(
                    "grid grid-cols-5 gap-2 sm:gap-2.5 w-full max-w-[400px]",
                    showWinPulse && "ring-2 ring-emerald-500/50 rounded-xl"
                  )}
                  animate={isShaking ? { 
                    x: [0, -8, 8, -6, 6, -4, 4, 0],
                    transition: { duration: 0.5 }
                  } : {}}
                >
                  {Array.from({ length: GRID_SIZE }).map((_, i) => {
                    const isMine = gameState.mines?.includes(i);
                    const isExploded = i === gameState.explodedIndex;
                    const isRevealed = gameState.revealed.includes(i);
                    const isGem = isRevealed && !isMine;
                    const isSafeUnrevealed = !gameState.active && gameState.mines && !isMine && !isRevealed;
                    const isPending = reveal.isPending || pendingClickRef.current;

                    return (
                      <motion.button
                        key={i}
                        whileHover={gameState.active && !isRevealed && !isPending ? { scale: 1.03 } : {}}
                        whileTap={gameState.active && !isRevealed && !isPending ? { scale: 0.97 } : {}}
                        onClick={() => handleTileClick(i)}
                        disabled={!gameState.active || isRevealed || isPending}
                        className={cn(
                          "aspect-square rounded-lg relative transition-all duration-100",
                          "bg-[#2f4553] border-2 border-[#3d5a6c]",
                          "shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.3)]",
                          gameState.active && !isRevealed && !isPending && "hover:bg-[#3a5565] hover:border-cyan-500/50 cursor-pointer",
                          isGem && "bg-[#1a2c38] border-emerald-500/50 shadow-none",
                          isExploded && "bg-red-900/60 border-red-500 shadow-none",
                          isMine && !isExploded && !gameState.active && "bg-[#1a2c38] border-red-500/30 shadow-none",
                          isSafeUnrevealed && "bg-[#1a2c38]/50 opacity-50 shadow-none",
                          isPending && !isRevealed && "opacity-70 cursor-not-allowed"
                        )}
                        data-testid={`tile-${i}`}
                      >
                        <AnimatePresence>
                          {isGem && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <Gem className="w-1/2 h-1/2 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                            </motion.div>
                          )}
                          
                          {isMine && !gameState.active && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.15, delay: isExploded ? 0 : 0.1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              {isExploded ? (
                                <Skull className="w-1/2 h-1/2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                              ) : (
                                <Bomb className="w-1/2 h-1/2 text-red-400" />
                              )}
                            </motion.div>
                          )}

                          {isSafeUnrevealed && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 0.8, opacity: 0.5 }}
                              transition={{ duration: 0.1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <Gem className="w-1/2 h-1/2 text-cyan-400/50" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </div>

              {/* Stats Row */}
              <div className="flex justify-center gap-4 mt-6">
                <div className="bg-[#1a2c38] rounded-lg px-4 py-2 text-center">
                  <div className="text-[10px] text-[#5b7a8a] uppercase tracking-wide mb-0.5">Next</div>
                  <div className="text-sm font-bold text-white">
                    {calculateMultiplier(gameState.revealed.length + 1, gameState.active ? gameState.minesCount : minesCount).toFixed(2)}×
                  </div>
                </div>
                <div className="bg-[#1a2c38] rounded-lg px-4 py-2 text-center">
                  <div className="text-[10px] text-[#5b7a8a] uppercase tracking-wide mb-0.5">Gems</div>
                  <div className="text-sm font-bold text-cyan-400">
                    {gameState.revealed.length} / {GRID_SIZE - (gameState.active ? gameState.minesCount : minesCount)}
                  </div>
                </div>
                <div className="bg-[#1a2c38] rounded-lg px-4 py-2 text-center">
                  <div className="text-[10px] text-[#5b7a8a] uppercase tracking-wide mb-0.5">Mines</div>
                  <div className="text-sm font-bold text-red-400">
                    {gameState.active ? gameState.minesCount : minesCount}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
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
