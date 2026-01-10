import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Clock, Package, Volume2, VolumeX, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WHEEL_PRIZES } from "@shared/schema";

type SpinState = "idle" | "preparing" | "spinning" | "revealing" | "cooldown";

interface ReelItem {
  id: string;
  label: string;
  value: number;
  rarity: Rarity;
}

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

const rarityStyles: Record<Rarity, { bg: string; border: string; label: string; labelColor: string }> = {
  common: { bg: "bg-gray-700", border: "border-gray-500", label: "COMMON", labelColor: "text-gray-400" },
  uncommon: { bg: "bg-emerald-700", border: "border-emerald-500", label: "UNCOMMON", labelColor: "text-emerald-400" },
  rare: { bg: "bg-blue-700", border: "border-blue-500", label: "RARE", labelColor: "text-blue-400" },
  epic: { bg: "bg-purple-700", border: "border-purple-500", label: "EPIC", labelColor: "text-purple-400" },
  legendary: { bg: "bg-amber-600", border: "border-amber-400", label: "LEGENDARY", labelColor: "text-amber-400" },
};

const ITEM_WIDTH = 180;
const ITEM_GAP = 8;
const FULL_CYCLES = 6;

const SPIN_SOUND_DATA = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleAcAQJ7Z3ax1AAAATW1zz/TJnF4LAABY2vXWsmUUBVeYz+W4axEKVZjP5bhrEQpVl87kunIOEFKVz+jGfScRR5TS6cqDLRM/kNLpyoMtEz+Q0unKgy0TP5DS6cqDLRM/kNLpyoMtEz+Q0unKgy0TP5DS6cqDLRM/kNLpyoMtEz+Q0unKgy0TP5DS6cqDLRM/kNLpyoMtEz+Q0unKgy0TP5DS6cqDLRM/";
const WIN_SOUND_DATA = "data:audio/wav;base64,UklGRl9XAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YYhWAACBhYaGhYWEg4KBgH+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/wA=";

export default function DailySpin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<SpinState>("idle");
  const [timeRemaining, setTimeRemaining] = useState("");
  const [wonPrize, setWonPrize] = useState<{ id: string; label: string; value: number } | null>(null);
  const [reelOffset, setReelOffset] = useState(0);
  const [reelItems, setReelItems] = useState<ReelItem[]>([]);
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lootbox-muted") !== "false";
    }
    return true;
  });
  
  const spinSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    spinSoundRef.current = new Audio(SPIN_SOUND_DATA);
    spinSoundRef.current.volume = 0.3;
    winSoundRef.current = new Audio(WIN_SOUND_DATA);
    winSoundRef.current.volume = 0.3;
    
    return () => {
      spinSoundRef.current = null;
      winSoundRef.current = null;
    };
  }, []);
  
  const { data: status, refetch } = useQuery<{ canSpin: boolean; nextSpinTime: string | null }>({
    queryKey: ["/api/rewards/wheel/status"],
    enabled: !!user,
  });
  
  useEffect(() => {
    localStorage.setItem("lootbox-muted", isMuted ? "true" : "false");
  }, [isMuted]);
  
  const playSound = useCallback((type: "spin" | "win") => {
    if (isMuted) return;
    
    const audio = type === "spin" ? spinSoundRef.current : winSoundRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, [isMuted]);
  
  const generateReelItems = useCallback((targetPrizeId: string): ReelItem[] => {
    const items: ReelItem[] = [];
    const prizeCount = WHEEL_PRIZES.length;
    
    for (let cycle = 0; cycle < FULL_CYCLES; cycle++) {
      for (let i = 0; i < prizeCount; i++) {
        const prize = WHEEL_PRIZES[i];
        items.push({
          id: prize.id,
          label: prize.label,
          value: prize.value,
          rarity: prize.rarity,
        });
      }
    }
    
    const targetIndex = WHEEL_PRIZES.findIndex(p => p.id === targetPrizeId);
    const targetPrize = WHEEL_PRIZES[targetIndex >= 0 ? targetIndex : 0];
    items.push({
      id: targetPrize.id,
      label: targetPrize.label,
      value: targetPrize.value,
      rarity: targetPrize.rarity,
    });
    
    return items;
  }, []);
  
  const spinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rewards/wheel/spin"),
    onSuccess: async (response) => {
      const data = await response.json();
      
      const items = generateReelItems(data.prizeId);
      setReelItems(items);
      setReelOffset(0);
      
      const animatedItem = items[items.length - 1];
      if (import.meta.env.DEV) {
        console.log(`[Lootbox] Backend prizeId=${data.prizeId}, Animated prizeId=${animatedItem.id}, Match=${data.prizeId === animatedItem.id}`);
      }
      
      setState("preparing");
      
      setTimeout(() => {
        setState("spinning");
        playSound("spin");
        
        const targetPosition = items.length - 1;
        const targetOffset = targetPosition * (ITEM_WIDTH + ITEM_GAP);
        setReelOffset(targetOffset);
        
        setTimeout(() => {
          setState("revealing");
          playSound("win");
          setWonPrize({ 
            id: data.prizeId,
            label: data.prizeLabel, 
            value: data.prizeValue
          });
          
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          refetch();
          
          const isBigPrize = data.prizeValue >= 1;
          
          toast({
            title: isBigPrize ? "JACKPOT!" : "You Won!",
            description: `${data.prizeLabel} play credits added to your balance!`,
          });
          
          setTimeout(() => {
            setState("cooldown");
          }, 3000);
        }, 4000);
      }, 500);
    },
    onError: () => {
      setState("idle");
      toast({
        title: "Error",
        description: "Could not open lootbox",
        variant: "destructive",
      });
    },
  });
  
  const handleOpen = () => {
    if (state !== "idle" || !status?.canSpin) return;
    setWonPrize(null);
    spinMutation.mutate();
  };
  
  useEffect(() => {
    if (!status?.nextSpinTime) {
      setTimeRemaining("");
      return;
    }
    
    const updateTimer = () => {
      const time = formatTimeRemaining(status.nextSpinTime);
      setTimeRemaining(time);
      if (!time && state === "cooldown") {
        setState("idle");
        refetch();
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [status?.nextSpinTime, state, refetch]);
  
  useEffect(() => {
    if (status && !status.canSpin && state === "idle") {
      setState("cooldown");
    } else if (status?.canSpin && state === "cooldown") {
      setState("idle");
    }
  }, [status, state]);
  
  if (!user) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Daily Lootbox</h1>
          <p className="text-muted-foreground mb-6">Please log in to open your daily lootbox</p>
        </div>
      </Layout>
    );
  }
  
  const crateState = state === "idle" || state === "cooldown" ? "closed" : 
                     state === "preparing" || state === "spinning" ? "opening" : "opened";
  
  const defaultReelItems: ReelItem[] = WHEEL_PRIZES.map((prize) => ({
    id: prize.id,
    label: prize.label,
    value: prize.value,
    rarity: prize.rarity,
  }));
  
  const displayItems = reelItems.length > 0 ? reelItems : defaultReelItems;
  
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 
              className="text-3xl md:text-4xl font-black tracking-tight"
              style={{ 
                background: "linear-gradient(135deg, #00ff88 0%, #00ffff 50%, #ff00ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              DAILY LOOTBOX
            </h1>
            <p className="text-muted-foreground text-sm">
              Open once every 24 hours
              <span className="ml-2 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">Play Money</span>
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-toggle-sound"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>
        
        <div className="flex justify-center gap-4 mb-8">
          {["closed", "opening", "opened"].map((cState) => (
            <div 
              key={cState}
              className={`relative w-20 h-20 md:w-24 md:h-24 rounded-xl transition-all duration-500 ${
                crateState === cState 
                  ? "bg-primary/20 border-2 border-primary shadow-lg shadow-primary/30 scale-110" 
                  : "bg-secondary/30 border border-border opacity-50"
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <Package 
                  className={`w-8 h-8 md:w-10 md:h-10 transition-all duration-300 ${
                    crateState === cState ? "text-primary" : "text-muted-foreground"
                  } ${cState === "opening" && crateState === "opening" ? "animate-pulse" : ""}`}
                  style={{
                    transform: cState === "opened" ? "rotateX(20deg)" : "none",
                  }}
                />
              </div>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {cState}
              </div>
            </div>
          ))}
        </div>
        
        <div 
          className="relative mx-auto w-full max-w-[900px] rounded-2xl overflow-hidden mb-8"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(20,20,30,0.95) 100%)",
            border: "2px solid rgba(0,255,136,0.3)",
            boxShadow: state === "revealing" 
              ? "0 0 60px rgba(0,255,136,0.6), 0 0 120px rgba(0,255,255,0.3)"
              : "0 0 30px rgba(0,255,136,0.2)"
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full bg-gradient-to-b from-primary via-primary/50 to-primary z-20 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-8 border-r-8 border-t-[12px] border-l-transparent border-r-transparent border-t-primary" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-0 h-0 border-l-8 border-r-8 border-b-[12px] border-l-transparent border-r-transparent border-b-primary" />
          </div>
          
          <div 
            className="relative h-36 md:h-44 overflow-hidden"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
            }}
          >
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 flex"
              animate={{ x: -reelOffset }}
              transition={{
                duration: state === "spinning" ? 4 : 0,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              style={{ 
                left: `calc(50% - ${ITEM_WIDTH / 2}px)`,
                gap: `${ITEM_GAP}px`,
                paddingLeft: ITEM_WIDTH,
                paddingRight: ITEM_WIDTH,
              }}
            >
              {displayItems.map((prize, i) => {
                const styles = rarityStyles[prize.rarity];
                
                return (
                  <div 
                    key={i}
                    className={`flex-shrink-0 h-28 md:h-36 rounded-lg ${styles.bg} ${styles.border} border-2 flex flex-col items-center justify-center`}
                    style={{ width: ITEM_WIDTH }}
                  >
                    <span className={`text-xs font-bold uppercase tracking-wide ${styles.labelColor}`}>
                      {styles.label}
                    </span>
                    <span className="text-2xl md:text-3xl font-black text-white drop-shadow-lg mt-1">
                      {prize.label}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>
        
        <AnimatePresence>
          {state === "revealing" && wonPrize && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setState("cooldown")}
            >
              <motion.div
                initial={{ rotateY: -90 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  className="w-64 md:w-80 p-8 rounded-2xl text-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,255,136,0.2) 0%, rgba(0,0,0,0.9) 50%, rgba(0,255,255,0.2) 100%)",
                    border: "3px solid #00ff88",
                    boxShadow: "0 0 60px rgba(0,255,136,0.5), 0 0 120px rgba(0,255,136,0.3), inset 0 0 60px rgba(0,255,136,0.1)"
                  }}
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: "radial-gradient(circle at center, rgba(0,255,136,0.3) 0%, transparent 70%)",
                    }}
                  />
                  
                  <div className="absolute -inset-4 pointer-events-none">
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                        animate={{ 
                          opacity: [0, 1, 0],
                          scale: [0, 1, 0],
                          x: Math.cos(i * 30 * Math.PI / 180) * 100,
                          y: Math.sin(i * 30 * Math.PI / 180) * 100,
                        }}
                        transition={{ 
                          duration: 1.5, 
                          delay: i * 0.1,
                          repeat: Infinity,
                          repeatDelay: 1
                        }}
                        className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-primary"
                        style={{ filter: "blur(1px)" }}
                      />
                    ))}
                  </div>
                  
                  <div className="relative z-10">
                    <span className={`text-sm font-bold uppercase tracking-widest ${rarityStyles[WHEEL_PRIZES.find(p => p.id === wonPrize.id)?.rarity ?? "common"].labelColor}`}>
                      {rarityStyles[WHEEL_PRIZES.find(p => p.id === wonPrize.id)?.rarity ?? "common"].label}
                    </span>
                    <h2 className="text-lg text-muted-foreground mt-2 mb-1">YOU WON</h2>
                    <motion.p 
                      className="text-5xl md:text-6xl font-black"
                      style={{
                        color: "#00ff88",
                        textShadow: "0 0 20px #00ff88, 0 0 40px #00ff8866"
                      }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      {wonPrize.label}
                    </motion.p>
                    <p className="text-sm text-muted-foreground mt-3">Play Credits</p>
                    
                    <Button 
                      className="mt-6"
                      onClick={() => setState("cooldown")}
                      data-testid="button-close-reveal"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="text-center">
          {state === "idle" && status?.canSpin ? (
            <Button 
              size="lg"
              className="w-full max-w-sm font-black text-xl py-8 relative overflow-hidden group"
              style={{
                background: "linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)",
                boxShadow: "0 0 40px rgba(0,255,136,0.5), inset 0 2px 0 rgba(255,255,255,0.2)",
              }}
              onClick={handleOpen}
              data-testid="button-open-lootbox"
            >
              <motion.span 
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              />
              <Sparkles className="w-6 h-6 mr-3" />
              OPEN LOOTBOX
            </Button>
          ) : state === "preparing" || state === "spinning" ? (
            <div className="py-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="inline-block"
              >
                <Package className="w-8 h-8 text-primary" />
              </motion.div>
              <p className="text-lg font-bold text-primary mt-2 animate-pulse">
                {state === "preparing" ? "Preparing..." : "Opening..."}
              </p>
            </div>
          ) : (
            <div 
              className="max-w-sm mx-auto text-center py-6 px-8 rounded-xl"
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.1)"
              }}
            >
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm uppercase tracking-wider">Next lootbox in</span>
              </div>
              <span 
                className="font-mono text-3xl font-bold"
                style={{
                  color: "#00ffff",
                  textShadow: "0 0 10px #00ffff"
                }}
              >
                {timeRemaining || "00:00:00"}
              </span>
            </div>
          )}
        </div>
        
        <div className="mt-10">
          <h3 className="text-center text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">
            Possible Rewards
          </h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {WHEEL_PRIZES.map((prize, i) => {
              const styles = rarityStyles[prize.rarity];
              
              return (
                <div 
                  key={i}
                  className={`p-3 rounded-lg text-center ${styles.bg} ${styles.border} border-2 opacity-80 hover:opacity-100 transition-opacity`}
                >
                  <span className={`text-[10px] font-bold uppercase ${styles.labelColor}`}>
                    {styles.label}
                  </span>
                  <div className="text-lg font-bold text-white mt-1">
                    {prize.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-8">
          <h3 className="text-center text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">
            Drop Rates
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {[
              { rarity: "common" as Rarity, chance: "99.5%", prizes: "1¢ - 5¢" },
              { rarity: "uncommon" as Rarity, chance: "0.4%", prizes: "$5" },
              { rarity: "rare" as Rarity, chance: "0.08%", prizes: "$50" },
              { rarity: "epic" as Rarity, chance: "0.015%", prizes: "$500" },
            ].map((tier) => {
              const styles = rarityStyles[tier.rarity];
              return (
                <div 
                  key={tier.rarity}
                  className={`p-3 rounded-lg text-center ${styles.bg} ${styles.border} border`}
                >
                  <span className={`text-xs font-bold uppercase ${styles.labelColor}`}>
                    {styles.label}
                  </span>
                  <div className="text-lg font-bold text-white mt-1">
                    {tier.chance}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {tier.prizes}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center mt-3">
            <div className={`p-3 rounded-lg text-center ${rarityStyles.legendary.bg} ${rarityStyles.legendary.border} border w-48`}>
              <span className={`text-xs font-bold uppercase ${rarityStyles.legendary.labelColor}`}>
                LEGENDARY
              </span>
              <div className="text-lg font-bold text-white mt-1">
                0.005%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                $1000
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 p-4 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            This is a play-money demo. No real currency is involved. All outcomes are determined by weighted randomness with no manipulation.
          </p>
        </div>
      </div>
    </Layout>
  );
}
