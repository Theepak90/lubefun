import { useState, useRef, useEffect } from "react";
import { Wallet, Plus, ArrowDownToLine, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

export function WalletDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <div className="flex items-center gap-0.5 p-0.5 bg-[#0a0f14] rounded-xl border border-[#1a2530] shadow-lg shadow-black/30">
        {/* Balance Pill */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-gradient-to-b from-[#1a2633] to-[#141c24] px-3.5 py-1.5 rounded-lg border border-[#2a3a4a]/50 cursor-pointer hover:from-[#1e2a38] hover:to-[#182028] transition-all"
        >
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm shadow-amber-500/20">
            <span className="text-[8px] font-bold text-amber-900">$</span>
          </div>
          <span className="font-mono font-semibold text-white text-xs tracking-wide">{user.balance.toFixed(2)}</span>
          <svg className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {/* Wallet Button */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 px-3.5 py-1.5 rounded-lg font-semibold text-white text-xs shadow-sm shadow-emerald-600/30 transition-all hover:shadow-md hover:shadow-emerald-500/40 border border-emerald-400/20"
          data-testid="button-wallet"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Wallet</span>
        </button>
      </div>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-72 z-50"
          >
            <div className="bg-[#0f1923] border border-[#1e2a36] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 bg-gradient-to-b from-[#1a2633] to-[#0f1923] border-b border-[#1e2a36]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Demo Credits</span>
                  </div>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white font-mono">${user.balance.toFixed(2)}</span>
                  <span className="text-sm text-slate-500 ml-1">play credits</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  This is play money for entertainment only. No real money involved.
                </p>
              </div>

              {/* Actions */}
              <div className="p-3 space-y-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-[#1a2633]/50 hover:bg-[#1a2633] border border-transparent hover:border-emerald-500/30 transition-all group"
                  data-testid="button-deposit"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/50 transition-colors">
                    <Plus className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">Add Credits</div>
                    <div className="text-xs text-slate-500">Get more demo play money</div>
                  </div>
                </button>

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-[#1a2633]/50 hover:bg-[#1a2633] border border-transparent hover:border-blue-500/30 transition-all group"
                  data-testid="button-withdraw"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center border border-blue-500/30 group-hover:border-blue-500/50 transition-colors">
                    <ArrowDownToLine className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">Cash Out</div>
                    <div className="text-xs text-slate-500">Convert credits (demo only)</div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-[#0a0f14] border-t border-[#1e2a36]">
                <p className="text-[10px] text-slate-600 text-center">
                  Play responsibly. Credits have no cash value.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
