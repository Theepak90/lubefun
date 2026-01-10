import { useState, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Shield, Zap, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getPlinkoMultipliers, PlinkoRisk, PLINKO_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/hooks/use-sound";

interface PlinkoResponse {
  bet: any;
  path: number[];
  binIndex: number;
  multiplier: number;
}

interface BallInstance {
  id: string;
  betAmount: number;
  path: number[];
  binIndex: number;
  multiplier: number;
  bet: any;
  x: number;
  y: number;
  step: number;
  status: 'animating' | 'landed' | 'done';
  landedAt?: number;
  // Physics animation state
  startTime: number;
  prevX: number;
  prevY: number;
  velocityX: number;
  velocityY: number;
  jitterSeed: number; // Per-ball deterministic jitter
}

// Rate limiting constants
const MAX_BALLS_PER_SECOND = 10;
const MAX_ACTIVE_BALLS = 50;
const AUTO_DROP_INTERVAL = 200; // 5 balls per second for auto mode

export default function Plinko() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { toast } = useToast();
  const { play: playSound } = useSound();
  
  const [amount, setAmount] = useState<string>("1");
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [rows, setRows] = useState<number>(12);
  const [balls, setBalls] = useState<BallInstance[]>([]);
  const [autoDropping, setAutoDropping] = useState(false);
  const [pendingDrops, setPendingDrops] = useState(0);
  
  // Rate limiting state
  const dropTimestamps = useRef<number[]>([]);
  const autoDropIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Sound throttling - limit concurrent tick sounds
  const lastTickSoundTime = useRef<number>(0);
  const tickSoundCount = useRef<number>(0);
  const TICK_SOUND_INTERVAL = 60; // Min ms between tick sounds
  const MAX_TICK_SOUNDS_PER_SECOND = 8; // Limit concurrent sounds

  const baseAmount = parseFloat(amount || "0");
  const multipliers = getPlinkoMultipliers(risk, rows);
  const numBins = rows + 1;
  const activeBallCount = balls.filter(b => b.status !== 'done').length;

  // Constants for board layout - refined spacing
  const PEG_SPACING = 36; // Wider spacing for cleaner look
  const ROW_HEIGHT = 32; // Taller rows for better visibility
  const PEG_AREA_TOP = 24; // More top padding
  const BIN_HEIGHT = 32; // Taller bins for cleaner typography
  const BIN_MARGIN = 8; // More margin above bins
  const BALL_RADIUS = 8;
  const BOARD_PADDING = 16; // Side padding

  const plinkoMutation = useMutation({
    mutationFn: async (data: { betAmount: number; risk: string; rows: number; ballId: string }) => {
      const res = await apiRequest("POST", "/api/games/plinko", {
        betAmount: data.betAmount,
        risk: data.risk,
        rows: data.rows,
      });
      const result = await res.json() as PlinkoResponse;
      return { ...result, ballId: data.ballId };
    },
    onSuccess: (data) => {
      // Add ball to active balls with physics state
      const newBall: BallInstance = {
        id: data.ballId,
        betAmount: data.bet.betAmount,
        path: data.path,
        binIndex: data.binIndex,
        multiplier: data.multiplier,
        bet: data.bet,
        x: 0,
        y: -10,
        step: -1,
        status: 'animating',
        startTime: performance.now(),
        prevX: 0,
        prevY: -10,
        velocityX: 0,
        velocityY: 0,
        jitterSeed: Math.random(), // Deterministic per-ball jitter
      };
      setBalls(prev => [...prev, newBall]);
      setPendingDrops(prev => Math.max(0, prev - 1));
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: any) => {
      setPendingDrops(prev => Math.max(0, prev - 1));
      toast({
        title: "Error",
        description: error.message || "Failed to place bet",
        variant: "destructive",
      });
    },
  });

  // Check rate limiting
  const canDropBall = useCallback(() => {
    const now = Date.now();
    // Clean old timestamps (older than 1 second)
    dropTimestamps.current = dropTimestamps.current.filter(t => now - t < 1000);
    
    // Check rate limit
    if (dropTimestamps.current.length >= MAX_BALLS_PER_SECOND) {
      return false;
    }
    
    // Check active balls limit
    if (activeBallCount + pendingDrops >= MAX_ACTIVE_BALLS) {
      return false;
    }
    
    return true;
  }, [activeBallCount, pendingDrops]);

  // Throttled tick sound - prevents sound spam with many balls
  const playTickSoundThrottled = useCallback(() => {
    const now = Date.now();
    // Reset counter every second
    if (now - lastTickSoundTime.current > 1000) {
      tickSoundCount.current = 0;
    }
    // Check throttle limits
    if (now - lastTickSoundTime.current < TICK_SOUND_INTERVAL) return;
    if (tickSoundCount.current >= MAX_TICK_SOUNDS_PER_SECOND) return;
    
    lastTickSoundTime.current = now;
    tickSoundCount.current++;
    playSound("ballTick");
  }, [playSound, TICK_SOUND_INTERVAL, MAX_TICK_SOUNDS_PER_SECOND]);

  // Drop a single ball
  const dropBall = useCallback(() => {
    if (!user || baseAmount < 0.1 || baseAmount > user.balance) return false;
    if (!canDropBall()) {
      toast({
        title: "Rate Limited",
        description: "Too many balls! Wait a moment.",
        variant: "destructive",
      });
      return false;
    }

    const ballId = `ball-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    dropTimestamps.current.push(Date.now());
    setPendingDrops(prev => prev + 1);
    plinkoMutation.mutate({ betAmount: baseAmount, risk, rows, ballId });
    
    // Play drop sound
    playSound("plinkoDrop");
    
    return true;
  }, [user, baseAmount, risk, rows, canDropBall, plinkoMutation, toast, playSound]);

  // Drop multiple balls
  const dropMultiple = useCallback((count: number) => {
    let dropped = 0;
    const dropNext = () => {
      if (dropped < count && dropBall()) {
        dropped++;
        if (dropped < count) {
          setTimeout(dropNext, 100); // 100ms between each drop
        }
      }
    };
    dropNext();
  }, [dropBall]);

  // Auto drop toggle
  const toggleAutoDrop = useCallback(() => {
    if (autoDropping) {
      setAutoDropping(false);
      if (autoDropIntervalRef.current) {
        clearInterval(autoDropIntervalRef.current);
        autoDropIntervalRef.current = null;
      }
    } else {
      if (!user || baseAmount < 0.1 || baseAmount > user.balance) {
        toast({
          title: "Cannot Auto Drop",
          description: "Check your bet amount and balance",
          variant: "destructive",
        });
        return;
      }
      setAutoDropping(true);
      dropBall(); // Drop immediately
      autoDropIntervalRef.current = setInterval(() => {
        if (!dropBall()) {
          // Stop if we can't drop anymore
          setAutoDropping(false);
          if (autoDropIntervalRef.current) {
            clearInterval(autoDropIntervalRef.current);
            autoDropIntervalRef.current = null;
          }
        }
      }, AUTO_DROP_INTERVAL);
    }
  }, [autoDropping, user, baseAmount, dropBall, toast]);

  // Stop auto drop when balance too low
  useEffect(() => {
    if (autoDropping && user && baseAmount > user.balance) {
      setAutoDropping(false);
      if (autoDropIntervalRef.current) {
        clearInterval(autoDropIntervalRef.current);
        autoDropIntervalRef.current = null;
      }
      toast({
        title: "Auto Drop Stopped",
        description: "Insufficient balance",
      });
    }
  }, [autoDropping, user, baseAmount, toast]);

  // Physics constants for realistic motion
  const GRAVITY = 0.15; // Acceleration per frame
  const FRICTION = 0.98; // Horizontal damping
  const RESTITUTION = 0.3; // Bounciness (0-1)
  const STEP_TIME = 80; // Base time per row (ms), slower for gravity feel
  const JITTER_AMOUNT = 2; // Max random offset in pixels (visual only)

  // Calculate target positions for each step
  const getTargetPosition = useCallback((path: number[], step: number) => {
    let x = 0;
    for (let i = 0; i <= step; i++) {
      x += path[i] === 1 ? PEG_SPACING / 2 : -PEG_SPACING / 2;
    }
    const y = PEG_AREA_TOP + (step + 1) * ROW_HEIGHT;
    return { x, y };
  }, []);

  // Track sounds to play (processed after state update to avoid issues)
  const pendingSoundsRef = useRef<{ type: 'tick' | 'land' | 'win' | 'lose' }[]>([]);

  // Animation loop for all balls with physics
  useEffect(() => {
    // Match boardHeight calculation exactly for proper ball/bin alignment
    const currentBoardHeight = PEG_AREA_TOP + rows * ROW_HEIGHT + BIN_MARGIN + BIN_HEIGHT + 16;
    const binCenterY = currentBoardHeight - 8 - BIN_HEIGHT / 2;
    const finalY = binCenterY - BALL_RADIUS;

    const animate = (time: number) => {
      // Clear pending sounds
      pendingSoundsRef.current = [];
      
      setBalls(prev => {
        const now = Date.now();
        return prev
          .map(ball => {
            if (ball.status === 'done') return ball;
            
            if (ball.status === 'landed') {
              if (ball.landedAt && now - ball.landedAt > 1200) {
                return { ...ball, status: 'done' as const };
              }
              return ball;
            }
            
            // Calculate elapsed time since ball started
            const elapsed = time - ball.startTime;
            
            // Determine which step we should be at based on time
            // Use accelerating time per step (gravity effect - faster as ball falls)
            let totalTime = 0;
            let targetStep = -1;
            for (let s = 0; s < ball.path.length; s++) {
              // Each step takes less time as ball accelerates (capped)
              const stepDuration = Math.max(40, STEP_TIME - s * 2);
              totalTime += stepDuration;
              if (elapsed >= totalTime) {
                targetStep = s;
              }
            }
            
            // Final landing phase
            const landingTime = totalTime + 60;
            
            if (elapsed >= landingTime && ball.step >= ball.path.length - 1) {
              // Landed in bin
              let finalX = 0;
              for (let i = 0; i < ball.path.length; i++) {
                finalX += ball.path[i] === 1 ? PEG_SPACING / 2 : -PEG_SPACING / 2;
              }
              
              if (ball.status === 'animating') {
                // Add result to history only once
                addResult({
                  game: "plinko",
                  betAmount: ball.betAmount,
                  won: ball.bet.won,
                  profit: ball.bet.profit,
                  detail: `${risk} risk, ${rows} rows → ${ball.multiplier}x`,
                });
                
                // Queue land sound and win/lose sound
                pendingSoundsRef.current.push({ type: 'land' });
                if (ball.bet.won) {
                  pendingSoundsRef.current.push({ type: 'win' });
                } else {
                  pendingSoundsRef.current.push({ type: 'lose' });
                }
              }
              
              return { 
                ...ball, 
                x: finalX, 
                y: finalY, 
                step: ball.path.length, 
                status: 'landed' as const,
                landedAt: now,
                velocityX: 0,
                velocityY: 0,
              };
            }
            
            // Smooth interpolation between steps
            if (targetStep >= ball.step) {
              const newStep = Math.min(targetStep, ball.path.length - 1);
              const target = getTargetPosition(ball.path, newStep);
              
              // Play tick sound when ball moves to new step (hits peg)
              if (newStep > ball.step && newStep >= 0) {
                pendingSoundsRef.current.push({ type: 'tick' });
              }
              
              // Calculate progress within current step for smooth interpolation
              let stepStartTime = 0;
              for (let s = 0; s < newStep; s++) {
                stepStartTime += Math.max(40, STEP_TIME - s * 2);
              }
              const currentStepDuration = Math.max(40, STEP_TIME - newStep * 2);
              const stepProgress = Math.min(1, (elapsed - stepStartTime) / currentStepDuration);
              
              // Easing function (ease-out bounce feel)
              const eased = 1 - Math.pow(1 - stepProgress, 2);
              
              // Add subtle deterministic jitter based on ball seed and step
              const jitterX = (Math.sin(ball.jitterSeed * 1000 + newStep * 7) * JITTER_AMOUNT) * (1 - eased);
              const jitterY = (Math.cos(ball.jitterSeed * 1000 + newStep * 11) * JITTER_AMOUNT * 0.5) * (1 - eased);
              
              // Interpolate from previous position
              const prevTarget = newStep > 0 ? getTargetPosition(ball.path, newStep - 1) : { x: 0, y: -10 };
              const newX = prevTarget.x + (target.x - prevTarget.x) * eased + jitterX;
              const newY = prevTarget.y + (target.y - prevTarget.y) * eased + jitterY;
              
              // Calculate velocity for motion blur
              const velocityX = (newX - ball.x) * 0.5;
              const velocityY = (newY - ball.y) * 0.5;
              
              return { 
                ...ball, 
                prevX: ball.x,
                prevY: ball.y,
                x: newX, 
                y: newY, 
                step: newStep,
                velocityX,
                velocityY,
              };
            }
            
            return ball;
          })
          .filter(ball => ball.status !== 'done');
      });
      
      // Process pending sounds after state update (throttled for ticks)
      for (const sound of pendingSoundsRef.current) {
        if (sound.type === 'tick') {
          playTickSoundThrottled();
        } else if (sound.type === 'land') {
          playSound("ballLand");
        } else if (sound.type === 'win') {
          playSound("win");
        } else if (sound.type === 'lose') {
          playSound("lose");
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (balls.some(b => b.status === 'animating' || b.status === 'landed')) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [balls.length, rows, risk, addResult, getTargetPosition, playTickSoundThrottled, playSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoDropIntervalRef.current) {
        clearInterval(autoDropIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
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
    dropBall();
  };

  const handleDrop10 = () => {
    dropMultiple(10);
  };

  const getMultiplierColor = (mult: number) => {
    // Minimal glow, clean colors
    if (mult >= 900) return "bg-gradient-to-b from-yellow-400 via-amber-500 to-orange-600 text-black font-black border-yellow-500/50";
    if (mult >= 100) return "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white font-bold border-emerald-500/50";
    if (mult >= 10) return "bg-emerald-600 text-white border-emerald-500/40";
    if (mult >= 3) return "bg-emerald-700 text-white border-emerald-600/30";
    if (mult >= 1.5) return "bg-amber-600 text-white border-amber-500/30";
    if (mult >= 1) return "bg-slate-700 text-slate-200 border-slate-600/30";
    return "bg-red-700 text-white border-red-600/30";
  };

  const pegRows = [];
  for (let r = 0; r < rows; r++) {
    const pegsInRow = r + 3;
    pegRows.push(pegsInRow);
  }

  // Calculate board dimensions based on the widest row (bottom row)
  const maxPegsInRow = rows + 2;
  const boardWidth = maxPegsInRow * PEG_SPACING + BOARD_PADDING * 2;
  const boardHeight = PEG_AREA_TOP + rows * ROW_HEIGHT + BIN_MARGIN + BIN_HEIGHT + 16;

  // Get recently landed balls for highlighting bins
  const landedBalls = balls.filter(b => b.status === 'landed');
  const highlightedBins = new Set(landedBalls.map(b => b.binIndex));

  const isControlsDisabled = autoDropping || activeBallCount > 0 || pendingDrops > 0;
  const canDrop = user && baseAmount >= 0.1 && baseAmount <= (user?.balance || 0) && activeBallCount + pendingDrops < MAX_ACTIVE_BALLS;

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
                    disabled={isControlsDisabled}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={isControlsDisabled}
                    data-testid="button-halve"
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={isControlsDisabled}
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
                      disabled={isControlsDisabled}
                      data-testid={`button-percent-${pct * 100}`}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk & Rows - Compact Panel */}
              <div className="bg-[#0d1419] rounded-lg border border-[#1a2530] p-3 mb-5">
                {/* Risk Level */}
                <div className="mb-3">
                  <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                    Risk
                  </Label>
                  <div className="flex gap-1.5">
                    {PLINKO_CONFIG.RISKS.map((level) => (
                      <button
                        key={level}
                        onClick={() => setRisk(level)}
                        disabled={isControlsDisabled}
                        data-testid={`button-risk-${level}`}
                        className={cn(
                          "flex-1 py-2 rounded-md font-semibold text-[11px] transition-all capitalize",
                          risk === level
                            ? level === "low" ? "bg-emerald-600 text-white" :
                              level === "medium" ? "bg-amber-600 text-white" :
                              "bg-red-600 text-white"
                            : "bg-[#1a2530] text-slate-400 hover:text-white"
                        )}
                      >
                        {level === "low" ? "Low" : level === "medium" ? "Med" : "High"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rows */}
                <div>
                  <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                    Rows
                  </Label>
                  <Select 
                    value={String(rows)} 
                    onValueChange={(v) => setRows(Number(v))} 
                    disabled={isControlsDisabled}
                  >
                    <SelectTrigger className="bg-[#1a2530] border-[#2a3a4a] h-9 text-sm" data-testid="select-rows">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: PLINKO_CONFIG.MAX_ROWS - PLINKO_CONFIG.MIN_ROWS + 1 }, (_, i) => i + PLINKO_CONFIG.MIN_ROWS).map((r) => (
                        <SelectItem key={r} value={String(r)}>{r} rows</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

              {/* Drop Buttons */}
              <div className="space-y-2 mb-4">
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={handleDrop}
                  disabled={!canDrop || autoDropping}
                  data-testid="button-drop"
                >
                  {user ? "Drop Ball" : "Login to Play"}
                </Button>
                
                <Button 
                  size="lg" 
                  variant="outline"
                  className="w-full h-10 text-sm font-bold border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition-all" 
                  onClick={handleDrop10}
                  disabled={!canDrop || autoDropping}
                  data-testid="button-drop-10"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Drop x10
                </Button>
              </div>

              {/* Auto Drop Toggle */}
              <div className="flex items-center justify-between p-3 bg-[#0d1419] rounded-lg border border-[#1a2530]">
                <div className="flex items-center gap-2">
                  {autoDropping ? (
                    <Square className="w-4 h-4 text-red-400" />
                  ) : (
                    <Play className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-semibold text-slate-400">Auto Drop</span>
                </div>
                <Switch
                  checked={autoDropping}
                  onCheckedChange={toggleAutoDrop}
                  disabled={!user || (!autoDropping && !canDrop)}
                  data-testid="switch-auto-drop"
                />
              </div>

              {/* Active Balls Counter */}
              {(activeBallCount > 0 || pendingDrops > 0) && (
                <div className="mt-3 text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Active Balls: {activeBallCount} / {MAX_ACTIVE_BALLS}
                    {pendingDrops > 0 && ` (+${pendingDrops} pending)`}
                  </span>
                </div>
              )}
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
                  {/* Pegs - smaller, evenly spaced grid */}
                  <div className="flex flex-col items-center" style={{ paddingTop: PEG_AREA_TOP }}>
                    {pegRows.map((pegsInRow, rowIndex) => (
                      <div 
                        key={rowIndex} 
                        className="flex justify-center items-center"
                        style={{ 
                          height: ROW_HEIGHT,
                          width: pegsInRow * PEG_SPACING,
                        }}
                      >
                        {Array.from({ length: pegsInRow }).map((_, pegIndex) => (
                          <div 
                            key={pegIndex}
                            className="w-[6px] h-[6px] rounded-full bg-slate-500 shrink-0"
                            style={{ margin: `0 ${(PEG_SPACING - 6) / 2}px` }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Ball Shadows - rendered first (behind balls) */}
                  {balls.filter(b => b.status !== 'done').map((ball) => {
                    // Shadow offset and blur based on height (more shadow as ball falls)
                    const heightRatio = Math.min(1, ball.y / (boardHeight - 50));
                    const shadowOffset = 2 + heightRatio * 4;
                    const shadowBlur = 4 + heightRatio * 6;
                    const shadowOpacity = 0.2 + heightRatio * 0.15;
                    
                    return (
                      <div
                        key={`shadow-${ball.id}`}
                        className="absolute rounded-full bg-black pointer-events-none"
                        style={{
                          left: `calc(50% + ${ball.x + shadowOffset}px - 7px)`,
                          top: ball.y + shadowOffset,
                          width: 14,
                          height: 14,
                          opacity: shadowOpacity,
                          filter: `blur(${shadowBlur}px)`,
                          zIndex: 15,
                        }}
                      />
                    );
                  })}

                  {/* Balls with motion blur trail */}
                  {balls.filter(b => b.status !== 'done').map((ball) => {
                    // Calculate velocity magnitude for motion blur
                    const velocity = Math.sqrt(ball.velocityX * ball.velocityX + ball.velocityY * ball.velocityY);
                    const showTrail = velocity > 1 && ball.status === 'animating';
                    
                    return (
                      <div key={ball.id}>
                        {/* Motion blur trail (faded previous positions) */}
                        {showTrail && (
                          <>
                            <div
                              className="absolute w-4 h-4 rounded-full bg-gradient-to-br from-amber-300/30 to-amber-500/30 pointer-events-none"
                              style={{
                                left: `calc(50% + ${ball.prevX}px - 8px)`,
                                top: ball.prevY,
                                zIndex: 18,
                                filter: 'blur(2px)',
                              }}
                            />
                            <div
                              className="absolute w-4 h-4 rounded-full bg-gradient-to-br from-amber-300/50 to-amber-500/50 pointer-events-none"
                              style={{
                                left: `calc(50% + ${(ball.x + ball.prevX) / 2}px - 8px)`,
                                top: (ball.y + ball.prevY) / 2,
                                zIndex: 19,
                                filter: 'blur(1px)',
                              }}
                            />
                          </>
                        )}
                        
                        {/* Main ball */}
                        <div
                          className={cn(
                            "absolute w-4 h-4 rounded-full pointer-events-none",
                            "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600",
                            "shadow-[0_0_8px_rgba(251,191,36,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.4)]",
                            ball.status === 'landed' && "animate-pulse scale-110"
                          )}
                          style={{
                            left: `calc(50% + ${ball.x}px - 8px)`,
                            top: ball.y,
                            zIndex: 20,
                            transform: ball.status === 'landed' ? 'scale(1.1)' : undefined,
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* Multiplier Bins - larger, centered, cleaner typography */}
                  <div 
                    className="absolute left-0 right-0"
                    style={{
                      bottom: 8,
                      height: BIN_HEIGHT,
                    }}
                  >
                    {multipliers.map((mult, i) => {
                      const binSpacing = PEG_SPACING;
                      const binCenterOffset = (i - (numBins - 1) / 2) * binSpacing;
                      const binWidth = binSpacing - 4;
                      const isHighlighted = highlightedBins.has(i);
                      
                      return (
                        <div 
                          key={i}
                          className={cn(
                            "absolute flex items-center justify-center font-semibold rounded-md border transition-all",
                            getMultiplierColor(mult),
                            isHighlighted && "ring-2 ring-white/80 scale-105 z-10"
                          )}
                          style={{
                            left: `calc(50% + ${binCenterOffset}px - ${binWidth / 2}px)`,
                            width: binWidth,
                            height: BIN_HEIGHT,
                            fontSize: mult >= 100 ? '9px' : '10px',
                          }}
                          data-testid={`bin-${i}`}
                        >
                          {mult >= 100 ? `${Math.round(mult)}x` : mult.toFixed(mult >= 10 ? 0 : 1) + 'x'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Minimal Info Row */}
              <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-slate-500">
                <span className="uppercase tracking-wide">House Edge: 2%</span>
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
