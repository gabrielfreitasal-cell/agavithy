import { useCreateSnippet, useGetClipboardStatus, getGetClipboardStatusQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Terminal, Save, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const formSchema = z.object({
  content: z.string().min(1, "Snippet content is required"),
  title: z.string().optional(),
  language: z.string().optional(),
  sourceApp: z.string().optional(),
  tagsString: z.string().optional(),
});

export default function Capture() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createSnippet = useCreateSnippet();
  
  const { data: clipboardStatus } = useGetClipboardStatus({
    query: { refetchInterval: 3000, queryKey: getGetClipboardStatusQueryKey() }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: "",
      title: "",
      language: "",
      sourceApp: "",
      tagsString: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    const tags = values.tagsString 
      ? values.tagsString.split(",").map(t => t.trim()).filter(Boolean)
      : undefined;

    createSnippet.mutate({
      data: {
        content: values.content,
        title: values.title || undefined,
        language: values.language || undefined,
        sourceApp: values.sourceApp || undefined,
        tags: tags,
      }
    }, {
      onSuccess: (data) => {
        toast({ title: "Snippet captured!" });
        setLocation(`/snippets/${data.id}`);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manual Capture</h1>
        <p className="text-muted-foreground mt-1">Paste code or notes directly into your library.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>New Snippet</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea 
                            placeholder="Paste your code here..." 
                            className="min-h-[300px] font-mono text-sm resize-y bg-black/50 border-border focus-visible:ring-primary" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. React Query Setup" {...field} className="bg-card" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Language</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. typescript, python" className="font-mono bg-card" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sourceApp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. VSCode, Slack" className="bg-card" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tagsString"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tags (Comma separated)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. frontend, setup, config" className="font-mono bg-card" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" disabled={createSnippet.isPending} className="w-full mt-6">
                    {createSnippet.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Snippet
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal className="h-5 w-5 text-primary" />
                Clipboard Monitor
              </CardTitle>
              <CardDescription>Background capture status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Status</span>
                {clipboardStatus?.isMonitoring ? (
                  <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/10">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-muted text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Captured</span>
                <span className="font-mono text-xl">{clipboardStatus?.capturedCount || 0}</span>
              </div>
              
              {clipboardStatus?.lastCapturedAt && (
                <div className="pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground block mb-1">Last capture</span>
                  <span className="text-sm font-mono">
                    {formatDistanceToNow(new Date(clipboardStatus.lastCapturedAt), { addSuffix: true })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
