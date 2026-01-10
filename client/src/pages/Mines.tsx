import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useMinesGame } from "@/hooks/use-games";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, Gem, Skull, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Mines() {
  const { start, reveal, cashout } = useMinesGame();

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

  const handleBet = (amount: number) => {
    start.mutate({ betAmount: amount, minesCount: parseInt(minesCount) }, {
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
    
    reveal.mutate({ betId: gameState.betId!, tileIndex: index }, {
      onSuccess: (data: any) => {
        if (!data.active) {
          setGameState(prev => ({
            ...prev,
            active: false,
            mines: data.result.mines,
            explodedIndex: index
          }));
        } else {
          setGameState(prev => ({
             ...prev,
             revealed: [...prev.revealed, index],
             profit: calculatePotentialProfit(data.betAmount, data.result.revealed.length, parseInt(minesCount)),
             multiplier: calculateMultiplier(data.result.revealed.length, parseInt(minesCount))
          }));
        }
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
      }
    });
  };

  const calculateMultiplier = (revealedCount: number, mines: number) => {
    let multiplier = 1;
    for(let i=0; i<revealedCount; i++) {
        multiplier *= (25 - i) / (25 - mines - i);
    }
    return multiplier;
  };

  const calculatePotentialProfit = (bet: number, revealedCount: number, mines: number) => {
    return bet * calculateMultiplier(revealedCount, mines) - bet;
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
        {/* Controls */}
        <div className="w-full lg:w-80 lg:shrink-0 flex flex-col gap-4">
          <div className="neon-card p-5 lg:hidden">
             <h2 className="font-display font-bold text-lg flex items-center gap-2 text-purple-400 tracking-wider">
               <Bomb className="w-5 h-5" /> Mines
             </h2>
          </div>
          
          <div className="neon-card p-5">
            <Label className="text-xs font-display text-cyan-400 uppercase tracking-wider mb-3 block">Mines Count</Label>
            <Select 
              value={minesCount} 
              onValueChange={setMinesCount} 
              disabled={gameState.active}
            >
              <SelectTrigger className="h-12 bg-purple-900/30 border-purple-500/30 font-display font-bold text-foreground">
                <SelectValue placeholder="Select mines" />
              </SelectTrigger>
              <SelectContent className="bg-card border-purple-500/30">
                {[1, 2, 3, 4, 5, 10, 15, 20, 24].map(num => (
                  <SelectItem key={num} value={num.toString()} className="font-display">{num} Mines</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <BetControls 
             onBet={handleBet} 
             isPending={start.isPending || gameState.active} 
             actionLabel={gameState.active ? "Game Active" : "Start Game"}
             disabled={gameState.active}
             className="neon-card"
          />

          {gameState.active && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="neon-card neon-glow-cyan p-5"
            >
               <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-display text-cyan-400 uppercase tracking-wider">Profit</span>
                  <span className="text-2xl font-mono font-bold text-cyan-400 text-glow-cyan">
                    ${gameState.profit.toFixed(2)}
                  </span>
               </div>
               <Button 
                 onClick={handleCashout} 
                 className="w-full h-12 neon-button font-display font-bold text-black tracking-wider rounded-xl"
                 disabled={cashout.isPending || gameState.revealed.length === 0}
               >
                 <Zap className="w-4 h-4 mr-2" />
                 {cashout.isPending ? "Cashing..." : "Cashout"}
               </Button>
            </motion.div>
          )}
        </div>

        {/* Game Grid */}
        <div className="flex-1 neon-card p-6 lg:p-10 flex items-center justify-center min-h-[500px]">
          <div className="grid grid-cols-5 gap-3 w-full max-w-[480px] aspect-square">
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
                    "rounded-xl relative transition-all duration-300 w-full h-full border-2",
                    "bg-purple-900/30 border-purple-500/30",
                    gameState.active && !isRevealed && "hover:border-cyan-400/50 hover:bg-purple-800/40 cursor-pointer neon-hover",
                    isRevealed && "bg-cyan-500/20 border-cyan-400/50 neon-glow-cyan",
                    isExploded && "bg-pink-500/30 border-pink-400 neon-glow-magenta",
                    isMine && !isExploded && "bg-purple-900/20 border-purple-500/20 opacity-50",
                    isSafeRevealed && "bg-purple-900/20 border-purple-500/20 opacity-30"
                  )}
                >
                  <AnimatePresence>
                    {isRevealed && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0, rotate: -180 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                         <Gem className="w-1/2 h-1/2 text-cyan-400 drop-shadow-[0_0_15px_hsl(180,100%,50%)]" />
                      </motion.div>
                    )}
                    
                    {isMine && (
                      <motion.div
                         initial={{ scale: 0, opacity: 0 }}
                         animate={{ scale: 1, opacity: 1 }}
                         className="absolute inset-0 flex items-center justify-center"
                      >
                         {isExploded ? (
                            <Skull className="w-1/2 h-1/2 text-pink-400 drop-shadow-[0_0_15px_hsl(320,100%,60%)]" />
                         ) : (
                            <Bomb className="w-1/2 h-1/2 text-purple-400/60" />
                         )}
                      </motion.div>
                    )}

                    {isSafeRevealed && (
                       <motion.div
                         initial={{ scale: 0, opacity: 0 }}
                         animate={{ scale: 0.7, opacity: 0.3 }}
                         className="absolute inset-0 flex items-center justify-center"
                       >
                          <Gem className="w-1/2 h-1/2 text-purple-500/50" />
                       </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
