import { useState, useRef, useEffect } from "react";
import { Wallet, X, ChevronDown, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

type TabType = "deposit" | "withdraw";

const currencies = [
  { id: "btc", name: "Bitcoin", symbol: "BTC", icon: "₿" },
  { id: "eth", name: "Ethereum", symbol: "ETH", icon: "Ξ" },
  { id: "usdt", name: "Tether", symbol: "USDT", icon: "$" },
  { id: "ltc", name: "Litecoin", symbol: "LTC", icon: "Ł" },
];

const networks = [
  { id: "mainnet", name: "Mainnet" },
  { id: "polygon", name: "Polygon" },
  { id: "bsc", name: "BSC" },
];

export function WalletDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const demoAddress = "0x7a9f...3b2c (Demo Only)";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setCurrencyDropdownOpen(false);
        setNetworkDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setCurrencyDropdownOpen(false);
        setNetworkDropdownOpen(false);
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

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedCurrencyData = currencies.find(c => c.id === selectedCurrency);
  const selectedNetworkData = networks.find(n => n.id === selectedNetwork);

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
          <span className="font-semibold text-white text-sm">${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                {/* Step 1: Select Currency */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">1</span>
                    </div>
                    <span className="font-semibold text-white">Select Currency</span>
                  </div>
                  <div className="relative ml-10">
                    <button
                      onClick={() => {
                        setCurrencyDropdownOpen(!currencyDropdownOpen);
                        setNetworkDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl hover:border-[#3a4a5a] transition-colors"
                      data-testid="select-currency"
                    >
                      <div className="flex items-center gap-3">
                        {selectedCurrencyData ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                              {selectedCurrencyData.icon}
                            </div>
                            <span className="text-white font-medium">{selectedCurrencyData.name}</span>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v12M6 12h12" />
                              </svg>
                            </div>
                            <span className="text-slate-400">Select Crypto</span>
                          </>
                        )}
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${currencyDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {currencyDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-[#1a2633] border border-[#2a3a4a] rounded-xl overflow-hidden z-10"
                        >
                          {currencies.map((currency) => (
                            <button
                              key={currency.id}
                              onClick={() => {
                                setSelectedCurrency(currency.id);
                                setCurrencyDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#243040] transition-colors"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                                {currency.icon}
                              </div>
                              <span className="text-white">{currency.name}</span>
                              <span className="text-slate-500 text-sm ml-auto">{currency.symbol}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Step 2: Select Network */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">2</span>
                    </div>
                    <span className="font-semibold text-white">Select Network</span>
                  </div>
                  <div className="relative ml-10">
                    <button
                      onClick={() => {
                        setNetworkDropdownOpen(!networkDropdownOpen);
                        setCurrencyDropdownOpen(false);
                      }}
                      disabled={!selectedCurrency}
                      className={`w-full flex items-center justify-between px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl transition-colors ${
                        selectedCurrency ? 'hover:border-[#3a4a5a]' : 'opacity-50 cursor-not-allowed'
                      }`}
                      data-testid="select-network"
                    >
                      <span className={selectedNetworkData ? "text-white font-medium" : "text-slate-500"}>
                        {selectedNetworkData ? selectedNetworkData.name : "Select"}
                      </span>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${networkDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {networkDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-[#1a2633] border border-[#2a3a4a] rounded-xl overflow-hidden z-10"
                        >
                          {networks.map((network) => (
                            <button
                              key={network.id}
                              onClick={() => {
                                setSelectedNetwork(network.id);
                                setNetworkDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[#243040] transition-colors text-white"
                            >
                              {network.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Step 3: Deposit Address */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1a2633] border border-[#2a3a4a] flex items-center justify-center">
                      <span className="text-xs font-semibold text-slate-400">3</span>
                    </div>
                    <span className="font-semibold text-white">{activeTab === "deposit" ? "Deposit" : "Withdraw"} Address</span>
                  </div>
                  <div className="ml-10 space-y-3">
                    {/* Address Input */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-[#1a2633] border border-[#2a3a4a] rounded-xl">
                      <input
                        type="text"
                        value={selectedCurrency && selectedNetwork ? demoAddress : ""}
                        readOnly
                        placeholder=""
                        className="flex-1 bg-transparent text-white text-sm outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        disabled={!selectedCurrency || !selectedNetwork}
                        className={`p-1.5 rounded-lg transition-colors ${
                          selectedCurrency && selectedNetwork 
                            ? 'hover:bg-[#243040] text-slate-400 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* QR Code Area */}
                    <div className="flex gap-4">
                      <div className="w-24 h-24 bg-[#1a2633] border border-[#2a3a4a] rounded-xl flex items-center justify-center">
                        {selectedCurrency && selectedNetwork ? (
                          <div className="w-16 h-16 bg-white rounded-lg p-1">
                            <div className="w-full h-full grid grid-cols-5 gap-0.5">
                              {Array.from({ length: 25 }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`${Math.random() > 0.5 ? 'bg-black' : 'bg-white'}`}
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <svg className="w-10 h-10 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                            <rect x="7" y="7" width="10" height="10" rx="1" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 flex items-center">
                        <p className="text-sm text-slate-500">
                          {selectedCurrency && selectedNetwork 
                            ? "Scan QR code or copy address above (Demo Only - No real crypto)"
                            : "Please select a crypto to see your deposit address"
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-[#0a0f14] border-t border-[#1e2a36]">
                <p className="text-[10px] text-slate-600 text-center">
                  This is a demo wallet. No real cryptocurrency transactions.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
