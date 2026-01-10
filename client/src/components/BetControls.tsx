import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

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
    <div className={cn("bg-card border-t lg:border-t-0 lg:border-r border-border p-4 lg:p-6 flex flex-col gap-6 lg:w-[320px] shrink-0", className)}>
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase">
          <Label>Bet Amount</Label>
          <span>${parseFloat(amount || "0").toFixed(2)}</span>
        </div>
        
        <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl border border-input focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
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
            className="h-10 w-10 px-0 font-mono text-muted-foreground hover:text-foreground"
            onClick={halve}
          >
            ½
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 px-0 font-mono text-muted-foreground hover:text-foreground"
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
               className="bg-secondary/30 border-transparent hover:bg-secondary text-xs"
               onClick={() => setPercent(pct)}
             >
               {pct === 1 ? "Max" : `${pct * 100}%`}
             </Button>
           ))}
        </div>
      </div>

      <div className="mt-auto">
        <Button 
          size="lg" 
          className="w-full h-14 text-lg font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-[0.98] select-none text-center flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" 
          onClick={handleBet}
          disabled={isPending || disabled || !user || parseFloat(amount) > (user?.balance || 0)}
        >
          <span className="select-none">{isPending ? "Betting..." : user ? actionLabel : "Login to Play"}</span>
        </Button>
      </div>
    </div>
  );
}
