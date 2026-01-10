import { useState, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Clock, Sparkles, RotateCw, Zap, Trophy, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WHEEL_PRIZES } from "@shared/schema";

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const neonColors = [
  { bg: "#00ff88", glow: "0 0 20px #00ff88, 0 0 40px #00ff8866" },
  { bg: "#ff00ff", glow: "0 0 20px #ff00ff, 0 0 40px #ff00ff66" },
  { bg: "#ffff00", glow: "0 0 20px #ffff00, 0 0 40px #ffff0066" },
  { bg: "#00ffff", glow: "0 0 20px #00ffff, 0 0 40px #00ffff66" },
  { bg: "#ff3366", glow: "0 0 20px #ff3366, 0 0 40px #ff336666" },
  { bg: "#9933ff", glow: "0 0 20px #9933ff, 0 0 40px #9933ff66" },
  { bg: "#ff9900", glow: "0 0 20px #ff9900, 0 0 40px #ff990066" },
  { bg: "#33ccff", glow: "0 0 20px #33ccff, 0 0 40px #33ccff66" },
];

export default function DailySpin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [showResult, setShowResult] = useState<{ label: string; value: number; index: number } | null>(null);
  const [glowPulse, setGlowPulse] = useState(false);
  
  const { data: status, refetch } = useQuery<{ canSpin: boolean; nextSpinTime: string | null }>({
    queryKey: ["/api/rewards/wheel/status"],
    enabled: !!user,
  });
  
  const spinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rewards/wheel/spin"),
    onSuccess: async (response) => {
      const data = await response.json();
      
      const segmentAngle = 360 / WHEEL_PRIZES.length;
      const prizeRotation = data.prizeIndex * segmentAngle;
      const targetRotation = rotation + 360 * 6 + (360 - prizeRotation - segmentAngle / 2);
      
      setRotation(targetRotation);
      
      setTimeout(() => {
        setIsSpinning(false);
        setGlowPulse(true);
        setShowResult({ label: data.prizeLabel, value: data.prizeValue, index: data.prizeIndex });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        refetch();
        
        const isBigPrize = data.prizeValue >= 1;
        
        toast({
          title: isBigPrize ? "JACKPOT!" : "You Won!",
          description: `${data.prizeLabel} play credits added to your balance!`,
        });
        
        setTimeout(() => setGlowPulse(false), 3000);
      }, 5000);
    },
    onError: () => {
      setIsSpinning(false);
      toast({
        title: "Error",
        description: "Could not spin wheel",
        variant: "destructive",
      });
    },
  });
  
  const handleSpin = () => {
    if (isSpinning || !status?.canSpin) return;
    setIsSpinning(true);
    setShowResult(null);
    spinMutation.mutate();
  };
  
  useEffect(() => {
    if (!status?.nextSpinTime) {
      setTimeRemaining("");
      return;
    }
    
    const updateTimer = () => {
      setTimeRemaining(formatTimeRemaining(status.nextSpinTime));
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [status?.nextSpinTime]);
  
  if (!user) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <RotateCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Daily Spin</h1>
          <p className="text-muted-foreground mb-6">Please log in to spin the wheel</p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Zap className="w-8 h-8 text-yellow-400" style={{ filter: "drop-shadow(0 0 10px #facc15)" }} />
            <h1 
              className="text-4xl md:text-5xl font-black tracking-tight"
              style={{ 
                background: "linear-gradient(135deg, #00ff88 0%, #00ffff 50%, #ff00ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 20px rgba(0, 255, 136, 0.5))"
              }}
            >
              DAILY SPIN
            </h1>
            <Zap className="w-8 h-8 text-yellow-400" style={{ filter: "drop-shadow(0 0 10px #facc15)" }} />
          </div>
          <p className="text-muted-foreground">
            Spin once every 24 hours for a chance to win big!
            <span className="ml-2 text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">Play Money</span>
          </p>
        </div>
        
        <div 
          className="relative mx-auto max-w-lg p-8 rounded-3xl"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(20,20,30,0.9) 100%)",
            border: "2px solid rgba(0,255,136,0.3)",
            boxShadow: glowPulse 
              ? "0 0 60px rgba(0,255,136,0.6), 0 0 120px rgba(0,255,255,0.3), inset 0 0 60px rgba(0,255,136,0.1)"
              : "0 0 30px rgba(0,255,136,0.2), inset 0 0 30px rgba(0,0,0,0.5)"
          }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-black border border-primary/50">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Lootbox Spinner</span>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="relative w-72 h-72 md:w-80 md:h-80 mb-8">
              <div 
                className="absolute -inset-4 rounded-full opacity-50"
                style={{
                  background: "conic-gradient(from 0deg, #00ff88, #00ffff, #ff00ff, #ffff00, #00ff88)",
                  filter: "blur(20px)",
                  animation: isSpinning ? "spin 2s linear infinite" : undefined
                }}
              />
              
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20"
                style={{ filter: "drop-shadow(0 0 10px #00ff88)" }}
              >
                <div 
                  className="w-0 h-0"
                  style={{
                    borderLeft: "16px solid transparent",
                    borderRight: "16px solid transparent",
                    borderTop: "28px solid #00ff88"
                  }}
                />
              </div>
              
              <motion.div 
                className="relative w-full h-full rounded-full overflow-hidden"
                style={{
                  border: "4px solid #333",
                  boxShadow: "0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5)"
                }}
                animate={{ rotate: rotation }}
                transition={{ 
                  duration: isSpinning ? 5 : 0, 
                  ease: [0.2, 0.8, 0.2, 1]
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    {neonColors.map((color, i) => (
                      <filter key={i} id={`glow-${i}`}>
                        <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    ))}
                  </defs>
                  
                  {WHEEL_PRIZES.map((prize, i) => {
                    const angle = (360 / WHEEL_PRIZES.length);
                    const startAngle = i * angle - 90;
                    const endAngle = startAngle + angle;
                    
                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;
                    
                    const x1 = 50 + 50 * Math.cos(startRad);
                    const y1 = 50 + 50 * Math.sin(startRad);
                    const x2 = 50 + 50 * Math.cos(endRad);
                    const y2 = 50 + 50 * Math.sin(endRad);
                    
                    const largeArc = angle > 180 ? 1 : 0;
                    
                    const textAngle = startAngle + angle / 2;
                    const textRad = (textAngle * Math.PI) / 180;
                    const textX = 50 + 32 * Math.cos(textRad);
                    const textY = 50 + 32 * Math.sin(textRad);
                    
                    const color = neonColors[i % neonColors.length];
                    const isBigPrize = prize.value >= 1;
                    
                    return (
                      <g key={i}>
                        <path
                          d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={i % 2 === 0 ? "#1a1a2e" : "#16213e"}
                          stroke={color.bg}
                          strokeWidth="0.5"
                        />
                        {isBigPrize && (
                          <path
                            d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={`${color.bg}22`}
                          />
                        )}
                        <text
                          x={textX}
                          y={textY}
                          fill={color.bg}
                          fontSize={isBigPrize ? "5" : "4.5"}
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                          style={{ 
                            filter: `drop-shadow(0 0 3px ${color.bg})`,
                            textShadow: color.glow
                          }}
                        >
                          {prize.label}
                        </text>
                        {isBigPrize && (
                          <g transform={`translate(${50 + 44 * Math.cos(textRad)}, ${50 + 44 * Math.sin(textRad)})`}>
                            <text
                              fill="#ffff00"
                              fontSize="3"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              style={{ filter: "drop-shadow(0 0 2px #ffff00)" }}
                            >
                              ★
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="10" 
                    fill="#0a0a0f"
                    stroke="#00ff88"
                    strokeWidth="1"
                    style={{ filter: "drop-shadow(0 0 10px #00ff88)" }}
                  />
                  <text
                    x="50"
                    y="50"
                    fill="#00ff88"
                    fontSize="4"
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    SPIN
                  </text>
                </svg>
              </motion.div>
              
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      top: `${50 + 48 * Math.sin((i * Math.PI * 2) / 8)}%`,
                      left: `${50 + 48 * Math.cos((i * Math.PI * 2) / 8)}%`,
                      transform: "translate(-50%, -50%)",
                      background: isSpinning || glowPulse ? neonColors[i].bg : "#333",
                      boxShadow: isSpinning || glowPulse ? neonColors[i].glow : "none",
                      transition: "all 0.3s ease"
                    }}
                  />
                ))}
              </div>
            </div>
            
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="mb-6 text-center"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {showResult.value >= 1 && <Trophy className="w-6 h-6 text-yellow-400" style={{ filter: "drop-shadow(0 0 5px #facc15)" }} />}
                    <span className="text-sm text-muted-foreground uppercase tracking-wider">You Won</span>
                    {showResult.value >= 1 && <Trophy className="w-6 h-6 text-yellow-400" style={{ filter: "drop-shadow(0 0 5px #facc15)" }} />}
                  </div>
                  <p 
                    className="text-4xl font-black"
                    style={{
                      color: neonColors[showResult.index % neonColors.length].bg,
                      textShadow: neonColors[showResult.index % neonColors.length].glow
                    }}
                  >
                    {showResult.label}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            
            {status?.canSpin ? (
              <Button 
                size="lg"
                className="w-full max-w-xs font-black text-lg py-6 relative overflow-hidden group"
                style={{
                  background: "linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)",
                  boxShadow: "0 0 30px rgba(0,255,136,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
                  border: "none"
                }}
                onClick={handleSpin}
                disabled={isSpinning}
                data-testid="button-spin-wheel"
              >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
                {isSpinning ? (
                  <>
                    <RotateCw className="w-5 h-5 mr-2 animate-spin" />
                    SPINNING...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    SPIN NOW
                  </>
                )}
              </Button>
            ) : (
              <div 
                className="w-full max-w-xs text-center py-4 px-6 rounded-xl"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm uppercase tracking-wider">Next spin in</span>
                </div>
                <span 
                  className="font-mono text-3xl font-bold"
                  style={{
                    color: "#00ffff",
                    textShadow: "0 0 10px #00ffff, 0 0 20px #00ffff66"
                  }}
                >
                  {timeRemaining}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          {WHEEL_PRIZES.map((prize, i) => {
            const color = neonColors[i % neonColors.length];
            const isBigPrize = prize.value >= 1;
            
            return (
              <div 
                key={i}
                className="p-3 rounded-lg text-center relative overflow-hidden"
                style={{
                  background: isBigPrize ? `${color.bg}15` : "rgba(0,0,0,0.3)",
                  border: `1px solid ${isBigPrize ? color.bg : "rgba(255,255,255,0.1)"}`
                }}
              >
                {isBigPrize && (
                  <Star 
                    className="absolute top-1 right-1 w-3 h-3" 
                    style={{ color: color.bg, filter: `drop-shadow(0 0 3px ${color.bg})` }}
                  />
                )}
                <div 
                  className="font-bold text-lg"
                  style={{ color: color.bg }}
                >
                  {prize.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isBigPrize ? "JACKPOT" : "Prize"}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-8 p-4 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            This is a play-money demo. No real currency is involved.
          </p>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
