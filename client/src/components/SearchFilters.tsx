import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const filters = [
  { id: "all", label: "All", active: true },
  { id: "originals", label: "Originals", active: true },
  { id: "live", label: "Live Casino", active: false },
  { id: "slots", label: "Slots", active: false },
];

interface SearchFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filterId: string) => void;
  activeFilter: string;
}

export function SearchFilters({ onSearch, onFilterChange, activeFilter }: SearchFiltersProps) {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const handleFilterClick = (filter: typeof filters[0]) => {
    if (!filter.active) {
      toast({
        title: "Coming Soon",
        description: `${filter.label} games will be available soon!`,
        duration: 2000,
      });
      return;
    }
    onFilterChange(filter.id);
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          type="text"
          placeholder="Search games..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-[#0f1923] border-[#1e2a36] text-white placeholder:text-slate-500 focus:border-[#2a3a4a]"
          data-testid="input-search-games"
        />
      </div>
      
      <div className="flex gap-2 flex-wrap">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            variant="ghost"
            size="sm"
            onClick={() => handleFilterClick(filter)}
            className={cn(
              "rounded-full px-4 text-sm font-medium transition-all",
              activeFilter === filter.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : filter.active
                  ? "bg-[#1a2633] text-slate-400 border border-[#1e2a36] hover:text-white hover:bg-[#243140]"
                  : "bg-[#1a2633]/50 text-slate-600 border border-[#1e2a36]/50 cursor-not-allowed"
            )}
            data-testid={`button-filter-${filter.id}`}
          >
            {filter.label}
            {!filter.active && <span className="ml-1 text-[10px] opacity-60">(soon)</span>}
          </Button>
        ))}
      </div>
    </div>
  );
}
