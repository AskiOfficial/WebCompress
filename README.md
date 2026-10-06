# WebCompress — 100% Local Video Compressor & Converter

A modern, fast, and privacy-first web application for compressing, converting, and resizing video files directly inside your browser. Built as a lightweight, client-side HandBrake alternative.

> **100% Local Processing**: Your videos never leave your device. Zero servers, zero uploads, zero cloud dependencies.

---

## Key Features

- **Privacy Guarantee**: All processing happens entirely in-memory and Web Workers within your browser's local sandbox.
- **Multiple Output Containers**:
  - **MP4**: Universal playback across all devices and web platforms.
  - **WebM**: Efficient open container for the modern web.
  - **MKV (Matroska)**: Flexible container supporting all video and audio codecs.
  - **MOV (QuickTime)**: Native format for macOS and iOS ecosystems.
  - **AVI**: Classic Windows video container.
- **Multiple Video Codecs**:
  - **H.264 / AVC**: Fast, maximum compatibility across all devices.
  - **H.265 / HEVC**: Next-gen compression (~50% smaller files than H.264). Tagged with `hvc1` for seamless Apple & Windows playback.
  - **VP9**: Efficient open web video format.
  - **AV1**: Cutting-edge compression efficiency (encoded via browser WebCodecs).
- **Processing Engines**:
  - **Auto (Recommended)**: Checks the exact browser encoder configuration and selects WebCodecs when available, otherwise CPU before encoding starts. Once encoding starts, errors stop the job; video encoding never switches automatically to CPU.
  - **Hardware (WebCodecs)**: Requires browser support for the chosen video configuration with `hardwareAcceleration: "prefer-hardware"`. This is a preference, not proof of GPU use. Unsupported configurations and encoding errors are reported without CPU video retries.
  - **Local audio and final container**: WebCodecs encodes video to an intermediate MP4. FFmpeg.wasm copies that video stream, prepares source audio, and writes the requested final container. Audio processing on CPU does not re-encode the video.
  - **CPU (FFmpeg.wasm)**: WebAssembly-powered CPU encoding supporting all formats (MP4, MKV, MOV, WebM, AVI), with dynamic multi-threading scaled to your CPU core count.
- **Original Resolution & Framerate by Default**:
  - Every profile (Balanced, Small, High Quality, Web, Discord, Email, Original, Custom) preserves your original resolution and framerate by default. You can still adjust downscaling (4K, 1440p, 1080p, 720p, 480p) or custom dimensions anytime.
- **CPU Multi-Threading (Auto Cores)**:
  - Auto mode detects `navigator.hardwareConcurrency` and allocates optimal worker threads (e.g. 15 threads on 16-core CPUs, scaling up to 32 threads) to prevent browser tab freezing.
  - Single-thread mode includes clear warnings about performance degradation on high-resolution media.
- **Dual Quality Control**:
  - **Visual Quality**: Intuitive slider (0–100) mapped to codec-specific CRF scales (H.264, H.265, VP9, AV1).
  - **Target File Size**: Specify desired output in MB; the engine automatically calculates video bitrates and container margins.
- **Real Progress & Clean Cancellation**:
  - Live progress percentage derived directly from the encoding pipeline.
  - Real-time elapsed time, remaining time estimation, and processing speed/FPS.
  - Full cancellation that genuinely terminates the worker, closes hardware encoders, and releases memory buffers.
- **Quality Comparison**:
  - Side-by-side or toggleable before/after video preview comparing the original file with the compressed output.

---

## Technical Details & Engine Specifications

### 1. AV1 Encoding Notes
- `@ffmpeg/core` WASM does not compile an AV1 encoder (such as `libaom` or `libsvtav1`) due to substantial WASM binary bloat and slow CPU performance in browser sandboxes.
- Therefore, AV1 encoding in WebCompress runs via the browser's native **WebCodecs** engine (`av01.0.04M.08`).
- If your device/browser does not have an AV1 encoder, WebCompress clearly indicates this and guides you to H.264, H.265, or VP9.

### 2. H.265 / HEVC Support
- CPU uses `libx265`; browser HEVC requires a supported WebCodecs encoder. Encoder configuration checks and actual encoding share the same codec/profile, fractional FPS, hardware preference, and `hevc` bitstream format.
- HEVC parameter sets from the encoder are required for the intermediate MP4. Encoder, flush, frame-read, and muxing failures are fatal; incomplete files are not returned as successful results.
- Browser video is copied into the final MP4, MOV, or MKV without a second video encode. MP4/MOV use the `hvc1` tag; playback still depends on the player's HEVC decoder support.
- Audio uses local FFmpeg rather than `AudioContext.decodeAudioData` or browser AAC encoding. Compatible source audio is copied for **Keep Audio** with original channels; otherwise it is converted using the selected bitrate/channels. Missing audio is allowed, but audio decode/encode errors stop the job.
- Input files are mounted through WORKERFS, avoiding whole-file copies into the WASM filesystem. FFmpeg core assets remain hosted with the app. Neither media nor its metadata is uploaded.
- The browser video frame source still uses an HTML video element with checked, cancellable seeks. Input playback support is therefore required. Seek timeouts fail rather than encoding stale frames. A streaming demux/decode pipeline for large files remains future work.

### 3. Multi-Threaded WebAssembly (FFmpeg.wasm)
- Multi-threaded WASM (`ffmpeg-core-mt`) uses `SharedArrayBuffer`, which modern browsers restrict behind Cross-Origin Isolation headers:
  ```http
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- WebCompress is preconfigured with these headers in Vite for development and preview.
- If deployed without these headers, WebCompress automatically falls back to single-threaded CPU mode without throwing errors.

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node v22)
- npm 9+

### Installation

```bash
git clone <repository-url>
cd WebCompress
npm install
```

### Running Locally (Development)

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### Running Automated Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm run preview
```
