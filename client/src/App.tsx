import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Dice from "@/pages/Dice";
import Coinflip from "@/pages/Coinflip";
import Mines from "@/pages/Mines";
import DailySpin from "@/pages/DailySpin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dice" component={Dice} />
      <Route path="/coinflip" component={Coinflip} />
      <Route path="/mines" component={Mines} />
      <Route path="/daily-spin" component={DailySpin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
