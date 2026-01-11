import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProfitTrackerProvider } from "@/hooks/use-profit-tracker";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Dice from "@/pages/Dice";
import Coinflip from "@/pages/Coinflip";
import Mines from "@/pages/Mines";
import Blackjack from "@/pages/Blackjack";
import Roulette from "@/pages/Roulette";
import Plinko from "@/pages/Plinko";
import DailySpin from "@/pages/DailySpin";
import Rewards from "@/pages/Rewards";
import SplitOrSteal from "@/pages/SplitOrSteal";
import Sponsors from "@/pages/Sponsors";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dice" component={Dice} />
      <Route path="/coinflip" component={Coinflip} />
      <Route path="/mines" component={Mines} />
      <Route path="/blackjack" component={Blackjack} />
      <Route path="/roulette" component={Roulette} />
      <Route path="/plinko" component={Plinko} />
      <Route path="/daily-spin" component={DailySpin} />
      <Route path="/rewards" component={Rewards} />
      <Route path="/split-or-steal" component={SplitOrSteal} />
      <Route path="/sponsors" component={Sponsors} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProfitTrackerProvider>
          <Toaster />
          <Router />
        </ProfitTrackerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
