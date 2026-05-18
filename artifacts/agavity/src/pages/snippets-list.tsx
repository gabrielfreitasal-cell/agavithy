import { useListSnippets } from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Pin, Terminal, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function SnippetsList() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const tagParam = searchParams.get("tag") || undefined;
  
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Debounce search
  // In a real app we'd use useDebounce hook
  
  const { data: snippets, isLoading } = useListSnippets({
    tag: tagParam,
    search: debouncedSearch || undefined,
  });

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-300">
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Snippets</h1>
          <p className="text-muted-foreground mt-1">Your entire code library.</p>
        </div>
      </div>

      <div className="flex gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search in content, title, tags..." 
            className="pl-9 font-mono bg-card"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Simple timeout for debounce
              setTimeout(() => setDebouncedSearch(e.target.value), 300);
            }}
          />
        </div>
      </div>

      {tagParam && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">Filtering by tag:</span>
          <Badge variant="secondary" className="font-mono">#{tagParam}</Badge>
          <Link href="/snippets" className="text-sm text-primary hover:underline">Clear</Link>
        </div>
      )}

      <div className="flex-1 overflow-auto space-y-3 pb-8">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : snippets?.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <Code2 className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No snippets found</h3>
            <p className="text-muted-foreground mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          snippets?.map((snippet) => (
            <Link key={snippet.id} href={`/snippets/${snippet.id}`} className="block">
              <Card className="hover:border-primary/50 transition-colors group cursor-pointer">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {snippet.isPinned && <Pin className="h-4 w-4 text-primary fill-primary" />}
                      <h3 className="font-medium text-base group-hover:text-primary transition-colors">
                        {snippet.title || "Untitled Snippet"}
                      </h3>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(snippet.createdAt))} ago
                    </div>
                  </div>
                  
                  <div className="text-sm font-mono text-muted-foreground bg-muted/50 p-2 rounded max-h-20 overflow-hidden text-ellipsis whitespace-pre-wrap border border-transparent group-hover:border-border/50">
                    {snippet.content.length > 150 ? snippet.content.slice(0, 150) + "..." : snippet.content}
                  </div>
                  
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center gap-2">
                      {snippet.language && (
                        <Badge variant="outline" className="font-mono text-[10px] text-primary/80 border-primary/20 bg-primary/5">
                          <Terminal className="h-3 w-3 mr-1" />
                          {snippet.language}
                        </Badge>
                      )}
                      <div className="flex gap-1">
                        {snippet.tags?.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="secondary" className="font-mono text-[10px]">#{tag}</Badge>
                        ))}
                        {(snippet.tags?.length || 0) > 3 && (
                          <Badge variant="secondary" className="font-mono text-[10px]">+{snippet.tags!.length - 3}</Badge>
                        )}
                      </div>
                    </div>
                    {snippet.sourceApp && (
                      <div className="text-xs text-muted-foreground">
                        From: {snippet.sourceApp}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

// Needed to import Code2 for the empty state
import { Code2 } from "lucide-react";
