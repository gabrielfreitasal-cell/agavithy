import { useListTags } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Hash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TagsBrowser() {
  const { data: tags, isLoading } = useListTags();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tags</h1>
        <p className="text-muted-foreground mt-1">Browse your snippet library by topic.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : tags?.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Hash className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">No tags found</h3>
          <p className="text-muted-foreground mt-1">Add tags when capturing snippets to organize them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tags?.map((tag) => (
            <Link key={tag.name} href={`/snippets?tag=${tag.name}`} className="block group">
              <Card className="hover:border-primary/50 transition-colors group-hover:bg-primary/5 h-full">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                  <div className="font-mono text-lg font-semibold flex items-center group-hover:text-primary transition-colors">
                    <span className="text-muted-foreground mr-1 opacity-50">#</span>
                    {tag.name}
                  </div>
                  <div className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {tag.count} {tag.count === 1 ? 'snippet' : 'snippets'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
