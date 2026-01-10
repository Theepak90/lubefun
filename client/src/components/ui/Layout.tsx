import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Dice5, 
  Coins, 
  Bomb, 
  Menu, 
  X, 
  User as UserIcon, 
  LogOut,
  History,
  ShieldCheck,
  RotateCw
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
import { DailyBonusDropdown } from "@/components/DailyBonusDropdown";
import { DailySpinDropdown } from "@/components/DailySpinDropdown";
import { RewardsDropdown } from "@/components/RewardsDropdown";
import { WalletDropdown } from "@/components/WalletDropdown";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

import logoImg from "@assets/Screenshot_2026-01-10_094338-removebg-preview_1768038772590.png";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [isFairnessOpen, setFairnessOpen] = useState(false);
  
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

  const openLogin = () => {
    setAuthMode("login");
    setAuthOpen(true);
  };

  const openRegister = () => {
    setAuthMode("register");
    setAuthOpen(true);
  };

  const navItems = [
    { icon: Dice5, label: "Dice", href: "/dice" },
    { icon: Coins, label: "Coinflip", href: "/coinflip" },
    { icon: Bomb, label: "Mines", href: "/mines" },
    { icon: RotateCw, label: "Daily Spin", href: "/daily-spin" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-body">
      {/* Header */}
      <header className="h-14 border-b border-[#1e2a36] bg-[#0f1923]/95 backdrop-blur-md fixed top-0 w-full z-50 flex items-center justify-between px-4 lg:px-6">
        {/* Left: Logo + Mobile Menu */}
        <div className="flex items-center gap-2 flex-shrink-0 h-full">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden w-8 h-8 text-slate-400 hover:text-white hover:bg-white/5">
            <Menu className="w-4 h-4" />
          </Button>
          <Link href="/">
            <div className="flex items-center cursor-pointer group h-full">
              <img src={logoImg} alt="Lube.fun Logo" className="h-10 w-auto object-contain group-hover:scale-105 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Center: Balance + Wallet - absolutely positioned for true centering */}
        {user && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <WalletDropdown />
          </div>
        )}

        {/* Right: User Icons or Auth Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0 h-full">
          {user ? (
            <>
              <RewardsDropdown />
              <DailySpinDropdown />
              <button 
                className="w-8 h-8 rounded-lg bg-[#1a2633] text-slate-400 hover:text-white border border-[#2a3a4a] hover:border-[#3a4a5a] flex items-center justify-center transition-all" 
                title={user.username}
              >
                <UserIcon className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => logout()} 
                title="Logout" 
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={openLogin} className="font-medium text-slate-300 hover:text-white h-8 px-3 text-sm">Log In</Button>
              <Button size="sm" onClick={openRegister} className="font-semibold bg-emerald-500 hover:bg-emerald-400 h-8 px-4 text-sm">Register</Button>
            </>
          )}
        </div>
      </header>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleSidebar}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <div className="flex pt-14 min-h-screen">
        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-14 left-0 h-[calc(100vh-3.5rem)] w-64 bg-[#0f1923] border-r border-[#1e2a36] z-40 transition-transform duration-300 lg:translate-x-0 flex flex-col",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <div className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Games</div>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer mb-1",
                    location === item.href 
                      ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)]" 
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}>
                    <item.icon className={cn("w-5 h-5", location === item.href && "animate-pulse")} />
                    <span className="font-semibold">{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8 space-y-1">
              <div className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Account</div>
              <div 
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary/50 hover:text-foreground cursor-pointer transition-colors"
                onClick={() => setFairnessOpen(true)}
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="font-semibold">Fairness</span>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-border">
             <div className="bg-secondary/30 rounded-lg p-4">
                <h4 className="font-bold text-sm text-foreground mb-1">Play Responsibly</h4>
                <p className="text-xs text-muted-foreground">This is a demo play-money application. No real money is involved.</p>
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden bg-background relative">
           {/* Background Gradient Mesh */}
           <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
           
           <div className="container max-w-7xl mx-auto p-4 lg:p-8 relative z-10">
            {children}
           </div>
        </main>
      </div>

      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setAuthOpen(false)} 
        defaultMode={authMode} 
      />
      
      <ProvablyFairModal
        isOpen={isFairnessOpen}
        onClose={() => setFairnessOpen(false)}
      />
    </div>
  );
}
