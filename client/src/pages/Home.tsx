import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Dice5, Coins, Bomb, Zap, Sparkles } from "lucide-react";
import { useGameHistory } from "@/hooks/use-games";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const games = [
  {
    title: "Dice",
    description: "Roll the dice. Beat the odds.",
    icon: Dice5,
    href: "/dice",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    title: "Coinflip",
    description: "50/50 chance. Double or nothing.",
    icon: Coins,
    href: "/coinflip",
    gradient: "from-pink-500 to-purple-500",
  },
  {
    title: "Mines",
    description: "Find gems. Avoid the bombs.",
    icon: Bomb,
    href: "/mines",
    gradient: "from-purple-500 to-cyan-500",
  }
];

export default function Home() {
  const { data: history } = useGameHistory();

  return (
    <Layout>
      <div className="space-y-16">
        {/* Hero Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative neon-card p-10 lg:p-16 overflow-hidden"
        >
          {/* Animated background elements */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-cyan-500/20 to-transparent rounded-full blur-[100px] -translate-y-1/4 translate-x-1/4 pointer-events-none animate-pulse" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-pink-500/20 to-transparent rounded-full blur-[100px] translate-y-1/4 -translate-x-1/4 pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />
          
          <div className="relative z-10 max-w-2xl">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.2 }}
               className="inline-flex items-center gap-2 px-4 py-2 rounded-full neon-card-magenta text-pink-400 text-xs font-display font-bold uppercase tracking-[0.15em] mb-8"
             >
                <Sparkles className="w-4 h-4" /> Provably Fair Gaming
             </motion.div>
             <h1 className="text-4xl lg:text-6xl font-display font-black mb-6 leading-[1.1] tracking-wider">
               <span className="text-glow-cyan text-cyan-400">NEON</span>{" "}
               <span className="text-glow-magenta text-pink-400">ARCADE</span>
             </h1>
             <p className="text-lg text-purple-200/80 mb-10 leading-relaxed max-w-lg font-medium">
               Experience the thrill of instant gaming. Play money only. No real stakes. Just pure fun.
             </p>
             <Link href="/mines">
               <Button className="neon-button h-14 px-10 text-base font-display font-bold text-black tracking-widest rounded-xl">
                 <Zap className="w-5 h-5 mr-2" /> Start Playing
               </Button>
             </Link>
          </div>
        </motion.section>

        {/* Games Grid */}
        <section>
           <h2 className="text-xl font-display font-bold mb-8 flex items-center gap-3 text-cyan-400 tracking-wider">
             <Zap className="w-5 h-5" /> Select Game
           </h2>
           <div className="grid md:grid-cols-3 gap-6">
              {games.map((game, index) => (
                <Link key={game.title} href={game.href}>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02, y: -5 }}
                    className="group relative neon-card p-8 cursor-pointer h-full neon-hover overflow-hidden"
                  >
                    {/* Gradient overlay on hover */}
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-20 transition-opacity duration-500",
                      game.gradient
                    )} />
                    
                    <div className="relative z-10">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br",
                        game.gradient
                      )}>
                         <game.icon className="w-8 h-8 text-white drop-shadow-lg" />
                      </div>
                      <h3 className="text-2xl font-display font-bold mb-2 tracking-wider text-foreground group-hover:text-cyan-400 transition-colors">{game.title}</h3>
                      <p className="text-purple-300/70 text-sm font-medium">{game.description}</p>
                    </div>
                  </motion.div>
                </Link>
              ))}
           </div>
        </section>

        {/* Live Bets Table */}
        <section>
          <div className="flex items-center justify-between mb-8">
             <h2 className="text-xl font-display font-bold flex items-center gap-3 text-pink-400 tracking-wider">
               <div className="w-3 h-3 rounded-full bg-pink-500 glow-pulse" /> Live Feed
             </h2>
          </div>
          
          <div className="neon-card-magenta overflow-hidden">
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                   <thead className="text-xs font-display text-pink-400 uppercase tracking-wider bg-pink-500/10">
                      <tr>
                        <th className="px-6 py-5">Game</th>
                        <th className="px-6 py-5">Player</th>
                        <th className="px-6 py-5 text-right">Bet</th>
                        <th className="px-6 py-5 text-right">Multi</th>
                        <th className="px-6 py-5 text-right">Payout</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-pink-500/10">
                      {history?.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-purple-300/60 font-medium">
                            No bets yet. Be the first to play!
                          </td>
                        </tr>
                      ) : (
                        history?.slice(0, 10).map((bet: any) => (
                          <motion.tr 
                            key={bet.id} 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-pink-500/5 transition-colors"
                          >
                            <td className="px-6 py-5 font-display font-bold capitalize flex items-center gap-3 text-foreground">
                               {bet.game === "dice" && <Dice5 className="w-4 h-4 text-cyan-400" />}
                               {bet.game === "coinflip" && <Coins className="w-4 h-4 text-pink-400" />}
                               {bet.game === "mines" && <Bomb className="w-4 h-4 text-purple-400" />}
                               {bet.game}
                            </td>
                            <td className="px-6 py-5 text-purple-300/60 font-mono text-xs">#{bet.userId}</td>
                            <td className="px-6 py-5 text-right font-mono text-foreground">${bet.betAmount.toFixed(2)}</td>
                            <td className="px-6 py-5 text-right font-mono text-purple-300/60">
                              {bet.payoutMultiplier ? `${bet.payoutMultiplier.toFixed(2)}x` : '-'}
                            </td>
                            <td className={cn(
                              "px-6 py-5 text-right font-mono font-bold",
                              bet.won ? "text-cyan-400 text-glow-cyan" : "text-pink-400"
                            )}>
                              {bet.won ? `+$${bet.profit.toFixed(2)}` : `-$${bet.betAmount.toFixed(2)}`}
                            </td>
                          </motion.tr>
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
