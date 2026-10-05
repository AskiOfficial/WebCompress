# AGENTS.md

## Project

This repository contains a browser-based **Local Video Compressor & Converter**.

The product should feel like a lightweight, simplified HandBrake running entirely inside the browser.

The primary goals are:

- simple UX,
- reliable video compression and conversion,
- local-first processing,
- privacy,
- reasonable performance,
- graceful browser capability detection,
- clean and maintainable code.

Always prefer a smaller, stable, fully working implementation over a larger implementation with partially working features.

---

# Core Product Rule

## All video processing must remain local

Video files must NEVER be uploaded to a server.

Do not:

- upload videos,
- upload video frames,
- upload audio,
- upload filenames,
- send media metadata to external processing APIs,
- use cloud transcoding services,
- create a backend for video processing.

The application must work as a client-side application.

The UI should clearly communicate:

> 100% local processing

and:

> Your videos never leave your device.

---

# Preferred Stack

Use:

- React
- TypeScript
- Vite
- Web Workers
- FFmpeg.wasm
- WebCodecs where supported

Tailwind CSS may be used if already configured.

Avoid introducing large dependencies unless they provide significant value.

Before adding a dependency, consider whether the functionality can be implemented simply with the existing stack or browser APIs.

---

# Processing Architecture

The application should support multiple processing engines.

Keep processing implementations separated behind a common abstraction.

Preferred conceptual structure:

```text
MediaEngine

├── FFmpegEngine
└── WebCodecsEngine
```

UI components must not contain FFmpeg or WebCodecs implementation details.

The UI should interact with a common conversion/compression interface.

---

# CPU Processing

FFmpeg.wasm is the primary compatibility engine.

Treat FFmpeg.wasm as CPU/WASM processing.

Do not describe FFmpeg.wasm as GPU acceleration.

Prefer:

1. FFmpeg.wasm multi-thread when supported
2. FFmpeg.wasm single-thread as fallback

Check runtime capabilities such as:

```ts
crossOriginIsolated
SharedArrayBuffer
navigator.hardwareConcurrency
```

Never assume multi-threading is available.

---

# Hardware / GPU Processing

Hardware acceleration should use WebCodecs when supported.

Use capability detection before exposing or using hardware encoding.

Prefer:

```ts
VideoEncoder.isConfigSupported()
```

and:

```ts
hardwareAcceleration: "prefer-hardware"
```

Important:

`prefer-hardware` is a browser preference and does NOT guarantee that the GPU is actually being used.

Never display misleading information such as:

```text
GPU ACTIVE
```

unless there is reliable evidence.

Prefer wording such as:

```text
Hardware preferred
```

or:

```text
Hardware encoding available
```

Processing mode should conceptually support:

```text
Auto
Hardware
CPU
```

Auto should normally be recommended.

If hardware encoding is unavailable, gracefully fall back to CPU when appropriate.

---

# Browser Capability Detection

Never assume browser features exist.

Detect capabilities at runtime.

Relevant capabilities include:

- WebAssembly
- Web Workers
- SharedArrayBuffer
- crossOriginIsolated
- WebCodecs
- VideoEncoder
- VideoDecoder
- supported codecs
- supported encoder configurations
- hardware-preferred encoder configurations

Unsupported options should be:

- hidden,
- disabled,
- or clearly explained.

Do not allow users to select technically invalid configurations.

---

# Supported Formats

The application should prioritize commonly used formats.

Primary output formats:

```text
MP4
WebM
```

Primary video codecs:

```text
H.264 / AVC
VP9
AV1
```

Optional / advanced codecs may include:

```text
H.265 / HEVC
```

only when actually supported by the selected processing engine.

Primary audio codecs:

```text
AAC
Opus
```

Common input formats should include, where supported:

```text
MP4
MOV
MKV
WebM
AVI
M4V
```

Do not validate media only by file extension.

---

# Container / Codec Compatibility

Never allow invalid or obviously incompatible combinations.

Examples of preferred combinations:

```text
MP4 + H.264 + AAC
WebM + VP9 + Opus
WebM + AV1 + Opus
```

Codec options should dynamically react to the selected container and processing engine.

---

# User Experience

Keep the main interface simple.

The default interface should expose only the parameters most users understand.

Primary controls should include:

- output format,
- resolution,
- FPS,
- quality,
- target file size,
- video codec,
- audio settings,
- processing mode.

Advanced technical controls should live inside an **Advanced Settings** section.

Do not turn the interface into a full FFmpeg GUI.

---

# Simple vs Advanced

Prefer two levels of configuration.

## Simple

Expose:

- preset,
- resolution,
- FPS,
- format,
- quality,
- target size,
- processing mode.

## Advanced

May expose:

- codec,
- video bitrate,
- bitrate mode,
- audio codec,
- audio bitrate,
- audio channels,
- CPU threads,
- metadata handling,
- web optimization / fast start,
- custom dimensions,
- custom FPS.

Only add technical controls if they are genuinely functional.

---

# Smart Defaults

Do not require users to understand codecs and bitrates to compress a video.

After loading a file, inspect available media metadata and choose reasonable defaults.

Consider:

- source resolution,
- source FPS,
- source bitrate,
- duration,
- file size,
- video codec,
- audio codec.

Do not upscale by default.

Do not increase FPS by default.

For example:

```text
4K 60 FPS source
```

may reasonably receive a Balanced suggestion of:

```text
1080p
30 FPS
H.264
```

but the UI must make the selected values visible.

---

# Presets

Presets are configuration shortcuts.

They must not bypass the normal settings system.

Recommended presets include:

```text
Original / Re-encode
Small
Balanced
High Quality
Web
Discord
Email
Custom
```

Balanced should normally be the default.

Changing an individual setting after selecting a preset should be allowed.

---

# Target File Size

Target file size is an important feature.

Allow users to specify values such as:

```text
100 MB
25 MB
8 MB
```

Estimate the required total bitrate using:

```text
totalBitrate = targetSizeBits / durationSeconds
```

Then approximately calculate:

```text
videoBitrate = totalBitrate - audioBitrate - overhead
```

Account for container overhead with a small safety margin.

If the requested target size would produce unusably low bitrate, show a warning.

Do not silently generate obviously unreasonable configurations.

---

# Quality Mode

Quality mode should be understandable by non-technical users.

Prefer a control such as:

```text
Smaller file <-----> Better quality
```

Internally map this value to the appropriate codec-specific mechanism such as:

- CRF,
- quantizer,
- bitrate,
- encoder quality setting.

Do not expose raw encoder parameters unless they belong in Advanced Settings.

---

# Estimated Output Size

When possible, show an estimated output size before processing.

Example:

```text
Original
326 MB

Estimated output
74 MB

Estimated reduction
77%
```

For quality-based encoding, clearly indicate that the output size is only an estimate.

---

# Resolution

Support common values:

```text
Original
2160p
1440p
1080p
720p
480p
Custom
```

Preserve aspect ratio by default.

Do not upscale unless the user explicitly chooses to do so.

Handle codec requirements such as even-numbered dimensions.

---

# FPS

Support common values:

```text
Original
60
50
30
25
24
15
Custom
```

Never increase FPS automatically.

Increasing frame rate does not create real additional motion information.

---

# Audio

Support:

```text
Keep
Compress
Remove
```

Common audio bitrates:

```text
64 kbps
96 kbps
128 kbps
160 kbps
192 kbps
256 kbps
320 kbps
```

Prefer sensible defaults based on the selected preset.

---

# Large Files and Memory

Video files may be large.

Avoid unnecessary copies of media data.

Prefer:

- Workers,
- transferable objects,
- File APIs,
- streams where useful,
- incremental processing where practical.

Release resources aggressively.

Cleanup should include where applicable:

- Object URLs,
- VideoFrames,
- ArrayBuffers,
- temporary FFmpeg files,
- Workers,
- decoder instances,
- encoder instances.

Do not retain large video buffers after they are no longer needed.

---

# WebCodecs Rules

When using WebCodecs:

- check support before initialization,
- use Workers where practical,
- close every `VideoFrame`,
- control encoder queue size,
- implement backpressure,
- preserve timestamps correctly,
- keep audio/video synchronization correct,
- use an appropriate muxing strategy,
- cleanup encoders and decoders properly.

Do not build a fragile WebCodecs implementation just to claim hardware support.

If a configuration is unreliable, fall back to FFmpeg.wasm.

---

# FFmpeg Rules

FFmpeg operations should not run directly in the React UI layer.

Keep FFmpeg logic inside a dedicated service/engine and Worker.

FFmpeg functionality should support:

- initialization,
- media probing,
- conversion,
- progress,
- cancellation,
- error reporting,
- cleanup.

FFmpeg core files should preferably be hosted with the application.

Do not rely on random third-party CDN resources at runtime.

---

# Workers

Heavy media processing must not block the main UI thread.

Use Web Workers wherever appropriate.

The UI must remain responsive during encoding.

---

# Progress

Never implement fake progress.

Progress must come from the actual processing pipeline.

If exact progress cannot be determined, clearly communicate an indeterminate stage rather than inventing percentages.

Where available, expose:

- percentage,
- processing stage,
- elapsed time,
- processed media time,
- encoding FPS.

---

# Cancellation

Cancel must actually cancel processing.

Do not simply hide the progress UI.

Cancellation should:

- stop encoding,
- terminate/reset relevant workers when necessary,
- release media resources,
- remove temporary files,
- return the application to a usable state.

---

# Error Handling

Do not expose raw cryptic errors as the primary user message.

Use:

```text
Simple explanation
```

with an optional:

```text
Show technical details
```

Handle cases such as:

- corrupted media,
- unsupported format,
- unsupported codec,
- unsupported encoder configuration,
- insufficient memory,
- worker failure,
- FFmpeg initialization failure,
- WebCodecs initialization failure,
- hardware encoding unavailable,
- cancellation.

Errors must not permanently break the application state.

---

# No Fake Features

This is a strict rule.

Do not add:

- buttons that do nothing,
- fake progress,
- placeholder codec options,
- simulated hardware acceleration,
- unsupported formats just for appearance,
- UI switches without implementation.

If a feature is displayed to the user, it must work.

Otherwise hide it or mark it explicitly as unavailable.

---

# Architecture

Prefer feature-based modular code.

A reasonable structure is:

```text
src/
├── components/
├── features/
│   └── converter/
├── hooks/
├── services/
│   ├── ffmpeg/
│   └── webcodecs/
├── workers/
├── utils/
├── types/
└── config/
```

Keep separate modules for:

- UI,
- presets,
- media metadata,
- capability detection,
- bitrate calculations,
- target-size calculations,
- FFmpeg commands,
- WebCodecs pipeline,
- muxing,
- processing state.

Avoid giant React components.

Avoid giant utility files.

---

# TypeScript

Use TypeScript properly.

Avoid:

```ts
any
```

unless there is a strong reason.

Prefer explicit domain types.

Useful concepts may include:

```ts
VideoMetadata
AudioMetadata
ConversionSettings
CompressionPreset
ProcessingEngine
ProcessingProgress
BrowserCapabilities
OutputFormat
VideoCodec
AudioCodec
```

Do not duplicate equivalent types across unrelated modules.

---

# React

Keep media engine state separate from presentation components.

Prefer:

- small components,
- custom hooks,
- explicit data flow,
- predictable state.

Avoid unnecessary global state.

Do not introduce Redux or another global state library unless complexity genuinely requires it.

---

# UI Design

The application should feel:

- minimal,
- modern,
- clean,
- fast,
- trustworthy.

Prefer:

- clear hierarchy,
- generous whitespace,
- simple cards,
- restrained animations,
- responsive layout.

Avoid:

- large dashboards,
- unnecessary sidebars,
- complex navigation,
- admin-panel aesthetics.

This is a single-purpose utility.

---

# Privacy UX

Privacy should be visible, not hidden in legal text.

Near the file drop area, show messaging similar to:

```text
100% local processing
Your videos never leave your device.
```

Do not make false privacy claims if future code changes introduce network processing.

---

# Accessibility

Maintain:

- keyboard navigation,
- visible focus states,
- labels,
- ARIA attributes where appropriate,
- sufficient contrast.

Do not communicate important status only through color.

---

# Features Not Needed

Do not add unless explicitly requested:

- user accounts,
- authentication,
- backend databases,
- cloud uploads,
- cloud storage,
- billing,
- admin panel,
- collaboration,
- social features,
- conversion history stored on a server.

Keep the product focused.

---

# Implementation Priority

When implementing a new version, prioritize functionality in this order:

1. file import,
2. media metadata,
3. resolution,
4. FPS,
5. MP4 output,
6. H.264,
7. WebM output,
8. VP9,
9. quality control,
10. bitrate control,
11. target file size,
12. audio configuration,
13. FFmpeg.wasm processing,
14. real progress,
15. cancellation,
16. download,
17. browser capability detection,
18. WebCodecs,
19. hardware-preferred encoding,
20. AV1,
21. advanced codecs and features.

Do not sacrifice the stability of items 1–16 to implement later items.

---

# Development Workflow

Before making a substantial change:

1. inspect the existing architecture,
2. reuse existing abstractions,
3. identify the smallest reliable solution,
4. implement it without unrelated refactoring.

After making changes:

1. run TypeScript checks,
2. run the build,
3. run available tests,
4. fix introduced warnings/errors,
5. verify the affected user flow.

Do not consider a task finished if the project no longer builds.

---

# Refactoring

Do not perform broad unrelated refactors while implementing a small feature.

Refactor when:

- it directly enables the requested change,
- it removes problematic duplication,
- it fixes an architectural problem.

Avoid rewriting working code without a concrete benefit.

---

# Dependencies

Do not install libraries automatically for trivial functionality.

Before adding a package:

1. verify it is actively maintained,
2. confirm it works in browsers,
3. consider bundle size,
4. verify license compatibility,
5. confirm there is no simpler built-in solution.

Media-processing dependencies are exceptions when they provide functionality that is impractical to implement safely from scratch.

---

# Performance

Performance matters.

Avoid:

- loading FFmpeg multiple times,
- repeatedly parsing the same media,
- unnecessary React rerenders,
- copying large ArrayBuffers,
- keeping unused media objects alive.

Load heavy processing engines lazily when practical.

---

# Logging

Keep production console output minimal.

Detailed FFmpeg/WebCodecs logs should be available only when useful for debugging.

Do not log:

- video contents,
- frame data,
- filenames unnecessarily,
- user media metadata to external services.

---

# Offline / PWA

Offline support is desirable but secondary to reliable video processing.

If PWA functionality exists:

- cache application assets safely,
- cache locally hosted processing assets when appropriate,
- ensure the Service Worker does not break COOP/COEP requirements,
- never cache user video files without explicit need.

---

# Security Headers

If multi-threaded WebAssembly requires cross-origin isolation, configure development and production hosting appropriately.

Typical requirements may include:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Do not blindly add headers without verifying that third-party assets remain compatible.

Prefer self-hosted assets when cross-origin isolation is required.

---

# Testing

When modifying the processing pipeline, test representative flows when possible.

Important cases include:

```text
MP4 H.264 -> MP4 H.264
1080p -> 720p
60 FPS -> 30 FPS
MOV -> MP4
MP4 -> WebM VP9
audio bitrate change
remove audio
target file size
cancel during encoding
hardware unavailable -> CPU fallback
multi-thread unavailable -> single-thread fallback
unsupported input
```

Avoid tests that merely confirm implementation details.

Prefer tests that validate user-visible behavior and calculation logic.

---

# Definition of Done

A feature is not complete until:

- it actually works,
- the UI reflects its real state,
- failure cases are handled,
- resources are cleaned up,
- TypeScript passes,
- the application builds,
- existing core conversion flows are not broken.

For processing features specifically, verify that the generated media file can actually be downloaded and played.

---

# Decision Making

When requirements are ambiguous, prefer:

1. privacy,
2. reliability,
3. browser compatibility,
4. simple UX,
5. maintainability,
6. performance,
7. additional features.

Do not ask for clarification about minor implementation details when a reasonable default can be chosen safely.

Document significant technical compromises in code comments or README when useful.

---

# Final Principle

Build a **real local video compressor**, not a visual prototype.

Every implementation decision should support this goal:

> A user selects a real video, configures compression, runs it locally, sees real progress, downloads a genuinely converted video, and no media leaves their device.