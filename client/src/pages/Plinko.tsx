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

  // Constants for board layout
  const PEG_SPACING = 32;
  const ROW_HEIGHT = 28;
  const PEG_AREA_TOP = 16;
  const BIN_HEIGHT = 28;
  const BIN_MARGIN = 4;
  
  const animateBall = useCallback((path: number[], binIndex: number, multiplier: number, bet: any) => {
    let step = 0;
    setBallPosition({ x: 0, y: -10, step: -1 });

    const animate = () => {
      if (step < path.length) {
        // Ball is moving through peg rows
        let x = 0;
        for (let i = 0; i <= step; i++) {
          x += path[i] === 1 ? PEG_SPACING / 2 : -PEG_SPACING / 2;
        }
        const y = PEG_AREA_TOP + (step + 1) * ROW_HEIGHT;
        setBallPosition({ x, y, step });
        step++;
        animationRef.current = setTimeout(animate, 65);
      } else if (step === path.length) {
        // Final position - land in the bin
        let x = 0;
        for (let i = 0; i < path.length; i++) {
          x += path[i] === 1 ? PEG_SPACING / 2 : -PEG_SPACING / 2;
        }
        // Calculate final Y so ball CENTER lands in bin center
        // Board height = PEG_AREA_TOP + rows * ROW_HEIGHT + BIN_MARGIN + BIN_HEIGHT + 8
        // Bins are positioned: bottom: 4px, height: BIN_HEIGHT
        // So bin center from top = boardHeight - 4 - BIN_HEIGHT/2
        // Ball is 16px (w-4 h-4), radius = 8
        // Ball top = binCenterY - 8
        const BALL_RADIUS = 8;
        const currentBoardHeight = PEG_AREA_TOP + path.length * ROW_HEIGHT + BIN_MARGIN + BIN_HEIGHT + 8;
        const binCenterY = currentBoardHeight - 4 - BIN_HEIGHT / 2;
        const finalY = binCenterY - BALL_RADIUS;
        setBallPosition({ x, y: finalY, step });
        step++;
        
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

        // Clear after showing result
        animationRef.current = setTimeout(() => {
          setBallPosition(null);
          setActivePath([]);
          setLastResult(null);
        }, 1200);
      }
    };

    animationRef.current = setTimeout(animate, 150);
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

  // Calculate board dimensions based on the widest row (bottom row)
  const maxPegsInRow = rows + 2;
  const boardWidth = maxPegsInRow * PEG_SPACING;
  const boardHeight = PEG_AREA_TOP + rows * ROW_HEIGHT + BIN_MARGIN + BIN_HEIGHT + 8;

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
            <div className="flex-1 p-4 lg:p-6 relative flex flex-col items-center justify-center min-h-[480px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-3 right-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Plinko Board - Responsive with CSS scaling */}
              <div 
                className="relative mx-auto flex items-center justify-center"
                style={{ 
                  width: '100%',
                  maxWidth: boardWidth + 24,
                }}
              >
                {/* Scaled board container for responsiveness */}
                <div 
                  className="relative bg-[#0a0e12] rounded-xl border border-[#1a2530]"
                  style={{ 
                    width: boardWidth,
                    height: boardHeight,
                    transformOrigin: 'top center',
                  }}
                >
                  {/* Pegs */}
                  <div className="flex flex-col items-center" style={{ paddingTop: PEG_AREA_TOP }}>
                    {pegRows.map((pegsInRow, rowIndex) => (
                      <div 
                        key={rowIndex} 
                        className="flex justify-center"
                        style={{ 
                          marginBottom: ROW_HEIGHT - 10,
                          width: pegsInRow * PEG_SPACING,
                        }}
                      >
                        {Array.from({ length: pegsInRow }).map((_, pegIndex) => (
                          <div 
                            key={pegIndex}
                            className={cn(
                              "w-2.5 h-2.5 rounded-full transition-colors duration-100 shrink-0",
                              activePath[rowIndex] !== undefined
                                ? "bg-slate-400"
                                : "bg-slate-600"
                            )}
                            style={{ margin: `0 ${(PEG_SPACING - 10) / 2}px` }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Ball */}
                  {ballPosition && (
                    <div
                      className="absolute w-4 h-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg shadow-amber-500/50 z-20 pointer-events-none"
                      style={{
                        left: `calc(50% + ${ballPosition.x}px - 8px)`,
                        top: ballPosition.y,
                        transition: 'left 55ms ease-out, top 55ms ease-out',
                      }}
                    />
                  )}

                  {/* Multiplier Bins - positioned to exactly match ball physics */}
                  <div 
                    className="absolute left-0 right-0"
                    style={{
                      bottom: 4,
                      height: BIN_HEIGHT,
                    }}
                  >
                    {multipliers.map((mult, i) => {
                      // Ball physics: each step moves ±PEG_SPACING/2 (±16px)
                      // But changing one left→right changes X by 32px
                      // So final positions are spaced at PEG_SPACING (32px) intervals
                      // For bin i with numBins total, center offset = (i - (numBins-1)/2) * PEG_SPACING
                      const binSpacing = PEG_SPACING; // 32px between bin centers
                      const binCenterOffset = (i - (numBins - 1) / 2) * binSpacing;
                      const binWidth = binSpacing - 4; // 28px wide with 4px gaps
                      
                      return (
                        <div 
                          key={i}
                          className={cn(
                            "absolute flex items-center justify-center font-bold rounded border transition-all",
                            getMultiplierColor(mult),
                            lastResult?.binIndex === i && "ring-2 ring-white ring-offset-1 ring-offset-[#0a0e12] scale-110 z-10"
                          )}
                          style={{
                            left: `calc(50% + ${binCenterOffset}px - ${binWidth / 2}px)`,
                            width: binWidth,
                            height: BIN_HEIGHT,
                            fontSize: '8px',
                          }}
                          data-testid={`bin-${i}`}
                        >
                          {mult.toFixed(mult >= 10 ? 0 : 1)}x
                        </div>
                      );
                    })}
                  </div>
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
