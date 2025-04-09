# Playwright + Lighthouse 批量网站测试工具

## 功能介绍

这个工具允许您批量测试多个网站的性能和可访问性，并生成汇总报告。主要功能包括：

- 从配置文件读取多个网站URL
- 对每个网站执行Lighthouse性能和可访问性测试
- 为每个网站捕获高质量截图
- 生成HTML和JSON格式的汇总报告
- 计算所有网站的平均性能指标

## 使用方法

### 1. 配置网站列表

在项目根目录下创建或编辑`websites.json`文件，格式如下：

```json
{
  "websites": [
    "https://example.com/",
    "https://another-site.com/",
    "https://third-site.org/"
  ],
  "testOptions": {
    "outputFormat": "html",
    "categories": ["performance", "accessibility", "best-practices", "seo"],
    "screenshotOptions": {
      "fullPage": true,
      "deviceScaleFactor": 2
    }
  }
}
```

### 2. 运行批量测试

```bash
node batch-test.js
```

或者在您的代码中引用：

```javascript
const { batchTest } = require('./batch-test.js');

// 使用默认配置文件 (./websites.json)
async function runTests() {
  const results = await batchTest();
  console.log(`测试完成，共测试 ${results.totalWebsites} 个网站`);
}

// 或指定配置文件路径
async function runTestsWithCustomConfig() {
  const results = await batchTest('./custom-config.json');
  console.log(`测试完成，共测试 ${results.totalWebsites} 个网站`);
}

runTests();
```

## 输出结果

批量测试完成后，将在`reports/batch-summary-[timestamp]`目录下生成以下文件：

- `batch-summary.html` - 包含所有网站测试结果的HTML报告，包括性能分数和平均值
- `batch-summary.json` - 包含详细测试数据的JSON文件

此外，每个网站的详细测试报告和截图将保存在各自的目录中（例如`reports/example.com/`）。

## 自定义选项

您可以在`websites.json`的`testOptions`部分自定义以下选项：

- `outputFormat`: 输出格式，可选值为`html`或`json`
- `categories`: 要测试的Lighthouse类别数组
- `screenshotOptions`: 截图选项
  - `fullPage`: 是否捕获整个页面（默认：true）
  - `deviceScaleFactor`: 设备缩放比例，用于高分辨率截图（默认：2）

## 故障排除

如果遇到问题，请检查：

1. 确保已安装所有依赖：`npm install`
2. 确保配置文件格式正确
3. 检查网站URL是否可访问
4. 如果测试失败，查看控制台输出的错误信息