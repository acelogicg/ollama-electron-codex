# Ollama Local Chat — Electron + React + WebGL

## Fitur
- Deteksi otomatis model dari `http://127.0.0.1:11434/api/tags`
- Model picker dan penyimpanan model terakhir
- Auto-load/prewarm model dengan `keep_alive: 30m`
- Streaming chat bubble melalui `/api/chat`
- Tombol hentikan generasi
- WebGL shader background
- IPC Electron agar renderer tidak terkena masalah CORS

## Menjalankan

```bash
ollama serve
npm install
npm run dev
```

Pastikan minimal satu model tersedia:

```bash
ollama pull qwen2.5-coder:1.5b
```

## Build Windows

```bash
npm run dist
```

Installer akan dibuat di folder `release/`.

## Alamat Ollama khusus

Secara default aplikasi memakai `http://127.0.0.1:11434`. Untuk alamat lain:

Windows PowerShell:

```powershell
$env:OLLAMA_URL="http://192.168.1.10:11434"
npm run dev
```

Linux/macOS:

```bash
OLLAMA_URL=http://192.168.1.10:11434 npm run dev
```

Catatan: WebGL hanya merender antarmuka. Proses inferensi tetap dilakukan oleh Ollama melalui CPU/GPU yang didukung Ollama.
