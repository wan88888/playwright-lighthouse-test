# Playwright + Lighthouse 网页性能与可访问性测试工具

这个工具使用 Playwright 和 Lighthouse 来衡量网页性能并识别可访问性问题。

## 功能

1. **网页性能衡量**：分析并报告关键性能指标，如首次内容绘制、最大内容绘制、交互时间等
2. **可访问性问题识别**：检测并报告网页中的可访问性问题，帮助开发者改进网页的无障碍访问
3. **自动截图**：捕获完整网页截图，便于视觉分析
4. **HTML报告生成**：生成详细的Lighthouse HTML报告，包含完整的性能和可访问性分析

## 安装

```bash
# 克隆仓库后安装依赖
npm install
```

## 使用方法

### 基本用法

```bash
# 测试默认网页 (example.com)
npm test

# 测试指定网页
node index.js https://www.your-website.com
```

### 在代码中使用

```javascript
const { runLighthouseTest, captureScreenshot } = require('./index.js');

// 运行Lighthouse测试
async function test() {
  // 捕获网页截图
  await captureScreenshot('https://www.example.com', './screenshot.png');
  
  // 运行性能和可访问性测试
  const results = await runLighthouseTest('https://www.example.com', {
    outputDir: './my-reports',
    outputFormat: 'html',
    onlyCategories: ['performance', 'accessibility']
  });
  
  console.log(`性能得分: ${results.performance}`);
  console.log(`可访问性得分: ${results.accessibility}`);
}

test();
```

## 配置选项

`runLighthouseTest` 函数接受以下配置选项：

- `outputDir`: 报告输出目录 (默认: './reports')
- `outputFormat`: 报告格式，可选 'html' 或 'json' (默认: 'html')
- `onlyCategories`: 要测试的类别数组 (默认: ['performance', 'accessibility', 'best-practices', 'seo'])
- `port`: Chrome远程调试端口 (默认: 9222)
- `createUrlSubDir`: 是否按URL创建子目录 (默认: true)

## 输出示例

运行测试后，工具将输出：

1. 性能和可访问性得分 (0-100)
2. 关键性能指标及其值
3. 发现的可访问性问题列表
4. HTML格式的完整Lighthouse报告
5. 网页完整截图

所有文件都保存在 `reports` 目录中（除非另有指定）。

## 要求

- Node.js 14+
- npm 或 yarn