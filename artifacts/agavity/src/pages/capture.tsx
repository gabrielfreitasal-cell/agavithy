import { useCreateSnippet, useGetClipboardStatus, getGetClipboardStatusQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Terminal, Save, RefreshCw, Mic, MicOff, CheckCircle2, Trash2, ClipboardPaste, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { cn } from "@/lib/utils";

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

  const {
    state: audioState,
    transcript,
    interimTranscript,
    error: audioError,
    isSupported,
    toggleListening,
    clearTranscript,
  } = useAudioTranscription("pt-BR");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { content: "", title: "", language: "", sourceApp: "", tagsString: "" },
  });

  // Injeta transcrição no campo de conteúdo quando parar de gravar
  const injectTranscript = () => {
    if (!transcript) return;
    const current = form.getValues("content");
    form.setValue("content", current ? `${current}\n\n${transcript}` : transcript);
    form.setValue("language", "plaintext");
    form.setValue("sourceApp", "Audio Transcription");
    clearTranscript();
    toast({ title: "Transcrição injetada!", description: "O texto foi adicionado ao snippet." });
  };

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
        tags,
      }
    }, {
      onSuccess: (data) => {
        toast({ title: "Snippet captured!" });
        setLocation(`/snippets/${data.id}`);
      }
    });
  }

  const isListening = audioState === "listening";

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Capture</h1>
        <p className="text-muted-foreground mt-1">Texto, código ou voz — salve tudo no seu contexto.</p>
      </div>

      {/* ── Audio Transcription Panel ── */}
      <Card className={cn(
        "border transition-all duration-300",
        isListening
          ? "border-red-500/50 bg-red-500/5 shadow-lg shadow-red-500/10"
          : "border-border"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isListening ? (
                <Radio className="h-5 w-5 text-red-500 animate-pulse" />
              ) : (
                <Mic className="h-5 w-5 text-primary" />
              )}
              <CardTitle className="text-lg">Transcrição de Voz</CardTitle>
              {isListening && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
                  🔴 Gravando
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {transcript && !isListening && (
                <>
                  <Button size="sm" variant="outline" onClick={clearTranscript}>
                    <Trash2 className="h-4 w-4 mr-1" /> Limpar
                  </Button>
                  <Button size="sm" variant="outline" onClick={injectTranscript}>
                    <ClipboardPaste className="h-4 w-4 mr-1" /> Usar no Snippet
                  </Button>
                </>
              )}
              <Button
                size="sm"
                onClick={toggleListening}
                disabled={!isSupported}
                className={cn(
                  "min-w-[120px] transition-all",
                  isListening
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-primary hover:bg-primary/90"
                )}
              >
                {isListening ? (
                  <><MicOff className="h-4 w-4 mr-2" /> Parar</>
                ) : (
                  <><Mic className="h-4 w-4 mr-2" /> Gravar</>
                )}
              </Button>
            </div>
          </div>
          {!isSupported && (
            <CardDescription className="text-yellow-500">
              ⚠️ Transcrição não disponível neste ambiente. Use o app Electron.
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          <div className="relative min-h-[120px] rounded-lg border border-border/50 bg-black/30 p-4 font-mono text-sm">
            {!transcript && !interimTranscript && !isListening && (
              <p className="text-muted-foreground italic">
                Clique em "Gravar" e fale... o texto aparece aqui em tempo real.
              </p>
            )}
            {!transcript && !interimTranscript && isListening && (
              <p className="text-muted-foreground italic animate-pulse">
                🎙️ Ouvindo... pode falar!
              </p>
            )}
            <span className="text-foreground whitespace-pre-wrap">{transcript}</span>
            {interimTranscript && (
              <span className="text-primary/60 italic"> {interimTranscript}</span>
            )}
            {isListening && (
              <span className="inline-block w-2 h-4 bg-red-500 ml-1 animate-pulse rounded-sm" />
            )}
          </div>
          {audioError && (
            <p className="text-red-400 text-sm mt-2">⚠️ {audioError}</p>
          )}
          {transcript && (
            <p className="text-xs text-muted-foreground mt-2">
              {transcript.split(" ").length} palavras capturadas
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ── Snippet Form ── */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Novo Snippet</CardTitle>
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
                            placeholder="Cole seu código ou texto aqui..."
                            className="min-h-[200px] font-mono text-sm resize-y bg-black/50 border-border focus-visible:ring-primary"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. React Query Setup" {...field} className="bg-card" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="language" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Linguagem</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. typescript, python" className="font-mono bg-card" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="sourceApp" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fonte</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. VSCode, Aula" className="bg-card" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="tagsString" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags (separadas por vírgula)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. cardiologia, residência" className="font-mono bg-card" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Button type="submit" disabled={createSnippet.isPending} className="w-full mt-2">
                    {createSnippet.isPending
                      ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                      : <><Save className="mr-2 h-4 w-4" /> Salvar Snippet</>
                    }
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* ── Clipboard Status ── */}
        <div>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal className="h-5 w-5 text-primary" />
                Clipboard Monitor
              </CardTitle>
              <CardDescription>Captura automática em background</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Status</span>
                {clipboardStatus?.isMonitoring ? (
                  <Badge variant="outline" className="border-green-500/50 text-green-500 bg-green-500/10">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-muted text-muted-foreground">
                    Inativo
                  </Badge>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Capturados</span>
                <span className="font-mono text-xl">{clipboardStatus?.capturedCount || 0}</span>
              </div>
              {clipboardStatus?.lastCapturedAt && (
                <div className="pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground block mb-1">Última captura</span>
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

