import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useDiceGame } from "@/hooks/use-games";
import { Slider } from "@/components/ui/slider";
import { motion, useAnimation } from "framer-motion";
import { Dice5 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dice() {
  const { mutate: playDice, isPending } = useDiceGame();
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [lastResult, setLastResult] = useState<{ result: number, won: boolean } | null>(null);
  const controls = useAnimation();

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

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
        {/* Controls Panel */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="neon-card p-5 lg:hidden mb-4">
            <h2 className="font-display font-bold text-lg flex items-center gap-2 text-cyan-400 tracking-wider">
              <Dice5 className="w-5 h-5" /> Dice
            </h2>
          </div>
          <BetControls 
            onBet={handleBet} 
            isPending={isPending} 
            className="neon-card"
          />
        </div>

        {/* Game Area */}
        <div className="flex-1 neon-card p-8 lg:p-12 flex flex-col justify-center items-center relative overflow-hidden min-h-[500px]">
          {/* Stats Bar */}
          <div className="w-full grid grid-cols-3 gap-6 mb-14 p-5 neon-card-magenta">
            <div className="text-center">
               <div className="text-xs font-display text-pink-400 uppercase tracking-wider mb-2">Multiplier</div>
               <div className="text-2xl font-mono font-bold text-cyan-400 text-glow-cyan">{multiplier}x</div>
            </div>
            <div className="text-center border-x border-pink-500/20">
               <div className="text-xs font-display text-pink-400 uppercase tracking-wider mb-2">Win Chance</div>
               <div className="text-2xl font-mono font-bold text-foreground">{winChance.toFixed(2)}%</div>
            </div>
            <div className="text-center">
               <div className="text-xs font-display text-pink-400 uppercase tracking-wider mb-2">Result</div>
               <div className={cn("text-2xl font-mono font-bold", lastResult ? (lastResult.won ? "text-cyan-400 text-glow-cyan" : "text-pink-400 text-glow-magenta") : "text-purple-400")}>
                  {lastResult ? lastResult.result.toFixed(2) : "-"}
               </div>
            </div>
          </div>

          {/* Dice Slider */}
          <div className="w-full max-w-2xl px-8 py-14 neon-card relative">
            
            {/* Range Bar */}
            <div className="relative h-4 bg-purple-900/50 rounded-full overflow-hidden mb-10 border border-purple-500/30">
               <motion.div 
                 className={cn(
                   "absolute h-full transition-all duration-300",
                   condition === "above" ? "right-0 bg-gradient-to-r from-cyan-500 to-cyan-400" : "left-0 bg-gradient-to-l from-cyan-500 to-cyan-400"
                 )}
                 style={{ width: `${winChance}%` }}
                 animate={{ boxShadow: "0 0 20px hsl(180, 100%, 50%, 0.5)" }}
               />
            </div>

            {/* Slider Component */}
            <div className="relative">
              <Slider
                value={[target]}
                min={2}
                max={98}
                step={1}
                onValueChange={(val) => setTarget(val[0])}
                className="w-full relative z-20"
              />
              
              {/* Result Indicator */}
              <motion.div 
                className="absolute top-[-55px] -translate-x-1/2 z-10 pointer-events-none"
                initial={{ left: "50%" }}
                animate={controls}
              >
                <div className={cn(
                  "neon-card px-4 py-2 font-mono font-bold text-lg min-w-[80px] text-center",
                  lastResult ? (lastResult.won ? "neon-glow-cyan text-cyan-400" : "neon-glow-magenta text-pink-400") : "text-purple-400"
                )}>
                  {lastResult?.result.toFixed(2) || "50.00"}
                </div>
                <div className={cn(
                  "w-3 h-3 bg-card border-r border-b rotate-45 absolute bottom-[-6px] left-1/2 -translate-x-1/2",
                  lastResult ? (lastResult.won ? "border-cyan-500/50" : "border-pink-500/50") : "border-purple-500/30"
                )} />
              </motion.div>
            </div>
            
            <div className="flex justify-between mt-10">
               {[0, 25, 50, 75, 100].map((val) => (
                 <span key={val} className="font-mono text-sm text-purple-400">{val}</span>
               ))}
            </div>
          </div>

          {/* Roll Over/Under Toggle */}
          <div className="mt-10 flex neon-card p-1.5">
             <button 
               className={cn(
                 "px-8 py-3 rounded-xl text-sm font-display font-bold tracking-wider transition-all",
                 condition === "above" ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-black neon-glow-cyan" : "text-purple-400 hover:text-cyan-400"
               )}
               onClick={() => setCondition("above")}
             >
               Roll Over
             </button>
             <button 
               className={cn(
                 "px-8 py-3 rounded-xl text-sm font-display font-bold tracking-wider transition-all",
                 condition === "below" ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-black neon-glow-cyan" : "text-purple-400 hover:text-cyan-400"
               )}
               onClick={() => setCondition("below")}
             >
               Roll Under
             </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
