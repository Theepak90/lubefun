import { useState, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, RotateCcw, Trash2, RefreshCw, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGameHistory } from "@/hooks/use-game-history";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/hooks/use-sound";
import { motion, AnimatePresence } from "framer-motion";

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

type GamePhase = "BETTING" | "DEALING" | "PLAYER_TURN" | "DEALER" | "SETTLEMENT" | "COMPLETE";

const DEAL_DELAY = 280;
const ACTION_DELAY = 350;
const REVEAL_DELAY = 500;

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

interface ChipValue {
  value: number;
  color: string;
  textColor: string;
}

const CHIP_VALUES: ChipValue[] = [
  { value: 0.5, color: "#ef4444", textColor: "white" },
  { value: 1, color: "#3b82f6", textColor: "white" },
  { value: 5, color: "#22c55e", textColor: "white" },
  { value: 10, color: "#a855f7", textColor: "white" },
  { value: 25, color: "#f59e0b", textColor: "black" },
  { value: 100, color: "#1e293b", textColor: "white" },
];

function Chip({ chip, selected, onClick, size = "md" }: { 
  chip: ChipValue; 
  selected?: boolean; 
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const s = size === "sm" ? 28 : 40;
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center font-bold transition-all",
        selected && "ring-2 ring-white scale-110",
        onClick && "hover:scale-105 active:scale-95"
      )}
      style={{
        width: s,
        height: s,
        background: chip.color,
        color: chip.textColor,
        boxShadow: selected 
          ? `0 0 12px ${chip.color}80`
          : "0 2px 4px rgba(0,0,0,0.3)",
        fontSize: size === "sm" ? 10 : 12,
      }}
      data-testid={`chip-${chip.value}`}
    >
      {chip.value >= 1 ? chip.value : `.5`}
    </button>
  );
}

function PlayingCard({ 
  cardIndex, 
  hidden = false,
  delay = 0,
}: { 
  cardIndex: number; 
  hidden?: boolean;
  delay?: number;
}) {
  if (hidden) {
    return (
      <motion.div 
        className="w-12 h-16 rounded-md bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-400 flex items-center justify-center shadow-md"
        initial={{ x: 150, y: -80, opacity: 0, rotate: -8 }}
        animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16, delay }}
      >
        <div className="w-5 h-7 rounded border border-blue-300/40 bg-blue-700/50" />
      </motion.div>
    );
  }

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const suitSymbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit];

  return (
    <motion.div 
      className="w-12 h-16 rounded-md bg-white border border-gray-200 flex flex-col items-center justify-center shadow-md"
      initial={{ x: 150, y: -80, opacity: 0, rotate: -8 }}
      animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 16, delay }}
    >
      <span className={cn("text-sm font-bold", isRed ? "text-red-500" : "text-gray-800")}>
        {rank}
      </span>
      <span className={cn("text-xs", isRed ? "text-red-500" : "text-gray-800")}>
        {suitSymbol}
      </span>
    </motion.div>
  );
}

function StatusBar({ 
  phase, 
  resultText,
  showResult,
}: { 
  phase: string;
  resultText: string;
  showResult: boolean;
}) {
  const phaseText: Record<string, string> = {
    BETTING: "",
    DEALING: "Dealing...",
    PLAYER_TURN: "Your turn",
    DEALER: "Dealer's turn",
    SETTLEMENT: "",
    COMPLETE: "",
  };

  return (
    <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 z-20">
      <AnimatePresence mode="wait">
        {showResult ? (
          <motion.div 
            key="result"
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium",
              resultText.includes("+") ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : 
              resultText.includes("-") ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
              "bg-slate-500/20 text-slate-300 border border-slate-500/30"
            )}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {resultText}
          </motion.div>
        ) : phaseText[phase] ? (
          <motion.div 
            key="phase"
            className="px-3 py-1 rounded bg-slate-900/70 text-xs text-slate-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {phaseText[phase]}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FairPlayModal({ user }: { user: any }) {
  const [newClientSeed, setNewClientSeed] = useState("");
  const { toast } = useToast();
  
  const rotateSeedsMutation = useMutation({
    mutationFn: async (clientSeed: string) => {
      const res = await apiRequest("POST", "/api/seeds/rotate", { clientSeed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Seeds rotated" });
      setNewClientSeed("");
    },
  });

  const handleRotate = () => {
    const seed = newClientSeed.trim() || Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    rotateSeedsMutation.mutate(seed);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 rounded-full border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400">Fair</span>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <Shield className="w-4 h-4 text-emerald-400" />
            Provably Fair
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-sm">
          <div>
            <Label className="text-[10px] text-slate-500 uppercase">Client Seed</Label>
            <code className="block mt-1 p-2 bg-slate-800 rounded text-xs text-amber-400 font-mono">
              {user?.clientSeed || "Login to view"}
            </code>
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 uppercase">Nonce</Label>
            <code className="block mt-1 p-2 bg-slate-800 rounded text-xs text-white font-mono">
              {user?.nonce?.toLocaleString() || "0"}
            </code>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New client seed"
              value={newClientSeed}
              onChange={(e) => setNewClientSeed(e.target.value)}
              className="bg-slate-800 border-slate-700 text-xs h-8"
            />
            <Button
              onClick={handleRotate}
              disabled={rotateSeedsMutation.isPending}
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-400 h-8"
            >
              <RefreshCw className={cn("w-3 h-3", rotateSeedsMutation.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Blackjack() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  const { play: playSound } = useSound();
  
  const [betAmount, setBetAmount] = useState(1);
  const [selectedChip, setSelectedChip] = useState<ChipValue>(CHIP_VALUES[1]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("BETTING");
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [visiblePlayerCards, setVisiblePlayerCards] = useState<number[]>([]);
  const [visibleDealerCards, setVisibleDealerCards] = useState<number[]>([]);
  const [dealerRevealed, setDealerRevealed] = useState(false);
  
  const [statusResult, setStatusResult] = useState("");
  const [showResult, setShowResult] = useState(false);
  
  const [lastBet, setLastBet] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  
  const balance = user?.balance || 0;
  const canDeal = betAmount >= 0.5 && betAmount <= balance && gamePhase === "BETTING";
  const canRebet = lastBet > 0 && lastBet <= balance;

  const addChip = () => {
    const newBet = Math.round((betAmount + selectedChip.value) * 100) / 100;
    if (newBet <= balance) {
      setBetAmount(newBet);
      playSound("chipDrop");
    }
  };

  const removeChip = () => {
    setBetAmount(Math.max(0, Math.round((betAmount - selectedChip.value) * 100) / 100));
  };

  const clearBet = () => {
    setBetAmount(0);
  };

  const dealMutation = useMutation({
    mutationFn: async (bet: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/deal", { betAmount: bet });
      return res.json() as Promise<BlackjackState>;
    },
  });

  const hitMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/hit", { betId });
      return res.json() as Promise<BlackjackState>;
    },
  });

  const standMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/stand", { betId });
      return res.json() as Promise<BlackjackState>;
    },
  });

  const doubleMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/double", { betId });
      return res.json() as Promise<BlackjackState>;
    },
  });

  const handleDeal = async () => {
    if (processingRef.current || !canDeal) return;
    processingRef.current = true;
    setIsProcessing(true);
    
    setLastBet(betAmount);
    setGamePhase("DEALING");
    setShowResult(false);
    setDealerRevealed(false);
    setVisiblePlayerCards([]);
    setVisibleDealerCards([]);
    
    try {
      const data = await dealMutation.mutateAsync(betAmount);
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      const playerCards = data.playerCards || [];
      const dealerCards = data.dealerCards || [];
      
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, DEAL_DELAY));
        playSound("cardDeal");
        
        if (i === 0) setVisiblePlayerCards([playerCards[0]]);
        else if (i === 1) setVisibleDealerCards([-1]);
        else if (i === 2) setVisiblePlayerCards([playerCards[0], playerCards[1]]);
        else if (i === 3) setVisibleDealerCards([dealerCards[0]]);
      }
      
      await new Promise(r => setTimeout(r, ACTION_DELAY));
      
      if (data.status === "completed") {
        await revealAndSettle(data);
      } else {
        setGamePhase("PLAYER_TURN");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      resetGame();
    }
    
    processingRef.current = false;
    setIsProcessing(false);
  };

  const handleHit = async () => {
    if (processingRef.current || gamePhase !== "PLAYER_TURN" || !gameState?.bet?.id) return;
    processingRef.current = true;
    setIsProcessing(true);
    
    try {
      const data = await hitMutation.mutateAsync(gameState.bet.id);
      playSound("cardDeal");
      
      setVisiblePlayerCards(data.playerCards || []);
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      await new Promise(r => setTimeout(r, ACTION_DELAY));
      
      if (data.status === "completed") {
        await revealAndSettle(data);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    
    processingRef.current = false;
    setIsProcessing(false);
  };

  const handleStand = async () => {
    if (processingRef.current || gamePhase !== "PLAYER_TURN" || !gameState?.bet?.id) return;
    processingRef.current = true;
    setIsProcessing(true);
    
    try {
      const data = await standMutation.mutateAsync(gameState.bet.id);
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      await revealAndSettle(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    
    processingRef.current = false;
    setIsProcessing(false);
  };

  const handleDouble = async () => {
    if (processingRef.current || gamePhase !== "PLAYER_TURN" || !gameState?.bet?.id) return;
    processingRef.current = true;
    setIsProcessing(true);
    
    try {
      const data = await doubleMutation.mutateAsync(gameState.bet.id);
      playSound("cardDeal");
      
      setVisiblePlayerCards(data.playerCards || []);
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      await new Promise(r => setTimeout(r, ACTION_DELAY));
      await revealAndSettle(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    
    processingRef.current = false;
    setIsProcessing(false);
  };

  const revealAndSettle = async (data: BlackjackState) => {
    setGamePhase("DEALER");
    
    await new Promise(r => setTimeout(r, REVEAL_DELAY));
    setDealerRevealed(true);
    setVisibleDealerCards(data.dealerCards || []);
    
    for (let i = 2; i < (data.dealerCards?.length || 0); i++) {
      await new Promise(r => setTimeout(r, DEAL_DELAY));
      playSound("cardDeal");
    }
    
    await new Promise(r => setTimeout(r, ACTION_DELAY));
    setGamePhase("SETTLEMENT");
    
    const outcome = data.outcome;
    const bet = data.bet?.betAmount || betAmount;
    const profit = data.bet?.profit || 0;
    const won = outcome === "win" || outcome === "blackjack";
    const isPush = outcome === "push";
    
    let resultStr = "";
    if (outcome === "blackjack") {
      resultStr = `Blackjack! +${formatCurrency(bet * 1.5)}`;
      playSound("win");
    } else if (outcome === "win") {
      resultStr = `You win +${formatCurrency(bet)}`;
      playSound("win");
    } else if (outcome === "push") {
      resultStr = "Push - Bet returned";
    } else {
      resultStr = `Dealer wins ${formatCurrency(-bet)}`;
      playSound("lose");
    }
    
    setStatusResult(resultStr);
    setShowResult(true);
    
    if (!isPush) {
      const payout = won ? bet + profit : 0;
      recordResult("blackjack", bet, payout, won);
    }
    
    addResult({
      game: "blackjack",
      betAmount: bet,
      won,
      profit: won ? profit : -bet,
      detail: `${outcome} - Player ${data.playerTotal} vs Dealer ${data.dealerTotal}`,
    });
    
    await new Promise(r => setTimeout(r, 600));
    setGamePhase("COMPLETE");
    
    setTimeout(() => setShowResult(false), 2500);
  };

  const resetGame = () => {
    setGamePhase("BETTING");
    setGameState(null);
    setVisiblePlayerCards([]);
    setVisibleDealerCards([]);
    setDealerRevealed(false);
    setShowResult(false);
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const handleRebet = () => {
    if (canRebet) {
      setBetAmount(lastBet);
    }
    resetGame();
  };

  const handleNewHand = () => {
    resetGame();
  };

  const isBusy = dealMutation.isPending || hitMutation.isPending || standMutation.isPending || doubleMutation.isPending || isProcessing;
  const playerTotal = visiblePlayerCards.length > 0 ? calculateTotal(visiblePlayerCards) : 0;
  const dealerTotal = dealerRevealed && visibleDealerCards.length > 0 
    ? calculateTotal(visibleDealerCards.filter(c => c !== -1))
    : visibleDealerCards.filter(c => c !== -1).length > 0 
      ? getCardValue(visibleDealerCards.find(c => c !== -1) || 0)
      : 0;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-3">
          
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Blackjack</h1>
              <FairPlayModal user={user} />
            </div>
            <ProfitTrackerWidget gameId="blackjack" />
          </div>

          <div className="relative rounded-2xl overflow-hidden shadow-xl">
            <div 
              className="relative h-[360px]"
              style={{
                background: "linear-gradient(180deg, #0a2818 0%, #0d3a25 50%, #0f4a30 100%)",
              }}
            >
              <div 
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.8'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
              />
              
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Dealer</span>
                <div className="flex -space-x-4">
                  {visibleDealerCards.length === 0 && gamePhase === "BETTING" && (
                    <div className="w-12 h-16 rounded-md border-2 border-dashed border-slate-500/30" />
                  )}
                  {visibleDealerCards.map((card, i) => (
                    <PlayingCard 
                      key={`d-${i}`}
                      cardIndex={card === -1 ? 0 : card}
                      hidden={card === -1 && !dealerRevealed}
                      delay={i * 0.12}
                    />
                  ))}
                </div>
                {visibleDealerCards.length > 0 && (
                  <div className="mt-1.5 px-2 py-0.5 bg-slate-900/80 rounded text-xs font-mono font-bold text-white">
                    {dealerTotal}
                  </div>
                )}
              </div>

              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                {gamePhase === "BETTING" && (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-14 rounded-lg border-2 border-dashed border-amber-400/40 flex items-center justify-center bg-amber-400/5">
                      {betAmount > 0 ? (
                        <span className="text-lg font-mono font-bold text-amber-400">${betAmount}</span>
                      ) : (
                        <span className="text-xs text-amber-400/60">Place Bet</span>
                      )}
                    </div>
                  </div>
                )}
                
                {visiblePlayerCards.length > 0 && (
                  <>
                    <div className="flex -space-x-4">
                      {visiblePlayerCards.map((card, i) => (
                        <PlayingCard key={`p-${i}`} cardIndex={card} delay={i * 0.12} />
                      ))}
                    </div>
                    <div className={cn(
                      "mt-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold",
                      playerTotal > 21 ? "bg-red-500/20 text-red-400" :
                      playerTotal === 21 ? "bg-emerald-500/20 text-emerald-400" :
                      "bg-slate-900/80 text-white"
                    )}>
                      {playerTotal}
                    </div>
                  </>
                )}
              </div>

              <StatusBar
                phase={gamePhase}
                resultText={statusResult}
                showResult={showResult}
              />
            </div>

            <div className="bg-slate-900/95 border-t border-slate-700 p-3">
              <AnimatePresence mode="wait">
                {gamePhase === "BETTING" && (
                  <motion.div 
                    key="betting"
                    className="flex items-center justify-between gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center gap-1">
                      {CHIP_VALUES.map((chip) => (
                        <Chip
                          key={chip.value}
                          chip={chip}
                          selected={selectedChip.value === chip.value}
                          onClick={() => setSelectedChip(chip)}
                          size="sm"
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={removeChip}
                          disabled={betAmount <= 0}
                          className="w-6 h-6 rounded bg-slate-700 text-white disabled:opacity-30 flex items-center justify-center"
                          data-testid="button-bet-minus"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold text-amber-400 min-w-[52px] text-center text-sm">
                          ${betAmount.toFixed(2)}
                        </span>
                        <button
                          onClick={addChip}
                          disabled={betAmount + selectedChip.value > balance}
                          className="w-6 h-6 rounded bg-slate-700 text-white disabled:opacity-30 flex items-center justify-center"
                          data-testid="button-bet-plus"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <div className="h-4 w-px bg-slate-700" />
                      
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px]">Balance </span>
                        <span className="font-mono text-emerald-400">${balance.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearBet}
                        disabled={betAmount === 0}
                        className="border-slate-600 text-slate-400 h-8 px-2"
                        data-testid="button-clear"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      {canRebet && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBetAmount(lastBet)}
                          className="border-slate-600 text-slate-400 h-8 px-2"
                          data-testid="button-repeat"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-8 px-6 bg-emerald-500 hover:bg-emerald-400 font-bold"
                        onClick={handleDeal}
                        disabled={!canDeal || isBusy}
                        data-testid="button-deal"
                      >
                        Deal
                      </Button>
                    </div>
                  </motion.div>
                )}

                {gamePhase === "PLAYER_TURN" && (
                  <motion.div 
                    key="playing"
                    className="flex items-center justify-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      size="sm"
                      className="h-9 px-6 bg-amber-500 hover:bg-amber-400 font-bold text-black"
                      onClick={handleHit}
                      disabled={isBusy}
                      data-testid="button-hit"
                    >
                      Hit
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 px-6 bg-slate-600 hover:bg-slate-500 font-bold"
                      onClick={handleStand}
                      disabled={isBusy}
                      data-testid="button-stand"
                    >
                      Stand
                    </Button>
                    {gameState?.canDouble && balance >= betAmount && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-6 border-slate-500 font-bold"
                        onClick={handleDouble}
                        disabled={isBusy}
                        data-testid="button-double"
                      >
                        Double
                      </Button>
                    )}
                  </motion.div>
                )}

                {(gamePhase === "DEALER" || gamePhase === "SETTLEMENT") && (
                  <motion.div 
                    key="dealer"
                    className="flex items-center justify-center h-9"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <span className="text-sm text-slate-400">
                      {gamePhase === "DEALER" ? "Dealer's turn..." : ""}
                    </span>
                  </motion.div>
                )}

                {gamePhase === "COMPLETE" && (
                  <motion.div 
                    key="complete"
                    className="flex items-center justify-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNewHand}
                      className="border-slate-600 text-slate-300 h-9"
                      data-testid="button-new-hand"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 px-6 bg-amber-500 hover:bg-amber-400 font-bold text-black"
                      onClick={handleRebet}
                      disabled={!canRebet}
                      data-testid="button-rebet"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Rebet
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 px-6 bg-emerald-500 hover:bg-emerald-400 font-bold"
                      onClick={() => {
                        handleRebet();
                        setTimeout(handleDeal, 50);
                      }}
                      disabled={!canRebet || isBusy}
                      data-testid="button-rebet-deal"
                    >
                      Rebet & Deal
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            <RecentResults 
              results={results} 
              onClear={clearHistory}
              filterGame="blackjack"
            />
            <LiveWins />
          </div>
        </div>
      </div>
    </Layout>
  );
}
