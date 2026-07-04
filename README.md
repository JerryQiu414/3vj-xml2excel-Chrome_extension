# 3VJ XML to Excel Chrome Extension

Chrome 浏览器扩展程序，用于将 3VJ 系统导出的 XML 生产数据转换为 Excel 文件，支持 FMS（柔性制造系统）格式输出。

## 功能特性

- **XML 解析**：支持解析 3VJ 系统导出的生产 XML 文件
- **数据转换**：将 XML 数据映射到 FMS 格式的 Excel 表格
- **多类型数据支持**：支持板件（Panel）、五金（Metal）、线条（Line）、台面（SubTable）等数据类型
- **智能字段映射**：可配置的字段映射规则，支持自定义代码逻辑
- **Excel 导出**：支持导出为 .xlsx 格式，自动生成供应商分组文件
- **数据完整性**：确保数值字段输出 0 而非空值，字符串字段输出 NULL 而非空值

## 安装步骤

1. 下载或克隆本仓库
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `chrome_extension` 目录

## 使用方法

1. 点击浏览器工具栏中的扩展图标
2. 点击「选择 XML 文件」按钮，选择要转换的 XML 文件
3. 等待转换完成，系统会自动下载转换后的 Excel 文件

## 技术栈

- **框架**：Chrome Extension Manifest V3
- **语言**：JavaScript ES6+
- **XML 解析**：DOMParser API
- **Excel 导出**：SheetJS (XLSX)
- **压缩打包**：JSZip

## 项目结构

```
chrome_extension/
├── config/              # 配置文件
│   ├── field_mapping.json    # 字段映射配置
│   ├── bom_rules.json        # BOM 规则配置
│   ├── process_routes.json   # 工艺路线配置
│   ├── production_plans.json # 生产方案配置
│   ├── supplier_mapping.json # 供应商映射配置
│   └── suppliers/            # 供应商配置文件
├── js/                  # 核心逻辑
│   ├── xml-parser.js         # XML 解析器
│   ├── field-mapper.js       # 字段映射器
│   ├── fms-converter.js      # FMS 转换器
│   ├── bom-converter.js      # BOM 转换器
│   ├── excel-exporter.js     # Excel 导出器
│   ├── plan-matcher.js       # 方案匹配器
│   └── route-matcher.js      # 路线匹配器
├── lib/                 # 第三方库
│   ├── xlsx.full.min.js      # SheetJS 库
│   └── jszip.min.js          # JSZip 库
├── icons/               # 扩展图标
├── popup.html           # 扩展弹出页面
├── popup.js             # 弹出页面逻辑
└── manifest.json        # 扩展配置
```

## 配置说明

### 字段映射配置

`config/field_mapping.json` 文件定义了 XML 字段到 Excel 列的映射关系：

- `row_data_sources`：定义各类型数据的 XPath 来源
- `parent_data_sources`：定义各类型数据的父节点 XPath 来源
- `columns`：定义 Excel 列的映射规则
  - `column_letter`：Excel 列字母
  - `name`：字段名称
  - `data_type`：数据类型（string/number/date）
  - `mapping`：映射方式（row/parent/order_info/custom_code）
  - `custom_code`：自定义 JavaScript 代码，用于复杂字段计算

### 数据类型规则

- **数值字段 (number)**：空值输出 0
- **字符串字段 (string)**：空值输出 NULL

## 许可证

MIT License
