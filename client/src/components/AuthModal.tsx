import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { useAuth } from "@/hooks/use-auth";
import { insertUserSchema } from "@shared/schema";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode: "login" | "register";
}

const authSchema = insertUserSchema;
type AuthFormValues = z.infer<typeof authSchema>;

export function AuthModal({ isOpen, onClose, defaultMode }: AuthModalProps) {
  const [mode, setMode] = useState(defaultMode);
  const { login, register, isLoggingIn, isRegistering } = useAuth();

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode, isOpen]);

  const { register: registerInput, handleSubmit, formState: { errors }, reset } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
  });

  const onSubmit = (data: AuthFormValues) => {
    if (mode === "login") {
      login(data, { onSuccess: () => { reset(); onClose(); } });
    } else {
      register(data, { onSuccess: () => { reset(); onClose(); } });
    }
  };

  const isLoading = isLoggingIn || isRegistering;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border p-0 overflow-hidden gap-0">
        <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
        
        <div className="p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-display font-bold text-center">
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              {mode === "login" 
                ? "Enter your details to access your account" 
                : "Join now to start playing instantly"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username" 
                {...registerInput("username")} 
                className="bg-secondary/50 border-input focus:border-primary/50 focus:ring-primary/20" 
                placeholder="Enter your username"
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                {...registerInput("password")} 
                className="bg-secondary/50 border-input focus:border-primary/50 focus:ring-primary/20"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button 
              type="submit" 
              className="w-full font-bold text-lg h-12 mt-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all" 
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : mode === "login" ? "Log In" : "Register Now"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <span 
              className="text-primary font-bold hover:underline cursor-pointer"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Register" : "Log In"}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
