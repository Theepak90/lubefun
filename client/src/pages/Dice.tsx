import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useDiceGame } from "@/hooks/use-games";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { motion, useAnimation } from "framer-motion";
import { Dice5, Trophy } from "lucide-react";
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
          // Animate the slider indicator to the result position
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
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        {/* Controls Panel */}
        <div className="w-full lg:w-auto lg:shrink-0 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-card border-b border-border p-4 lg:hidden">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <Dice5 className="w-6 h-6 text-primary" /> Dice
            </h2>
          </div>
          <BetControls 
            onBet={handleBet} 
            isPending={isPending} 
            className="h-full rounded-b-2xl lg:rounded-2xl"
          />
        </div>

        {/* Game Area */}
        <Card className="flex-1 bg-card border-border p-6 lg:p-12 flex flex-col justify-center items-center relative overflow-hidden min-h-[500px]">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />

          {/* Stats Bar */}
          <div className="w-full grid grid-cols-3 gap-4 mb-12 p-4 bg-secondary/30 rounded-xl border border-white/5 backdrop-blur-sm">
            <div className="text-center">
               <div className="text-xs text-muted-foreground font-bold uppercase mb-1">Multiplier</div>
               <div className="text-xl font-mono font-bold text-primary">{multiplier}x</div>
            </div>
            <div className="text-center border-x border-white/5">
               <div className="text-xs text-muted-foreground font-bold uppercase mb-1">Win Chance</div>
               <div className="text-xl font-mono font-bold text-foreground">{winChance.toFixed(2)}%</div>
            </div>
            <div className="text-center">
               <div className="text-xs text-muted-foreground font-bold uppercase mb-1">Result</div>
               <div className={cn("text-xl font-mono font-bold", lastResult ? (lastResult.won ? "text-primary text-glow" : "text-destructive") : "text-muted")}>
                  {lastResult ? lastResult.result.toFixed(2) : "-"}
               </div>
            </div>
          </div>

          {/* Dice Slider */}
          <div className="w-full max-w-2xl px-8 py-16 bg-secondary/20 rounded-3xl border border-white/5 relative">
            
            {/* Range Bar */}
            <div className="relative h-4 bg-secondary rounded-full overflow-hidden mb-8 shadow-inner">
               <div 
                 className={cn("absolute h-full transition-all duration-300", condition === "above" ? "bg-primary right-0" : "bg-primary left-0")}
                 style={{ width: `${winChance}%` }}
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
                className="w-full relative z-20 cursor-grab active:cursor-grabbing"
              />
              
              {/* Result Indicator */}
              <motion.div 
                className="absolute top-[-40px] -translate-x-1/2 z-10 pointer-events-none"
                initial={{ left: "50%" }}
                animate={controls}
              >
                <div className={cn(
                  "bg-card border-2 px-3 py-1 rounded-lg font-mono font-bold shadow-lg text-lg min-w-[60px] text-center",
                  lastResult ? (lastResult.won ? "border-primary text-primary" : "border-destructive text-destructive") : "border-muted text-muted-foreground"
                )}>
                  {lastResult?.result.toFixed(2) || 50.00}
                </div>
                <div className={cn(
                  "w-4 h-4 bg-card border-r-2 border-b-2 rotate-45 absolute bottom-[-8px] left-1/2 -translate-x-1/2",
                  lastResult ? (lastResult.won ? "border-primary" : "border-destructive") : "border-muted"
                )} />
              </motion.div>
            </div>
            
            <div className="flex justify-between mt-8">
               <span className="font-mono font-bold text-muted-foreground">0</span>
               <span className="font-mono font-bold text-muted-foreground">25</span>
               <span className="font-mono font-bold text-muted-foreground">50</span>
               <span className="font-mono font-bold text-muted-foreground">75</span>
               <span className="font-mono font-bold text-muted-foreground">100</span>
            </div>
          </div>

          {/* Roll Over/Under Toggle */}
          <div className="mt-8 flex bg-secondary rounded-xl p-1 shadow-inner">
             <button 
               className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all", condition === "above" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
               onClick={() => setCondition("above")}
             >
               Roll Over
             </button>
             <button 
               className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all", condition === "below" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
               onClick={() => setCondition("below")}
             >
               Roll Under
             </button>
          </div>

        </Card>
      </div>
    </Layout>
  );
}
