import { useState, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useMinesGame } from "@/hooks/use-games";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Bomb, Gem, Skull, Shield, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";

export default function Mines() {
  const { start, reveal, cashout } = useMinesGame();
  const { user } = useAuth(); // Could be used to restore state if needed

  const [minesCount, setMinesCount] = useState<string>("3");
  const [gameState, setGameState] = useState<{
    active: boolean;
    betId?: number;
    revealed: number[];
    mines?: number[]; // Only present when game ends
    profit: number; // Current profit
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
          // Game Over (Lost)
          setGameState(prev => ({
            ...prev,
            active: false,
            mines: data.result.mines,
            explodedIndex: index
          }));
        } else {
          // Keep Playing
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

  // Helper utility for frontend prediction (would usually come from backend state)
  // This is a simplified calculation for display purposes
  const calculateMultiplier = (revealedCount: number, mines: number) => {
    // Basic probability math for display only - real calc is on backend
    let multiplier = 1;
    for(let i=0; i<revealedCount; i++) {
        multiplier *= (25 - i) / (25 - mines - i);
    }
    // Apply house edge
    return multiplier * GAME_CONFIG.RTP;
  };

  const calculatePotentialProfit = (bet: number, revealedCount: number, mines: number) => {
    return bet * calculateMultiplier(revealedCount, mines) - bet;
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        {/* Controls */}
        <div className="w-full lg:w-auto lg:shrink-0 rounded-2xl overflow-hidden shadow-2xl flex flex-col bg-card border border-border">
          <div className="bg-card border-b border-border p-4 lg:hidden">
             <h2 className="font-display font-bold text-xl flex items-center gap-2">
               <Bomb className="w-6 h-6 text-primary" /> Mines
             </h2>
          </div>
          
          <div className="p-4 lg:p-6 border-b border-border space-y-2">
            <Label>Mines Count</Label>
            <Select 
              value={minesCount} 
              onValueChange={setMinesCount} 
              disabled={gameState.active}
            >
              <SelectTrigger className="h-12 bg-secondary/50 border-input font-bold">
                <SelectValue placeholder="Select mines" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 10, 15, 20, 24].map(num => (
                  <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <BetControls 
             onBet={handleBet} 
             isPending={start.isPending || gameState.active} 
             actionLabel={gameState.active ? "Game in Progress" : "Bet"}
             disabled={gameState.active}
             className="border-none shadow-none"
          />

          {gameState.active && (
            <div className="p-4 bg-primary/10 border-t border-primary/20">
               <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-muted-foreground">Current Profit</span>
                  <span className="text-lg font-mono font-bold text-primary text-glow">
                    ${gameState.profit.toFixed(2)}
                  </span>
               </div>
               <Button 
                 onClick={handleCashout} 
                 className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                 disabled={cashout.isPending || gameState.revealed.length === 0}
               >
                 {cashout.isPending ? "Cashing out..." : "Cashout"}
               </Button>
            </div>
          )}
        </div>

        {/* Game Grid */}
        <Card className="flex-1 bg-card border-border p-6 lg:p-12 flex items-center justify-center min-h-[500px] relative">
          
          {/* House Edge Note */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/50 rounded-full border border-border">
              <Info className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-medium text-amber-400">Edge: {GAME_CONFIG.HOUSE_EDGE_PERCENT}%</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/50 rounded-full border border-border">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Fair Play</span>
            </div>
          </div>
          
          <div className="grid grid-cols-5 gap-3 sm:gap-4 w-full max-w-[500px] aspect-square">
            {Array.from({ length: 25 }).map((_, i) => {
              const isRevealed = gameState.revealed.includes(i);
              const isMine = !gameState.active && gameState.mines?.includes(i);
              const isExploded = i === gameState.explodedIndex;
              const isSafeRevealed = !gameState.active && !isMine && !isRevealed; // Show unrevealed gems at end

              return (
                <motion.button
                  key={i}
                  whileHover={!gameState.active && !isRevealed ? { scale: 1.05 } : {}}
                  whileTap={!gameState.active && !isRevealed ? { scale: 0.95 } : {}}
                  onClick={() => handleTileClick(i)}
                  disabled={!gameState.active || isRevealed}
                  className={cn(
                    "rounded-xl relative shadow-lg transition-all duration-300 w-full h-full",
                    // Base styles
                    "bg-secondary/40 border-b-4 border-black/20",
                    // Interactive states
                    gameState.active && !isRevealed && "hover:bg-secondary/60 cursor-pointer",
                    // Revealed State
                    isRevealed && "bg-card border-transparent shadow-none",
                    // Game Over States
                    isExploded && "bg-destructive/20 border-destructive",
                    isMine && !isExploded && "bg-secondary/20 opacity-50",
                    isSafeRevealed && "bg-primary/5 opacity-50"
                  )}
                >
                  <AnimatePresence>
                    {isRevealed && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                         <Gem className="w-1/2 h-1/2 text-primary drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                      </motion.div>
                    )}
                    
                    {isMine && (
                      <motion.div
                         initial={{ scale: 0, opacity: 0 }}
                         animate={{ scale: 1, opacity: 1 }}
                         className="absolute inset-0 flex items-center justify-center"
                      >
                         {isExploded ? (
                            <Skull className="w-1/2 h-1/2 text-destructive drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                         ) : (
                            <Bomb className="w-1/2 h-1/2 text-muted-foreground" />
                         )}
                      </motion.div>
                    )}

                    {isSafeRevealed && (
                       <motion.div
                         initial={{ scale: 0, opacity: 0 }}
                         animate={{ scale: 0.8, opacity: 0.3 }}
                         className="absolute inset-0 flex items-center justify-center grayscale"
                       >
                          <Gem className="w-1/2 h-1/2 text-muted-foreground" />
                       </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
