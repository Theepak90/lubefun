import { Layout } from "@/components/ui/Layout";
import { Sparkles } from "lucide-react";

export default function Sponsors() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6">
          <Sparkles className="w-10 h-10 text-amber-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">Our Sponsors</h1>
        <p className="text-xl text-slate-400 mb-2">Coming Soon</p>
        <p className="text-slate-500 max-w-md">
          We're working on bringing you exciting partnerships and sponsorships. Check back soon!
        </p>
      </div>
    </Layout>
  );
}
