import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

interface BetControlsProps {
  onBet: (amount: number) => void;
  isPending: boolean;
  minBet?: number;
  maxBet?: number;
  actionLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function BetControls({ 
  onBet, 
  isPending, 
  minBet = 1, 
  maxBet = 1000, 
  actionLabel = "Place Bet",
  className,
  disabled = false
}: BetControlsProps) {
  const [amount, setAmount] = useState<string>("10");
  const { user } = useAuth();

  const handleBet = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < minBet) return;
    onBet(val);
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  return (
    <div className={cn("p-6 flex flex-col gap-6", className)}>
      <div className="space-y-3">
        <div className="flex justify-between text-xs font-display text-cyan-400 uppercase tracking-wider">
          <Label>Bet Amount</Label>
          <span className="text-pink-400">${parseFloat(amount || "0").toFixed(2)}</span>
        </div>
        
        <div className="flex gap-2 bg-purple-900/30 p-2 rounded-xl border border-purple-500/30 focus-within:border-cyan-400/50 transition-all">
          <Input 
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-none bg-transparent h-10 focus-visible:ring-0 font-mono font-bold text-foreground"
            min={minBet}
            max={maxBet}
          />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 px-0 font-mono text-purple-400 hover:text-cyan-400 hover:bg-purple-500/20"
            onClick={halve}
          >
            ½
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 px-0 font-mono text-purple-400 hover:text-cyan-400 hover:bg-purple-500/20"
            onClick={double}
          >
            2x
          </Button>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
           {[0.1, 0.25, 0.5, 1].map((pct) => (
             <Button 
               key={pct} 
               variant="outline" 
               size="sm" 
               className="bg-purple-900/20 border-purple-500/30 hover:bg-purple-500/30 hover:border-cyan-400/50 text-xs font-display font-bold text-purple-300 hover:text-cyan-400 transition-all"
               onClick={() => setPercent(pct)}
             >
               {pct === 1 ? "Max" : `${pct * 100}%`}
             </Button>
           ))}
        </div>
      </div>

      <div className="mt-auto">
        <Button 
          className="w-full h-14 neon-button font-display font-bold text-black tracking-wider rounded-xl text-base" 
          onClick={handleBet}
          disabled={isPending || disabled || !user || parseFloat(amount) > (user?.balance || 0)}
        >
          <Zap className="w-5 h-5 mr-2" />
          {isPending ? "Processing..." : user ? actionLabel : "Login to Play"}
        </Button>
      </div>
    </div>
  );
}
