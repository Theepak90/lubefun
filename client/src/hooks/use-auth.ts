import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await fetch(api.auth.me.path);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return await res.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Invalid username or password");
        }
        throw new Error("Login failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({ title: "Welcome back!", description: "Successfully logged in." });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Registration failed");
        }
        throw new Error("Registration failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      // Auto login after register (optional, or just set user)
      queryClient.setQueryData(["/api/user"], data);
      toast({
        title: "Account created!",
        description: "Your account has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch(api.auth.logout.path, { method: api.auth.logout.method });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear(); // Clear all cache on logout
      toast({ title: "Logged out", description: "See you next time!" });
    },
  });

  const updateSeedsMutation = useMutation({
    mutationFn: async (clientSeed: string) => {
      const res = await fetch(api.user.updateSeeds.path, {
        method: api.user.updateSeeds.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSeed }),
      });
      if (!res.ok) throw new Error("Failed to update seed");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data);
      toast({ title: "Seed updated", description: "Your client seed has been updated." });
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    updateSeeds: updateSeedsMutation.mutate,
  };
}
