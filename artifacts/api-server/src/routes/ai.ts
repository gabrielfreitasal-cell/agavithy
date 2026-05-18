import { Router } from "express";
import { db } from "@workspace/db";
import { snippets } from "@workspace/db/schema";
import { gte } from "drizzle-orm";

const router = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Provider models
const PROVIDERS = {
  antigravity: "gemini-2.5-pro-preview-05-06",  // Antigravity — tier 1 🧠
  gemini:      "gemini-2.0-flash",               // Gemini Flash — tier 2 ⚡
} as const;

// ── Providers ────────────────────────────────────────────────────────────────

async function generateWithOllama(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { response: string };
  return data.response?.trim() ?? "";
}

async function generateWithGemini(prompt: string, model: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// POST /api/ai/daily-summary
// Gera um resumo estruturado de todos os snippets do dia (ou de uma data específica)
router.post("/api/ai/daily-summary", async (req, res) => {
  try {
    const { date, model, provider } = req.body as {
      date?: string;
      model?: string;
      provider?: "gemini" | "ollama" | "auto";
    };

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const daySnippets = await db
      .select()
      .from(snippets)
      .where(gte(snippets.createdAt, targetDate));

    if (daySnippets.length === 0) {
      return res.status(404).json({
        error: "Nenhum snippet encontrado para esta data.",
        date: targetDate.toISOString().split("T")[0],
      });
    }

    const dateLabel = targetDate.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

    const snippetContext = daySnippets
      .map((s, i) => {
        const source = s.sourceApp ? `[${s.sourceApp}]` : "";
        const title = s.title ? `"${s.title}"` : "";
        return `--- Snippet ${i + 1} ${source} ${title}\n${s.content}`;
      })
      .join("\n\n");

    const prompt = `Você é um assistente especializado em organização de conhecimento médico e técnico.

Abaixo estão ${daySnippets.length} snippets capturados em ${dateLabel}. Eles podem ser transcrições de aulas, notas, código ou textos copiados.

${snippetContext}

---

Com base nesses snippets, gere um RESUMO DO DIA estruturado em markdown com:

## 📋 Resumo do Dia — ${dateLabel}

### 🎯 Tópicos Principais
(lista dos principais assuntos abordados)

### 📚 Pontos-chave
(os conceitos, fatos ou informações mais importantes)

### 🔗 Conexões
(relacionamentos entre os tópicos, se houver)

### ✅ Para Revisar
(o que merece atenção especial ou revisão posterior)

Seja conciso e objetivo. Foque no que é realmente relevante.`;

    // ── Seleciona provider: antigravity → gemini → ollama
    // "auto" tenta nessa ordem conforme disponibilidade
    let summary = "";
    let usedProvider = "";

    const resolvedProvider = provider ?? "auto";
    const hasGeminiKey = Boolean(GEMINI_API_KEY);

    if (resolvedProvider === "antigravity" || (resolvedProvider === "auto" && hasGeminiKey)) {
      // Tier 1 🧠 — Antigravity (Gemini 2.5 Pro)
      summary = await generateWithGemini(prompt, PROVIDERS.antigravity);
      usedProvider = `antigravity/${PROVIDERS.antigravity}`;
    } else if (resolvedProvider === "gemini") {
      // Tier 2 ⚡ — Gemini Flash
      summary = await generateWithGemini(prompt, PROVIDERS.gemini);
      usedProvider = `gemini/${PROVIDERS.gemini}`;
    } else {
      // Tier 3 🏠 — Ollama/Hermes local
      const ollamaModel = model || DEFAULT_OLLAMA_MODEL;
      summary = await generateWithOllama(prompt, ollamaModel);
      usedProvider = `ollama/${ollamaModel}`;
    }

    if (!summary) throw new Error("Provider returned empty response");

    const [savedSummary] = await db
      .insert(snippets)
      .values({
        content: summary,
        title: `📋 Resumo — ${targetDate.toLocaleDateString("pt-BR")}`,
        language: "markdown",
        sourceApp: "Agavity AI",
      })
      .returning();

    res.json({
      summary,
      snippetId: savedSummary.id,
      date: targetDate.toISOString().split("T")[0],
      snippetsAnalyzed: daySnippets.length,
      provider: usedProvider,
    });
  } catch (err) {
    console.error("[AI] Daily summary error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});


// GET /api/ai/models — lista modelos disponíveis no Ollama
router.get("/api/ai/models", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error("Ollama not available");
    const data = (await r.json()) as { models: Array<{ name: string; size: number }> };
    res.json({
      models: data.models.map((m) => ({ name: m.name, size: m.size })),
      default: DEFAULT_MODEL,
    });
  } catch {
    res.status(503).json({ error: "Ollama not running", models: [] });
  }
});

export default router;
