import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { RotateCw, Clock } from "lucide-react";

function formatTimeShort(isoString: string | null): string {
  if (!isoString) return "";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

export function DailySpinDropdown() {
  const { user } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState("");
  
  const { data: status } = useQuery<{ canSpin: boolean; nextSpinTime: string | null }>({
    queryKey: ["/api/rewards/wheel/status"],
    enabled: !!user,
  });
  
  useEffect(() => {
    if (!status?.nextSpinTime) {
      setTimeRemaining("");
      return;
    }
    
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeShort(status.nextSpinTime));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [status?.nextSpinTime]);
  
  return (
    <Link href="/daily-spin">
      <Button 
        variant="outline" 
        size="sm" 
        className="gap-1.5 border-accent/30 hover:border-accent/50 relative"
        data-testid="button-daily-spin-nav"
      >
        <RotateCw className="w-4 h-4 text-accent" />
        <span className="hidden md:inline">Daily Spin</span>
        {status?.canSpin ? (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
        ) : timeRemaining ? (
          <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground ml-1">
            <Clock className="w-3 h-3" />
            {timeRemaining}
          </span>
        ) : null}
      </Button>
    </Link>
  );
}
