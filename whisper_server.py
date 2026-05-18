#!/usr/bin/env python3
"""
Agavity Whisper Server
Servidor HTTP leve que expõe o faster-whisper como API REST local.
Roda em background e é chamado pelo Electron via fetch.

Uso: python whisper_server.py [--model tiny|base|small|medium] [--port 9876]
"""

import argparse
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Lazy load do modelo (só carrega quando a primeira transcrição for pedida)
_model = None
_model_lock = threading.Lock()
_model_name = "base"  # default

def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                print(f"[Whisper] Loading model '{_model_name}'...", flush=True)
                from faster_whisper import WhisperModel
                _model = WhisperModel(
                    _model_name,
                    device="cpu",
                    compute_type="int8",  # usa int8 para CPU — mais rápido e leve
                )
                print(f"[Whisper] Model '{_model_name}' loaded!", flush=True)
    return _model


def transcribe_file(audio_path: str, language: str = None) -> dict:
    """Transcreve um arquivo de áudio e retorna o texto."""
    model = get_model()
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,           # remove silêncio automaticamente
        vad_parameters={"min_silence_duration_ms": 500},
    )
    
    full_text = ""
    segment_list = []
    for seg in segments:
        full_text += seg.text
        segment_list.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
    
    return {
        "text": full_text.strip(),
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "segments": segment_list,
    }


class WhisperHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[Whisper Server] {format % args}", flush=True)

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"status": "ok", "model": _model_name, "ready": _model is not None})
        elif self.path == "/warmup":
            # Pré-carrega o modelo em background
            threading.Thread(target=get_model, daemon=True).start()
            self.send_json({"status": "warming_up", "model": _model_name})
        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_json({"error": "Not found"}, 404)
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            
            if content_length == 0:
                self.send_json({"error": "No audio data provided"}, 400)
                return

            # Recebe os bytes do áudio
            audio_bytes = self.rfile.read(content_length)
            language = self.headers.get("X-Language", None)  # e.g. "pt" ou "en"

            # Salva em arquivo temporário para o faster-whisper processar
            suffix = ".webm"  # Electron captura WebM por padrão
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            try:
                result = transcribe_file(tmp_path, language=language)
                self.send_json(result)
            finally:
                os.unlink(tmp_path)  # limpa o arquivo temporário

        except Exception as e:
            print(f"[Whisper] Error: {e}", flush=True)
            self.send_json({"error": str(e)}, 500)


def main():
    parser = argparse.ArgumentParser(description="Agavity Whisper Server")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large-v3"],
                        help="Whisper model to use (default: base)")
    parser.add_argument("--port", type=int, default=9876, help="Port to listen on (default: 9876)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--warmup", action="store_true", help="Pre-load model on startup")
    args = parser.parse_args()

    global _model_name
    _model_name = args.model

    server = HTTPServer((args.host, args.port), WhisperHandler)
    print(f"[Whisper Server] Starting on {args.host}:{args.port} (model: {args.model})", flush=True)
    print(f"[Whisper Server] POST /transcribe — send raw audio bytes", flush=True)
    print(f"[Whisper Server] GET  /health    — check status", flush=True)

    if args.warmup:
        threading.Thread(target=get_model, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Whisper Server] Shutting down...", flush=True)


if __name__ == "__main__":
    main()
