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
      <button 
        className="w-10 h-10 rounded-xl bg-[#1a2633] border border-[#2a3a4a] hover:border-amber-500/50 flex items-center justify-center transition-all relative group"
        data-testid="button-daily-spin-nav"
      >
        <svg 
          className="w-5 h-5 text-amber-400 group-hover:rotate-45 transition-transform duration-300" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2v10l7 4" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
        {status?.canSpin ? (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
        ) : timeRemaining ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400 bg-[#0f1923] px-1 rounded whitespace-nowrap">
            {timeRemaining}
          </span>
        ) : null}
      </button>
    </Link>
  );
}
