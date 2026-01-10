import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { BetControls } from "@/components/BetControls";
import { useCoinflipGame } from "@/hooks/use-games";
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
      <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
        {/* Controls */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="neon-card p-5 lg:hidden mb-4">
             <h2 className="font-display font-bold text-lg flex items-center gap-2 text-pink-400 tracking-wider">
               <Coins className="w-5 h-5" /> Coinflip
             </h2>
          </div>
          <BetControls 
             onBet={handleBet} 
             isPending={isPending || flipping} 
             className="neon-card"
          />
        </div>

        {/* Game Area */}
        <div className="flex-1 neon-card-magenta p-8 lg:p-12 flex flex-col justify-center items-center relative overflow-hidden min-h-[500px]">
          
          <div className="mb-14 flex gap-8">
             <motion.button 
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => setSide("heads")}
               className={cn(
                 "w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                 side === "heads" ? "border-cyan-400 neon-glow-cyan" : "border-purple-500/30 hover:border-cyan-400/50"
               )}
             >
               <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-lg">
                  <span className="text-amber-900 font-display font-black text-2xl">H</span>
               </div>
             </motion.button>

             <motion.button 
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => setSide("tails")}
               className={cn(
                 "w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                 side === "tails" ? "border-pink-400 neon-glow-magenta" : "border-purple-500/30 hover:border-pink-400/50"
               )}
             >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center shadow-lg">
                   <span className="text-slate-800 font-display font-black text-2xl">T</span>
                </div>
             </motion.button>
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
                <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-amber-300 to-amber-600 shadow-2xl border-4 border-amber-400/50 flex items-center justify-center">
                   <div className="w-40 h-40 rounded-full border-2 border-amber-700/30 flex items-center justify-center">
                      <span className="text-4xl font-display font-black text-amber-900 tracking-wider">HEADS</span>
                   </div>
                </div>

                {/* Back (Tails) */}
                <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-slate-300 to-slate-500 shadow-2xl border-4 border-slate-400/50 flex items-center justify-center" style={{ transform: "rotateY(180deg)" }}>
                   <div className="w-40 h-40 rounded-full border-2 border-slate-700/30 flex items-center justify-center">
                      <span className="text-4xl font-display font-black text-slate-800 tracking-wider">TAILS</span>
                   </div>
                </div>
             </motion.div>
          </div>

          <div className="h-16 mt-10 flex items-center justify-center">
            <AnimatePresence>
              {result && !flipping && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={cn(
                    "text-2xl font-display font-bold px-8 py-3 rounded-xl tracking-wider",
                    result === side ? "neon-card neon-glow-cyan text-cyan-400" : "neon-card-magenta neon-glow-magenta text-pink-400"
                  )}
                >
                  {result === side ? "YOU WON!" : "YOU LOST"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </Layout>
  );
}
