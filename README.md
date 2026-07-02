# LM Studio Local Chat — Electron + React + WebGL

## Fitur
- Deteksi otomatis model dari `http://127.0.0.1:1234/v1/models`
- Model picker dan penyimpanan model terakhir
- Auto-load/prewarm model (JIT) via `/v1/chat/completions`
- Streaming chat bubble melalui `/v1/chat/completions` (OpenAI-compatible SSE)
- Tombol hentikan generasi
- WebGL shader background
- IPC Electron agar renderer tidak terkena masalah CORS

## Menjalankan

1. Buka aplikasi **LM Studio**, muat sebuah model, lalu nyalakan **Local Server** (tab Developer / Server) di port `1234`.
2. Jalankan aplikasi:

```bash
npm install
npm run dev
```

Pastikan minimal satu model sudah diunduh dan diaktifkan di LM Studio.

## Build Windows

```bash
npm run dist
```

Installer akan dibuat di folder `release/`.

## Alamat LM Studio khusus

Secara default aplikasi memakai `http://127.0.0.1:1234`. Untuk alamat lain:

Windows PowerShell:

```powershell
$env:LMSTUDIO_URL="http://192.168.1.10:1234"
npm run dev
```

Linux/macOS:

```bash
LMSTUDIO_URL=http://192.168.1.10:1234 npm run dev
```

Catatan: WebGL hanya merender antarmuka. Proses inferensi tetap dilakukan oleh LM Studio melalui CPU/GPU yang didukung LM Studio.
