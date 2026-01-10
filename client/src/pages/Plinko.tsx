import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";

const RISK_MULTIPLIERS = {
  low: [1.5, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.5],
  medium: [3, 1.5, 1.2, 0.8, 0.3, 0.8, 1.2, 1.5, 3],
  high: [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10]
};

export default function Plinko() {
  const { user } = useAuth();
  const { results, clearHistory } = useGameHistory();
  const [amount, setAmount] = useState<string>("10");
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [rows, setRows] = useState<string>("12");
  const [dropping, setDropping] = useState(false);

  const baseAmount = parseFloat(amount || "0");
  const multipliers = RISK_MULTIPLIERS[risk];

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const handleDrop = () => {
    if (baseAmount < 0.1 || baseAmount > (user?.balance || 0)) return;
    setDropping(true);
    setTimeout(() => setDropping(false), 2000);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
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
                    min={0.1}
                    step={0.1}
                    max={1000}
                    disabled={dropping}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={dropping}
                    data-testid="button-halve"
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={dropping}
                    data-testid="button-double"
                  >
                    2x
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.1, 0.25, 0.5, 1].map((pct) => (
                    <button 
                      key={pct} 
                      className="py-1.5 rounded-md bg-[#1a2530]/50 hover:bg-[#1a2530] text-[10px] font-semibold text-slate-500 hover:text-white transition-all border border-transparent hover:border-[#2a3a4a] disabled:opacity-50"
                      onClick={() => setPercent(pct)}
                      disabled={dropping}
                      data-testid={`button-percent-${pct * 100}`}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Level */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Risk Level
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setRisk(level)}
                      disabled={dropping}
                      data-testid={`button-risk-${level}`}
                      className={cn(
                        "py-2.5 rounded-lg font-semibold text-xs transition-all capitalize",
                        risk === level
                          ? level === "low" ? "bg-emerald-500 text-white" :
                            level === "medium" ? "bg-amber-500 text-white" :
                            "bg-red-500 text-white"
                          : "bg-[#1a2530] text-slate-400 hover:text-white border border-[#2a3a4a]"
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Rows
                </Label>
                <Select value={rows} onValueChange={setRows} disabled={dropping}>
                  <SelectTrigger className="bg-[#0d1419] border-[#1a2530] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[8, 10, 12, 14, 16].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} rows</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Max Win */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Max Win
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    +${(baseAmount * Math.max(...multipliers) - baseAmount).toFixed(2)}
                  </span>
                  <span className="text-slate-500 text-xs ml-2">({Math.max(...multipliers)}x)</span>
                </div>
              </div>

              {/* Drop Button */}
              <Button 
                size="lg" 
                className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                onClick={handleDrop}
                disabled={!user || dropping || baseAmount > (user?.balance || 0) || baseAmount < 0.1}
                data-testid="button-drop"
              >
                {dropping ? "Dropping..." : user ? "Drop Ball" : "Login to Play"}
              </Button>
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[480px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Plinko Board */}
              <div className="relative">
                {/* Pegs Grid */}
                <div className="flex flex-col items-center gap-3">
                  {Array.from({ length: 8 }).map((_, rowIdx) => (
                    <div key={rowIdx} className="flex gap-4" style={{ paddingLeft: rowIdx % 2 === 0 ? 0 : 12 }}>
                      {Array.from({ length: rowIdx % 2 === 0 ? 8 : 7 }).map((_, pegIdx) => (
                        <div 
                          key={pegIdx}
                          className="w-2.5 h-2.5 rounded-full bg-slate-600 shadow-sm"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Drop Zone Indicator */}
                {dropping && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 animate-bounce">
                    <Circle className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                )}
              </div>

              {/* Multiplier Buckets */}
              <div className="flex gap-1 mt-8">
                {multipliers.map((mult, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all",
                      mult >= 3 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                      mult >= 1 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                      "bg-red-500/20 text-red-400 border border-red-500/30"
                    )}
                  >
                    {mult}x
                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                  Drop the ball and watch it bounce to a multiplier
                </p>
              </div>

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-6">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Risk
                  </span>
                  <span className={cn(
                    "font-mono font-semibold capitalize",
                    risk === "low" ? "text-emerald-400" :
                    risk === "medium" ? "text-amber-400" : "text-red-400"
                  )}>{risk}</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Rows
                  </span>
                  <span className="font-mono font-semibold text-white">{rows}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="plinko"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
