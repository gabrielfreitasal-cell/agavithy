// ─────────────────────────────────────────────────────────────
// DEPENDENCY INJECTION CONTAINER
//
// Wires concrete adapters to their port interfaces and composes
// use cases. This is the single location where the infrastructure
// meets the domain — all other files depend only on interfaces.
//
// To swap an adapter (e.g. replace Ollama with a cloud LLM):
//   1. Create a new adapter implementing the relevant port
//   2. Replace the binding below — no other file changes required
// ─────────────────────────────────────────────────────────────

import { ClipboardListenerAdapter } from "./adapters/native/ClipboardListenerAdapter";
import { SystemProcessMonitorAdapter } from "./adapters/native/SystemProcessMonitorAdapter";
import { ScreenCaptureOCRAdapter } from "./adapters/native/ScreenCaptureOCRAdapter";
import { AudioStreamAdapter } from "./adapters/native/AudioStreamAdapter";
import { OllamaEnrichmentAdapter } from "./adapters/llm/OllamaEnrichmentAdapter";
import { DrizzleSnippetRepository } from "./adapters/persistence/DrizzleSnippetRepository";
import { DrizzleTagRepository } from "./adapters/persistence/DrizzleTagRepository";
import { DrizzleWindowContextRepository } from "./adapters/persistence/DrizzleWindowContextRepository";
import { DrizzleMediaMetadataRepository } from "./adapters/persistence/DrizzleMediaMetadataRepository";
import { CaptureSnippetUseCase } from "./core/use-cases/CaptureSnippetUseCase";
import { EnrichSnippetUseCase } from "./core/use-cases/EnrichSnippetUseCase";
import { OCRCaptureUseCase } from "./core/use-cases/OCRCaptureUseCase";
import { AudioTranscribeUseCase } from "./core/use-cases/AudioTranscribeUseCase";

// ── Infrastructure (adapters) ─────────────────────────────────

export const clipboardListener = new ClipboardListenerAdapter();
export const processMonitor = new SystemProcessMonitorAdapter();
export const ocrService = new ScreenCaptureOCRAdapter();
export const audioService = new AudioStreamAdapter();
export const enrichmentService = new OllamaEnrichmentAdapter();

// ── Repositories ──────────────────────────────────────────────

export const snippetRepository = new DrizzleSnippetRepository();
export const tagRepository = new DrizzleTagRepository();
export const windowContextRepository = new DrizzleWindowContextRepository();
export const mediaMetadataRepository = new DrizzleMediaMetadataRepository();

// ── Use cases ─────────────────────────────────────────────────

export const captureSnippetUseCase = new CaptureSnippetUseCase(
  snippetRepository,
  tagRepository,
  windowContextRepository,
  processMonitor,
  enrichmentService,
);

export const enrichSnippetUseCase = new EnrichSnippetUseCase(
  snippetRepository,
  tagRepository,
  enrichmentService,
);

export const ocrCaptureUseCase = new OCRCaptureUseCase(
  snippetRepository,
  mediaMetadataRepository,
  ocrService,
  enrichmentService,
);

export const audioTranscribeUseCase = new AudioTranscribeUseCase(
  snippetRepository,
  mediaMetadataRepository,
  audioService,
  enrichmentService,
);
