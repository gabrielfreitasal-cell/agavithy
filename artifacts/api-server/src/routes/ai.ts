import { Router } from "express";
import { db } from "@workspace/db";
import { snippets } from "@workspace/db/schema";
import { gte, and } from "drizzle-orm";

const router = Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

// POST /api/ai/daily-summary
// Gera um resumo estruturado de todos os snippets do dia (ou de uma data específica)
router.post("/api/ai/daily-summary", async (req, res) => {
  try {
    const { date, model } = req.body as { date?: string; model?: string };

    // Define o intervalo: hoje ou a data fornecida
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Busca snippets do dia
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

    // Monta o contexto para o LLM
    const dateLabel = targetDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
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

    // Chama o Ollama
    const ollamaModel = model || DEFAULT_MODEL;
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama error: ${ollamaRes.status} ${ollamaRes.statusText}`);
    }

    const ollamaData = (await ollamaRes.json()) as { response: string };
    const summary = ollamaData.response?.trim();

    if (!summary) {
      throw new Error("Ollama returned empty response");
    }

    // Salva o resumo como um novo snippet
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
      model: ollamaModel,
    });
  } catch (err) {
    console.error("[AI] Daily summary error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
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
