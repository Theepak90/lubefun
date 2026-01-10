import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { useDiceGame } from "@/hooks/use-games";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, useAnimation } from "framer-motion";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { GAME_CONFIG } from "@shared/config";
import { useAuth } from "@/hooks/use-auth";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { RecentResults } from "@/components/RecentResults";

export default function Dice() {
  const { mutate: playDice, isPending } = useDiceGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [lastResult, setLastResult] = useState<{ result: number, won: boolean } | null>(null);
  const [amount, setAmount] = useState<string>("10");
  const controls = useAnimation();
  
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const rafId = useRef<number | null>(null);

  const winChance = condition === "above" ? (100 - target) : target;
  const baseMultiplier = 100 / winChance;
  const multiplier = (baseMultiplier * GAME_CONFIG.RTP).toFixed(4);

  const handleBet = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 1) return;
    setLastResult(null);
    playSound("bet");
    playDice(
      { betAmount: val, target, condition },
      {
        onSuccess: (data: any) => {
          const result = data.result.roll;
          controls.start({
            left: `${result}%`,
            transition: { type: "spring", stiffness: 300, damping: 20 }
          });
          setLastResult({ result, won: data.won });
          
          setTimeout(() => {
            playSound(data.won ? "win" : "lose");
          }, 300);
          
          addResult({
            game: "dice",
            betAmount: val,
            won: data.won,
            profit: data.profit,
            detail: `Rolled ${result.toFixed(2)} (${condition} ${target})`
          });
        }
      }
    );
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const updateSliderValue = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const padding = 16;
    const trackWidth = rect.width - padding * 2;
    const x = clientX - rect.left - padding;
    const percentage = Math.max(2, Math.min(98, (x / trackWidth) * 100));
    setTarget(Math.round(percentage));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    sliderRef.current?.setPointerCapture(e.pointerId);
    updateSliderValue(e.clientX);
  }, [updateSliderValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    e.preventDefault();
    
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      updateSliderValue(e.clientX);
    });
  }, [updateSliderValue]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    sliderRef.current?.releasePointerCapture(e.pointerId);
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

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
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all"
                    onClick={halve}
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all"
                    onClick={double}
                  >
                    2x
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.1, 0.25, 0.5, 1].map((pct) => (
                    <button 
                      key={pct} 
                      className="py-1.5 rounded-md bg-[#1a2530]/50 hover:bg-[#1a2530] text-[10px] font-semibold text-slate-500 hover:text-white transition-all border border-transparent hover:border-[#2a3a4a]"
                      onClick={() => setPercent(pct)}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profit on Win */}
              <div className="space-y-2 mb-6">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Profit on Win
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    +${((parseFloat(amount || "0") * parseFloat(multiplier)) - parseFloat(amount || "0")).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Place Bet Button */}
              <Button 
                size="lg" 
                className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                onClick={handleBet}
                disabled={isPending || !user || parseFloat(amount) > (user?.balance || 0)}
                data-testid="button-place-bet"
              >
                {isPending ? "Rolling..." : user ? "Place Bet" : "Login to Play"}
              </Button>
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-6 relative flex flex-col justify-center min-h-[420px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Slider Section */}
              <div className="mb-6">
                
                {/* Result Indicator */}
                <div className="relative h-12 mx-4 mb-2">
                  <motion.div 
                    className="absolute -translate-x-1/2 z-10 pointer-events-none"
                    initial={{ left: "50%" }}
                    animate={controls}
                  >
                    <div className={cn(
                      "px-3 py-1 rounded-md font-mono font-bold text-sm min-w-[60px] text-center shadow-lg transition-colors",
                      lastResult 
                        ? (lastResult.won 
                          ? "bg-emerald-500/20 border border-emerald-500 text-emerald-400" 
                          : "bg-red-500/20 border border-red-500 text-red-400"
                        ) 
                        : "bg-[#1a2530] border border-[#2a3a4a] text-slate-400"
                    )}>
                      {lastResult?.result.toFixed(2) ?? "—"}
                    </div>
                    <div className={cn(
                      "w-2 h-2 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2 border-r border-b transition-colors",
                      lastResult 
                        ? (lastResult.won 
                          ? "bg-emerald-500/20 border-emerald-500" 
                          : "bg-red-500/20 border-red-500"
                        ) 
                        : "bg-[#1a2530] border-[#2a3a4a]"
                    )} />
                  </motion.div>
                </div>

                {/* Main Slider */}
                <div 
                  ref={sliderRef}
                  className="relative px-4 py-5 cursor-pointer touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  data-testid="slider-bar"
                >
                  {/* Track */}
                  <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#1a2530' }}>
                    <div 
                      className="absolute inset-y-0 left-0 pointer-events-none"
                      style={{ 
                        width: `${target}%`,
                        background: condition === "above" ? '#dc2626' : '#10b981'
                      }}
                    />
                    <div 
                      className="absolute inset-y-0 right-0 pointer-events-none"
                      style={{ 
                        width: `${100 - target}%`,
                        background: condition === "above" ? '#10b981' : '#dc2626'
                      }}
                    />
                  </div>
                  
                  {/* Thumb */}
                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0 pointer-events-none">
                    <div 
                      className="absolute -translate-x-1/2"
                      style={{ left: `${target}%` }}
                    >
                      <div className="w-7 h-7 bg-white rounded-md shadow-lg border border-slate-200 flex items-center justify-center -mt-3.5">
                        <div className="flex flex-col gap-0.5">
                          <div className="w-2.5 h-0.5 bg-slate-300 rounded-full" />
                          <div className="w-2.5 h-0.5 bg-slate-300 rounded-full" />
                          <div className="w-2.5 h-0.5 bg-slate-300 rounded-full" />
                        </div>
                      </div>
                      
                      <div className="text-center mt-2 whitespace-nowrap">
                        <span className="text-xl font-mono font-bold text-white">
                          {target.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tick Marks */}
                <div className="flex justify-between mt-8 px-4">
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <div key={tick} className="flex flex-col items-center">
                      <div className="w-px h-1 bg-slate-600 mb-0.5" />
                      <span className="text-[9px] font-mono text-slate-500">{tick}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                
                {/* Multiplier */}
                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Multiplier
                  </label>
                  <Input 
                    type="text"
                    value={`${multiplier}x`}
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                    data-testid="input-multiplier"
                  />
                </div>

                {/* Roll Over/Under */}
                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Roll {condition === "above" ? "Over" : "Under"}
                  </label>
                  <div className="flex bg-[#0d1419] rounded-md p-0.5 border border-[#1a2530]">
                    <button 
                      className={cn(
                        "flex-1 py-1.5 rounded text-[10px] font-semibold transition-all",
                        condition === "above" 
                          ? "bg-emerald-500 text-white" 
                          : "text-slate-500 hover:text-white"
                      )}
                      onClick={() => setCondition("above")}
                      data-testid="button-roll-over"
                    >
                      Over
                    </button>
                    <button 
                      className={cn(
                        "flex-1 py-1.5 rounded text-[10px] font-semibold transition-all",
                        condition === "below" 
                          ? "bg-emerald-500 text-white" 
                          : "text-slate-500 hover:text-white"
                      )}
                      onClick={() => setCondition("below")}
                      data-testid="button-roll-under"
                    >
                      Under
                    </button>
                  </div>
                </div>

                {/* Win Chance */}
                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Win Chance
                  </label>
                  <Input 
                    type="text"
                    value={`${winChance.toFixed(2)}%`}
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                    data-testid="input-win-chance"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <RecentResults 
          results={results} 
          onClear={clearHistory}
          filterGame="dice"
        />
      </div>
    </Layout>
  );
}
