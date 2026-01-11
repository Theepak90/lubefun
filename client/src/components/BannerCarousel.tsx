import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles, Gift, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import sponsorsBanner from "@assets/image_1768118927718.png";
import giveawayBanner from "@assets/image_1768118093805.png";

type BannerType = {
  id: number;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon?: typeof Sparkles;
  gradient?: string;
  glowColor: string;
  image?: string;
  external?: boolean;
};

const banners: BannerType[] = [
  {
    id: 1,
    title: "",
    subtitle: "",
    cta: "",
    href: "/sponsors",
    image: sponsorsBanner,
    glowColor: "rgba(59, 130, 246, 0.3)"
  },
  {
    id: 2,
    title: "",
    subtitle: "",
    cta: "",
    href: "https://x.com/Rtoorich",
    image: giveawayBanner,
    glowColor: "rgba(59, 130, 246, 0.3)",
    external: true
  }
];

export function BannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const goTo = (index: number) => {
    setCurrentIndex(index);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <div 
      className="relative w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="hidden lg:flex lg:gap-4 lg:items-stretch">
        {banners.map((banner, index) => (
          <div key={banner.id} className="flex-1">
            <BannerCard banner={banner} isActive={index === currentIndex} />
          </div>
        ))}
      </div>

      <div className="lg:hidden relative overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <BannerCard banner={banners[currentIndex]} isActive />
          </motion.div>
        </AnimatePresence>

        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
          data-testid="button-banner-prev"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors z-10"
          data-testid="button-banner-next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === currentIndex ? "bg-white w-6" : "bg-white/40 hover:bg-white/60"
              )}
              data-testid={`button-banner-dot-${index}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BannerCard({ banner, isActive }: { banner: BannerType; isActive: boolean }) {
  const Icon = banner.icon;
  
  if (banner.image) {
    const content = (
      <div 
        className={cn(
          "relative aspect-[16/6] rounded-lg overflow-hidden cursor-pointer group transition-all duration-300",
          isActive ? "ring-1 ring-white/10" : "opacity-90 hover:opacity-100"
        )}
        style={{ boxShadow: isActive ? `0 0 20px ${banner.glowColor}` : undefined }}
        data-testid={`card-banner-${banner.id}`}
      >
        <img 
          src={banner.image} 
          alt="Banner" 
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
    
    if (banner.external) {
      return (
        <a href={banner.href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }
    
    return <Link href={banner.href}>{content}</Link>;
  }
  
  return (
    <Link href={banner.href}>
      <div 
        className={cn(
          "relative h-64 rounded-2xl overflow-hidden cursor-pointer group transition-all duration-300",
          isActive ? "ring-2 ring-white/20" : "opacity-80 hover:opacity-100"
        )}
        style={{ boxShadow: isActive ? `0 0 40px ${banner.glowColor}` : undefined }}
        data-testid={`card-banner-${banner.id}`}
      >
        <div className={cn("absolute inset-0 bg-gradient-to-br", banner.gradient)} />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative h-full p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            {Icon && (
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-6 h-6 text-white" />
              </div>
            )}
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-white mb-1">{banner.title}</h3>
            <p className="text-white/70 text-sm mb-3 line-clamp-2">{banner.subtitle}</p>
            {banner.cta && (
              <Button 
                size="sm" 
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border-0 font-semibold"
                data-testid={`button-banner-cta-${banner.id}`}
              >
                {banner.cta}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
