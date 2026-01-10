import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Dice5, 
  Coins, 
  Bomb, 
  Menu, 
  X, 
  Wallet, 
  User as UserIcon, 
  LogOut,
  History,
  ShieldCheck
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/AuthModal";
import { ProvablyFairModal } from "@/components/ProvablyFairModal";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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
    <div className="min-h-screen bg-background text-foreground flex flex-col font-body">
      {/* Header */}
      <header className="h-16 border-b border-border bg-card/50 backdrop-blur-md fixed top-0 w-full z-50 flex items-center px-4 lg:px-6 justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden text-muted-foreground hover:text-primary">
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="font-display font-bold text-primary-foreground text-xl">S</span>
              </div>
              <span className="font-display font-bold text-xl tracking-tight hidden sm:block group-hover:text-primary transition-colors">STAKE<span className="text-primary">CLONE</span></span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-white/5">
                <span className="text-sm font-medium text-muted-foreground">Balance:</span>
                <span className="font-mono font-bold text-primary text-glow">${user.balance.toFixed(2)}</span>
              </div>
              <Button variant="default" size="sm" className="hidden sm:flex gap-2 font-bold shadow-lg shadow-primary/20">
                <Wallet className="w-4 h-4" />
                Wallet
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full bg-secondary text-secondary-foreground" title={user.username}>
                 <UserIcon className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="text-muted-foreground hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={openLogin} className="font-semibold">Log In</Button>
              <Button onClick={openRegister} className="font-bold shadow-lg shadow-primary/20">Register</Button>
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

      <div className="flex pt-16 min-h-screen">
        {/* Sidebar */}
        <aside className={cn(
          "fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] w-64 bg-card border-r border-border z-40 transition-transform duration-300 lg:translate-x-0 flex flex-col",
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
