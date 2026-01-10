import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Copy, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProvablyFairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProvablyFairModal({ isOpen, onClose }: ProvablyFairModalProps) {
  const { user, updateSeeds } = useAuth();
  const [newSeed, setNewSeed] = useState("");
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const handleUpdate = () => {
    if (!newSeed) return;
    updateSeeds(newSeed);
    setNewSeed("");
  };

  const copyServerSeed = () => {
    navigator.clipboard.writeText(user.serverSeed);
    setCopied(true);
    toast({ title: "Copied!", description: "Active server seed hash copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-primary">🛡️</span> Provably Fair Settings
          </DialogTitle>
          <DialogDescription>
            We use a verifiable system to ensure all game outcomes are fair and manipulated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Active Server Seed Hash */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Active Server Seed (Hashed)</Label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-secondary/50 rounded-lg border border-border font-mono text-xs truncate text-muted-foreground">
                {user.serverSeed || "Loading..."}
              </div>
              <Button size="icon" variant="outline" onClick={copyServerSeed}>
                {copied ? <CheckCheck className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">This seed will be revealed after you rotate your seed pair.</p>
          </div>

          {/* Client Seed */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Active Client Seed</Label>
            <div className="flex gap-2">
              <Input 
                value={newSeed}
                onChange={(e) => setNewSeed(e.target.value)}
                placeholder={user.clientSeed}
                className="font-mono"
              />
              <Button onClick={handleUpdate} disabled={!newSeed}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Change
              </Button>
            </div>
          </div>

          {/* Nonce */}
          <div className="space-y-2">
             <Label className="text-muted-foreground text-xs uppercase tracking-wider">Current Nonce</Label>
             <div className="p-3 bg-secondary/30 rounded-lg border border-border inline-block min-w-[60px] text-center font-mono font-bold">
               {user.nonce}
             </div>
             <p className="text-xs text-muted-foreground">Increments by 1 for every bet made with this seed pair.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
