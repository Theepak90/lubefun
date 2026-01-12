import { useState, useRef, useEffect } from "react";
import { Wallet, X, ChevronDown, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
// To use a local Solana logo image, save it as solana-logo.png in attached_assets and uncomment:
// import solanaLogo from "@assets/solana-logo.png";
// Then replace SOLANA_LOGO_URL below with: const SOLANA_LOGO_URL = solanaLogo;
const SOLANA_LOGO_URL = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

type TabType = "deposit" | "withdraw";

const SOLANA_CURRENCY = {
  id: "sol",
  name: "Solana",
  symbol: "SOL",
  icon: "◎",
};

const SOLANA_NETWORK = {
  id: "mainnet",
  name: "Solana Mainnet",
};

export function WalletDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawAddress, setWithdrawAddress] = useState<string>("");
  const [depositMemo, setDepositMemo] = useState<string>("");
  const [depositId, setDepositId] = useState<number | null>(null);
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);
  const [depositStatus, setDepositStatus] = useState<"PENDING" | "CONFIRMED" | "NONE">("NONE");
  const [isCheckingDeposit, setIsCheckingDeposit] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Solana wallet address (will be generated or fetched from backend)

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

  // Reset address and amounts when modal closes
  useEffect(() => {
    if (!isOpen) {
      setWalletAddress("");
      setDepositAmount("");
      setWithdrawAmount("");
      setWithdrawAddress("");
      setDepositMemo("");
      setDepositId(null);
    }
  }, [isOpen]);

  // Initiate deposit when amount is entered
  useEffect(() => {
    if (user && isOpen && activeTab === "deposit" && depositAmount && parseFloat(depositAmount) > 0 && !walletAddress && !isProcessingDeposit) {
      handleInitiateDeposit();
    }
  }, [user, isOpen, activeTab, depositAmount]);

  // Poll for deposit status if there's a pending deposit
  useEffect(() => {
    if (!user || !depositId || activeTab !== "deposit") {
      setDepositStatus("NONE");
      return;
    }

    let interval: NodeJS.Timeout;
    
    const checkDepositStatus = async () => {
      try {
        const res = await fetch("/api/deposit/status", {
          credentials: "include",
        });
        
        if (res.ok) {
          const data = await res.json();
          const status = data.status || "NONE";
          setDepositStatus(status);
          
          if (status === "CONFIRMED") {
            // Deposit confirmed - refresh user data and show success
            queryClient.invalidateQueries({ queryKey: ["/api/user"] });
            // Don't reload page, just update balance
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          } else if (status === "PENDING") {
            // Keep polling
            console.log("Deposit still pending, will check again in 5 seconds...");
          }
        }
      } catch (error) {
        console.error("Error checking deposit status:", error);
      }
    };

    // Check immediately
    checkDepositStatus();
    
    // Then poll every 5 seconds
    interval = setInterval(checkDepositStatus, 5000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, depositId, activeTab, queryClient]);

  const handleInitiateDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return;
    
    setIsProcessingDeposit(true);
    try {
      const idempotencyKey = `deposit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const res = await fetch("/api/deposit/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
        body: JSON.stringify({ amount: parseFloat(depositAmount) }),
      });

      if (!res.ok) {
        const err = await res.json();
        setWalletAddress(`Error: ${err.error || "Failed to generate deposit address"}`);
        return;
      }

      const data = await res.json();
      if (data.success && data.deposit) {
        setWalletAddress(data.address);
        setDepositMemo(data.memo || "");
        setDepositId(data.deposit.id);
      } else {
        setWalletAddress(`Error: ${data.error || "Failed to generate deposit address"}`);
      }
    } catch (error) {
      console.error("Error initiating deposit:", error);
      setWalletAddress("Error: Failed to connect to server");
    } finally {
      setIsProcessingDeposit(false);
    }
  };

  const handleCopy = () => {
    if (walletAddress && walletAddress !== "Generating Solana address..." && !walletAddress.startsWith("Error")) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0) return;
    
    setIsProcessingWithdraw(true);
    try {
      const idempotencyKey = `withdraw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          address: withdrawAddress,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Withdrawal failed: ${err.error || "Unknown error"}`);
        return;
      }

      const data = await res.json();
      if (data.success) {
        alert(`Withdrawal ${data.status === "SENT" ? "sent successfully" : "queued for processing"}. ${data.txHash ? `Transaction: ${data.txHash}` : ""}`);
        // Refresh user data
        window.location.reload();
      } else {
        alert(`Withdrawal failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error processing withdrawal:", error);
      alert("Failed to process withdrawal. Please try again.");
    } finally {
      setIsProcessingWithdraw(false);
    }
  };

  if (!user) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <div className="flex items-center gap-1">
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-[#1a2633] px-4 py-2 rounded-l-xl cursor-pointer hover:bg-[#1e2a38] transition-all border border-[#2a3a4a]/50 border-r-0"
        >
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
          <span className="font-semibold text-white text-sm">
            {user?.availableBalance ? `$${user.availableBalance.toFixed(2)}` : "$0.00"}
          </span>
          <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 px-5 py-2 rounded-r-xl font-bold text-white text-sm shadow-lg shadow-emerald-600/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40"
          data-testid="button-wallet"
        >
          <Wallet className="w-4 h-4" />
          <span>Wallet</span>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full right-0 mt-3 w-[420px] z-50"
          >
            <div className="bg-[#0f1923] border border-[#1e2a36] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-2 p-4 border-b border-[#1e2a36]">
                <button
                  onClick={() => setActiveTab("deposit")}
                  className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    activeTab === "deposit"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : "text-slate-400 hover:text-white hover:bg-[#1a2633]"
                  }`}
                  data-testid="tab-deposit"
                >
                  Deposit
                </button>
                <button
                  onClick={() => setActiveTab("withdraw")}
                  className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    activeTab === "withdraw"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : "text-slate-400 hover:text-white hover:bg-[#1a2633]"
                  }`}
                  data-testid="tab-withdraw"
                >
                  Withdraw
                </button>
                <div className="flex-1" />
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-slate-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-[#1a2633]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-6">
                {/* Step 1: Solana Currency Display */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">1</span>
                    </div>
                    <span className="font-semibold text-white">Currency</span>
                  </div>
                  <div className="ml-10">
                    <div className="w-full flex items-center gap-3 px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-transparent">
                        <img 
                          src={SOLANA_LOGO_URL} 
                          alt="Solana" 
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            // Fallback if image fails to load
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <span className="text-white font-medium">{SOLANA_CURRENCY.name}</span>
                        <span className="text-slate-500 text-sm ml-2">{SOLANA_CURRENCY.symbol}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Amount Input */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">2</span>
                    </div>
                    <span className="font-semibold text-white">Amount</span>
                  </div>
                  <div className="ml-10">
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={activeTab === "deposit" ? depositAmount : withdrawAmount}
                        onChange={(e) => {
                          if (activeTab === "deposit") {
                            setDepositAmount(e.target.value);
                          } else {
                            setWithdrawAmount(e.target.value);
                          }
                        }}
                        placeholder={`Enter ${SOLANA_CURRENCY.symbol} amount`}
                        className="w-full px-4 py-3 pr-16 bg-[#1a2633] border border-[#2a3a4a] rounded-xl text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">
                        {SOLANA_CURRENCY.symbol}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {[0.1, 0.5, 1, 5].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => {
                            if (activeTab === "deposit") {
                              setDepositAmount(amount.toString());
                            } else {
                              setWithdrawAmount(amount.toString());
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-[#0a0f14] border border-[#2a3a4a] rounded-lg text-xs text-slate-400 hover:text-white hover:border-emerald-500/50 transition-colors"
                        >
                          {amount} {SOLANA_CURRENCY.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 3: Address */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">3</span>
                    </div>
                    <span className="font-semibold text-white">{activeTab === "deposit" ? "Deposit" : "Withdraw"} Address</span>
                  </div>
                  <div className="ml-10 space-y-3">
                    {activeTab === "deposit" ? (
                      <>
                        {/* Deposit Address Input */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl">
                          <input
                            type="text"
                            value={walletAddress}
                            readOnly
                            placeholder="Generating Solana address..."
                            className="flex-1 bg-transparent text-white text-sm outline-none font-mono"
                          />
                          <button
                            onClick={handleCopy}
                            disabled={!walletAddress || walletAddress === "Generating Solana address..." || walletAddress.startsWith("Error")}
                            className={`p-1.5 rounded-lg transition-colors ${
                              walletAddress && walletAddress !== "Generating Solana address..." && !walletAddress.startsWith("Error")
                                ? 'hover:bg-[#243040] text-slate-400 hover:text-white' 
                                : 'text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        {/* QR Code Area */}
                        <div className="flex gap-4">
                          <a
                            href={`solana:${walletAddress}?amount=${depositAmount}&memo=${encodeURIComponent(depositMemo)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              // Open in Solana explorer
                              window.open(`https://solscan.io/account/${walletAddress}`, '_blank');
                            }}
                            className="w-24 h-24 bg-white p-2 rounded-xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform border-2 border-transparent hover:border-emerald-500/50"
                            title="Click to open in Solana explorer or scan with Phantom"
                          >
                            {walletAddress && walletAddress !== "Generating Solana address..." && !walletAddress.startsWith("Error") ? (
                              <QRCode
                                value={`solana:${walletAddress}?amount=${depositAmount}&memo=${encodeURIComponent(depositMemo)}`}
                                level="H"
                                size={88}
                                style={{ height: 88, width: 88 }}
                              />
                            ) : (
                              <svg className="w-10 h-10 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                                <rect x="7" y="7" width="10" height="10" rx="1" />
                              </svg>
                            )}
                          </a>
                          <div className="flex-1 flex flex-col gap-2">
                            <p className="text-sm text-slate-500">
                              {walletAddress && walletAddress !== "Generating Solana address..." && !walletAddress.startsWith("Error")
                                ? depositMemo 
                                  ? `Send exactly ${depositAmount} SOL to the address above. Include memo: ${depositMemo.substring(0, 20)}...`
                                  : `Send exactly ${depositAmount} SOL to the address above. Click QR code to open in Phantom.`
                                : walletAddress.startsWith("Error")
                                ? walletAddress
                                : isProcessingDeposit
                                ? "Generating deposit address..."
                                : "Enter amount to generate deposit address"
                              }
                            </p>
                            {depositStatus === "PENDING" && depositId && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                                <p className="text-xs text-yellow-400">Waiting for deposit confirmation... Checking every 5 seconds</p>
                              </div>
                            )}
                            {depositStatus === "CONFIRMED" && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <p className="text-xs text-emerald-400">Deposit confirmed! Balance updated.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Withdraw Address Input */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl">
                          <input
                            type="text"
                            value={withdrawAddress}
                            onChange={(e) => setWithdrawAddress(e.target.value)}
                            placeholder="Enter your Solana wallet address"
                            className="flex-1 bg-transparent text-white text-sm outline-none font-mono placeholder-slate-600"
                          />
                        </div>
                        <button 
                          disabled={!withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount || "0") <= 0 || isProcessingWithdraw}
                          onClick={handleWithdraw}
                          className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all"
                        >
                          {isProcessingWithdraw ? "Processing..." : "Request Withdrawal"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-[#0a0f14] border-t border-[#1e2a36]">
                <p className="text-[10px] text-slate-600 text-center">
                  Solana integration - Real SOL deposits and withdrawals supported
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
