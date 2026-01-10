import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Dice5, Coins, Bomb, TrendingUp, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useGameHistory } from "@/hooks/use-games";
import { cn } from "@/lib/utils";

const games = [
  {
    title: "Dice",
    description: "Predict the roll outcome. Simple, fast, classic.",
    icon: Dice5,
    href: "/dice",
    color: "from-blue-500/20 to-purple-500/20",
    border: "group-hover:border-blue-500/50",
    text: "text-blue-500"
  },
  {
    title: "Coinflip",
    description: "Heads or Tails? Double your money instantly.",
    icon: Coins,
    href: "/coinflip",
    color: "from-yellow-500/20 to-orange-500/20",
    border: "group-hover:border-yellow-500/50",
    text: "text-yellow-500"
  },
  {
    title: "Mines",
    description: "Find the gems, avoid the bombs. High risk, huge reward.",
    icon: Bomb,
    href: "/mines",
    color: "from-green-500/20 to-emerald-500/20",
    border: "group-hover:border-green-500/50",
    text: "text-green-500"
  }
];

export default function Home() {
  const { data: history } = useGameHistory();

  return (
    <Layout>
      <div className="space-y-12">
        {/* Hero Section */}
        <section className="relative rounded-3xl bg-card border border-border p-8 lg:p-12 overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10 max-w-2xl">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-6">
                <Trophy className="w-3 h-3" /> #1 Provably Fair Casino
             </div>
             <h1 className="text-4xl lg:text-6xl font-display font-bold mb-6 leading-tight">
               Play Smarter,<br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">Win Bigger.</span>
             </h1>
             <p className="text-xl text-muted-foreground mb-8">
               Experience the next generation of online gaming. Instant payouts, verifiable fairness, and premium design.
             </p>
             <div className="flex gap-4">
                <Link href="/mines">
                  <Button size="lg" className="h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all">
                    Play Now
                  </Button>
                </Link>
             </div>
          </div>
        </section>

        {/* Games Grid */}
        <section>
           <h2 className="text-2xl font-display font-bold mb-6 flex items-center gap-2">
             <TrendingUp className="w-6 h-6 text-primary" /> Popular Games
           </h2>
           <div className="grid md:grid-cols-3 gap-6">
              {games.map((game) => (
                <Link key={game.title} href={game.href}>
                   <div className={cn(
                     "group relative bg-card rounded-2xl p-8 border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 cursor-pointer overflow-hidden h-full",
                     game.border
                   )}>
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500", game.color)} />
                      
                      <div className="relative z-10">
                        <div className={cn("w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300", game.text)}>
                           <game.icon className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">{game.title}</h3>
                        <p className="text-muted-foreground">{game.description}</p>
                      </div>
                   </div>
                </Link>
              ))}
           </div>
        </section>

        {/* Live Bets Table */}
        <section>
          <div className="flex items-center justify-between mb-6">
             <h2 className="text-2xl font-display font-bold flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" /> Live Bets
             </h2>
          </div>
          
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                   <thead className="text-xs text-muted-foreground uppercase bg-secondary/30 font-bold">
                      <tr>
                        <th className="px-6 py-4">Game</th>
                        <th className="px-6 py-4">Player</th>
                        <th className="px-6 py-4 text-right">Bet</th>
                        <th className="px-6 py-4 text-right">Multiplier</th>
                        <th className="px-6 py-4 text-right">Payout</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-border/50">
                      {history?.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                            No bets placed yet. Be the first!
                          </td>
                        </tr>
                      ) : (
                        history?.slice(0, 10).map((bet: any) => (
                          <tr key={bet.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-semibold capitalize flex items-center gap-2">
                               {bet.game === "dice" && <Dice5 className="w-4 h-4 text-blue-500" />}
                               {bet.game === "coinflip" && <Coins className="w-4 h-4 text-yellow-500" />}
                               {bet.game === "mines" && <Bomb className="w-4 h-4 text-green-500" />}
                               {bet.game}
                            </td>
                            <td className="px-6 py-4 text-muted-foreground font-mono">User#{bet.userId}</td>
                            <td className="px-6 py-4 text-right font-mono">${bet.betAmount.toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                              {bet.payoutMultiplier ? `${bet.payoutMultiplier.toFixed(2)}x` : '-'}
                            </td>
                            <td className={cn(
                              "px-6 py-4 text-right font-mono font-bold",
                              bet.won ? "text-primary text-glow" : "text-muted-foreground"
                            )}>
                              {bet.won ? `+${bet.profit.toFixed(2)}` : `-${bet.betAmount.toFixed(2)}`}
                            </td>
                          </tr>
                        ))
                      )}
                   </tbody>
                </table>
             </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
