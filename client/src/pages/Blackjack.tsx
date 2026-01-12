import { useState, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, RotateCcw, RefreshCw, Hand, Square, Layers, Info } from "lucide-react";
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

interface SideBetResults {
  perfectPairs?: { result: string | null; payout: number };
  twentyOnePlus3?: { result: string | null; payout: number };
}

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
  sideBetResults?: SideBetResults;
  sideBetPayout?: number;
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

interface ChipData {
  value: number;
  color: string;
  label: string;
  borderColor: string;
}

const CHIPS: ChipData[] = [
  { value: 1, color: "#3b82f6", label: "1", borderColor: "#60a5fa" },
  { value: 5, color: "#22c55e", label: "5", borderColor: "#4ade80" },
  { value: 25, color: "#a855f7", label: "25", borderColor: "#c084fc" },
  { value: 100, color: "#ef4444", label: "100", borderColor: "#f87171" },
  { value: 200, color: "#eab308", label: "200", borderColor: "#facc15" },
];

function ChipButton({ chip, selected, onClick }: { chip: ChipData; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-11 h-11 rounded-full flex items-center justify-center transition-all font-bold text-white text-xs",
        selected ? "scale-110 ring-2 ring-white" : "hover:scale-105"
      )}
      style={{
        background: `radial-gradient(circle at 30% 30%, ${chip.borderColor}, ${chip.color})`,
        boxShadow: `0 3px 8px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)`,
        border: `2px solid ${chip.borderColor}`,
      }}
      data-testid={`chip-${chip.value}`}
    >
      <span className="drop-shadow-md">{chip.label}</span>
      <div 
        className="absolute inset-1 rounded-full border-2 border-dashed opacity-40"
        style={{ borderColor: "rgba(255,255,255,0.5)" }}
      />
    </button>
  );
}

function UndoChip({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-11 h-11 rounded-full flex items-center justify-center transition-all",
        disabled ? "opacity-40" : "hover:scale-105"
      )}
      style={{
        background: "radial-gradient(circle at 30% 30%, #6b7280, #374151)",
        boxShadow: "0 3px 8px rgba(0,0,0,0.4)",
        border: "2px solid #9ca3af",
      }}
      data-testid="chip-undo"
    >
      <RotateCcw className="w-4 h-4 text-white" />
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
        className="w-14 h-20 rounded-lg flex items-center justify-center shadow-xl"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)",
          border: "2px solid #3b82f6",
        }}
        initial={{ x: 100, y: -60, opacity: 0, rotateY: 180 }}
        animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 14, delay }}
      >
        <div className="w-10 h-14 rounded border-2 border-blue-400/30 bg-gradient-to-br from-blue-500/30 to-blue-700/30" />
      </motion.div>
    );
  }

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const suitSymbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit];

  return (
    <motion.div 
      className="w-14 h-20 rounded-lg bg-white flex flex-col items-center justify-center shadow-xl"
      style={{
        border: "2px solid #e5e7eb",
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
      }}
      initial={{ x: 100, y: -60, opacity: 0, rotateY: 180 }}
      animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 14, delay }}
    >
      <span className={cn("text-lg font-bold", isRed ? "text-red-500" : "text-gray-800")}>
        {rank}
      </span>
      <span className={cn("text-base", isRed ? "text-red-500" : "text-gray-800")}>
        {suitSymbol}
      </span>
    </motion.div>
  );
}

function CardDeck() {
  return (
    <div className="relative" style={{ width: 60, height: 85 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute rounded-lg"
          style={{
            width: 60,
            height: 85,
            background: "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)",
            border: "2px solid #3b82f6",
            top: i * -2,
            left: i * 1,
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          <div 
            className="absolute inset-2 rounded border border-blue-400/30 bg-gradient-to-br from-blue-500/20 to-blue-700/20"
          />
        </div>
      ))}
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
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-slate-400 hover:text-white">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs">Fair Play</span>
        </Button>
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
            <code className="block mt-1 p-2 bg-slate-800 rounded text-xs text-amber-400 font-mono break-all">
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
  
  const [betAmount, setBetAmount] = useState(0);
  const [selectedChip, setSelectedChip] = useState<ChipData>(CHIPS[0]);
  const [chipHistory, setChipHistory] = useState<number[]>([]);
  
  const [perfectPairsBet, setPerfectPairsBet] = useState(0);
  const [twentyOnePlus3Bet, setTwentyOnePlus3Bet] = useState(0);
  const [sideBetResults, setSideBetResults] = useState<SideBetResults | null>(null);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("BETTING");
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [visiblePlayerCards, setVisiblePlayerCards] = useState<number[]>([]);
  const [visibleDealerCards, setVisibleDealerCards] = useState<number[]>([]);
  const [dealerRevealed, setDealerRevealed] = useState(false);
  
  const [statusText, setStatusText] = useState("");
  const [resultText, setResultText] = useState("");
  
  const [lastBet, setLastBet] = useState(0);
  const [lastSideBets, setLastSideBets] = useState({ perfectPairs: 0, twentyOnePlus3: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  
  const balance = user?.balance || 0;
  const totalBet = betAmount + perfectPairsBet + twentyOnePlus3Bet;
  const canDeal = betAmount >= 0.5 && totalBet <= balance && gamePhase === "BETTING";
  const canRebet = lastBet > 0 && (lastBet + lastSideBets.perfectPairs + lastSideBets.twentyOnePlus3) <= balance;

  const clearBet = () => {
    setBetAmount(0);
    setPerfectPairsBet(0);
    setTwentyOnePlus3Bet(0);
    setChipHistory([]);
  };

  const addChipToBet = (chip: ChipData) => {
    const newBet = Math.round((betAmount + chip.value) * 100) / 100;
    if (newBet <= balance) {
      setBetAmount(newBet);
      setChipHistory(prev => [...prev, chip.value]);
      playSound("chipDrop");
    }
  };

  const undoLastChip = () => {
    if (chipHistory.length > 0) {
      const lastValue = chipHistory[chipHistory.length - 1];
      setBetAmount(prev => Math.max(0, Math.round((prev - lastValue) * 100) / 100));
      setChipHistory(prev => prev.slice(0, -1));
    }
  };

  const dealMutation = useMutation({
    mutationFn: async (params: { betAmount: number; sideBets: { perfectPairs: number; twentyOnePlus3: number } }) => {
      const res = await apiRequest("POST", "/api/games/blackjack/deal", params);
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
    setLastSideBets({ perfectPairs: perfectPairsBet, twentyOnePlus3: twentyOnePlus3Bet });
    setGamePhase("DEALING");
    setStatusText("Dealing cards...");
    setResultText("");
    setDealerRevealed(false);
    setVisiblePlayerCards([]);
    setVisibleDealerCards([]);
    setSideBetResults(null);
    
    try {
      const data = await dealMutation.mutateAsync({
        betAmount,
        sideBets: { perfectPairs: perfectPairsBet, twentyOnePlus3: twentyOnePlus3Bet }
      });
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.sideBetResults) {
        setSideBetResults(data.sideBetResults);
      }
      
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
      
      if (data.sideBetResults) {
        const pp = data.sideBetResults.perfectPairs;
        const t3 = data.sideBetResults.twentyOnePlus3;
        if (pp?.payout && pp.payout > 0) {
          toast({ title: `Perfect Pairs: ${pp.result}!`, description: `Won $${pp.payout.toFixed(2)}` });
        }
        if (t3?.payout && t3.payout > 0) {
          toast({ title: `21+3: ${t3.result}!`, description: `Won $${t3.payout.toFixed(2)}` });
        }
      }
      
      if (data.status === "completed") {
        await revealAndSettle(data);
      } else {
        setGamePhase("PLAYER_TURN");
        setStatusText("Your turn - Hit or Stand?");
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
    setStatusText("Dealer's turn...");
    
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
    setStatusText("Doubling down...");
    
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
    setStatusText("Dealer reveals...");
    
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
      resultStr = `BLACKJACK! +$${(bet * 1.5).toFixed(2)}`;
      playSound("win");
    } else if (outcome === "win") {
      resultStr = `YOU WIN +$${bet.toFixed(2)}`;
      playSound("win");
    } else if (outcome === "push") {
      resultStr = "PUSH - Bet Returned";
    } else {
      resultStr = `DEALER WINS -$${bet.toFixed(2)}`;
      playSound("lose");
    }
    
    setStatusText(resultStr);
    setResultText(outcome || "");
    
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
  };

  const resetGame = () => {
    setGamePhase("BETTING");
    setGameState(null);
    setVisiblePlayerCards([]);
    setVisibleDealerCards([]);
    setDealerRevealed(false);
    setStatusText("");
    setResultText("");
    setBetAmount(0);
    setPerfectPairsBet(0);
    setTwentyOnePlus3Bet(0);
    setSideBetResults(null);
    setChipHistory([]);
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const handleRebet = () => {
    if (canRebet) {
      setBetAmount(lastBet);
      setPerfectPairsBet(lastSideBets.perfectPairs);
      setTwentyOnePlus3Bet(lastSideBets.twentyOnePlus3);
    }
    setGamePhase("BETTING");
    setGameState(null);
    setVisiblePlayerCards([]);
    setVisibleDealerCards([]);
    setDealerRevealed(false);
    setStatusText("");
    setResultText("");
    setSideBetResults(null);
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
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
      <div className="min-h-screen" style={{ background: "#0c1929" }}>
        <div className="max-w-5xl mx-auto px-4 py-3">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500" />
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h1 className="text-base font-semibold text-white">Blackjack</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FairPlayModal user={user} />
              <ProfitTrackerWidget gameId="blackjack" />
            </div>
          </div>

          {/* Main Table */}
          <div 
            className="relative rounded-xl overflow-hidden"
            style={{ background: "#0f1e32" }}
          >
            {/* Table Surface */}
            <div 
              className="relative"
              style={{ height: "420px" }}
            >
              {/* Oval Table Outline */}
              <div 
                className="absolute inset-8 rounded-[50%] border border-slate-600/50"
                style={{
                  background: "transparent",
                }}
              />

              {/* Center Banners */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
                {gamePhase === "BETTING" && !statusText && (
                  <>
                    <div 
                      className="px-6 py-1.5 text-xs font-medium tracking-wider text-slate-400"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(30, 58, 95, 0.8), transparent)",
                        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
                      }}
                    >
                      BLACKJACK PAYS 3 TO 2
                    </div>
                    <div 
                      className="px-6 py-1 text-[10px] font-medium tracking-wider text-slate-500"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(30, 58, 95, 0.6), transparent)",
                        clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)",
                      }}
                    >
                      INSURANCE PAYS 2 TO 1
                    </div>
                  </>
                )}
                
                <AnimatePresence mode="wait">
                  {statusText && (
                    <motion.div
                      key={statusText}
                      className={cn(
                        "px-6 py-3 rounded-lg text-center font-bold text-sm",
                        resultText === "blackjack" || resultText === "win" 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                          : resultText === "bust" || resultText === "lose"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-slate-800/80 text-slate-200 border border-slate-600/30"
                      )}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      {statusText}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Card Deck on Right */}
              <div className="absolute top-8 right-8 z-5">
                <CardDeck />
              </div>

              {/* Dealer Cards - Top Center */}
              <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                <div className="flex -space-x-4">
                  {visibleDealerCards.length === 0 && gamePhase === "BETTING" && (
                    <>
                      <div className="w-14 h-20 rounded-lg border-2 border-dashed border-slate-600/30" />
                      <div className="w-14 h-20 rounded-lg border-2 border-dashed border-slate-600/30" />
                    </>
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
                  <div className={cn(
                    "mt-2 px-3 py-1 rounded-full text-xs font-bold",
                    dealerRevealed && dealerTotal > 21 ? "bg-red-500 text-white" :
                    "bg-slate-700 text-white"
                  )}>
                    {dealerTotal}
                  </div>
                )}
              </div>

              {/* Player Cards and Bets - Bottom Center */}
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-end gap-4 z-10">
                {/* Perfect Pairs Side Bet */}
                <div className="relative">
                  <motion.div
                    className={cn(
                      "w-16 h-16 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all",
                      perfectPairsBet > 0 ? "ring-2 ring-amber-400" : "hover:ring-1 hover:ring-slate-400/50"
                    )}
                    style={{
                      background: perfectPairsBet > 0
                        ? "linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 0.1) 100%)"
                        : "linear-gradient(135deg, rgba(15, 30, 50, 0.8) 0%, rgba(20, 40, 60, 0.6) 100%)",
                      border: "2px dashed rgba(100, 116, 139, 0.4)",
                    }}
                    onClick={() => {
                      if (gamePhase === "BETTING" && selectedChip) {
                        const newBet = Math.round((perfectPairsBet + selectedChip.value) * 100) / 100;
                        if (totalBet + selectedChip.value <= balance) {
                          setPerfectPairsBet(newBet);
                          playSound("chipDrop");
                        }
                      }
                    }}
                    whileHover={gamePhase === "BETTING" ? { scale: 1.05 } : undefined}
                    data-testid="side-bet-perfect-pairs"
                  >
                    {perfectPairsBet > 0 ? (
                      <span className="text-xs font-mono font-bold text-amber-300">${perfectPairsBet}</span>
                    ) : (
                      <span className="text-[9px] text-slate-400 text-center leading-tight">Perfect<br/>Pairs</span>
                    )}
                    {sideBetResults?.perfectPairs?.result && (
                      <span className="text-[7px] text-emerald-400 mt-0.5">{sideBetResults.perfectPairs.result}</span>
                    )}
                  </motion.div>
                  {perfectPairsBet > 0 && gamePhase === "BETTING" && (
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white text-xs font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPerfectPairsBet(0);
                      }}
                      data-testid="clear-perfect-pairs"
                    >
                      x
                    </button>
                  )}
                </div>

                {/* Main Bet & Player Cards */}
                <div className="flex flex-col items-center">
                  <div className="flex -space-x-4">
                    {visiblePlayerCards.length === 0 && gamePhase === "BETTING" && (
                      <>
                        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-slate-600/30" />
                        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-slate-600/30" />
                      </>
                    )}
                    {visiblePlayerCards.map((card, i) => (
                      <PlayingCard 
                        key={`p-${i}`}
                        cardIndex={card}
                        delay={i * 0.12}
                      />
                    ))}
                  </div>
                  {visiblePlayerCards.length > 0 && (
                    <div className={cn(
                      "mt-2 px-3 py-1 rounded-full text-xs font-bold",
                      playerTotal > 21 ? "bg-red-500 text-white" :
                      playerTotal === 21 ? "bg-emerald-500 text-white" :
                      "bg-blue-600 text-white"
                    )}>
                      {playerTotal}
                    </div>
                  )}
                  
                  {/* Bet Amount Display */}
                  {betAmount > 0 && (
                    <div className="mt-2 px-4 py-1 rounded-full bg-slate-800 text-amber-400 font-mono text-sm font-bold">
                      ${betAmount.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* 21+3 Side Bet */}
                <div className="relative">
                  <motion.div
                    className={cn(
                      "w-16 h-16 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all",
                      twentyOnePlus3Bet > 0 ? "ring-2 ring-cyan-400" : "hover:ring-1 hover:ring-slate-400/50"
                    )}
                    style={{
                      background: twentyOnePlus3Bet > 0
                        ? "linear-gradient(135deg, rgba(34, 211, 238, 0.3) 0%, rgba(34, 211, 238, 0.1) 100%)"
                        : "linear-gradient(135deg, rgba(15, 30, 50, 0.8) 0%, rgba(20, 40, 60, 0.6) 100%)",
                      border: "2px dashed rgba(100, 116, 139, 0.4)",
                    }}
                    onClick={() => {
                      if (gamePhase === "BETTING" && selectedChip) {
                        const newBet = Math.round((twentyOnePlus3Bet + selectedChip.value) * 100) / 100;
                        if (totalBet + selectedChip.value <= balance) {
                          setTwentyOnePlus3Bet(newBet);
                          playSound("chipDrop");
                        }
                      }
                    }}
                    whileHover={gamePhase === "BETTING" ? { scale: 1.05 } : undefined}
                    data-testid="side-bet-21-plus-3"
                  >
                    {twentyOnePlus3Bet > 0 ? (
                      <span className="text-xs font-mono font-bold text-cyan-300">${twentyOnePlus3Bet}</span>
                    ) : (
                      <span className="text-[9px] text-slate-400 text-center leading-tight">21+3</span>
                    )}
                    {sideBetResults?.twentyOnePlus3?.result && (
                      <span className="text-[7px] text-emerald-400 mt-0.5">{sideBetResults.twentyOnePlus3.result}</span>
                    )}
                  </motion.div>
                  {twentyOnePlus3Bet > 0 && gamePhase === "BETTING" && (
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-white text-xs font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTwentyOnePlus3Bet(0);
                      }}
                      data-testid="clear-21-plus-3"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>

              {/* Play Button - Center Bottom */}
              {gamePhase === "BETTING" && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                  <Button
                    size="lg"
                    className="h-12 px-12 bg-blue-600 hover:bg-blue-500 font-bold text-base rounded-lg shadow-lg"
                    style={{
                      clipPath: "polygon(5% 0%, 95% 0%, 100% 50%, 95% 100%, 5% 100%, 0% 50%)",
                    }}
                    onClick={handleDeal}
                    disabled={!canDeal || isBusy}
                    data-testid="button-play"
                  >
                    Play
                  </Button>
                </div>
              )}
            </div>

            {/* Action Buttons Bar */}
            <div 
              className="px-4 py-3 flex items-center justify-center gap-3"
              style={{ 
                background: "#0a1520",
                borderTop: "1px solid rgba(100, 116, 139, 0.2)",
              }}
            >
              <AnimatePresence mode="wait">
                {gamePhase === "PLAYER_TURN" && (
                  <motion.div 
                    key="playing"
                    className="flex items-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {gameState?.canDouble && balance >= betAmount && (
                      <Button
                        variant="outline"
                        className="h-10 px-4 border-slate-600 text-slate-300 gap-2"
                        onClick={handleDouble}
                        disabled={isBusy}
                        data-testid="button-double"
                      >
                        <span className="text-xs font-bold">x2</span>
                        Double
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-300 gap-2"
                      onClick={handleHit}
                      disabled={isBusy}
                      data-testid="button-hit"
                    >
                      <Hand className="w-4 h-4" />
                      Hit
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-300 gap-2"
                      onClick={handleStand}
                      disabled={isBusy}
                      data-testid="button-stand"
                    >
                      <Square className="w-4 h-4" />
                      Stand
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-400 gap-2 opacity-50"
                      disabled
                      data-testid="button-split"
                    >
                      <Layers className="w-4 h-4" />
                      Split
                    </Button>
                  </motion.div>
                )}

                {(gamePhase === "DEALER" || gamePhase === "SETTLEMENT" || gamePhase === "DEALING") && (
                  <motion.div 
                    key="waiting"
                    className="flex items-center justify-center h-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-sm">
                        {gamePhase === "DEALING" ? "Dealing..." : "Dealer playing..."}
                      </span>
                    </div>
                  </motion.div>
                )}

                {gamePhase === "COMPLETE" && (
                  <motion.div 
                    key="complete"
                    className="flex items-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      variant="outline"
                      onClick={handleNewHand}
                      className="h-10 border-slate-600 text-slate-300"
                      data-testid="button-new-hand"
                    >
                      Clear
                    </Button>
                    <Button
                      className="h-10 px-6 bg-slate-700 hover:bg-slate-600 font-bold"
                      onClick={handleRebet}
                      disabled={!canRebet}
                      data-testid="button-rebet"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Rebet
                    </Button>
                    <Button
                      className="h-10 px-6 bg-blue-600 hover:bg-blue-500 font-bold"
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

                {gamePhase === "BETTING" && (
                  <motion.div 
                    key="betting-actions"
                    className="flex items-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      variant="outline"
                      className="h-10 px-4 border-slate-600 text-slate-300 gap-2 opacity-50"
                      disabled
                    >
                      <span className="text-xs font-bold">x2</span>
                      Double
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-300 gap-2 opacity-50"
                      disabled
                    >
                      <Hand className="w-4 h-4" />
                      Hit
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-300 gap-2 opacity-50"
                      disabled
                    >
                      <Square className="w-4 h-4" />
                      Stand
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 px-6 border-slate-600 text-slate-400 gap-2 opacity-50"
                      disabled
                    >
                      <Layers className="w-4 h-4" />
                      Split
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chips and Bet Controls */}
            <div 
              className="px-4 py-4 flex items-center justify-between gap-4"
              style={{ 
                background: "#0a1520",
                borderTop: "1px solid rgba(100, 116, 139, 0.1)",
              }}
            >
              {/* Chips */}
              <div className="flex items-center gap-2">
                <UndoChip onClick={undoLastChip} disabled={chipHistory.length === 0 || gamePhase !== "BETTING"} />
                {CHIPS.map((chip) => (
                  <ChipButton
                    key={chip.value}
                    chip={chip}
                    selected={selectedChip.value === chip.value}
                    onClick={() => {
                      setSelectedChip(chip);
                      if (gamePhase === "BETTING") {
                        addChipToBet(chip);
                      }
                    }}
                  />
                ))}
              </div>

              {/* Bet Amount Input and Quick Actions */}
              <div className="flex items-center gap-2">
                <div 
                  className="flex items-center gap-2 px-3 h-10 rounded-md"
                  style={{ background: "#1a2a3a" }}
                >
                  <span className="text-slate-400">$</span>
                  <input
                    type="text"
                    value={betAmount.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= balance) {
                        setBetAmount(val);
                      }
                    }}
                    className="w-20 bg-transparent text-white text-sm font-mono outline-none"
                    disabled={gamePhase !== "BETTING"}
                    data-testid="input-bet-amount"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 border-slate-600 text-slate-400"
                  onClick={() => setBetAmount(Math.max(0.5, betAmount / 2))}
                  disabled={gamePhase !== "BETTING"}
                  data-testid="button-half"
                >
                  1/2
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 border-slate-600 text-slate-400"
                  onClick={() => setBetAmount(Math.min(balance, betAmount * 2))}
                  disabled={gamePhase !== "BETTING"}
                  data-testid="button-double-bet"
                >
                  2x
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 border-slate-600 text-slate-400"
                  onClick={() => setBetAmount(balance)}
                  disabled={gamePhase !== "BETTING"}
                  data-testid="button-max"
                >
                  Max
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
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
