import { useState, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, RotateCcw, Trash2, RefreshCw, BookOpen, User } from "lucide-react";
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
  const s = size === "sm" ? 32 : 44;
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center font-bold transition-all border-2",
        selected ? "ring-2 ring-emerald-400 scale-110 border-white" : "border-white/20",
        onClick && "hover:scale-105 active:scale-95"
      )}
      style={{
        width: s,
        height: s,
        background: `radial-gradient(circle at 30% 30%, ${chip.color}, ${chip.color}dd)`,
        color: chip.textColor,
        boxShadow: selected 
          ? `0 0 16px ${chip.color}80, inset 0 2px 4px rgba(255,255,255,0.3)`
          : "0 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
        fontSize: size === "sm" ? 11 : 13,
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
        className="w-10 h-14 rounded flex items-center justify-center shadow-lg"
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
          border: "1.5px solid #2563eb",
        }}
        initial={{ x: 80, y: -40, opacity: 0, rotateY: 180 }}
        animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 14, delay }}
      >
        <div className="w-6 h-8 rounded-sm border border-blue-400/30 bg-gradient-to-br from-blue-600/40 to-blue-800/40" />
      </motion.div>
    );
  }

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const suitSymbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit];

  return (
    <motion.div 
      className="w-10 h-14 rounded bg-white flex flex-col items-center justify-center shadow-lg"
      style={{
        border: "1.5px solid #e5e7eb",
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
      }}
      initial={{ x: 80, y: -40, opacity: 0, rotateY: 180 }}
      animate={{ x: 0, y: 0, opacity: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 14, delay }}
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

function PlayerSeat({
  total,
  betAmount,
  isActive,
  cards,
  showCards,
  seatActive,
  onSeatClick,
  isPlaying,
}: {
  total?: number;
  betAmount: number;
  isActive: boolean;
  cards: number[];
  showCards: boolean;
  seatActive: boolean;
  onSeatClick: () => void;
  isPlaying: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center relative",
      isActive && "z-10"
    )}>
      {showCards && cards.length > 0 && (
        <div className="flex -space-x-4 mb-2">
          {cards.map((card, i) => (
            <PlayingCard key={i} cardIndex={card} delay={i * 0.1} />
          ))}
        </div>
      )}
      
      {showCards && total !== undefined && total > 0 && (
        <div className={cn(
          "absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold",
          total > 21 ? "bg-red-500 text-white" :
          total === 21 ? "bg-emerald-500 text-white" :
          "bg-violet-600 text-white"
        )}>
          {total}
        </div>
      )}

      <motion.div
        className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center cursor-pointer transition-all",
          seatActive || isPlaying
            ? "ring-2 ring-violet-400"
            : "hover:ring-2 hover:ring-violet-500/50"
        )}
        style={{
          background: seatActive || isPlaying
            ? "linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(139, 92, 246, 0.15) 100%)"
            : "linear-gradient(135deg, rgba(30, 21, 53, 0.8) 0%, rgba(42, 30, 74, 0.6) 100%)",
          border: "2px dashed rgba(139, 92, 246, 0.5)",
        }}
        onClick={!isPlaying ? onSeatClick : undefined}
        whileHover={!isPlaying ? { scale: 1.05 } : undefined}
        whileTap={!isPlaying ? { scale: 0.98 } : undefined}
        data-testid="player-seat"
      >
        {betAmount > 0 ? (
          <span className="text-lg font-mono font-bold text-violet-300">${betAmount}</span>
        ) : (
          <span className="text-xs text-violet-400 text-center leading-tight">
            {seatActive ? "Click chip" : "Open\nSeat"}
          </span>
        )}
      </motion.div>
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-600 bg-slate-800/50">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs">Provably Fair</span>
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

function PayoutRulesModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-600 bg-slate-800/50">
          <BookOpen className="w-3.5 h-3.5" />
          <span className="text-xs">Payout Rulebook</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-base">Payout Rules</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Blackjack (21)</span>
            <span className="text-emerald-400 font-mono">3:2</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Win</span>
            <span className="text-emerald-400 font-mono">1:1</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Push</span>
            <span className="text-slate-300 font-mono">Bet returned</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-700">
            <span className="text-slate-400">Insurance</span>
            <span className="text-amber-400 font-mono">2:1</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-400">House Edge</span>
            <span className="text-slate-300 font-mono">~0.5%</span>
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
  const [selectedChip, setSelectedChip] = useState<ChipValue | null>(CHIP_VALUES[0]);
  const [seatActive, setSeatActive] = useState(false);
  const [draggingChip, setDraggingChip] = useState<ChipValue | null>(null);
  
  // Side bets
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
    setSeatActive(false);
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
      
      // Store side bet results
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
      
      // Show side bet results
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
    setSeatActive(false);
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const handleRebet = () => {
    if (canRebet) {
      setBetAmount(lastBet);
      setPerfectPairsBet(lastSideBets.perfectPairs);
      setTwentyOnePlus3Bet(lastSideBets.twentyOnePlus3);
      setSeatActive(true);
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

  const username = user?.username || "Player";

  return (
    <Layout>
      <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f0a1a 0%, #1a1025 50%, #0f0a1a 100%)" }}>
        <div className="max-w-5xl mx-auto px-4 py-3">
          
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">Blackjack</h1>
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-600 bg-slate-800/50">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-xs">Play Alone</span>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PayoutRulesModal />
              <FairPlayModal user={user} />
              <ProfitTrackerWidget gameId="blackjack" />
            </div>
          </div>

          <div 
            className="relative rounded-3xl overflow-hidden shadow-2xl"
            style={{
              background: "linear-gradient(180deg, #1a1030 0%, #251845 30%, #1a1030 100%)",
              border: "3px solid #3d2860",
            }}
          >
            <div 
              className="relative"
              style={{ 
                height: "440px",
                background: `
                  radial-gradient(ellipse 120% 80% at 50% 100%, #2d1f50 0%, transparent 70%),
                  radial-gradient(ellipse 100% 50% at 50% 0%, #1a1030 0%, transparent 50%)
                `,
              }}
            >
              <div 
                className="absolute inset-4 rounded-[100px_100px_200px_200px/60px_60px_120px_120px]"
                style={{
                  background: "linear-gradient(180deg, #1e1535 0%, #2a1e4a 50%, #1e1535 100%)",
                  border: "2px solid #3d2860",
                  boxShadow: "inset 0 0 60px rgba(139, 92, 246, 0.1)",
                }}
              />

              {/* Dealer chip stacks */}
              <div className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-1 z-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col-reverse">
                    {[0, 1, 2, 3, 4, 5].map((j) => (
                      <div 
                        key={j}
                        className="w-6 h-1.5 rounded-sm"
                        style={{
                          background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
                          marginBottom: "-2px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Card shoe on right side */}
              <div 
                className="absolute top-8 right-8 z-5"
                style={{
                  width: "50px",
                  height: "70px",
                  background: "linear-gradient(135deg, #4c1d95 0%, #2e1065 100%)",
                  borderRadius: "4px",
                  border: "2px solid #6d28d9",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                <div 
                  className="absolute inset-1 rounded-sm"
                  style={{
                    background: "repeating-linear-gradient(90deg, #1e1535 0px, #1e1535 2px, #2a1e4a 2px, #2a1e4a 4px)",
                  }}
                />
                <div 
                  className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-12 rounded-l"
                  style={{
                    background: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)",
                    border: "1px solid #60a5fa",
                  }}
                />
              </div>

              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                <div className="flex -space-x-4">
                  {visibleDealerCards.length === 0 && gamePhase === "BETTING" && (
                    <>
                      <div 
                        className="w-10 h-14 rounded border-2 border-dashed opacity-30"
                        style={{ borderColor: "#6366f1" }}
                      />
                      <div 
                        className="w-10 h-14 rounded border-2 border-dashed opacity-30"
                        style={{ borderColor: "#6366f1" }}
                      />
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
                    "mt-1.5 px-2 py-0.5 rounded-full text-xs font-bold",
                    dealerRevealed && dealerTotal > 21 ? "bg-red-500 text-white" :
                    "bg-violet-600 text-white"
                  )}>
                    {dealerTotal}
                  </div>
                )}
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <AnimatePresence mode="wait">
                  {statusText && (
                    <motion.div
                      key={statusText}
                      className={cn(
                        "px-4 py-2 rounded-lg text-center font-bold text-sm",
                        resultText === "blackjack" || resultText === "win" 
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                          : resultText === "bust" || resultText === "lose"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-violet-900/60 text-violet-200 border border-violet-500/30"
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

              {/* Side bet and main bet circles */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-2 z-10">
                {/* Perfect Pairs - Left side bet */}
                <motion.div
                  className={cn(
                    "w-14 h-14 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all",
                    perfectPairsBet > 0 ? "ring-2 ring-amber-400" : "hover:ring-1 hover:ring-violet-400/50"
                  )}
                  style={{
                    background: perfectPairsBet > 0
                      ? "linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 0.1) 100%)"
                      : "linear-gradient(135deg, rgba(30, 21, 53, 0.6) 0%, rgba(42, 30, 74, 0.4) 100%)",
                    border: "2px dashed rgba(139, 92, 246, 0.4)",
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
                    <span className="text-[8px] text-violet-400 text-center leading-tight">Perfect<br/>Pairs</span>
                  )}
                  {sideBetResults?.perfectPairs?.result && (
                    <span className="text-[7px] text-emerald-400 mt-0.5">{sideBetResults.perfectPairs.result}</span>
                  )}
                </motion.div>

                {/* Main bet - Center */}
                <PlayerSeat
                  total={playerTotal}
                  betAmount={betAmount}
                  isActive={gamePhase === "PLAYER_TURN"}
                  cards={visiblePlayerCards}
                  showCards={visiblePlayerCards.length > 0}
                  seatActive={seatActive}
                  onSeatClick={() => {
                    if (!seatActive) {
                      setSeatActive(true);
                    } else if (selectedChip) {
                      const newBet = Math.round((betAmount + selectedChip.value) * 100) / 100;
                      if (totalBet - betAmount + newBet <= balance) {
                        setBetAmount(newBet);
                        playSound("chipDrop");
                      }
                    }
                  }}
                  isPlaying={gamePhase !== "BETTING"}
                />

                {/* 21+3 - Right side bet */}
                <motion.div
                  className={cn(
                    "w-14 h-14 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all",
                    twentyOnePlus3Bet > 0 ? "ring-2 ring-cyan-400" : "hover:ring-1 hover:ring-violet-400/50"
                  )}
                  style={{
                    background: twentyOnePlus3Bet > 0
                      ? "linear-gradient(135deg, rgba(34, 211, 238, 0.3) 0%, rgba(34, 211, 238, 0.1) 100%)"
                      : "linear-gradient(135deg, rgba(30, 21, 53, 0.6) 0%, rgba(42, 30, 74, 0.4) 100%)",
                    border: "2px dashed rgba(139, 92, 246, 0.4)",
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
                    <span className="text-[8px] text-violet-400 text-center leading-tight">21+3</span>
                  )}
                  {sideBetResults?.twentyOnePlus3?.result && (
                    <span className="text-[7px] text-emerald-400 mt-0.5">{sideBetResults.twentyOnePlus3.result}</span>
                  )}
                </motion.div>
              </div>
            </div>

            <div 
              className="p-4"
              style={{
                background: "linear-gradient(180deg, #1a1030 0%, #0f0a1a 100%)",
                borderTop: "2px solid #3d2860",
              }}
            >
              <AnimatePresence mode="wait">
                {gamePhase === "BETTING" && (
                  <motion.div 
                    key="betting"
                    className="flex flex-col gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {CHIP_VALUES.map((chip) => (
                        <Chip
                          key={chip.value}
                          chip={chip}
                          selected={selectedChip?.value === chip.value}
                          onClick={() => {
                            if (seatActive) {
                              const newBet = Math.round((betAmount + chip.value) * 100) / 100;
                              if (newBet <= balance) {
                                setBetAmount(newBet);
                                playSound("chipDrop");
                              }
                            }
                            setSelectedChip(chip);
                          }}
                          size="sm"
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearBet}
                        disabled={betAmount === 0}
                        className="border-slate-600 text-slate-400 h-10 px-3"
                        data-testid="button-clear"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {canRebet && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBetAmount(lastBet)}
                          className="border-slate-600 text-slate-400 h-10 px-3"
                          data-testid="button-repeat"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="default"
                        className="h-10 px-8 bg-emerald-500 hover:bg-emerald-400 font-bold text-base"
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
                    className="flex items-center justify-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      size="lg"
                      className="h-12 px-8 bg-amber-500 hover:bg-amber-400 font-bold text-lg text-black"
                      onClick={handleHit}
                      disabled={isBusy}
                      data-testid="button-hit"
                    >
                      Hit
                    </Button>
                    <Button
                      size="lg"
                      className="h-12 px-8 bg-slate-600 hover:bg-slate-500 font-bold text-lg"
                      onClick={handleStand}
                      disabled={isBusy}
                      data-testid="button-stand"
                    >
                      Stand
                    </Button>
                    {gameState?.canDouble && balance >= betAmount && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-12 px-8 border-violet-500 text-violet-300 font-bold text-lg"
                        onClick={handleDouble}
                        disabled={isBusy}
                        data-testid="button-double"
                      >
                        Double
                      </Button>
                    )}
                  </motion.div>
                )}

                {(gamePhase === "DEALER" || gamePhase === "SETTLEMENT" || gamePhase === "DEALING") && (
                  <motion.div 
                    key="waiting"
                    className="flex items-center justify-center h-12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="flex items-center gap-2 text-violet-300">
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                      <span className="text-sm">
                        {gamePhase === "DEALING" ? "Dealing..." : "Dealer playing..."}
                      </span>
                    </div>
                  </motion.div>
                )}

                {gamePhase === "COMPLETE" && (
                  <motion.div 
                    key="complete"
                    className="flex items-center justify-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleNewHand}
                      className="border-slate-600 text-slate-300 h-12"
                      data-testid="button-new-hand"
                    >
                      Clear
                    </Button>
                    <Button
                      size="lg"
                      className="h-12 px-8 bg-violet-600 hover:bg-violet-500 font-bold"
                      onClick={handleRebet}
                      disabled={!canRebet}
                      data-testid="button-rebet"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Rebet
                    </Button>
                    <Button
                      size="lg"
                      className="h-12 px-8 bg-emerald-500 hover:bg-emerald-400 font-bold"
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
