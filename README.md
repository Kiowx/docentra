# 文枢 Docentra

[English](./README.en.md)

文枢，一个开源的智能多功能一体化工作台，可通过ai对话进行修改表格，同时提供可视化表格界面

<img width="2100" height="1350" alt="35055659d47d26212137b54eb323dd39" src="https://github.com/user-attachments/assets/5aa19894-f3e5-4775-b11e-6d947cac1c99" />

## 简介

文枢（Docentra）基于 `React + Vite + Electron + Zustand` 构建，提供本地优先的桌面表格体验，并集成 AI 助手、Excel 导入导出、公式计算、筛选排序、查找替换等能力。

## 功能亮点

- `Excel 风格编辑`：支持单元格直接输入、双击编辑、`F2` 编辑、公式栏编辑、`Enter` / `Tab` 导航、多选、整行整列选择、全选、右键菜单和拖拽填充。
- `公式与格式`：支持常见公式、依赖重算、基础文本样式、对齐、自动换行、数字格式、行高列宽调整。
- `数据操作`：支持复制、剪切、粘贴、撤销、重做、查找替换、排序、自动筛选、清空内容、自适应行高/列宽。
- `工作表管理`：支持多工作表、新建、重命名、复制、删除和切换。
- `导入、导出与校验`：支持导入 `xlsx/xlsm/xlsb/xls`，导出整本工作簿为 `xlsx`，导出当前工作表为 `csv`，并在导入后生成交叉验证报告。
- `AI 助手`：内置聊天侧栏，可连接 `OpenAI`、`Claude`、`Ollama` 和 OpenAI-compatible 自定义 API，并支持工具模式探测与自动回退。
- `中文友好`：已处理中文输入法组合输入、中文界面文案和中文文本显示。
- `桌面应用`：使用 Electron 封装，适合本地办公、AI 辅助编辑和 Windows 便携分发。

## 当前支持的公式函数

`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `IF`, `CONCATENATE`, `ROUND`, `ABS`, `INT`, `MOD`, `POWER`, `SQRT`, `LEN`, `LEFT`, `RIGHT`, `UPPER`, `LOWER`, `TRIM`, `NOW`, `TODAY`, `PI`

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 UI | React 18, TypeScript, Tailwind CSS |
| 构建工具 | Vite 6 |
| 桌面壳 | Electron 33 |
| 状态管理 | Zustand |
| Excel 导入导出 | `xlsx` |
| Markdown 消息渲染 | `react-markdown`, `remark-gfm`, `rehype-sanitize` |

## 快速开始

### 环境要求

- `Node.js 18+`（建议使用 LTS 版本）
- `npm 9+`
- 若要打包桌面版，当前配置默认面向 `Windows x64`

### 安装依赖

```bash
npm install
```

### 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器，默认端口 `5173` |
| `npm run dev:electron` | 以 Electron 开发模式启动桌面应用 |
| `npm run build:check` | 执行 TypeScript 检查并构建前端与 Electron 产物 |
| `npm run pack` | 生成未打包目录到 `release/win-unpacked` |
| `npm run dist` | 生成 Windows 便携版可执行文件 |

## AI 配置

1. 打开右侧聊天面板设置。
2. 选择服务提供方：`OpenAI`、`Claude`、`Ollama`。
3. 填写 `API Key`、模型名和可选 `Base URL`。
4. 如果你使用 OpenAI-compatible 自定义 API，可以在工具模式中选择：

- `auto`：自动回退，优先尝试原生工具调用，再退到 JSON 工具协议等模式。
- `native`：原生工具调用。
- `json`：JSON 工具协议。
- `inject`：提示词注入工具。
- `none`：关闭工具，纯对话。

5. 可点击“测试支持情况”自动探测当前 API 最合适的工具模式。

## 导入、导出与交叉验证

- 支持导入 `xlsx`、`xlsm`、`xlsb`、`xls` 文件。
- 导入后会尝试保留工作表、单元格值、公式、部分行高列宽信息。
- 导入完成后会生成校验结果，显示导入工作表数、校验单元格数、差异数和截断信息。
- 支持将整本工作簿导出为 `xlsx`，或将当前工作表导出为 `csv`。

## 项目结构

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

## 当前默认限制

- 当前每个工作表默认网格大小为 `5000` 行、`200` 列。
- 当前打包配置默认生成 `Windows x64 portable`。
- 项目尚未配置正式应用图标和代码签名。
- 当前仓库没有独立的单元测试或端到端测试脚本，`npm run build:check` 是主要自动化校验入口。

## 验证

推荐在提交或打包前运行：

```bash
npm run build:check
```

## 说明

- 项目当前主打表格，但命名和产品方向已经为文档类编辑器扩展留出空间。
- 如果你准备发布桌面版，建议补充应用图标、安装包命名策略和代码签名。
