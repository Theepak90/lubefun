import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, Clock, Sparkles, RotateCw, ChevronDown } from "lucide-react";
import { DAILY_BONUS_AMOUNT } from "@shared/schema";

function formatTimeRemaining(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function DailyBonusDropdown() {
  const { toast } = useToast();
  const [timeRemaining, setTimeRemaining] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  
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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5 border-primary/30 hover:border-primary/50 relative"
          data-testid="button-daily-bonus-dropdown"
        >
          <Gift className="w-4 h-4 text-primary" />
          <span className="hidden md:inline">Daily Bonus</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
          {status?.canClaim && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-4 border-b border-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Daily Login Bonus</h3>
              <p className="text-xs text-muted-foreground">Claim every 24 hours</p>
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-primary mb-1">${DAILY_BONUS_AMOUNT}</div>
            <p className="text-xs text-muted-foreground">Play credits</p>
          </div>
          
          {status?.canClaim ? (
            <Button 
              className="w-full font-bold" 
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
              data-testid="button-claim-bonus"
            >
              {claimMutation.isPending ? (
                <RotateCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Claim Now
            </Button>
          ) : (
            <div className="text-center py-2 px-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs">Next bonus in</span>
              </div>
              <span className="font-mono text-lg font-bold text-foreground">{timeRemaining}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
