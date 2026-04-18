# 文枢 Docentra

AI 驱动的桌面文档工作台，当前聚焦类 Excel 表格编辑，并为后续扩展到文档等更多编辑器预留了空间。  
An AI-powered desktop document workspace focused on Excel-like spreadsheet editing today, with room to grow into documents and more.

## 简介 | Overview

文枢（Docentra）基于 `React + Vite + Electron + Zustand` 构建，提供本地优先的桌面表格体验，并集成 AI 助手、Excel 导入导出、公式计算、筛选排序、查找替换等能力。项目当前以表格为核心，但命名和结构都已经按“文档工作台”方向设计。  
Docentra is built with `React + Vite + Electron + Zustand` and delivers a local-first desktop spreadsheet experience with an integrated AI assistant, Excel import/export, formula calculation, filtering, sorting, and find/replace. The current focus is spreadsheets, but the product direction and naming are designed for a broader document workspace.

## 功能亮点 | Highlights

- `Excel 风格编辑 / Excel-like editing`: 支持单元格直接输入、双击编辑、`F2` 编辑、公式栏编辑、`Enter` / `Tab` 导航、多选、整行整列选择、全选、右键菜单和拖拽填充。 Supports direct cell input, double-click editing, `F2`, formula bar editing, `Enter` / `Tab` navigation, multi-selection, row/column selection, select-all, context menus, and drag fill.
- `公式与格式 / Formulas and formatting`: 支持常见公式、依赖重算、基础文本样式、对齐、自动换行、数字格式、行高列宽调整。 Includes common formulas, dependency-based recalculation, basic text styling, alignment, wrap text, number formats, and row/column sizing.
- `数据操作 / Data operations`: 支持复制、剪切、粘贴、撤销、重做、查找替换、排序、自动筛选、清空内容、自适应行高/列宽。 Includes copy, cut, paste, undo, redo, find/replace, sorting, auto-filter, clear contents, and auto-fit row height / column width.
- `工作表管理 / Sheet management`: 支持多工作表、新建、重命名、复制、删除和切换。 Supports multiple sheets, create, rename, duplicate, delete, and switch actions.
- `导入、导出与校验 / Import, export, and validation`: 支持导入 `xlsx/xlsm/xlsb/xls`，导出整本工作簿为 `xlsx`，导出当前工作表为 `csv`，并在导入后生成交叉验证报告。 Supports importing `xlsx/xlsm/xlsb/xls`, exporting the full workbook to `xlsx`, exporting the current sheet to `csv`, and generating a post-import validation report.
- `AI 助手 / AI assistant`: 内置聊天侧栏，可连接 `OpenAI`、`Claude`、`Ollama` 和 OpenAI-compatible 自定义 API，并支持工具模式探测与自动回退。 Includes a built-in chat sidebar that can connect to `OpenAI`, `Claude`, `Ollama`, and OpenAI-compatible custom APIs, with tool mode probing and automatic fallback.
- `中文友好 / Chinese-friendly`: 已处理中文输入法组合输入、中文界面文案和中文文本显示。 Handles Chinese IME composition input, Chinese UI copy, and normal Chinese text rendering.
- `桌面应用 / Desktop app`: 使用 Electron 封装，适合本地办公、AI 辅助编辑和 Windows 便携分发。 Wrapped with Electron for local productivity, AI-assisted editing, and Windows portable distribution.

## 当前支持的公式函数 | Supported Formula Functions

当前内置公式函数包括：  
The built-in formula functions currently include:

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `IF`, `CONCATENATE`, `ROUND`, `ABS`, `INT`, `MOD`, `POWER`, `SQRT`, `LEN`, `LEFT`, `RIGHT`, `UPPER`, `LOWER`, `TRIM`, `NOW`, `TODAY`, `PI`

## 技术栈 | Tech Stack

| 模块 | 技术 |
| --- | --- |
| 前端 UI / Frontend UI | React 18, TypeScript, Tailwind CSS |
| 构建工具 / Build tool | Vite 6 |
| 桌面壳 / Desktop shell | Electron 33 |
| 状态管理 / State management | Zustand |
| Excel 导入导出 / Excel I/O | `xlsx` |
| Markdown 消息渲染 / Markdown rendering | `react-markdown`, `remark-gfm`, `rehype-sanitize` |

## 快速开始 | Quick Start

### 环境要求 | Requirements

- `Node.js 18+`（建议使用 LTS 版本） / `Node.js 18+` (LTS recommended)
- `npm 9+`
- 若要打包桌面版，当前配置默认面向 `Windows x64` / For packaged desktop builds, the current config targets `Windows x64`

### 安装依赖 | Install Dependencies

```bash
npm install
```

### 开发命令 | Development Commands

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，默认端口 `5173` / Start the Vite dev server on port `5173` |
| `npm run dev:electron` | 以 Electron 开发模式启动桌面应用 / Launch the desktop app in Electron dev mode |
| `npm run build:check` | 执行 TypeScript 检查并构建前端与 Electron 产物 / Run TypeScript checks and build both renderer and Electron bundles |
| `npm run pack` | 生成未打包目录到 `release/win-unpacked` / Build the unpacked Electron directory in `release/win-unpacked` |
| `npm run dist` | 生成 Windows 便携版可执行文件 / Build the Windows portable executable |

## AI 配置 | AI Configuration

1. 打开右侧聊天面板设置。  
   Open the settings panel in the right-side chat area.
2. 选择服务提供方：`OpenAI`、`Claude`、`Ollama`。  
   Choose a provider: `OpenAI`, `Claude`, or `Ollama`.
3. 填写 `API Key`、模型名和可选 `Base URL`。  
   Fill in the `API Key`, model name, and optional `Base URL`.
4. 如果你使用 OpenAI-compatible 自定义 API，可以在工具模式中选择：  
   If you use an OpenAI-compatible custom API, you can choose one of these tool modes:

   - `auto`: 自动回退，优先尝试原生工具调用，再退到 JSON 工具协议等模式。 Automatically falls back from native tool calling to safer compatibility modes.
   - `native`: 原生工具调用。 Native tool calling.
   - `json`: JSON 工具协议。 JSON-based tool protocol.
   - `inject`: 提示词注入工具。 Prompt-injected tool calling.
   - `none`: 关闭工具，纯对话。 Disable tools and use plain chat only.

5. 可点击“测试支持情况”自动探测当前 API 最合适的工具模式。  
   Click "测试支持情况" to automatically probe the best tool mode for the current API.

## 导入、导出与交叉验证 | Import, Export, and Cross-validation

- 支持导入 `xlsx`、`xlsm`、`xlsb`、`xls` 文件。 Supports importing `xlsx`, `xlsm`, `xlsb`, and `xls`.
- 导入后会尝试保留工作表、单元格值、公式、部分行高列宽信息。 The importer tries to preserve sheets, cell values, formulas, and part of the row/column sizing information.
- 导入完成后会生成校验结果，显示导入工作表数、校验单元格数、差异数和截断信息。 After import, the app generates a validation result showing imported sheets, checked cells, mismatches, and truncation information.
- 支持将整本工作簿导出为 `xlsx`，或将当前工作表导出为 `csv`。 The app can export the full workbook to `xlsx` or the current sheet to `csv`.

## 项目结构 | Project Structure

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

## 当前默认限制 | Current Defaults and Limits

- 当前每个工作表默认网格大小为 `5000` 行、`200` 列。 Each sheet currently defaults to a `5000 x 200` grid.
- 当前打包配置默认生成 `Windows x64 portable`。 The current packaging config builds a `Windows x64 portable` target by default.
- 项目尚未配置正式应用图标和代码签名。 The project does not yet ship with a custom application icon or code signing.
- 当前仓库没有独立的单元测试或端到端测试脚本，`npm run build:check` 是主要自动化校验入口。 There is no standalone unit or end-to-end test suite yet; `npm run build:check` is the main automated verification entry.

## 验证 | Verification

推荐在提交或打包前运行：  
Recommended before committing or packaging:

```bash
npm run build:check
```

## 说明 | Notes

- 项目当前主打表格，但命名和产品方向已经为文档类编辑器扩展留出空间。 The project is spreadsheet-first today, but its naming and direction already leave room for document-style editors.
- 如果你准备发布桌面版，建议补充应用图标、安装包命名策略和代码签名。 If you plan to distribute the desktop build, consider adding an application icon, cleaner installer naming, and code signing.
