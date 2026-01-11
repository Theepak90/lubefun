import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumTableProps {
  children: React.ReactNode;
  statusText?: string;
  className?: string;
}

export function PremiumTable({ children, statusText, className }: PremiumTableProps) {
  return (
    <div className={cn("relative rounded-3xl overflow-hidden shadow-2xl", className)}>
      <div 
        className="relative h-[520px] min-w-[640px] md:min-w-0"
        style={{
          background: "radial-gradient(ellipse 130% 110% at 50% -10%, #0c1829 0%, #060d14 100%)"
        }}
      >
        <div 
          className="absolute inset-x-0 bottom-0 h-[88%]"
          style={{
            background: `
              radial-gradient(ellipse 60% 40% at 50% 30%, rgba(26, 78, 120, 0.4) 0%, transparent 70%),
              linear-gradient(to top, #0a3a2a 0%, #0d4a35 30%, #0f5c42 60%, #117a55 100%)
            `,
            clipPath: "ellipse(88% 100% at 50% 100%)",
          }}
        />
        
        <div 
          className="absolute inset-x-0 bottom-0 h-[88%] pointer-events-none"
          style={{
            clipPath: "ellipse(88% 100% at 50% 100%)",
          }}
        >
          <div 
            className="absolute inset-0"
            style={{
              boxShadow: `
                inset 0 0 0 12px #c9a227,
                inset 0 0 0 16px #a88520,
                inset 0 0 0 18px rgba(201, 162, 39, 0.3),
                inset 0 0 60px rgba(0,0,0,0.5),
                inset 0 -20px 40px rgba(0,0,0,0.3)
              `,
            }}
          />
          <div 
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-1"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
            }}
          />
        </div>
        
        <div 
          className="absolute inset-x-[18px] bottom-0 h-[calc(88%-18px)]"
          style={{
            background: `
              radial-gradient(ellipse 50% 35% at 50% 25%, rgba(34, 139, 90, 0.25) 0%, transparent 70%),
              linear-gradient(180deg, #0d5c42 0%, #0a4a35 50%, #083a2a 100%)
            `,
            clipPath: "ellipse(88% 100% at 50% 100%)",
          }}
        >
          <div 
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
          
          <motion.div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              background: "linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.8) 50%, transparent 60%)",
              backgroundSize: "200% 200%",
            }}
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%"],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear",
            }}
          />
          
          <div 
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(0,0,0,0.25) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="absolute top-4 right-10 z-10">
          <div className="relative">
            <div 
              className="w-12 h-16 rounded-md flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #8b1a1a 0%, #5c0f0f 50%, #3a0909 100%)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <div className="absolute inset-1.5 rounded-sm bg-gradient-to-b from-red-700/50 to-red-900/50 flex items-center justify-center">
                <div 
                  className="w-7 h-10 rounded-sm border border-white/20"
                  style={{
                    background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 50%, #1e3a8a 100%)",
                  }}
                />
              </div>
              <div 
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-sm"
                style={{ background: "#5c0f0f" }}
              />
            </div>
            <span className="text-[9px] text-slate-500 text-center block mt-1.5 font-medium tracking-wider">SHOE</span>
          </div>
        </div>

        {statusText && (
          <motion.div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={statusText}
          >
            <div 
              className="px-5 py-2.5 rounded-xl backdrop-blur-sm text-white/90 text-sm font-medium tracking-wide"
              style={{
                background: "rgba(0, 0, 0, 0.6)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}
            >
              {statusText}
            </div>
          </motion.div>
        )}

        {children}
      </div>
    </div>
  );
}
