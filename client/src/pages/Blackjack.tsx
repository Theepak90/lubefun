import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useProfitTracker } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { useSound } from "@/hooks/use-sound";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Hand, Square, Layers, Info, ChevronDown, ChevronUp } from "lucide-react";
import {
  GameState,
  GameAction,
  gameReducer,
  createInitialState,
  calculateHandTotal,
  getAvailableActions,
  Card,
  Hand as HandType,
} from "@/lib/blackjackEngine";

import chip50c from "@assets/ChatGPT_Image_Jan_11,_2026,_11_12_58_PM_1768197549199.png";
import chip1 from "@assets/Water-themed_$1_poker_chip_1768197549200.png";
import chip5 from "@assets/Water-themed_$5_poker_chip_1768197549200.png";
import chip10 from "@assets/Water-themed_$10_poker_chip_1768197549200.png";
import chip20 from "@assets/Water-themed_$20_casino_chip_1768197549201.png";
import chip100 from "@assets/Poker_chip_with_glowing_water_effects_1768197549201.png";

interface ChipData {
  value: number;
  label: string;
  image: string;
}

const CHIPS: ChipData[] = [
  { value: 0.5, label: "50¢", image: chip50c },
  { value: 1, label: "$1", image: chip1 },
  { value: 5, label: "$5", image: chip5 },
  { value: 10, label: "$10", image: chip10 },
  { value: 20, label: "$20", image: chip20 },
  { value: 100, label: "$100", image: chip100 },
];

function ChipButton({ 
  chip, 
  selected, 
  onClick,
  disabled 
}: { 
  chip: ChipData; 
  selected?: boolean; 
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-[clamp(2.5rem,4vw,3rem)] h-[clamp(2.5rem,4vw,3rem)] rounded-full flex items-center justify-center transition-all",
        selected ? "scale-110 ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900" : "hover:scale-105",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      data-testid={`chip-${chip.value}`}
    >
      <img 
        src={chip.image} 
        alt={chip.label}
        className="w-full h-full object-contain"
        draggable={false}
      />
    </button>
  );
}

function PlayingCard({ 
  card, 
  hidden = false, 
  delay = 0,
  size = "normal"
}: { 
  card: Card; 
  hidden?: boolean; 
  delay?: number;
  size?: "normal" | "small";
}) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  // Responsive card sizing using CSS custom properties
  const sizeClasses = size === "small" 
    ? "w-[clamp(2.5rem,4vw,3rem)] h-[clamp(3.5rem,5.5vw,4rem)]" 
    : "w-[clamp(3rem,5vw,3.75rem)] h-[clamp(4.25rem,7vw,5.25rem)]";
  
  const suitSymbol = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  }[card.suit];

  if (hidden) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20, rotateY: 180 }}
        animate={{ opacity: 1, y: 0, rotateY: 0 }}
        transition={{ delay, duration: 0.3 }}
        className={cn(sizeClasses, "rounded-lg bg-gradient-to-br from-blue-800 to-blue-900 border-2 border-blue-600 shadow-lg flex items-center justify-center")}
      >
        <div className="w-[60%] h-[70%] rounded border-2 border-blue-500 bg-blue-700/50" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, rotateY: 180 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn(
        sizeClasses,
        "rounded-lg bg-white border border-gray-200 shadow-lg flex flex-col items-center justify-between p-1.5"
      )}
    >
      <div className={cn("text-[clamp(0.6rem,1.5vw,0.75rem)] font-bold self-start leading-none", isRed ? "text-red-500" : "text-gray-900")}>
        {card.rank}
      </div>
      <div className={cn("text-[clamp(1rem,2.5vw,1.5rem)]", isRed ? "text-red-500" : "text-gray-900")}>
        {suitSymbol}
      </div>
      <div className={cn("text-[clamp(0.6rem,1.5vw,0.75rem)] font-bold self-end rotate-180 leading-none", isRed ? "text-red-500" : "text-gray-900")}>
        {card.rank}
      </div>
    </motion.div>
  );
}

function HandDisplay({ 
  hand, 
  isActive, 
  showTotal = true,
  label 
}: { 
  hand: HandType; 
  isActive?: boolean; 
  showTotal?: boolean;
  label?: string;
}) {
  const { total, isSoft } = calculateHandTotal(hand.cards);
  
  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <div className="text-xs text-slate-400 font-medium">{label}</div>
      )}
      <div className={cn(
        "flex -space-x-6",
        isActive && "ring-2 ring-cyan-400 rounded-lg p-1"
      )}>
        {hand.cards.map((card, i) => (
          <PlayingCard key={`${card.index}-${i}`} card={card} delay={i * 0.1} />
        ))}
      </div>
      {showTotal && hand.cards.length > 0 && (
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-bold",
          hand.isBusted ? "bg-red-500 text-white" :
          hand.isBlackjack ? "bg-amber-500 text-white" :
          total === 21 ? "bg-emerald-500 text-white" :
          "bg-slate-700 text-white"
        )}>
          {isSoft && total <= 21 ? `${total - 10}/${total}` : total}
          {hand.isDoubled && " (2x)"}
        </div>
      )}
    </div>
  );
}

function DealerHand({ 
  cards, 
  holeRevealed 
}: { 
  cards: Card[]; 
  holeRevealed: boolean;
}) {
  if (cards.length === 0) return null;
  
  const visibleCards = holeRevealed ? cards : cards.slice(0, 1);
  const { total } = calculateHandTotal(holeRevealed ? cards : [cards[0]]);
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-slate-400 font-medium">DEALER</div>
      <div className="flex -space-x-6">
        {visibleCards.map((card, i) => (
          <PlayingCard key={`d-${card.index}-${i}`} card={card} delay={i * 0.1} />
        ))}
        {!holeRevealed && cards.length > 1 && (
          <PlayingCard card={cards[1]} hidden delay={0.1} />
        )}
      </div>
      <div className={cn(
        "px-3 py-1 rounded-full text-xs font-bold",
        holeRevealed && total > 21 ? "bg-red-500 text-white" :
        "bg-slate-700 text-white"
      )}>
        {holeRevealed ? total : total}
      </div>
    </div>
  );
}

function DevPanel({ state, show }: { state: GameState; show: boolean }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!show) return null;
  
  return (
    <div className="fixed bottom-4 left-4 z-50 bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl text-xs font-mono max-w-sm">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left text-slate-300 hover:bg-slate-800"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        <span>Dev Panel</span>
        <span className="ml-auto px-2 py-0.5 rounded bg-blue-600 text-white">{state.phase}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1 text-slate-400 max-h-64 overflow-y-auto">
          <div>Last: <span className="text-cyan-400">{state.lastAction}</span></div>
          <div>Balance: <span className="text-green-400">${state.balance.toFixed(2)}</span></div>
          <div>Pending Bet: <span className="text-amber-400">${state.pendingBet.toFixed(2)}</span></div>
          <div>Shoe: <span className="text-slate-300">{state.shoe.length} cards</span></div>
          <div>Hands: <span className="text-slate-300">{state.playerHands.length}</span></div>
          <div>Active: <span className="text-slate-300">{state.activeHandIndex}</span></div>
          <div>Message: <span className="text-white">{state.message}</span></div>
          {state.roundResult && (
            <div>Result: <span className="text-emerald-400">{JSON.stringify(state.roundResult.outcomes.map(o => o.result))}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Blackjack() {
  const { user } = useAuth();
  const { recordResult } = useProfitTracker();
  const { play: playSound } = useSound();
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [selectedChipIndex, setSelectedChipIndex] = useState(1);
  const [chipHistory, setChipHistory] = useState<number[]>([]);
  const actionLockRef = useRef(false);
  const dealerActingRef = useRef(false);
  
  const balance = user?.balance ?? 1000;
  
  const [state, dispatch] = useReducer(gameReducer, createInitialState(balance));
  
  useEffect(() => {
    if (user?.balance !== undefined && state.phase === "IDLE") {
      dispatch({ type: "SET_BALANCE", balance: user.balance });
    }
  }, [user?.balance, state.phase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "~" || e.key === "`") {
        setShowDevPanel(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dealer turn orchestration with hard guard and finally block
  useEffect(() => {
    if (state.phase !== "DEALER_TURN") {
      dealerActingRef.current = false;
      return;
    }
    
    if (dealerActingRef.current) {
      console.log("[Dealer] Already acting, skipping");
      return;
    }
    
    dealerActingRef.current = true;
    console.log("[Dealer] Starting dealer turn");
    
    const runDealerTurn = async () => {
      try {
        dispatch({ type: "SET_PROCESSING", value: true });
        
        // Reveal hole card first
        dispatch({ type: "REVEAL_HOLE" });
        console.log("[Dealer] Hole card revealed");
        await new Promise(r => setTimeout(r, 500));
        
        // Dispatch dealer play which handles the draw loop
        dispatch({ type: "DEALER_PLAY" });
        console.log("[Dealer] DEALER_PLAY dispatched, turn complete");
        
      } catch (error) {
        console.error("[Dealer] Error during dealer turn:", error);
        // Force end round on error
        dispatch({ type: "FORCE_ROUND_END" });
      } finally {
        dispatch({ type: "SET_PROCESSING", value: false });
        dealerActingRef.current = false;
        console.log("[Dealer] Cleanup complete, isProcessing=false");
      }
    };
    
    runDealerTurn();
  }, [state.phase]);

  useEffect(() => {
    if (state.roundResult) {
      const outcome = state.roundResult.outcomes[0];
      if (outcome) {
        const totalBet = state.playerHands.reduce((sum, h) => sum + h.bet, 0);
        const won = outcome.result === "win" || outcome.result === "blackjack";
        playSound(won ? "win" : outcome.result === "push" ? "chipDrop" : "lose");
        
        if (outcome.result !== "push") {
          recordResult("blackjack", totalBet, state.roundResult.totalPayout, won);
        }
      }
    }
  }, [state.roundResult]);

  const actions = getAvailableActions(state);

  const lockAndExecute = useCallback((action: () => void, delay: number = 300) => {
    if (actionLockRef.current || state.isProcessing) return false;
    actionLockRef.current = true;
    dispatch({ type: "SET_PROCESSING", value: true });
    action();
    setTimeout(() => {
      actionLockRef.current = false;
      dispatch({ type: "SET_PROCESSING", value: false });
    }, delay);
    return true;
  }, [state.isProcessing]);

  const handleAddChip = useCallback((chipValue: number) => {
    if (state.phase !== "IDLE") return;
    if (chipValue > state.balance - state.pendingBet) return;
    
    dispatch({ type: "ADD_CHIP", value: chipValue });
    setChipHistory(prev => [...prev, chipValue]);
    playSound("chipDrop");
  }, [state.phase, state.balance, state.pendingBet, playSound]);

  const handleUndo = useCallback(() => {
    if (chipHistory.length === 0 || state.phase !== "IDLE") return;
    const lastChip = chipHistory[chipHistory.length - 1];
    dispatch({ type: "UNDO_CHIP", value: lastChip });
    setChipHistory(prev => prev.slice(0, -1));
  }, [chipHistory, state.phase]);

  const handleClear = useCallback(() => {
    if (state.phase !== "IDLE") return;
    dispatch({ type: "CLEAR_BET" });
    setChipHistory([]);
  }, [state.phase]);

  const handleDeal = useCallback(() => {
    if (!actions.canDeal) return;
    lockAndExecute(() => {
      dispatch({ type: "DEAL" });
      setChipHistory([]);
      playSound("chipDrop");
    }, 400);
  }, [actions.canDeal, lockAndExecute, playSound]);

  const handleHit = useCallback(() => {
    if (!actions.canHit) return;
    lockAndExecute(() => {
      dispatch({ type: "HIT" });
      playSound("cardDeal");
    }, 300);
  }, [actions.canHit, lockAndExecute, playSound]);

  const handleStand = useCallback(() => {
    if (!actions.canStand) return;
    lockAndExecute(() => {
      dispatch({ type: "STAND" });
    }, 300);
  }, [actions.canStand, lockAndExecute]);

  const handleDouble = useCallback(() => {
    if (!actions.canDouble) return;
    lockAndExecute(() => {
      dispatch({ type: "DOUBLE" });
      playSound("cardDeal");
    }, 400);
  }, [actions.canDouble, lockAndExecute, playSound]);

  const handleSplit = useCallback(() => {
    if (!actions.canSplit) return;
    lockAndExecute(() => {
      dispatch({ type: "SPLIT" });
      playSound("cardDeal");
    }, 400);
  }, [actions.canSplit, lockAndExecute, playSound]);

  const handleInsurance = useCallback((accept: boolean) => {
    if (!actions.canInsurance) return;
    lockAndExecute(() => {
      dispatch({ type: "INSURANCE", accept });
    }, 300);
  }, [actions.canInsurance, lockAndExecute]);

  const handleNewRound = useCallback(() => {
    if (!actions.canNewRound || actionLockRef.current) return;
    dispatch({ type: "NEW_ROUND" });
  }, [actions.canNewRound]);

  const selectedChip = CHIPS[selectedChipIndex];
  const isPlaying = state.phase !== "IDLE" && state.phase !== "ROUND_END";

  return (
    <Layout>
      <div 
        className="min-h-screen flex flex-col"
        style={{ background: "linear-gradient(180deg, #0a1628 0%, #0c1929 50%, #0a1628 100%)" }}
      >
        <div className="flex-1 flex flex-col mx-auto w-full px-3 py-3" style={{ maxWidth: "min(1100px, 95vw)" }}>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <h1 className="text-lg font-semibold text-white">Blackjack</h1>
            </div>
            <div className="flex items-center gap-2">
              <ProfitTrackerWidget gameId="blackjack" />
            </div>
          </div>

          <div 
            className="flex-1 relative rounded-2xl overflow-hidden"
            style={{
              background: "radial-gradient(ellipse 120% 80% at 50% 40%, #1a3a5c 0%, #0f2744 40%, #0a1c30 100%)",
              border: "2px solid rgba(30, 64, 100, 0.6)",
              minHeight: "clamp(320px, 50vh, 400px)",
            }}
          >
            <div 
              className="absolute inset-4 rounded-full opacity-30 pointer-events-none"
              style={{
                border: "2px solid rgba(100, 160, 200, 0.3)",
                background: "radial-gradient(ellipse at center, transparent 60%, rgba(10, 40, 70, 0.5) 100%)",
              }}
            />

            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
              <DealerHand cards={state.dealerHand} holeRevealed={state.dealerHoleRevealed} />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={state.message}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "px-6 py-3 rounded-xl text-center",
                    state.phase === "ROUND_END" 
                      ? state.roundResult?.outcomes[0]?.result === "win" || state.roundResult?.outcomes[0]?.result === "blackjack"
                        ? "bg-emerald-600/90 text-white"
                        : state.roundResult?.outcomes[0]?.result === "push"
                        ? "bg-amber-600/90 text-white"
                        : "bg-red-600/90 text-white"
                      : "bg-slate-800/80 text-slate-200"
                  )}
                >
                  <div className="text-lg font-bold">{state.message}</div>
                  {state.phase === "ROUND_END" && state.roundResult && (
                    <div className="text-sm mt-1 opacity-80">
                      Payout: ${state.roundResult.totalPayout.toFixed(2)}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="absolute bottom-[clamp(5rem,12vh,8rem)] left-1/2 -translate-x-1/2 z-10">
              <div className="flex gap-4 items-end">
                {state.playerHands.map((hand, i) => (
                  <HandDisplay 
                    key={i}
                    hand={hand}
                    isActive={state.activeHandIndex === i && state.phase === "PLAYER_TURN"}
                    label={state.playerHands.length > 1 ? `Hand ${i + 1}` : undefined}
                  />
                ))}
                {state.playerHands.length === 0 && state.phase === "IDLE" && (
                  <div className="flex -space-x-4">
                    <div className="w-[clamp(3rem,5vw,3.75rem)] h-[clamp(4.25rem,7vw,5.25rem)] rounded-lg border-2 border-dashed border-slate-600/40 bg-slate-800/20" />
                    <div className="w-[clamp(3rem,5vw,3.75rem)] h-[clamp(4.25rem,7vw,5.25rem)] rounded-lg border-2 border-dashed border-slate-600/40 bg-slate-800/20" />
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-[clamp(1.5rem,4vh,2rem)] left-1/2 -translate-x-1/2 z-10">
              {state.pendingBet > 0 && state.phase === "IDLE" && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="px-5 py-2 rounded-full bg-slate-800/90 border border-amber-500/50 text-amber-400 font-mono font-bold"
                >
                  ${state.pendingBet.toFixed(2)}
                </motion.div>
              )}
              {state.playerHands.length > 0 && (
                <div className="px-5 py-2 rounded-full bg-slate-800/90 border border-amber-500/50 text-amber-400 font-mono font-bold">
                  ${state.playerHands.reduce((sum, h) => sum + h.bet, 0).toFixed(2)}
                </div>
              )}
            </div>
          </div>

          <div 
            className="mt-4 rounded-xl p-4"
            style={{ background: "rgba(10, 21, 32, 0.9)", border: "1px solid rgba(50, 80, 120, 0.3)" }}
          >
            <AnimatePresence mode="wait">
              {state.phase === "IDLE" && (
                <motion.div
                  key="betting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-400">
                      Balance: <span className="text-emerald-400 font-mono">${state.balance.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUndo}
                        disabled={chipHistory.length === 0}
                        className="border-slate-600 text-slate-400"
                        data-testid="button-undo"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClear}
                        disabled={state.pendingBet === 0}
                        className="border-slate-600 text-slate-400"
                        data-testid="button-clear"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {CHIPS.map((chip, i) => (
                      <ChipButton
                        key={chip.value}
                        chip={chip}
                        selected={selectedChipIndex === i}
                        onClick={() => {
                          setSelectedChipIndex(i);
                          handleAddChip(chip.value);
                        }}
                        disabled={chip.value > state.balance - state.pendingBet}
                      />
                    ))}
                  </div>

                  <Button
                    size="lg"
                    className="w-full h-12 bg-blue-600 hover:bg-blue-500 font-bold text-lg"
                    onClick={handleDeal}
                    disabled={!actions.canDeal}
                    data-testid="button-deal"
                  >
                    Deal
                  </Button>
                </motion.div>
              )}

              {state.phase === "INSURANCE" && (
                <motion.div
                  key="insurance"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-4 items-center"
                >
                  <div className="text-white text-center">
                    <div className="text-lg font-bold mb-1">Insurance?</div>
                    <div className="text-sm text-slate-400">
                      Dealer shows an Ace. Take insurance for ${(state.playerHands[0]?.bet / 2).toFixed(2)}?
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="border-red-500 text-red-400 hover:bg-red-500/20"
                      onClick={() => handleInsurance(false)}
                      disabled={state.isProcessing}
                      data-testid="button-no-insurance"
                    >
                      No Thanks
                    </Button>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-500"
                      onClick={() => handleInsurance(true)}
                      disabled={state.isProcessing || (state.playerHands[0]?.bet / 2) > state.balance}
                      data-testid="button-yes-insurance"
                    >
                      Take Insurance
                    </Button>
                  </div>
                </motion.div>
              )}

              {state.phase === "PLAYER_TURN" && (
                <motion.div
                  key="playing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3"
                >
                  <div className="text-center text-sm text-slate-400">
                    {state.playerHands.length > 1 && `Playing Hand ${state.activeHandIndex + 1} of ${state.playerHands.length}`}
                  </div>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {actions.canDouble && (
                      <Button
                        variant="outline"
                        className="border-amber-500 text-amber-400 hover:bg-amber-500/20 gap-2"
                        onClick={handleDouble}
                        disabled={state.isProcessing}
                        data-testid="button-double"
                      >
                        <Layers className="w-4 h-4" />
                        Double
                      </Button>
                    )}
                    {actions.canSplit && (
                      <Button
                        variant="outline"
                        className="border-purple-500 text-purple-400 hover:bg-purple-500/20 gap-2"
                        onClick={handleSplit}
                        disabled={state.isProcessing}
                        data-testid="button-split"
                      >
                        Split
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="border-slate-500 text-slate-300 hover:bg-slate-500/20 gap-2 min-w-24"
                      onClick={handleHit}
                      disabled={!actions.canHit}
                      data-testid="button-hit"
                    >
                      <Hand className="w-4 h-4" />
                      Hit
                    </Button>
                    <Button
                      className="bg-red-600 hover:bg-red-500 gap-2 min-w-24"
                      onClick={handleStand}
                      disabled={!actions.canStand}
                      data-testid="button-stand"
                    >
                      <Square className="w-4 h-4" />
                      Stand
                    </Button>
                  </div>
                </motion.div>
              )}

              {state.phase === "DEALER_TURN" && (
                <motion.div
                  key="dealer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-4"
                >
                  <div className="flex items-center gap-3 text-slate-300">
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    <span>Dealer's turn...</span>
                  </div>
                </motion.div>
              )}

              {state.phase === "ROUND_END" && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-4 items-center"
                >
                  <div className="text-center">
                    <div className="text-sm text-slate-400 mb-1">
                      Balance: <span className="text-emerald-400 font-mono">${state.balance.toFixed(2)}</span>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="w-full max-w-xs h-12 bg-blue-600 hover:bg-blue-500 font-bold text-lg"
                    onClick={handleNewRound}
                    data-testid="button-new-round"
                  >
                    New Hand
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <DevPanel state={state} show={showDevPanel} />
      </div>
    </Layout>
  );
}
