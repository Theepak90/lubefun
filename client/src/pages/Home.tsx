import { useState, useMemo } from "react";
import { Layout } from "@/components/ui/Layout";
import { BannerCarousel } from "@/components/BannerCarousel";
import { LiveWins } from "@/components/LiveWins";
import { GameRow } from "@/components/GameRow";
import { SearchFilters } from "@/components/SearchFilters";
import { GameInfo } from "@/components/GameCard";
import { Gamepad2, TrendingUp, Star, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const allGames: GameInfo[] = [
  { id: "dice", name: "Dice", href: "/dice", icon: "dice", players: 1247, isHot: true },
  { id: "coinflip", name: "Coinflip", href: "/coinflip", icon: "coinflip", players: 892 },
  { id: "mines", name: "Mines", href: "/mines", icon: "mines", players: 2156, isHot: true },
  { id: "roulette", name: "Roulette", href: "/roulette", icon: "roulette", players: 1834 },
  { id: "plinko", name: "Plinko", href: "/plinko", icon: "plinko", players: 743, isNew: true },
  { id: "blackjack", name: "Blackjack", href: "/blackjack", icon: "blackjack", players: 1567 },
  { id: "daily-spin", name: "Daily Spin", href: "/rewards", icon: "spin", players: 3421 },
];

const popularGames = [
  allGames.find(g => g.id === "mines")!,
  allGames.find(g => g.id === "dice")!,
  allGames.find(g => g.id === "blackjack")!,
  allGames.find(g => g.id === "roulette")!,
  allGames.find(g => g.id === "coinflip")!,
];

const recommendedGames = [
  allGames.find(g => g.id === "plinko")!,
  allGames.find(g => g.id === "daily-spin")!,
  allGames.find(g => g.id === "dice")!,
  allGames.find(g => g.id === "mines")!,
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"casino" | "sports">("casino");

  const filteredGames = useMemo(() => {
    let games = [...allGames];
    
    if (searchQuery) {
      games = games.filter(g => 
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (activeFilter === "originals") {
      games = games.filter(g => 
        ["dice", "coinflip", "mines", "roulette", "plinko", "blackjack"].includes(g.id)
      );
    }
    
    return games;
  }, [searchQuery, activeFilter]);

  const showFilteredResults = searchQuery || activeFilter !== "all";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setActiveTab("casino")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "casino"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-[#1a2633] text-slate-400 border border-[#1e2a36] hover:text-white"
            )}
            data-testid="button-tab-casino"
          >
            Casino
          </button>
          <button
            onClick={() => setActiveTab("sports")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "sports"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-[#1a2633] text-slate-400 border border-[#1e2a36] hover:text-white opacity-50"
            )}
            disabled
            data-testid="button-tab-sports"
          >
            Sports
            <span className="ml-1 text-[10px] opacity-60">(soon)</span>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <BannerCarousel />
          </div>
          
          <div className="lg:w-72 flex-shrink-0">
            <LiveWins />
          </div>
        </div>

        <SearchFilters 
          onSearch={setSearchQuery}
          onFilterChange={setActiveFilter}
          activeFilter={activeFilter}
        />

        {showFilteredResults ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-white">
                {searchQuery ? `Results for "${searchQuery}"` : "Originals"}
              </h2>
              <span className="text-sm text-slate-500">({filteredGames.length} games)</span>
            </div>
            
            {filteredGames.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredGames.map((game) => (
                  <div key={game.id} className="w-full">
                    <a href={game.href} className="block">
                      <div 
                        className="group relative bg-[#0f1923] rounded-xl border border-[#1e2a36] overflow-hidden cursor-pointer transition-all duration-300 hover:border-[#2a3a4a] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-1"
                        data-testid={`card-game-${game.id}`}
                      >
                        <div className="p-4 flex flex-col items-center">
                          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                            <Gamepad2 className="w-7 h-7 text-primary" />
                          </div>
                          <h3 className="text-sm font-semibold text-white text-center mb-1">{game.name}</h3>
                          {game.players !== undefined && (
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-[10px] text-slate-500">{game.players.toLocaleString()} playing</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                No games found matching "{searchQuery}"
              </div>
            )}
          </section>
        ) : (
          <>
            <GameRow 
              title="Originals" 
              games={allGames}
              icon={<Gamepad2 className="w-5 h-5 text-primary" />}
            />

            <GameRow 
              title="Popular" 
              games={popularGames}
              icon={<TrendingUp className="w-5 h-5 text-orange-400" />}
            />

            <GameRow 
              title="Recommended" 
              games={recommendedGames}
              icon={<Star className="w-5 h-5 text-yellow-400" />}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
