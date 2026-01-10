import { useState, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  Gift, 
  Clock, 
  RefreshCw, 
  Sparkles, 
  Calendar, 
  CalendarDays, 
  Percent,
  Trophy,
  RotateCw,
  Coins,
  ArrowLeft
} from "lucide-react";

interface RewardItem {
  canClaim: boolean;
  nextClaimTime: string | null;
  amount: number;
  label: string;
  description: string;
  volumeProgress?: number;
  wagerVolume?: number;
}

interface AllRewardsStatus {
  dailyReload: RewardItem;
  dailyBonus: RewardItem;
  weeklyBonus: RewardItem;
  monthlyBonus: RewardItem;
  rakeback: RewardItem;
}

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const rewardIcons: Record<string, any> = {
  dailyReload: RefreshCw,
  dailyBonus: Sparkles,
  weeklyBonus: Calendar,
  monthlyBonus: CalendarDays,
  rakeback: Percent,
};

const rewardColors: Record<string, { bg: string; text: string; border: string }> = {
  dailyReload: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  dailyBonus: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  weeklyBonus: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  monthlyBonus: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  rakeback: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/30" },
};

export default function Rewards() {
  const { toast } = useToast();
  const [timeNow, setTimeNow] = useState(Date.now());
  
  const { data: status, refetch, isLoading } = useQuery<AllRewardsStatus>({
    queryKey: ["/api/rewards/all-status"],
  });
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const claimMutation = useMutation({
    mutationFn: (type: string) => apiRequest("POST", `/api/rewards/claim/${type}`),
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "Reward Claimed!",
        description: `You received $${data.amount.toFixed(2)} play credits!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/all-status"] });
      refetch();
    },
    onError: async (error: any) => {
      let message = "Could not claim reward";
      try {
        const data = await error.response?.json();
        if (data?.message) message = data.message;
      } catch {}
      toast({
        title: "Cannot Claim",
        description: message,
        variant: "destructive",
      });
    },
  });
  
  const rewardKeys = ["dailyReload", "dailyBonus", "weeklyBonus", "monthlyBonus", "rakeback"] as const;
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <RotateCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Gift className="w-8 h-8 text-primary" />
              Rewards Center
            </h1>
            <p className="text-muted-foreground mt-1">Claim your daily, weekly, and monthly rewards</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Games
            </Button>
          </Link>
        </div>
        
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/30 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">$20,000 WEEKLY RAFFLE</h2>
                <p className="text-muted-foreground">Every bet you make counts as an entry into our weekly raffle!</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewardKeys.map((key) => {
            const reward = status?.[key];
            if (!reward) return null;
            
            const Icon = rewardIcons[key];
            const colors = rewardColors[key];
            const timeLeft = formatTimeRemaining(reward.nextClaimTime);
            
            return (
              <Card 
                key={key} 
                className={`relative overflow-hidden ${colors.border} border-2`}
                data-testid={`reward-card-${key}`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 ${colors.bg} rounded-full blur-3xl -translate-y-1/2 translate-x-1/2`} />
                
                <CardHeader className="flex-row items-center gap-3 pb-2">
                  <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${colors.text}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{reward.label}</CardTitle>
                    <CardDescription className="text-xs">{reward.description}</CardDescription>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className={`w-5 h-5 ${colors.text}`} />
                      <span className="text-2xl font-bold text-foreground">
                        ${key === "rakeback" ? reward.amount.toFixed(2) : reward.amount}
                      </span>
                    </div>
                  </div>
                  
                  {key === "rakeback" && reward.wagerVolume !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      Wagered: ${reward.wagerVolume.toFixed(2)} since last claim
                    </div>
                  )}
                  
                  {key === "dailyBonus" && reward.volumeProgress !== undefined && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Daily volume progress</span>
                        <span>{Math.round(reward.volumeProgress)}%</span>
                      </div>
                      <Progress value={reward.volumeProgress} className="h-1.5" />
                    </div>
                  )}
                  
                  {reward.canClaim ? (
                    <Button 
                      className="w-full font-bold"
                      onClick={() => claimMutation.mutate(key)}
                      disabled={claimMutation.isPending}
                      data-testid={`button-claim-${key}`}
                    >
                      {claimMutation.isPending ? (
                        <RotateCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Claim Now
                    </Button>
                  ) : (
                    <div className="text-center py-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs">Available in</span>
                      </div>
                      <span className="font-mono text-lg font-bold text-foreground">{timeLeft || "Soon"}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          This is a play-money demo application. All rewards are virtual credits with no real value.
        </div>
      </div>
    </Layout>
  );
}
