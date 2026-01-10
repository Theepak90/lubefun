import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, RotateCw, Clock, Sparkles } from "lucide-react";
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

function DailyBonus() {
  const { toast } = useToast();
  const [timeRemaining, setTimeRemaining] = useState("");
  
  const { data: status, refetch } = useQuery<{ canClaim: boolean; nextClaimTime: string | null; bonusAmount: number }>({
    queryKey: ["/api/rewards/bonus/status"],
  });
  
  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rewards/bonus/claim"),
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "Bonus Claimed!",
        description: `You received $${data.amount} play credits!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      refetch();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not claim bonus",
        variant: "destructive",
      });
    },
  });
  
  useEffect(() => {
    if (!status?.nextClaimTime) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(status.nextClaimTime));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [status?.nextClaimTime]);
  
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <Gift className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Daily Login Bonus</h3>
          <p className="text-sm text-muted-foreground">Claim ${status?.bonusAmount || 10} every 24 hours</p>
        </div>
      </div>
      
      {status?.canClaim ? (
        <Button 
          className="w-full font-bold" 
          size="lg"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
          data-testid="button-claim-bonus"
        >
          {claimMutation.isPending ? (
            <RotateCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Claim Daily Bonus
        </Button>
      ) : (
        <div className="text-center py-3">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Next bonus available in</span>
          </div>
          <span className="font-mono text-2xl font-bold text-primary">{timeRemaining}</span>
        </div>
      )}
    </Card>
  );
}

function SpinWheel() {
  const { toast } = useToast();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [showResult, setShowResult] = useState<{ label: string; value: number } | null>(null);
  
  const { data: status, refetch } = useQuery<{ canSpin: boolean; nextSpinTime: string | null }>({
    queryKey: ["/api/rewards/wheel/status"],
  });
  
  const spinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rewards/wheel/spin"),
    onSuccess: async (response) => {
      const data = await response.json();
      
      // Calculate rotation to land on the prize
      const segmentAngle = 360 / WHEEL_PRIZES.length;
      const prizeRotation = data.prizeIndex * segmentAngle;
      // Spin multiple times + land on prize (need to go opposite direction since wheel spins clockwise)
      const targetRotation = rotation + 360 * 5 + (360 - prizeRotation - segmentAngle / 2);
      
      setRotation(targetRotation);
      
      // Wait for animation to complete
      setTimeout(() => {
        setIsSpinning(false);
        setShowResult({ label: data.prizeLabel, value: data.prizeValue });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        refetch();
        
        toast({
          title: "Congratulations!",
          description: `You won ${data.prizeLabel} play credits!`,
        });
      }, 4000);
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
    if (!status?.nextSpinTime) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(status.nextSpinTime));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [status?.nextSpinTime]);
  
  const colors = [
    "hsl(142, 76%, 36%)", // green
    "hsl(262, 83%, 58%)", // purple
    "hsl(45, 93%, 47%)",  // gold
    "hsl(199, 89%, 48%)", // blue
    "hsl(0, 84%, 60%)",   // red
    "hsl(280, 65%, 60%)", // violet
    "hsl(38, 92%, 50%)",  // orange
    "hsl(330, 81%, 60%)", // pink
  ];
  
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
          <RotateCw className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Daily Wheel Spin</h3>
          <p className="text-sm text-muted-foreground">Spin once every 24 hours for prizes</p>
        </div>
      </div>
      
      <div className="flex flex-col items-center">
        {/* Wheel Container */}
        <div className="relative w-72 h-72 mb-6">
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
            <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-primary drop-shadow-lg" />
          </div>
          
          {/* Wheel */}
          <motion.div 
            className="w-full h-full rounded-full border-4 border-border overflow-hidden shadow-2xl"
            style={{ 
              rotate: rotation,
              transition: isSpinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : undefined
            }}
            animate={{ rotate: rotation }}
            transition={{ duration: isSpinning ? 4 : 0, ease: [0.17, 0.67, 0.12, 0.99] }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full">
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
                
                return (
                  <g key={i}>
                    <path
                      d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[i % colors.length]}
                      stroke="rgba(0,0,0,0.2)"
                      strokeWidth="0.5"
                    />
                    <text
                      x={textX}
                      y={textY}
                      fill="white"
                      fontSize="5"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {prize.label}
                    </text>
                  </g>
                );
              })}
              {/* Center circle */}
              <circle cx="50" cy="50" r="8" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
            </svg>
          </motion.div>
        </div>
        
        {/* Result Display */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 text-center"
            >
              <p className="text-sm text-muted-foreground">You won</p>
              <p className="text-3xl font-bold text-primary">{showResult.label}</p>
            </motion.div>
          )}
        </AnimatePresence>
        
        {status?.canSpin ? (
          <Button 
            className="w-full max-w-xs font-bold" 
            size="lg"
            onClick={handleSpin}
            disabled={isSpinning}
            data-testid="button-spin-wheel"
          >
            {isSpinning ? (
              <>
                <RotateCw className="w-4 h-4 mr-2 animate-spin" />
                Spinning...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Spin the Wheel
              </>
            )}
          </Button>
        ) : (
          <div className="text-center py-3">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Next spin available in</span>
            </div>
            <span className="font-mono text-2xl font-bold text-primary">{timeRemaining}</span>
          </div>
        )}
      </div>
      
      {/* Prize List */}
      <div className="mt-6 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center mb-3">Possible Prizes</p>
        <div className="flex flex-wrap justify-center gap-2">
          {WHEEL_PRIZES.map((prize, i) => (
            <span 
              key={i} 
              className="px-2 py-1 text-xs font-medium rounded-md"
              style={{ backgroundColor: colors[i % colors.length] + "30", color: colors[i % colors.length] }}
            >
              {prize.label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function Rewards() {
  const { user } = useAuth();
  
  if (!user) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <Gift className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Daily Rewards</h1>
          <p className="text-muted-foreground mb-6">Please log in to claim your daily rewards</p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Daily Rewards</h1>
          <p className="text-muted-foreground">
            Claim your free play-money bonuses every day!
            <span className="ml-2 text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">Demo Only</span>
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <DailyBonus />
          <SpinWheel />
        </div>
        
        <div className="mt-8 p-4 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            This is a play-money demo application. No real money is involved.
          </p>
        </div>
      </div>
    </Layout>
  );
}
