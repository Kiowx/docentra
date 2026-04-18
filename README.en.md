# Docentra

<a href="README.md">中文</a> |
<a href="README.en.md"><strong>English</strong></a>

An AI-powered desktop document workspace focused on Excel-like spreadsheet editing today, with room to grow into documents and more.
<img width="2100" height="1350" alt="35055659d47d26212137b54eb323dd39" src="https://github.com/user-attachments/assets/5aa19894-f3e5-4775-b11e-6d947cac1c99" />

## Overview

Docentra is built with `React + Vite + Electron + Zustand` and delivers a local-first desktop spreadsheet experience with an integrated AI assistant, Excel import/export, formula calculation, filtering, sorting, and find/replace. The current focus is spreadsheets, but the product direction and naming are designed for a broader document workspace.

## Highlights

- `Excel-like editing`: Direct cell input, double-click editing, `F2`, formula bar editing, `Enter` / `Tab` navigation, multi-selection, row/column selection, select-all, context menus, and drag fill.
- `Formulas and formatting`: Common formulas, dependency-based recalculation, basic text styling, alignment, wrap text, number formats, and row/column sizing.
- `Data operations`: Copy, cut, paste, undo, redo, find/replace, sorting, auto-filter, clear contents, and auto-fit row height / column width.
- `Sheet management`: Multiple sheets, create, rename, duplicate, delete, and switch actions.
- `Import, export, and validation`: Import `xlsx/xlsm/xlsb/xls`, export the full workbook to `xlsx`, export the current sheet to `csv`, and generate a post-import validation report.
- `AI assistant`: Built-in chat sidebar for `OpenAI`, `Claude`, `Ollama`, and OpenAI-compatible custom APIs, with tool mode probing and automatic fallback.
- `Chinese-friendly`: Supports Chinese IME composition input, Chinese UI copy, and normal Chinese text rendering.
- `Desktop app`: Wrapped with Electron for local productivity, AI-assisted editing, and Windows portable distribution.

## Supported Formula Functions

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `IF`, `CONCATENATE`, `ROUND`, `ABS`, `INT`, `MOD`, `POWER`, `SQRT`, `LEN`, `LEFT`, `RIGHT`, `UPPER`, `LOWER`, `TRIM`, `NOW`, `TODAY`, `PI`

## Tech Stack

| Area | Tech |
| --- | --- |
| Frontend UI | React 18, TypeScript, Tailwind CSS |
| Build tool | Vite 6 |
| Desktop shell | Electron 33 |
| State management | Zustand |
| Excel I/O | `xlsx` |
| Markdown rendering | `react-markdown`, `remark-gfm`, `rehype-sanitize` |

## Quick Start

### Requirements

- `Node.js 18+` (LTS recommended)
- `npm 9+`
- The current packaging config targets `Windows x64`

### Install Dependencies

```bash
npm install
```

### Development Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port `5173` |
| `npm run dev:electron` | Launch the desktop app in Electron dev mode |
| `npm run build:check` | Run TypeScript checks and build both renderer and Electron bundles |
| `npm run pack` | Build the unpacked Electron directory in `release/win-unpacked` |
| `npm run dist` | Build the Windows portable executable |

## AI Configuration

1. Open the settings panel in the right-side chat area.
2. Choose a provider: `OpenAI`, `Claude`, or `Ollama`.
3. Fill in the `API Key`, model name, and optional `Base URL`.
4. If you use an OpenAI-compatible custom API, you can choose one of these tool modes:

- `auto`: Automatically falls back from native tool calling to safer compatibility modes.
- `native`: Native tool calling.
- `json`: JSON-based tool protocol.
- `inject`: Prompt-injected tool calling.
- `none`: Disable tools and use plain chat only.

5. Click "测试支持情况" to automatically probe the best tool mode for the current API.

## Import, Export, and Cross-validation

- Supports importing `xlsx`, `xlsm`, `xlsb`, and `xls`.
- The importer tries to preserve sheets, cell values, formulas, and part of the row/column sizing information.
- After import, the app generates a validation result showing imported sheets, checked cells, mismatches, and truncation information.
- The app can export the full workbook to `xlsx` or the current sheet to `csv`.

## Project Structure

```text
.
├─ electron/                # Electron main/preload entry
├─ scripts/                 # Helper scripts
├─ src/
│  ├─ ai/                   # AI providers, tool execution, prompts, probing
│  ├─ components/
│  │  ├─ Chat/              # Chat panel, message list, message actions
│  │  ├─ Layout/            # App shell and title bar
│  │  └─ Spreadsheet/       # Spreadsheet UI, toolbar, dialogs, status bars
│  ├─ store/                # Zustand store and app state
│  ├─ types/                # Shared TypeScript types
│  └─ utils/                # Formula engine, XLSX I/O, auto-fit, helpers
├─ dist/                    # Renderer build output
├─ dist-electron/           # Electron build output
└─ release/                 # Packaged desktop artifacts
```

## Current Defaults and Limits

- Each sheet currently defaults to a `5000 x 200` grid.
- The current packaging config builds a `Windows x64 portable` target by default.
- The project does not yet ship with a custom application icon or code signing.
- There is no standalone unit or end-to-end test suite yet; `npm run build:check` is the main automated verification entry.

## Verification

Recommended before committing or packaging:

```bash
npm run build:check
```

## Notes

- The project is spreadsheet-first today, but its naming and direction already leave room for document-style editors.
- If you plan to distribute the desktop build, consider adding an application icon, cleaner installer naming, and code signing.
