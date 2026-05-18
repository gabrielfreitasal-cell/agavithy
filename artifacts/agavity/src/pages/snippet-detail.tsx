import { useGetSnippet, useUpdateSnippet, useDeleteSnippet, useToggleSnippetPin, useEnrichSnippet, getGetSnippetQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pin, Trash2, Sparkles, Copy, ArrowLeft, Terminal, Clock, ExternalLink, Edit2, Check } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";

export default function SnippetDetail() {
  const { id } = useParams<{ id: string }>();
  const snippetId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: snippet, isLoading } = useGetSnippet(snippetId, { 
    query: { enabled: !!snippetId, queryKey: getGetSnippetQueryKey(snippetId) } 
  });
  
  const updateSnippet = useUpdateSnippet();
  const deleteSnippet = useDeleteSnippet();
  const togglePin = useToggleSnippetPin();
  const enrichSnippet = useEnrichSnippet();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const handleCopy = () => {
    if (snippet?.content) {
      navigator.clipboard.writeText(snippet.content);
      toast({
        title: "Copied to clipboard",
        description: "Snippet content copied.",
      });
    }
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this snippet?")) {
      deleteSnippet.mutate({ id: snippetId }, {
        onSuccess: () => {
          toast({ title: "Snippet deleted" });
          setLocation("/snippets");
        }
      });
    }
  };

  const handleTogglePin = () => {
    togglePin.mutate({ id: snippetId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetSnippetQueryKey(snippetId), data);
      }
    });
  };

  const handleEnrich = () => {
    enrichSnippet.mutate({ id: snippetId }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetSnippetQueryKey(snippetId), data);
        toast({
          title: "Snippet enriched",
          description: "AI has processed your snippet.",
        });
      }
    });
  };

  const saveTitle = () => {
    updateSnippet.mutate({ id: snippetId, data: { title: editTitle } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetSnippetQueryKey(snippetId), data);
        setIsEditingTitle(false);
      }
    });
  };

  if (isLoading) return <div className="space-y-4">
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>;

  if (!snippet) return <div>Snippet not found</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTogglePin} className={snippet.isPinned ? "text-primary border-primary/50 bg-primary/10" : ""}>
            <Pin className={cn("h-4 w-4 mr-2", snippet.isPinned && "fill-primary")} />
            {snippet.isPinned ? "Pinned" : "Pin"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleEnrich} disabled={enrichSnippet.isPending} className="text-amber-500 hover:text-amber-400 border-amber-500/30 hover:border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10">
            <Sparkles className="h-4 w-4 mr-2" />
            {enrichSnippet.isPending ? "Enriching..." : snippet.isEnriched ? "Re-enrich" : "Enrich with AI"}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} className="opacity-80 hover:opacity-100">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isEditingTitle ? (
          <div className="flex items-center gap-2 max-w-xl">
            <Input 
              value={editTitle} 
              onChange={(e) => setEditTitle(e.target.value)} 
              className="text-2xl font-bold bg-card"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            />
            <Button size="icon" variant="ghost" onClick={saveTitle}><Check className="h-4 w-4 text-green-500" /></Button>
          </div>
        ) : (
          <h1 className="text-3xl font-bold flex items-center gap-2 group">
            {snippet.title || <span className="text-muted-foreground italic">Untitled Snippet</span>}
            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 h-8 w-8" onClick={() => { setEditTitle(snippet.title || ""); setIsEditingTitle(true); }}>
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </h1>
        )}
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {format(new Date(snippet.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
          {snippet.sourceApp && (
            <div className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded text-secondary-foreground border border-border">
              From: <span className="font-medium">{snippet.sourceApp}</span>
            </div>
          )}
          {snippet.sourceUrl && (
            <a href={snippet.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" />
              Source URL
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {snippet.language && (
          <Badge variant="outline" className="font-mono bg-primary/5 text-primary border-primary/20 text-sm py-1">
            <Terminal className="h-4 w-4 mr-2" />
            {snippet.language}
          </Badge>
        )}
        {snippet.tags?.map(tag => (
          <Badge key={tag} variant="secondary" className="font-mono text-sm py-1">#{tag}</Badge>
        ))}
      </div>

      <div className="relative rounded-lg overflow-hidden border border-border shadow-md">
        <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-[#333] text-xs font-mono text-zinc-400">
          <span>{snippet.language || "text"}</span>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 hover:bg-white/10 hover:text-white">
            <Copy className="h-3 w-3 mr-2" />
            Copy Code
          </Button>
        </div>
        <SyntaxHighlighter
          language={snippet.language?.toLowerCase() || "text"}
          style={vscDarkPlus}
          customStyle={{ margin: 0, padding: '1.5rem', background: '#1e1e1e', fontSize: '14px', lineHeight: '1.5' }}
          showLineNumbers
        >
          {snippet.content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Needed imports
import { cn } from "@/lib/utils";
