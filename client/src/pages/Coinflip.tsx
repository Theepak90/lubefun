import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useCoinflipGame } from "@/hooks/use-games";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Coinflip() {
  const { mutate: playCoinflip, isPending } = useCoinflipGame();
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);

  const handleBet = (amount: number) => {
    setFlipping(true);
    setResult(null);
    
    // Simulate animation time before API call resolves visually
    setTimeout(() => {
      playCoinflip(
        { betAmount: amount, side },
        {
          onSuccess: (data: any) => {
            setResult(data.result.flip);
            setFlipping(false);
          },
          onError: () => setFlipping(false)
        }
      );
    }, 1000);
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        {/* Controls */}
        <div className="w-full lg:w-auto lg:shrink-0 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-card border-b border-border p-4 lg:hidden">
             <h2 className="font-display font-bold text-xl flex items-center gap-2">
               <Coins className="w-6 h-6 text-primary" /> Coinflip
             </h2>
          </div>
          <BetControls 
             onBet={handleBet} 
             isPending={isPending || flipping} 
             className="h-full rounded-b-2xl lg:rounded-2xl"
          />
        </div>

        {/* Game Area */}
        <Card className="flex-1 bg-card border-border p-6 lg:p-12 flex flex-col justify-center items-center relative overflow-hidden min-h-[500px]">
          
          <div className="mb-12 flex gap-4">
             <button 
               onClick={() => setSide("heads")}
               className={cn(
                 "w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden group",
                 side === "heads" ? "border-primary bg-primary/10 scale-110 shadow-[0_0_30px_-5px_rgba(34,197,94,0.4)]" : "border-border bg-secondary/20 hover:border-primary/50"
               )}
             >
               <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center justify-center shadow-inner">
                  <span className="text-yellow-900 font-bold text-2xl font-display">H</span>
               </div>
               {side === "heads" && <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full" />}
             </button>

             <button 
               onClick={() => setSide("tails")}
               className={cn(
                 "w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden group",
                 side === "tails" ? "border-primary bg-primary/10 scale-110 shadow-[0_0_30px_-5px_rgba(34,197,94,0.4)]" : "border-border bg-secondary/20 hover:border-primary/50"
               )}
             >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-inner">
                   <span className="text-gray-800 font-bold text-2xl font-display">T</span>
                </div>
                {side === "tails" && <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full" />}
             </button>
          </div>

          {/* The Coin */}
          <div className="relative w-48 h-48 perspective-[1000px]">
             <motion.div
               className="w-full h-full relative preserve-3d"
               animate={{ 
                 rotateY: flipping ? 1800 : (result === "tails" ? 180 : 0) 
               }}
               transition={{ 
                 duration: flipping ? 2 : 0.5, 
                 ease: "circOut" 
               }}
               style={{ transformStyle: "preserve-3d" }}
             >
                {/* Front (Heads) */}
                <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 shadow-xl border-4 border-yellow-200 flex items-center justify-center">
                   <div className="w-40 h-40 rounded-full border-2 border-yellow-700/30 flex items-center justify-center">
                      <span className="text-6xl font-bold text-yellow-900 font-display">HEADS</span>
                   </div>
                </div>

                {/* Back (Tails) */}
                <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-gray-300 to-gray-500 shadow-xl border-4 border-gray-200 flex items-center justify-center" style={{ transform: "rotateY(180deg)" }}>
                   <div className="w-40 h-40 rounded-full border-2 border-gray-700/30 flex items-center justify-center">
                      <span className="text-6xl font-bold text-gray-800 font-display">TAILS</span>
                   </div>
                </div>
             </motion.div>
          </div>

          <div className="h-12 mt-8 flex items-center justify-center">
            <AnimatePresence>
              {result && !flipping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "text-2xl font-bold px-6 py-2 rounded-full",
                    result === side ? "text-primary bg-primary/10 border border-primary/20" : "text-destructive bg-destructive/10 border border-destructive/20"
                  )}
                >
                  {result === side ? "YOU WON!" : "YOU LOST"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </Card>
      </div>
    </Layout>
  );
}
