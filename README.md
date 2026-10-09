# WebCompress — 100% Local Video Compressor & Converter

[![React 19](https://img.shields.io/badge/React-19.3-blue.svg)](https://react.dev/)
[![TypeScript 7.0](https://img.shields.io/badge/TypeScript-7.0-blue.svg)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite-8.3-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS 4](https://img.shields.io/badge/TailwindCSS-4.3-38B2AC.svg)](https://tailwindcss.com/)
[![WebCodecs API](https://img.shields.io/badge/WebCodecs-Hardware_Accelerated-green.svg)](https://w3c.github.io/webcodecs/)
[![FFmpeg WASM](https://img.shields.io/badge/FFmpeg-WASM_Multi--Thread-orange.svg)](https://ffmpegwasm.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Prywatność i wydajność**: Kompresja i konwersja wideo bezpośrednio w Twojej przeglądarce. Pliki wideo nigdy nie opuszczają Twojego urządzenia. Zero serwerów, zero wysyłania do chmury, 100% lokalne przetwarzanie.

---

### Spis treści / Table of Contents
- [🇵🇱 Dokumentacja w języku polskim](#-dokumentacja-w-języku-polskim)
  - [O projekcie](#o-projekcie)
  - [Kluczowe funkcjonalności](#kluczowe-funkcjonalności)
  - [Architektura v0.2 (Dual-Engine)](#architektura-v02-dual-engine)
  - [Obsługiwane formaty i kodeki](#obsługiwane-formaty-i-kodeki)
  - [Profile kompresji (Presety)](#profile-kompresji-presety)
  - [Stos technologiczny](#stos-technologiczny)
  - [Wymagania i instalacja](#wymagania-i-instalacja)
  - [Uruchomienie i testy](#uruchomienie-i-testy)
- [🇬🇧 English Documentation](#-english-documentation)
  - [Project Overview](#project-overview)
  - [Key Features](#key-features)
  - [Architecture v0.2 (Dual-Engine)](#architecture-v02-dual-engine)
  - [Supported Containers & Codecs](#supported-containers--codecs)
  - [Compression Presets](#compression-presets)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
  - [Testing & Benchmarking](#testing--benchmarking)

---

# 🇵🇱 Dokumentacja w języku polskim

## O projekcie

**WebCompress** to nowoczesna, szybka i w 100% lokalna aplikacja webowa do kompresji, konwersji i skalowania materiałów wideo, stworzona jako lekka przeglądarkowa alternatywa dla programów takich jak HandBrake. 

Wersja **v0.2** to gruntownie przepisana implementacja, która łączy bezpośrednią akcelerację sprzętową przeglądarki (**WebCodecs API**) z wielowątkowym silnikiem **FFmpeg.wasm** (WebAssembly), oferując bezkompromisową wydajność, bezpieczeństwo i prywatność.

---

## Kluczowe funkcjonalności

- 🔒 **100% prywatności i bezpieczeństwa**: Żadne wideo ani metadane nie są wysyłane przez sieć. Całe przetwarzanie odbywa się w piaskownicy przeglądarki (Web Workers, OffscreenCanvas, WASM).
- ⚡ **Architektura Dual-Engine (Sprzęt + CPU)**:
  - **WebCodecs (Hardware)**: Błyskawiczny, sekwencyjny potok dekodowania i kodowania wykorzystujący GPU użytkownika.
  - **FFmpeg.wasm (CPU Multi-Thread)**: Zoptymalizowany silnik WebAssembly z obsługą wielu rdzeni CPU i buforów `SharedArrayBuffer`.
  - **Auto Dispatcher**: Inteligentny wybór najlepszego silnika przed rozpoczęciem zadania na podstawie rzeczywistych możliwości przeglądarki.
- 📐 **Oryginalna rozdzielczość i klatkaż (HandBrake Pattern)**:
  - Wszystkie profile domyślnie zachowują oryginalne wymiary i FPS materiału źródłowego. Brak niepożądanego, cichego downscalingu.
  - Opcjonalne skalowanie do standardów: 4K (2160p), 1440p, 1080p, 720p, 480p lub własne wymiary z blokadą proporcji (Aspect Ratio Lock).
- 🎛️ **Dwa tryby kontroli jakości**:
  - **Jakość wizualna (CRF)**: Płynny suwak 0–100 z automatycznym mapowaniem na krzywe CRF specyficzne dla kodeków (H.264, H.265, VP9, AV1).
  - **Docelowy rozmiar pliku (Target Size)**: Automatyczne przeliczanie bitrate'u wideo i audio pod zadany limit w MB (np. 25 MB dla Discorda, 20 MB dla poczty e-mail).
- 🎵 **Elastyczna obsługa ścieżek audio**:
  - **Passthrough (Keep)**: Bezstratne kopiowanie kompatybilnego strumienia audio bez rekompresji (`canCopyAudio`).
  - **Kompresja**: Konwersja do AAC, Opus lub MP3 z wyborem bitrate'u (64–320 kbps).
  - **Mikser kanałów**: Zachowanie oryginału, Stereo, Mono lub 5.1 Surround.
  - **Wyciszenie (Remove)**: Całkowite usunięcie dźwięku w celu oszczędności miejsca.
- ⏱️ **Prawdziwy wskaźnik postępu i bezpieczne anulowanie**:
  - Precyzyjne fazy zadania: inicjalizacja, inspekcja, demuxing, kodowanie, muxing, finalizacja.
  - Rzeczywisty wskaźnik FPS, prędkość kompresji (np. 2.4x), czas trwania i szacowany czas zakończenia (ETA).
  - Natychmiastowe anulowanie (`AbortController`), które zwalnia uchwyty pamięci i natychmiast ubija procesy w workerze.
- 🔍 **Podgląd porównawczy A/B**:
  - Interaktywny modal porównujący plik oryginalny ze skompresowanym (widok obok siebie lub suwak nakładający wideo na wideo).
- 📊 **Estymator rozmiaru i inteligentne ostrzeżenia (Smart Warnings)**:
  - Dynamiczna prognoza wagi pliku wynikowego oraz procentu redukcji w trakcie konfiguracji ustawień.
  - Ostrzeżenia o próbie upscalingu, przekroczeniu ograniczeń kontenera czy zbyt niskim bitrate dla wybranej rozdzielczości.
- 💻 **Diagnostyka sprzętu i przeglądarki**:
  - Wbudowany modal diagnostyczny badający wsparcie dla enkodera H.264, H.265, VP9, AV1, WebCodecs, WASM, Web Workers i liczby rdzeni logicznych.

---

## Architektura v0.2 (Dual-Engine)

Wersja v0.2 wprowadza całkowicie zoptymalizowaną, płaską architekturę pozbawioną zbędnych warstw pośrednich:

```
[Plik wideo użytkownika]
         │
         ▼
 ┌──────────────────────┐
 │   mediaProbe.ts      │ ──> Błyskawiczny odczyt nagłówków binarnych (MP4, EBML, AVI)
 └──────────────────────┘
         │
         ▼
 ┌──────────────────────┐
 │ mediaDispatcher.ts   │ ──> Weryfikacja profili RFC 6381 i preferencji użytkownika
 └──────────────────────┘
         │
         ├───► Tryb sprzętowy (WebCodecs Engine):
         │     ├── Web Worker: webcodecs.worker.ts
         │     ├── Demuxer: Mediabunny (sekwencyjny odczyt, bufor 8 MiB)
         │     ├── Dekoder: VideoDecoder (sprzętowy)
         │     ├── Przetwarzanie: OffscreenCanvas (tylko przy skalowaniu/obrocie)
         │     ├── Enkoder: VideoEncoder (prefer-hardware, kontrola przepływu/backpressure)
         │     ├── Muxer pośredni: mp4-muxer
         │     └── Finalizacja kontenera & audio: FFmpeg WASM (-c:v copy)
         │
         └───► Tryb CPU (FFmpeg WASM Engine):
               ├── Web Worker: ffmpeg.worker.ts
               ├── Montowanie wejścia: WORKERFS (zerowe kopiowanie pliku do RAM)
               ├── Wielowątkowość: @ffmpeg/core-mt (SharedArrayBuffer)
               └── Sterowanie wątkami: Dynamiczna alokacja rdzeni, pula x265 (max 16 wątków WPP)
```

### Najważniejsze ulepszenia architektoniczne v0.2:
1. **Koniec z przestarzałym potokiem (No Legacy Seek)**: Usunięto sekwencyjne odtwarzanie klatka po klatce przez `<video>` DOM i `canvas.drawImage`. Całość działa w tle w dedykowanym Web Workerze.
2. **Ścisła kontrola przepływu (Backpressure Flow Control)**: Bounded queues (maksymalnie 8 zadań dekodowania, 6 zadań kodowania w toku), eliminujące wycieki pamięci RAM przy długich filmach 4K.
3. **Optymalizacja pamięci WORKERFS**: W silniku FFmpeg pliki nie są kopiowane w całości do wirtualnego systemu plików Emscripten — są montowane bezpośrednio z obiektów `File` za pomocą `WORKERFS`.
4. **Pewny dyspozytor (Deterministic Dispatcher)**: Wybór silnika następuje raz przed startem kodowania. Brak cichych, ukrytych restartów w razie błędu.

---

## Obsługiwane formaty i kodeki

| Kontener | Rozszerzenie | Domyślny kodek wideo | Domyślny kodek audio | Zgodne kodeki wideo | Zgodne kodeki audio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MP4** | `.mp4` | H.264 | AAC | H.264, H.265 (HEVC), AV1 | AAC |
| **WebM** | `.webm` | VP9 | Opus | VP9, AV1 | Opus |
| **MKV** | `.mkv` | H.264 | AAC | H.264, H.265, VP9, AV1 | AAC, Opus |
| **MOV** | `.mov` | H.264 | AAC | H.264, H.265 (HEVC) | AAC |
| **AVI** | `.avi` | H.264 | MP3 | H.264 | MP3, AAC |

> **Uwaga dot. H.265 (HEVC)**: W plikach MP4 i MOV stosowany jest oficjalny czteroznakowy znacznik `hvc1`, zapewniający poprawną natywną obsługę na urządzeniach Apple (macOS, iOS) oraz w systemie Windows 10/11.
> 
> **Uwaga dot. AV1**: Kodowanie AV1 realizowane jest za pośrednictwem silnika WebCodecs (`av01.0.04M.08`). Biblioteka `@ffmpeg/core` WASM nie kompiluje CPU enkodera AV1 z powodu ogromnego rozmiaru pliku binarnego i drastycznie niskiej wydajności CPU w przeglądarce.

---

## Profile kompresji (Presety)

| Preset | Przeznaczenie | Rozdzielczość | FPS | Domyślny kontener |
| :--- | :--- | :--- | :--- | :--- |
| **Balanced** *(Zalecany)* | Optymalny balans między wagą a wiernością obrazu | Oryginał | Oryginał | MP4 (H.264) |
| **Small** | Agresywna kompresja pod kątem minimalnego rozmiaru | Oryginał | Oryginał | MP4 (H.264) |
| **High Quality** | Wysoki bitrate zachowujący najdrobniejsze detale | Oryginał | Oryginał | MP4 (H.264) |
| **Web / Streaming** | Zoptymalizowany pod kątem szybkiego startu odtwarzania (FastStart) | Oryginał | Oryginał | MP4 (H.264) |
| **Discord (25 MB)** | Skalkulowany ściśle pod limit 25 MB platformy Discord | Oryginał | Oryginał | MP4 (H.264) |
| **Email (20 MB)** | Skalkulowany pod standardowe limity załączników pocztowych | Oryginał | Oryginał | MP4 (H.264) |
| **Original / Re-encode** | Standardowa rekompresja przy zachowaniu natywnych parametrów | Oryginał | Oryginał | MP4 (H.264) |
| **Custom** | Pełna swoboda wyboru rozdzielczości, FPS, kodeka, bitrate'u i audio | Konfigurowalna | Konfigurowalny | Dowolny |

---

## Stos technologiczny

- **Framework**: [React 19](https://react.dev/)
- **Język**: [TypeScript 7.0+](https://www.typescriptlang.org/)
- **Narzędzie budowania**: [Vite 8.3](https://vitejs.dev/)
- **Stylowanie**: [Tailwind CSS v4.3](https://tailwindcss.com/) z `@tailwindcss/vite`
- **Ikony**: [Lucide React](https://lucide.dev/)
- **Silniki multimedialne**:
  - [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) (`VideoDecoder`, `VideoEncoder`)
  - [Mediabunny 1.61.3](https://github.com/Vanilagy/mediabunny) (sekwencyjny demuxing MP4, WebM, MKV, MOV)
  - [mp4-muxer 5.2](https://github.com/Vanilagy/mp4-muxer) (ultraszybki muxer kontenera MP4 w przeglądarce)
  - [@ffmpeg/ffmpeg 0.12](https://ffmpegwasm.netlify.app/) z rdzeniami `@ffmpeg/core` i `@ffmpeg/core-mt` (WASM)
- **Środowisko testowe**: [Vitest 5.0](https://vitest.dev/)

---

## Wymagania i instalacja

### Wymagania systemowe
- **Node.js**: wersja 18+ (rekomendowana wersja 22+)
- **Przeglądarka**: Nowoczesna przeglądarka wspierająca WebAssembly i WebCodecs (Google Chrome 94+, Microsoft Edge 94+, Opera, nowsze wersje Firefox/Safari).
- **Nagłówki Cross-Origin Isolation**: Dla pełnej wielowątkowości WASM (`SharedArrayBuffer`) wymagane są nagłówki:
  ```http
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
  *(Są one domyślnie skonfigurowane w `vite.config.ts` dla serwera dev i preview).*

### Instalacja

```bash
# Sklonuj repozytorium
git clone <adres-repozytorium>
cd WebCompress

# Zainstaluj zależności (automatycznie skopiuje pliki binarne FFmpeg WASM)
npm install
```

---

## Uruchomienie i testy

### Serwer deweloperski
```bash
npm run dev
```
Aplikacja uruchomi się pod adresem `http://localhost:5173`.

### Budowanie produkcyjne
```bash
npm run build
npm run preview
```

### Uruchomienie testów jednostkowych
```bash
npm test
```
Zestaw 17 pakietów testowych Vitest weryfikuje poprawność obliczeń bitrate'u, parserów nagłówków, konfiguracji kodeków i logiki dispatcherów.

### Uruchomienie testów integracyjnych w przeglądarce
```bash
npm run test:browser
```
Uruchamia zautomatyzowany potok testów w przeglądarce Chromium/Edge weryfikujący enkoder sprzętowy i silnik sekwencyjny.

---
---

# 🇬🇧 English Documentation

## Project Overview

**WebCompress** is a modern, fast, and privacy-first web application for compressing, converting, and resizing video files directly inside your browser. Built as a lightweight, client-side HandBrake alternative.

Version **v0.2** is a complete, clean rewrite combining native browser hardware acceleration (**WebCodecs API**) with multi-threaded **FFmpeg.wasm** (WebAssembly), delivering peak performance with zero server dependencies.

> **100% Local Processing**: Your videos never leave your device. Zero servers, zero uploads, zero cloud storage.

---

## Key Features

- 🔒 **Absolute Privacy**: All processing occurs strictly within your browser's local sandbox (Web Workers, OffscreenCanvas, WASM). No video data or metadata ever touches an external server.
- ⚡ **Dual-Engine Architecture (Hardware + CPU)**:
  - **WebCodecs (Hardware)**: Ultra-fast sequential demuxing and encoding pipeline leveraging the user's GPU/native hardware encoders.
  - **FFmpeg.wasm (CPU Multi-Thread)**: High-compatibility WebAssembly engine with multi-core CPU scaling via `SharedArrayBuffer`.
  - **Intelligent Dispatcher**: Validates codec support and configuration upfront before dispatching to the appropriate engine.
- 📐 **Original Resolution & FPS by Default (HandBrake Pattern)**:
  - All compression profiles preserve original dimensions and frame rates out-of-the-box.
  - Optional downscaling to 4K (2160p), 1440p, 1080p, 720p, 480p, or custom dimensions with aspect-ratio locking.
- 🎛️ **Dual Rate Control Modes**:
  - **Visual Quality (CRF)**: Smooth 0–100 quality slider mapped to codec-specific CRF scales (H.264, H.265, VP9, AV1).
  - **Target File Size**: Specify desired output size in MB (e.g. 25 MB Discord limit, 20 MB Email limit); bitrates are calculated automatically.
- 🎵 **Flexible Audio Handling**:
  - **Passthrough (Keep)**: Lossless copy of compatible audio streams without re-encoding (`canCopyAudio`).
  - **Compression**: Re-encode to AAC, Opus, or MP3 with selectable bitrate (64–320 kbps).
  - **Channel Downmixing / Upmixing**: Original, Stereo, Mono, 5.1 Surround.
  - **Mute / Strip**: Completely strip audio tracks to save maximum file size.
- ⏱️ **Real-Time Progress & Clean Cancellation**:
  - Clear processing stages: initializing, probing, demuxing, encoding, muxing, finalizing.
  - Live FPS counter, encoding speed factor (e.g. 2.4x realtime), elapsed time, and remaining time estimation (ETA).
  - True cancellation via `AbortController` that immediately terminates workers and frees memory buffers.
- 🔍 **Interactive A/B Quality Comparison**:
  - Built-in comparison modal offering side-by-side video playback and an interactive split slider comparing original vs compressed video.
- 📊 **Real-Time Size Estimator & Smart Warnings**:
  - Instant output size calculation and compression ratio predictions as settings change.
  - Contextual warnings for upscaling, low bitrates, or container/codec incompatibilities.
- 💻 **System & Browser Capability Diagnostic**:
  - Modal providing instant inspection of WebCodecs, hardware encoder support (H.264, H.265, VP9, AV1), WASM, Web Workers, and logical CPU cores.

---

## Architecture v0.2 (Dual-Engine)

```
[User Video File]
       │
       ▼
 ┌──────────────────────┐
 │   mediaProbe.ts      │ ──> Instant binary header inspection (MP4, EBML, AVI)
 └──────────────────────┘
       │
       ▼
 ┌──────────────────────┐
 │ mediaDispatcher.ts   │ ──> RFC 6381 validation & processing mode selection
 └──────────────────────┘
       │
       ├───► Hardware Engine (WebCodecs):
       │     ├── Worker: webcodecs.worker.ts
       │     ├── Demuxer: Mediabunny (sequential stream, 8 MiB local cache)
       │     ├── Decoder: VideoDecoder (hardware accelerated)
       │     ├── Rendering: OffscreenCanvas (only when scaling or rotation required)
       │     ├── Encoder: VideoEncoder (prefer-hardware, strict backpressure limits)
       │     ├── Intermediate Muxer: mp4-muxer
       │     └── Container & Audio Finalizer: FFmpeg WASM (-c:v copy)
       │
       └───► CPU Engine (FFmpeg WASM):
             ├── Worker: ffmpeg.worker.ts
             ├── File Mounting: WORKERFS (zero-copy memory mapping)
             ├── Multi-Threading: @ffmpeg/core-mt (SharedArrayBuffer)
             └── Thread Pool: Dynamic core scaling, bounded x265 pool (max 16 WPP threads)
```

---

## Supported Containers & Codecs

| Container | Extension | Default Video Codec | Default Audio Codec | Compatible Video Codecs | Compatible Audio Codecs |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MP4** | `.mp4` | H.264 | AAC | H.264, H.265 (HEVC), AV1 | AAC |
| **WebM** | `.webm` | VP9 | Opus | VP9, AV1 | Opus |
| **MKV** | `.mkv` | H.264 | AAC | H.264, H.265, VP9, AV1 | AAC, Opus |
| **MOV** | `.mov` | H.264 | AAC | H.264, H.265 (HEVC) | AAC |
| **AVI** | `.avi` | H.264 | MP3 | H.264 | MP3, AAC |

---

## Compression Presets

| Preset | Target Purpose | Resolution | Framerate | Default Container |
| :--- | :--- | :--- | :--- | :--- |
| **Balanced** *(Recommended)* | Ideal balance between file size and visual fidelity | Original | Original | MP4 (H.264) |
| **Small** | Aggressive compression for minimal storage footprint | Original | Original | MP4 (H.264) |
| **High Quality** | High bitrate retaining crisp fine details | Original | Original | MP4 (H.264) |
| **Web / Streaming** | Fast-start streaming optimization (`moov` atom front-loaded) | Original | Original | MP4 (H.264) |
| **Discord (25 MB)** | Strict 25 MB budget for Discord free upload limits | Original | Original | MP4 (H.264) |
| **Email (20 MB)** | Strict 20 MB budget for email attachment limits | Original | Original | MP4 (H.264) |
| **Original / Re-encode** | Standard re-encode retaining all native dimensions & FPS | Original | Original | MP4 (H.264) |
| **Custom** | Manual configuration of resolution, FPS, bitrates, audio, format | Custom | Custom | Any |

---

## Tech Stack

- **UI & Framework**: [React 19](https://react.dev/), [TypeScript 7.0+](https://www.typescriptlang.org/)
- **Build System**: [Vite 8.3](https://vitejs.dev/) with `@vitejs/plugin-react`
- **Styling**: [Tailwind CSS v4.3](https://tailwindcss.com/) via `@tailwindcss/vite`
- **Icons**: [Lucide React](https://lucide.dev/)
- **Core Processing**:
  - [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) (`VideoDecoder`, `VideoEncoder`)
  - [Mediabunny 1.61.3](https://github.com/Vanilagy/mediabunny)
  - [mp4-muxer 5.2](https://github.com/Vanilagy/mp4-muxer)
  - [@ffmpeg/ffmpeg 0.12](https://ffmpegwasm.netlify.app/) (`@ffmpeg/core` & `@ffmpeg/core-mt`)
- **Testing**: [Vitest 5.0](https://vitest.dev/)

---

## Getting Started

### Prerequisites
- **Node.js**: v18+ (Node v22 recommended)
- **Browser**: Modern Chromium-based browser (Chrome 94+, Edge 94+, Brave, Opera), Firefox, or Safari with WebCodecs support.

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd WebCompress

# Install dependencies (runs postinstall script to copy FFmpeg core files)
npm install
```

### Running Locally

```bash
# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Building for Production

```bash
npm run build
npm run preview
```

---

## Testing & Benchmarking

### Unit Tests
```bash
npm test
```
Executes 17 Vitest test suites testing bitrate calculations, metadata probes, codec mappings, worker management, and UI logic.

### Browser Pipeline Tests
```bash
npm run test:browser
```
Runs automated headless Chromium/Edge integration tests validating hardware encoder pipelines, frame counts, and cancellation handling.

---

## License

This project is licensed under the [MIT License](LICENSE).
Mediabunny is distributed under MPL-2.0.
FFmpeg is distributed under LGPL/GPL.
