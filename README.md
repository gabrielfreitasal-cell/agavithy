# 🧠 Agavity

> **A local-first, open-source context engine for developers — inspired by Pieces for Developers.**

Agavity is a multi-modal productivity tool that captures, organizes, and enriches your development context automatically. It monitors your clipboard, active windows, audio, screen content, and system activity — all locally, with full privacy and AI-powered semantic enrichment.

---

## ✨ Features

- 📋 **Smart Clipboard Manager** — Captures code snippets with source context (which app, which window)
- 🖥️ **Screen OCR Stream** — Real-time text extraction from screenshots and images
- 🎙️ **Audio Transcription** — Continuous background recording and transcription pipeline
- 🔍 **System Context Monitor** — Tracks active processes, window titles, and resource usage
- 🤖 **AI Enrichment** — Auto-generates titles, tags, descriptions, and detects programming language via local LLMs (Ollama/LM Studio)
- 🗄️ **Local SQLite Database** — All your data stays on your machine, always
- 🧩 **Modular Architecture** — Clean separation between Core, Adapters, and API layers, ready for native OS integration

---

## 🏗️ Architecture

```
agavity/
├── packages/
│   ├── core/           # Domain logic, interfaces, business rules
│   ├── api-server/     # Express REST API + SQLite
│   ├── ui/             # React + TypeScript frontend
│   └── adapters/       # Native OS service stubs (Clipboard, OCR, Audio, System)
└── docs/               # Architecture decisions and service contracts
```

The adapter layer is designed for **zero-friction migration** to native Electron/Tauri bindings. Web-standard mock services are in place for development — swap them for Rust/C++ modules when ready.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the database)

### Run locally

```bash
# 1. Clone the repo
git clone https://github.com/gabrielfreitasal-cell/agavithy.git
cd agavithy

# 2. Start the PostgreSQL database
docker run -d --name agavity-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=agavity123 \
  -e POSTGRES_USER=agavity \
  -e POSTGRES_DB=agavity \
  postgres:16-alpine

# 3. Create .env file
echo DATABASE_URL=postgresql://agavity:agavity123@localhost:5432/agavity > .env

# 4. Install dependencies
pnpm install

# 5. Run database migrations
cd lib/db && DATABASE_URL=... npx drizzle-kit push && cd ../..

# 6. Launch everything (API + UI + Electron)
start-agavity.bat   # Windows
```

The app will open as a **native desktop window** and start monitoring your clipboard automatically.

---

## 🔮 Roadmap

- [ ] Native Windows clipboard listener (Electron/Tauri)
- [ ] Active window context capture via Windows API
- [ ] Continuous audio transcription with Whisper
- [ ] Real-time screen capture + OCR pipeline
- [ ] Local LLM integration (Ollama / LM Studio)
- [ ] System tray background mode
- [ ] Plugin system for custom capture modules

---

## 🤝 Contributing

Contributions are welcome! This project is built to be **open and extensible**. Feel free to open issues, suggest features, or submit pull requests.

---

## 📄 License

MIT — do whatever you want with it. Just give credit. 🙏

---

<p align="center">
  Built with ❤️ for developers who want full control over their own context.
</p>
