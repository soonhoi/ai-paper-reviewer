# AI Paper Reviewer v1.0.0

First laboratory release.

## Features

- PDF academic paper analysis
- Korean / English review
- RAG-based evidence retrieval
- Summary Agent, Critical Reviewer, Advocate Agent
- Reviewer–Advocate Debate (maximum three rounds)
- Meta Reviewer final verdict and score
- JSON export and PDF review report export
- User-provided OpenAI API Key
- Optional local encrypted API Key storage using Electron safeStorage

## Platform

Windows 10 / 11 x64. An internet connection and an OpenAI API account with access to the configured models are required. The installer includes Electron; no separate Node.js installation is required.

## Installation

Download `AI Paper Reviewer Setup 1.0.0.exe` from this GitHub Release and run the installer. Start menu and desktop shortcuts are supported.

This development release may be unsigned and Windows SmartScreen may show a warning. Verify the source and Release information before running the file. Compare its SHA-256 with `SHA256SUMS.txt` if supplied.

## Assets

- `AI Paper Reviewer Setup 1.0.0.exe`: Windows NSIS installer
- `SHA256SUMS.txt`: SHA-256 checksum of the installer, generated after the final build
- Optional: `AI Paper Reviewer Setup 1.0.0.exe.blockmap` (not required for manual installation)

Installer binaries are Release assets, not source repository commits. This file is a draft for the first Release; it does not indicate that a public Release has already been published.

## Notes

Users must provide their own OpenAI API Key. No developer credential is included. API usage is billed to the user's API account.

PDF parsing and local index management run on the user's PC. Extracted paper text is sent to OpenAI for embeddings and analysis, including potentially the full extracted text in the Summary step. Check the relevant permissions and policies before analyzing unpublished or confidential work.

Korean PDF reports require an installed Unicode font. Used glyphs are embedded in the exported PDF; Windows font files are not distributed in the installer.

AI results are research assistance and should be checked against the paper. Valid-key end-to-end review, installation on a different PC, and Edge/Acrobat compatibility across PCs have not been fully tested. Local Windows 11 packaged-app smoke tests, PDF rendering checks and the automated test suite have passed.

## License

ISC, preserving the existing project license declaration.
