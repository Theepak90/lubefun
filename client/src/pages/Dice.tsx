import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useDiceGame } from "@/hooks/use-games";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, useAnimation } from "framer-motion";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dice() {
  const { mutate: playDice, isPending } = useDiceGame();
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [lastResult, setLastResult] = useState<{ result: number, won: boolean } | null>(null);
  const controls = useAnimation();
  
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const rafId = useRef<number | null>(null);

  const multiplier = (condition === "above" ? (99 / (100 - target)) : (99 / target)).toFixed(4);
  const winChance = condition === "above" ? (100 - target) : target;

  const handleBet = (amount: number) => {
    setLastResult(null);
    playDice(
      { betAmount: amount, target, condition },
      {
        onSuccess: (data: any) => {
          const result = data.result.roll;
          controls.start({
            left: `${result}%`,
            transition: { type: "spring", stiffness: 300, damping: 20 }
          });
          setLastResult({ result, won: data.won });
        }
      }
    );
  };

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
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Left Column: Bet Controls */}
          <div className="w-full lg:w-80 shrink-0">
            <Card className="bg-[#0f1923] border-[#1e2a36] rounded-2xl overflow-hidden shadow-xl">
              <BetControls 
                onBet={handleBet} 
                isPending={isPending} 
                className="rounded-2xl"
              />
            </Card>
          </div>

          {/* Main Game Area */}
          <Card className="flex-1 bg-[#0f1923] border-[#1e2a36] rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-xl">
            
            {/* Fair Play Badge */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2633] rounded-full border border-[#2a3a4a]">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">Fair Play</span>
            </div>

            {/* Slider Section */}
            <div className="mt-12 mb-8">
              
              {/* Result Indicator */}
              <div className="relative h-16 mb-2">
                <motion.div 
                  className="absolute -translate-x-1/2 z-10 pointer-events-none"
                  initial={{ left: "50%" }}
                  animate={controls}
                >
                  <div className={cn(
                    "px-4 py-2 rounded-xl font-mono font-bold text-lg min-w-[80px] text-center shadow-lg transition-colors",
                    lastResult 
                      ? (lastResult.won 
                        ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400" 
                        : "bg-red-500/20 border-2 border-red-500 text-red-400"
                      ) 
                      : "bg-[#1a2633] border-2 border-[#2a3a4a] text-slate-400"
                  )}>
                    {lastResult?.result.toFixed(2) ?? "50.00"}
                  </div>
                  <div className={cn(
                    "w-3 h-3 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-r-2 border-b-2 transition-colors",
                    lastResult 
                      ? (lastResult.won 
                        ? "bg-emerald-500/20 border-emerald-500" 
                        : "bg-red-500/20 border-red-500"
                      ) 
                      : "bg-[#1a2633] border-[#2a3a4a]"
                  )} />
                </motion.div>
              </div>

              {/* Main Slider Container - entire area is draggable */}
              <div 
                ref={sliderRef}
                className="relative px-4 py-6 cursor-pointer select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                data-testid="slider-bar"
              >
                {/* Track bar */}
                <div className="relative h-4 rounded-full overflow-hidden shadow-inner" style={{ background: '#1a2633' }}>
                  {/* Loss segment (left) - pointer-events-none */}
                  <div 
                    className="absolute inset-y-0 left-0 pointer-events-none"
                    style={{ 
                      width: `${target}%`,
                      background: condition === "above" ? '#dc2626' : '#10b981'
                    }}
                  />
                  {/* Win segment (right) - pointer-events-none */}
                  <div 
                    className="absolute inset-y-0 right-0 pointer-events-none"
                    style={{ 
                      width: `${100 - target}%`,
                      background: condition === "above" ? '#10b981' : '#dc2626'
                    }}
                  />
                </div>
                
                {/* Thumb container - same width as track, positioned over it */}
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0 pointer-events-none">
                  <div 
                    className="absolute -translate-x-1/2"
                    style={{ left: `${target}%` }}
                  >
                    {/* Square thumb with inner lines */}
                    <div className="w-8 h-8 bg-white rounded-lg shadow-lg border border-slate-200 flex items-center justify-center -mt-4">
                      {/* Inner grip lines */}
                      <div className="flex flex-col gap-0.5">
                        <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                        <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                        <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                      </div>
                    </div>
                    
                    {/* Value label beneath thumb */}
                    <div className="text-center mt-2 whitespace-nowrap">
                      <span className="text-2xl font-mono font-bold text-white">
                        {target.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tick Marks - aligned with slider */}
              <div className="flex justify-between mt-12 px-4">
                {[0, 25, 50, 75, 100].map((tick) => (
                  <div key={tick} className="flex flex-col items-center">
                    <div className="w-px h-2 bg-slate-600 mb-1" />
                    <span className="text-xs font-mono text-slate-500">{tick}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              
              {/* Multiplier Card */}
              <Card className="bg-[#1a2633] border-[#2a3a4a] rounded-xl p-4">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 block">
                  Multiplier
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="text"
                    value={`${multiplier}x`}
                    readOnly
                    className="bg-[#0f1923] border-[#2a3a4a] text-white font-mono text-lg h-11 rounded-lg"
                    data-testid="input-multiplier"
                  />
                </div>
              </Card>

              {/* Roll Over/Under Toggle */}
              <Card className="bg-[#1a2633] border-[#2a3a4a] rounded-xl p-4">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 block">
                  Roll {condition === "above" ? "Over" : "Under"}
                </label>
                <div className="flex bg-[#0f1923] rounded-lg p-1 border border-[#2a3a4a]">
                  <button 
                    className={cn(
                      "flex-1 py-2.5 rounded-md text-sm font-semibold transition-all",
                      condition === "above" 
                        ? "bg-emerald-500 text-white shadow-md" 
                        : "text-slate-400 hover:text-white"
                    )}
                    onClick={() => setCondition("above")}
                    data-testid="button-roll-over"
                  >
                    Over
                  </button>
                  <button 
                    className={cn(
                      "flex-1 py-2.5 rounded-md text-sm font-semibold transition-all",
                      condition === "below" 
                        ? "bg-emerald-500 text-white shadow-md" 
                        : "text-slate-400 hover:text-white"
                    )}
                    onClick={() => setCondition("below")}
                    data-testid="button-roll-under"
                  >
                    Under
                  </button>
                </div>
              </Card>

              {/* Win Chance Card */}
              <Card className="bg-[#1a2633] border-[#2a3a4a] rounded-xl p-4">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 block">
                  Win Chance
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="text"
                    value={`${winChance.toFixed(2)}%`}
                    readOnly
                    className="bg-[#0f1923] border-[#2a3a4a] text-white font-mono text-lg h-11 rounded-lg"
                    data-testid="input-win-chance"
                  />
                </div>
              </Card>
            </div>

          </Card>
        </div>
      </div>
    </Layout>
  );
}
