import { useGetSnippetStats, useListRecentSnippets } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Code2, Pin, Sparkles, Plus, Clock, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetSnippetStats();
  const { data: recent, isLoading: recentLoading } = useListRecentSnippets({ limit: 5 });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your snippet cockpit.</p>
        </div>
        <Link href="/capture">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Quick Capture
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Snippets</CardTitle>
            <Code2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold font-mono">{stats?.total || 0}</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pinned</CardTitle>
            <Pin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold font-mono">{stats?.pinned || 0}</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">AI Enriched</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold font-mono">{stats?.enriched || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-2 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" /> Recent Captures
          </h2>
          <div className="space-y-3">
            {recentLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))
            ) : recent?.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground">
                No snippets captured yet.
              </div>
            ) : (
              recent?.map((snippet) => (
                <Link key={snippet.id} href={`/snippets/${snippet.id}`} className="block group">
                  <Card className="transition-colors hover:border-primary/50">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium truncate group-hover:text-primary transition-colors">
                          {snippet.title || "Untitled Snippet"}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(snippet.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-3 items-center">
                        {snippet.language && (
                          <span className="flex items-center gap-1 font-mono text-primary/80">
                            <Terminal className="h-3 w-3" />
                            {snippet.language}
                          </span>
                        )}
                        {snippet.sourceApp && (
                          <span className="truncate max-w-[150px]">From: {snippet.sourceApp}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Top Languages</h2>
            <Card>
              <CardContent className="p-4">
                {statsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : stats?.byLanguage?.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">No data yet</div>
                ) : (
                  <div className="space-y-3">
                    {stats?.byLanguage?.slice(0, 5).map(lang => (
                      <div key={lang.label} className="flex justify-between items-center text-sm">
                        <span className="font-mono">{lang.label}</span>
                        <span className="text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">{lang.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Top Tags</h2>
            <Card>
              <CardContent className="p-4">
                {statsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : stats?.byTag?.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">No tags used</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {stats?.byTag?.slice(0, 10).map(tag => (
                      <Link key={tag.label} href={`/snippets?tag=${tag.label}`}>
                        <div className="text-xs font-mono px-2 py-1 bg-secondary text-secondary-foreground rounded border border-transparent hover:border-primary/50 transition-colors cursor-pointer">
                          #{tag.label} <span className="text-muted-foreground ml-1">{tag.count}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
