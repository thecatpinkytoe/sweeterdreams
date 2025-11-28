# HealthExportKit (Cloud-build friendly)

This repository contains a minimal SwiftUI app that reads HealthKit samples and exports newline-delimited JSON (NDJSON). It also includes optional GZIP output.

Key points:
- Outputs: `filename.ndjson` and `filename.ndjson.gz`
- NDJSON is written incrementally to avoid large memory use.
- Gzip is produced using a helper built on the Compression framework.
- Designed for cloud builds (Codemagic / GitHub Actions). See `codemagic.yaml`.

Usage:
1. Upload this repo to GitHub.
2. Configure code signing in your CI (Codemagic recommended).
3. Run the `build-and-export` workflow to build an IPA and install to your device.

References:
- The design and exporter logic was informed by prior conversation and notes (your uploaded chat PDF). See the PDF excerpts included in the conversation for details on NDJSON, gzip benefits, and Codemagic fixes.
