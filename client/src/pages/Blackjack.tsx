import { useState, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGameHistory } from "@/hooks/use-game-history";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BlackjackState {
  bet: any;
  playerCards: number[];
  dealerCards: number[];
  playerTotal: number;
  dealerTotal?: number;
  dealerShowing?: number;
  status: string;
  canDouble: boolean;
  outcome?: string;
  payout?: number;
}

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardRank(cardIndex: number): string {
  return RANKS[cardIndex % 13];
}

function getCardSuit(cardIndex: number): string {
  return SUITS[Math.floor(cardIndex / 13)];
}

function getCardValue(cardIndex: number): number {
  const rank = cardIndex % 13;
  if (rank === 0) return 11;
  if (rank >= 10) return 10;
  return rank + 1;
}

function calculateTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const value = getCardValue(card);
    total += value;
    if (value === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function Card({ cardIndex, hidden = false }: { cardIndex: number; hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-blue-500 flex items-center justify-center shadow-lg">
        <div className="w-10 h-14 rounded border-2 border-blue-400/50 bg-blue-800/50" />
      </div>
    );
  }

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  
  const SuitIcon = () => {
    const className = cn("w-4 h-4", isRed ? "text-red-500" : "text-slate-800");
    switch (suit) {
      case 'spades': return <span className={className}>♠</span>;
      case 'hearts': return <span className={className}>♥</span>;
      case 'diamonds': return <span className={className}>♦</span>;
      case 'clubs': return <span className={className}>♣</span>;
      default: return null;
    }
  };

  return (
    <div className="w-16 h-24 rounded-lg bg-white border-2 border-slate-200 flex flex-col items-center justify-center shadow-lg relative">
      <div className="absolute top-1 left-2 flex flex-col items-center">
        <span className={cn("text-xs font-bold", isRed ? "text-red-500" : "text-slate-800")}>{rank}</span>
        <SuitIcon />
      </div>
      <span className={cn("text-2xl font-bold", isRed ? "text-red-500" : "text-slate-800")}>{rank}</span>
      <SuitIcon />
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600/50 flex items-center justify-center opacity-30">
      <div className="w-10 h-14 rounded border border-slate-500/50" />
    </div>
  );
}

export default function Blackjack() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState<string>("1");
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const baseAmount = parseFloat(amount || "0");
  const isPlaying = gameState?.status === "playing";
  const isCompleted = gameState?.status === "completed";

  // Fetch active hand on mount
  const { data: activeHand, isLoading } = useQuery({
    queryKey: ["/api/games/blackjack/active"],
    enabled: !!user,
  });

  useEffect(() => {
    if (activeHand && activeHand.bet) {
      setGameState(activeHand);
    }
  }, [activeHand]);

  const dealMutation = useMutation({
    mutationFn: async (betAmount: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/deal", { betAmount });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setIsAnimating(true);
      setTimeout(() => {
        setGameState(data);
        setIsAnimating(false);
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        
        if (data.status === "completed" && data.outcome) {
          handleGameComplete(data);
        }
      }, 500);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to deal", variant: "destructive" });
    },
  });

  const hitMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/hit", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.status === "completed" && data.outcome) {
        handleGameComplete(data);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to hit", variant: "destructive" });
    },
  });

  const standMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/stand", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      handleGameComplete(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to stand", variant: "destructive" });
    },
  });

  const doubleMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/double", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      handleGameComplete(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to double", variant: "destructive" });
    },
  });

  const handleGameComplete = (data: BlackjackState) => {
    const outcomeLabel = data.outcome === "blackjack" ? "Blackjack!" :
                         data.outcome === "win" ? "Win" :
                         data.outcome === "push" ? "Push" : "Lose";
    
    const betAmount = data.bet?.betAmount || baseAmount;
    const profit = data.bet?.profit || 0;
    const won = data.outcome === "win" || data.outcome === "blackjack";
    const isPush = data.outcome === "push";
    const payout = won ? betAmount + profit : (isPush ? betAmount : 0);
    
    // Only record wins and losses - pushes are neutral and don't affect stats
    if (!isPush) {
      recordResult("blackjack", betAmount, payout, won);
    }
    
    if (isPush) {
      toast({
        title: "Push",
        description: `Bet returned ${formatCurrency(betAmount)}`,
        duration: 1500,
      });
    } else {
      toast({
        title: won ? "You won!" : "You lost",
        description: won 
          ? `Won ${formatCurrency(payout)} (profit ${formatCurrency(profit)})`
          : `Lost ${formatCurrency(betAmount)} (profit ${formatCurrency(-betAmount)})`,
        duration: 1500,
      });
    }
    
    addResult({
      game: "blackjack",
      betAmount,
      won,
      profit,
      detail: `${outcomeLabel} - Player ${data.playerTotal} vs Dealer ${data.dealerTotal}`,
    });
  };

  const handleDeal = () => {
    if (baseAmount < 0.1 || baseAmount > (user?.balance || 0)) return;
    dealMutation.mutate(baseAmount);
  };

  const handleHit = () => {
    if (!gameState?.bet?.id) return;
    hitMutation.mutate(gameState.bet.id);
  };

  const handleStand = () => {
    if (!gameState?.bet?.id) return;
    standMutation.mutate(gameState.bet.id);
  };

  const handleDouble = () => {
    if (!gameState?.bet?.id) return;
    doubleMutation.mutate(gameState.bet.id);
  };

  const handleNewHand = () => {
    setGameState(null);
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => Math.max(0.1, parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const isBusy = dealMutation.isPending || hitMutation.isPending || standMutation.isPending || doubleMutation.isPending || isAnimating;

  const playerTotal = gameState?.playerCards ? calculateTotal(gameState.playerCards) : 0;
  const dealerTotal = gameState?.dealerTotal || (gameState?.dealerCards ? calculateTotal(gameState.dealerCards) : 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
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
                    min={0.1}
                    step={0.1}
                    max={1000}
                    disabled={isPlaying || isBusy}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={isPlaying || isBusy}
                    data-testid="button-halve"
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={isPlaying || isBusy}
                    data-testid="button-double-amount"
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
                      disabled={isPlaying || isBusy}
                      data-testid={`button-percent-${pct * 100}`}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Potential Win */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Blackjack Pays
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    3:2 (+${(baseAmount * 1.5).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Game Info */}
              <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg p-3 mb-5">
                <div className="space-y-2 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Win Payout:</span>
                    <span className="text-white font-mono">1:1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Blackjack:</span>
                    <span className="text-white font-mono">3:2</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dealer Stands:</span>
                    <span className="text-white font-mono">Soft 17</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {!gameState || isCompleted ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={isCompleted ? handleNewHand : handleDeal}
                  disabled={!user || (!isCompleted && (baseAmount > (user?.balance || 0) || baseAmount < 0.1)) || isBusy}
                  data-testid="button-deal"
                >
                  {isBusy ? "Dealing..." : isCompleted ? "New Hand" : user ? "Deal Cards" : "Login to Play"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      className="h-10 text-sm font-semibold bg-amber-500 hover:bg-amber-400"
                      onClick={handleHit}
                      disabled={isBusy}
                      data-testid="button-hit"
                    >
                      Hit
                    </Button>
                    <Button 
                      className="h-10 text-sm font-semibold bg-slate-600 hover:bg-slate-500"
                      onClick={handleStand}
                      disabled={isBusy}
                      data-testid="button-stand"
                    >
                      Stand
                    </Button>
                  </div>
                  {gameState.canDouble && (
                    <Button 
                      variant="outline"
                      className="w-full h-10 text-sm font-semibold border-[#2a3a4a] text-slate-300"
                      onClick={handleDouble}
                      disabled={isBusy || (user?.balance || 0) < baseAmount}
                      data-testid="button-double"
                    >
                      Double Down
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[520px]">
              
              {/* Fair Play Badge + Profit Tracker */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <ProfitTrackerWidget gameId="blackjack" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Blackjack Table */}
              <div className="w-full max-w-md">
                {/* Dealer Area */}
                <div className="mb-8">
                  <div className="text-center mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dealer</span>
                  </div>
                  <div className="flex justify-center gap-2 min-h-[96px]">
                    {gameState && gameState.dealerCards.length > 0 ? (
                      <>
                        {isCompleted ? (
                          gameState.dealerCards.map((card, i) => (
                            <Card key={i} cardIndex={card} />
                          ))
                        ) : (
                          <>
                            <Card cardIndex={0} hidden />
                            {gameState.dealerCards.map((card, i) => (
                              <Card key={i} cardIndex={card} />
                            ))}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <EmptyCard />
                        <EmptyCard />
                      </>
                    )}
                  </div>
                  {gameState && gameState.dealerCards.length > 0 && (
                    <div className="text-center mt-2">
                      <span className="text-lg font-mono font-bold text-white">
                        {isCompleted ? dealerTotal : `${gameState.dealerShowing || getCardValue(gameState.dealerCards[0])}+`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-[#2a3a4a] to-transparent my-6" />

                {/* Player Area */}
                <div>
                  <div className="text-center mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Hand</span>
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap min-h-[96px]">
                    {gameState && gameState.playerCards.length > 0 ? (
                      gameState.playerCards.map((card, i) => (
                        <Card key={i} cardIndex={card} />
                      ))
                    ) : (
                      <>
                        <EmptyCard />
                        <EmptyCard />
                      </>
                    )}
                  </div>
                  {gameState && gameState.playerCards.length > 0 && (
                    <div className="text-center mt-2">
                      <span className={cn(
                        "text-lg font-mono font-bold",
                        playerTotal > 21 ? "text-red-400" : 
                        playerTotal === 21 ? "text-emerald-400" : "text-white"
                      )}>
                        {playerTotal}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Result Display */}
              {isCompleted && gameState.outcome && (
                <div className="mt-6 text-center">
                  <div className={cn(
                    "inline-flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-bold",
                    gameState.outcome === "blackjack" ? "bg-amber-500/20 border border-amber-500/40 text-amber-400" :
                    gameState.outcome === "win" ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400" :
                    gameState.outcome === "push" ? "bg-slate-500/20 border border-slate-500/40 text-slate-300" :
                    "bg-red-500/20 border border-red-500/40 text-red-400"
                  )}>
                    {gameState.outcome === "blackjack" ? "BLACKJACK!" :
                     gameState.outcome === "win" ? "YOU WIN!" :
                     gameState.outcome === "push" ? "PUSH" : "DEALER WINS"}
                  </div>
                  {gameState.payout !== undefined && gameState.payout > 0 && (
                    <div className="mt-2 text-emerald-400 font-mono font-semibold">
                      +${(gameState.payout - (gameState.bet?.betAmount || 0)).toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              {/* Instructions */}
              {!gameState && (
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-sm">Place your bet and click Deal to start</p>
                </div>
              )}

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-8">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Decks
                  </span>
                  <span className="font-mono font-semibold text-white">1</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    House Edge
                  </span>
                  <span className="font-mono font-semibold text-white">0.5%</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Dealer Stands
                  </span>
                  <span className="font-mono font-semibold text-white">Soft 17</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="blackjack"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
