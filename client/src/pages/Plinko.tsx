import { useState, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getPlinkoMultipliers, PlinkoRisk, PLINKO_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PlinkoResponse {
  bet: any;
  path: number[];
  binIndex: number;
  multiplier: number;
}

interface BallPosition {
  x: number;
  y: number;
  step: number;
}

export default function Plinko() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState<string>("1");
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [rows, setRows] = useState<number>(12);
  const [dropping, setDropping] = useState(false);
  const [ballPosition, setBallPosition] = useState<BallPosition | null>(null);
  const [activePath, setActivePath] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<{ binIndex: number; multiplier: number } | null>(null);
  
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const baseAmount = parseFloat(amount || "0");
  const multipliers = getPlinkoMultipliers(risk, rows);
  const numBins = rows + 1;

  const plinkoMutation = useMutation({
    mutationFn: async (data: { betAmount: number; risk: string; rows: number }) => {
      const res = await apiRequest("POST", "/api/games/plinko", data);
      return res.json() as Promise<PlinkoResponse>;
    },
    onSuccess: (data) => {
      setActivePath(data.path);
      animateBall(data.path, data.binIndex, data.multiplier, data.bet);
    },
    onError: (error: any) => {
      setDropping(false);
      toast({
        title: "Error",
        description: error.message || "Failed to place bet",
        variant: "destructive",
      });
    },
  });

  const animateBall = useCallback((path: number[], binIndex: number, multiplier: number, bet: any) => {
    const pegSpacing = 32;
    const rowHeight = 28;
    const startX = 0;
    
    let step = 0;
    setBallPosition({ x: startX, y: -20, step: -1 });

    const animate = () => {
      if (step <= path.length) {
        let x = 0;
        for (let i = 0; i < step; i++) {
          x += path[i] === 1 ? pegSpacing / 2 : -pegSpacing / 2;
        }
        setBallPosition({ x, y: step * rowHeight, step });
        step++;
        animationRef.current = setTimeout(animate, 80);
      } else {
        setDropping(false);
        setLastResult({ binIndex, multiplier });
        
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });

        addResult({
          game: "plinko",
          betAmount: bet.betAmount,
          won: bet.won,
          profit: bet.profit,
          detail: `${risk} risk, ${rows} rows → ${multiplier}x`,
        });

        setTimeout(() => {
          setBallPosition(null);
          setActivePath([]);
          setLastResult(null);
        }, 1500);
      }
    };

    animationRef.current = setTimeout(animate, 200);
  }, [risk, rows, addResult]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => Math.max(0.1, parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const handleDrop = () => {
    if (baseAmount < 0.1 || baseAmount > (user?.balance || 0) || dropping) return;
    setDropping(true);
    setLastResult(null);
    plinkoMutation.mutate({ betAmount: baseAmount, risk, rows });
  };

  const getMultiplierColor = (mult: number) => {
    if (mult >= 10) return "bg-emerald-500 text-white border-emerald-400";
    if (mult >= 3) return "bg-emerald-500/60 text-white border-emerald-400/60";
    if (mult >= 1.5) return "bg-amber-500/60 text-white border-amber-400/60";
    if (mult >= 1) return "bg-slate-600 text-white border-slate-500";
    return "bg-red-500/60 text-white border-red-400/60";
  };

  const pegRows = [];
  for (let r = 0; r < rows; r++) {
    const pegsInRow = r + 3;
    pegRows.push(pegsInRow);
  }

  const boardWidth = (rows + 2) * 32;
  const boardHeight = rows * 28 + 60;

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
                  {PLINKO_CONFIG.RISKS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setRisk(level)}
                      disabled={dropping}
                      data-testid={`button-risk-${level}`}
                      className={cn(
                        "py-2.5 rounded-lg font-semibold text-xs transition-all capitalize",
                        risk === level
                          ? level === "low" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" :
                            level === "medium" ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" :
                            "bg-red-500 text-white shadow-lg shadow-red-500/20"
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
                <Select 
                  value={String(rows)} 
                  onValueChange={(v) => setRows(Number(v))} 
                  disabled={dropping}
                >
                  <SelectTrigger className="bg-[#0d1419] border-[#1a2530] h-10" data-testid="select-rows">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: PLINKO_CONFIG.MAX_ROWS - PLINKO_CONFIG.MIN_ROWS + 1 }, (_, i) => i + PLINKO_CONFIG.MIN_ROWS).map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} rows</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payout Range */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Payout Range
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-red-400 font-mono">{Math.min(...multipliers).toFixed(2)}x</span>
                    <span className="text-slate-500">to</span>
                    <span className="text-emerald-400 font-mono">{Math.max(...multipliers).toFixed(2)}x</span>
                  </div>
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
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[520px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Plinko Board */}
              <div 
                className="relative"
                style={{ 
                  width: boardWidth, 
                  height: boardHeight + 50,
                }}
              >
                {/* Pegs */}
                <div className="flex flex-col items-center pt-4">
                  {pegRows.map((pegsInRow, rowIndex) => (
                    <div 
                      key={rowIndex} 
                      className="flex justify-center gap-0"
                      style={{ 
                        marginBottom: 12,
                        width: pegsInRow * 32,
                      }}
                    >
                      {Array.from({ length: pegsInRow }).map((_, pegIndex) => (
                        <div 
                          key={pegIndex}
                          className={cn(
                            "w-2.5 h-2.5 rounded-full transition-colors duration-100",
                            activePath[rowIndex] !== undefined
                              ? "bg-slate-500"
                              : "bg-slate-600"
                          )}
                          style={{ margin: '0 10.75px' }}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Ball */}
                {ballPosition && (
                  <div
                    className="absolute w-4 h-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg shadow-amber-500/50 z-10 transition-all"
                    style={{
                      left: `calc(50% + ${ballPosition.x}px - 8px)`,
                      top: ballPosition.y + 8,
                      transitionDuration: '70ms',
                      transitionTimingFunction: 'ease-out',
                    }}
                  />
                )}

                {/* Multiplier Bins */}
                <div 
                  className="flex justify-center gap-1 mt-2"
                  style={{ width: boardWidth }}
                >
                  {multipliers.map((mult, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "flex items-center justify-center text-[10px] font-bold rounded-md border transition-all",
                        getMultiplierColor(mult),
                        lastResult?.binIndex === i && "ring-2 ring-white ring-offset-1 ring-offset-[#0d1419] scale-110"
                      )}
                      style={{
                        width: Math.max(28, (boardWidth - (numBins - 1) * 4) / numBins),
                        height: 32,
                      }}
                      data-testid={`bin-${i}`}
                    >
                      {mult.toFixed(mult >= 10 ? 0 : 1)}x
                    </div>
                  ))}
                </div>
              </div>

              {/* Result Display */}
              {lastResult && (
                <div className="mt-4 text-center animate-pulse">
                  <div className={cn(
                    "text-2xl font-bold font-mono",
                    lastResult.multiplier >= 1 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {lastResult.multiplier.toFixed(2)}x
                  </div>
                  <div className="text-slate-500 text-xs mt-1">
                    {lastResult.multiplier >= 1 ? "Win" : "Loss"}: {lastResult.multiplier >= 1 ? "+" : ""}{((baseAmount * lastResult.multiplier) - baseAmount).toFixed(2)}
                  </div>
                </div>
              )}

              {/* Stats Row */}
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
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    House Edge
                  </span>
                  <span className="font-mono font-semibold text-white">2%</span>
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
