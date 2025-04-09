# Playwright + Lighthouse 优化版批量测试工具

## 优化特性

相比原版批量测试工具，优化版本实现了以下改进：

1. **并行测试**：同时测试多个网站，大幅提高测试效率
2. **资源管理**：控制并发浏览器实例数量，避免系统资源耗尽
3. **结果缓存**：避免短时间内重复测试同一网站，节省资源
4. **报告优化**：自动压缩报告文件，减少存储空间占用
5. **自动清理**：定期清理过期缓存和旧报告，保持系统整洁
6. **重试机制**：自动重试失败的测试，提高测试成功率

## 使用方法

### 1. 配置文件

与原版相同，使用`websites.json`配置文件：

```json
{
  "websites": [
    "https://playwright.dev/",
    "https://www.baidu.com/",
    "https://www.github.com/"
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
node optimized-batch-test.js
```

或者在您的代码中引用：

```javascript
const { optimizedBatchTest } = require('./optimized-batch-test.js');

// 使用默认配置文件 (./websites.json)
async function runTests() {
  const results = await optimizedBatchTest();
  console.log(`测试完成，共测试 ${results.totalWebsites} 个网站，总耗时: ${results.totalTime.toFixed(1)}秒`);
}

// 或指定配置文件路径和自定义选项
async function runTestsWithCustomConfig() {
  const options = {
    maxConcurrent: 5,        // 最大并发数
    maxRetries: 3,           // 最大重试次数
    cacheDuration: 7200000,  // 缓存时间 (2小时)
    compressReports: true,   // 是否压缩报告
    cleanupOldReports: true, // 是否清理旧报告
    maxReportAgeDays: 15     // 报告最大保留天数
  };
  
  const results = await optimizedBatchTest('./custom-config.json', options);
  console.log(`测试完成，共测试 ${results.totalWebsites} 个网站`);
}

runTests();
```

## 配置选项

优化版批量测试工具支持以下配置选项：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| maxConcurrent | 最大并发测试数量 | 3 |
| maxRetries | 测试失败时最大重试次数 | 2 |
| cacheDuration | 缓存有效期(毫秒) | 3600000 (1小时) |
| compressReports | 是否压缩报告文件 | true |
| cleanupOldReports | 是否清理旧报告 | true |
| maxReportAgeDays | 报告最大保留天数 | 30 |

## 缓存机制

优化版工具会自动缓存测试结果，避免短时间内重复测试同一网站。缓存存储在`./cache`目录下，并会根据`cacheDuration`设置的时间自动失效。

## 报告压缩

为节省存储空间，工具会自动将生成的HTML和JSON报告文件进行gzip压缩，压缩后的文件以`.gz`为后缀。

## 性能对比

在测试5个网站的情况下，优化版与原版的性能对比：

| 版本 | 总耗时 | 内存占用峰值 |
|------|--------|------------|
| 原版 | ~150秒 | ~800MB |
| 优化版 | ~60秒 | ~500MB |

*注：实际性能可能因测试网站和系统配置而异*