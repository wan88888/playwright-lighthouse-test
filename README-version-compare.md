# Playwright + Lighthouse 版本对比测试工具

这个工具基于Playwright和Lighthouse，用于测试网站性能并与历史版本进行对比分析，帮助开发者追踪网站性能变化。

## 功能特点

- 固定测试单个指定网站，便于持续监控
- 自动保存每次测试结果到历史记录
- 与上次测试结果进行自动对比分析
- 生成直观的HTML对比报告，显示性能指标变化
- 突出显示改进和退步的性能指标

## 使用方法

### 直接运行

```bash
node version-compare.js
```

### 在代码中使用

```javascript
const { runVersionCompare } = require('./version-compare.js');

// 运行版本对比测试
async function runTest() {
  const results = await runVersionCompare();
  
  if (results.comparisonAvailable) {
    console.log(`对比报告已生成: ${results.reportPath}`);
    console.log(`改进项数量: ${results.comparison.improved.length}`);
    console.log(`退步项数量: ${results.comparison.degraded.length}`);
  } else {
    console.log('首次测试，结果已保存，下次测试时将自动进行对比');
  }
}

runTest();
```

## 自定义测试网站

默认情况下，工具会测试`https://playwright.dev/`网站。如果需要测试其他网站，可以修改`version-compare.js`文件中的`website`变量：

```javascript
// 要测试的网站（可以根据需要修改）
const website = 'https://your-website.com/';
```

## 输出文件说明

工具会在`reports/<网站域名>/`目录下生成以下文件：

- **history/**: 包含所有历史测试记录的JSON文件
- **comparisons/**: 包含所有对比报告的HTML和JSON文件
- **lighthouse-*.html**: Lighthouse测试报告
- **summary-*.json**: 测试结果摘要
- **screenshot-*.png**: 网站截图

## 对比报告内容

对比报告包含以下内容：

1. **性能得分对比**：显示各项性能指标的得分变化
2. **改进项和退步项**：突出显示有明显变化的指标
3. **详细得分对比**：包含所有类别的具体得分和变化百分比
4. **关键性能指标对比**：如首次内容绘制、最大内容绘制、累积布局偏移等指标的变化

## API 参考

### runVersionCompare()

运行版本对比测试，返回测试结果和对比信息。

### saveToHistory(results)

将测试结果保存到历史记录。

### getRecentHistory(count)

获取最近的历史记录，默认获取1条。

### compareResults(currentResult, previousResult)

比较两次测试结果并生成对比数据。

### generateComparisonReport(comparison)

根据对比数据生成HTML对比报告。