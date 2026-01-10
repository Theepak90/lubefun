import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RotateCw, Clock, Sparkles, ChevronDown } from "lucide-react";
import { WHEEL_PRIZES } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function DailySpinDropdown() {
  const { toast } = useToast();
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [showResult, setShowResult] = useState<{ label: string; value: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: status, refetch } = useQuery<{ canSpin: boolean; nextSpinTime: string | null }>({
    queryKey: ["/api/rewards/wheel/status"],
  });
  
  const spinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rewards/wheel/spin"),
    onSuccess: async (response) => {
      const data = await response.json();
      
      const segmentAngle = 360 / WHEEL_PRIZES.length;
      const prizeRotation = data.prizeIndex * segmentAngle;
      const targetRotation = rotation + 360 * 4 + (360 - prizeRotation - segmentAngle / 2);
      
      setRotation(targetRotation);
      
      setTimeout(() => {
        setIsSpinning(false);
        setShowResult({ label: data.prizeLabel, value: data.prizeValue });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        refetch();
        
        toast({
          title: "You won!",
          description: `${data.prizeLabel} play credits added!`,
        });
      }, 3000);
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
    "hsl(142, 76%, 36%)",
    "hsl(262, 83%, 58%)",
    "hsl(45, 93%, 47%)",
    "hsl(199, 89%, 48%)",
    "hsl(0, 84%, 60%)",
    "hsl(280, 65%, 60%)",
    "hsl(38, 92%, 50%)",
    "hsl(330, 81%, 60%)",
  ];
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 border-accent/30 hover:border-accent/50 relative"
          data-testid="button-daily-spin-dropdown"
        >
          <RotateCw className="w-4 h-4 text-accent" />
          <span className="hidden md:inline">Daily Spin</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
          {status?.canSpin && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-border bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <RotateCw className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Daily Wheel Spin</h3>
              <p className="text-xs text-muted-foreground">Spin once every 24 hours</p>
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48 mb-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
                <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[14px] border-l-transparent border-r-transparent border-t-primary drop-shadow" />
              </div>
              
              <motion.div 
                className="w-full h-full rounded-full border-2 border-border overflow-hidden shadow-lg"
                animate={{ rotate: rotation }}
                transition={{ duration: isSpinning ? 3 : 0, ease: [0.17, 0.67, 0.12, 0.99] }}
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
                    const textX = 50 + 30 * Math.cos(textRad);
                    const textY = 50 + 30 * Math.sin(textRad);
                    
                    return (
                      <g key={i}>
                        <path
                          d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={colors[i % colors.length]}
                          stroke="rgba(0,0,0,0.15)"
                          strokeWidth="0.3"
                        />
                        <text
                          x={textX}
                          y={textY}
                          fill="white"
                          fontSize="4.5"
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
                  <circle cx="50" cy="50" r="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.5" />
                </svg>
              </motion.div>
            </div>
            
            <AnimatePresence>
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-3 text-center"
                >
                  <p className="text-xs text-muted-foreground">You won</p>
                  <p className="text-xl font-bold text-primary">{showResult.label}</p>
                </motion.div>
              )}
            </AnimatePresence>
            
            {status?.canSpin ? (
              <Button 
                className="w-full font-bold" 
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
                    Spin Now
                  </>
                )}
              </Button>
            ) : (
              <div className="w-full text-center py-2 px-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">Next spin in</span>
                </div>
                <span className="font-mono text-lg font-bold text-foreground">{timeRemaining}</span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
