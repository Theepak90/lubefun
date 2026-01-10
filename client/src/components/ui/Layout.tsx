import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Dice5, 
  Coins, 
  Bomb, 
  Menu, 
  User as UserIcon, 
  LogOut,
  ShieldCheck,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
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
  ];

  return (
    <div className="min-h-screen text-foreground flex flex-col grid-bg">
      {/* Header */}
      <header className="h-20 neon-card rounded-none border-x-0 border-t-0 fixed top-0 w-full z-50 flex items-center px-6 lg:px-8 justify-between">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar} 
            className="lg:hidden text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <img 
                src={logoImg} 
                alt="Lube.fun Logo" 
                className="h-12 w-auto object-contain group-hover:drop-shadow-[0_0_10px_hsl(180,100%,50%)] transition-all duration-300" 
              />
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-3 neon-card px-5 py-3">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="font-mono font-bold text-cyan-400 text-glow-cyan">${user.balance.toFixed(2)}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 neon-border" 
                title={user.username}
              >
                 <UserIcon className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => logout()} 
                title="Logout" 
                className="text-pink-400 hover:text-pink-300 hover:bg-pink-500/10"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="ghost" 
                onClick={openLogin} 
                className="font-display font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 tracking-wider"
              >
                Log In
              </Button>
              <Button 
                onClick={openRegister} 
                className="neon-button font-display font-bold text-black tracking-wider rounded-xl px-6"
              >
                Sign Up
              </Button>
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
            className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <div className="flex pt-20 min-h-screen">
        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-72 neon-card rounded-none border-y-0 border-l-0 z-40 transition-transform duration-300 lg:translate-x-0 flex flex-col",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <div className="px-3 py-3 text-xs font-display font-bold text-cyan-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Games
              </div>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <motion.div 
                    whileHover={{ x: 4 }}
                    className={cn(
                      "flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-300 cursor-pointer mb-1 neon-hover",
                      location === item.href 
                        ? "neon-card neon-glow-cyan text-cyan-400" 
                        : "text-purple-300 hover:text-cyan-400"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", location === item.href && "drop-shadow-[0_0_8px_hsl(180,100%,50%)]")} />
                    <span className="font-display font-bold tracking-wider">{item.label}</span>
                  </motion.div>
                </Link>
              ))}
            </div>

            <div className="mt-10 space-y-2">
              <div className="px-3 py-3 text-xs font-display font-bold text-pink-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> Settings
              </div>
              <motion.div 
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 px-4 py-4 rounded-xl text-purple-300 hover:text-pink-400 cursor-pointer transition-all duration-300 neon-hover"
                onClick={() => setFairnessOpen(true)}
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="font-display font-bold tracking-wider">Fairness</span>
              </motion.div>
            </div>
          </div>
          
          <div className="p-6 border-t border-cyan-500/20">
             <div className="neon-card-magenta p-5">
                <p className="text-xs text-pink-300/80 leading-relaxed font-medium">
                  Play money only. No real gambling. Have fun!
                </p>
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden relative">
           <div className="max-w-7xl mx-auto p-6 lg:p-10">
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
