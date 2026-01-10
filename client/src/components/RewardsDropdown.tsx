import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  Gift, 
  ChevronDown, 
  Clock, 
  RefreshCw, 
  Sparkles, 
  Calendar, 
  CalendarDays, 
  Percent,
  ArrowRight,
  RotateCw
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
  
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const rewardIcons: Record<string, any> = {
  dailyReload: RefreshCw,
  dailyBonus: Sparkles,
  weeklyBonus: Calendar,
  monthlyBonus: CalendarDays,
  rakeback: Percent,
};

const rewardColors: Record<string, string> = {
  dailyReload: "text-emerald-400",
  dailyBonus: "text-amber-400",
  weeklyBonus: "text-blue-400",
  monthlyBonus: "text-purple-400",
  rakeback: "text-pink-400",
};

export function RewardsDropdown() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: status, refetch } = useQuery<AllRewardsStatus>({
    queryKey: ["/api/rewards/all-status"],
    refetchInterval: 60000, // Refresh every minute
  });
  
  const claimMutation = useMutation({
    mutationFn: (type: string) => apiRequest("POST", `/api/rewards/claim/${type}`),
    onSuccess: async (response, type) => {
      const data = await response.json();
      const reward = status?.[type as keyof AllRewardsStatus];
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
  const availableRewardsCount = status 
    ? rewardKeys.filter(key => status[key]?.canClaim).length 
    : 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 border-primary/30 hover:border-primary/50 relative"
          data-testid="button-rewards-dropdown"
        >
          <Gift className="w-4 h-4 text-primary" />
          <span className="hidden md:inline">Rewards</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
          {availableRewardsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs font-bold flex items-center justify-center animate-pulse">
              {availableRewardsCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-border bg-gradient-to-r from-primary/20 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/30 flex items-center justify-center">
              <Gift className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Daily Rewards</h3>
              <p className="text-xs text-muted-foreground">Claim your bonuses below</p>
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-border">
          {rewardKeys.map((key) => {
            const reward = status?.[key];
            if (!reward) return null;
            
            const Icon = rewardIcons[key];
            const colorClass = rewardColors[key];
            const timeLeft = formatTimeRemaining(reward.nextClaimTime);
            
            return (
              <div 
                key={key} 
                className="p-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
                data-testid={`reward-item-${key}`}
              >
                <div className={`w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{reward.label}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {key === "rakeback" 
                      ? `$${reward.amount.toFixed(2)} available` 
                      : `$${reward.amount} credits`}
                  </div>
                </div>
                
                {reward.canClaim ? (
                  <Button 
                    size="sm" 
                    className="h-7 text-xs font-semibold"
                    onClick={() => claimMutation.mutate(key)}
                    disabled={claimMutation.isPending}
                    data-testid={`button-claim-${key}`}
                  >
                    {claimMutation.isPending ? (
                      <RotateCw className="w-3 h-3 animate-spin" />
                    ) : (
                      "Claim"
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{timeLeft || "Soon"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="p-3 border-t border-border">
          <Link href="/rewards">
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => setIsOpen(false)}
              data-testid="button-all-rewards"
            >
              All Rewards
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground text-center">
            Play-money demo only. No real value.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
