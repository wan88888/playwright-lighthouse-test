/**
 * 示例脚本：测试特定网站的性能和可访问性
 */
const { runFullTest, runLighthouseTest, captureScreenshot } = require('./index.js');
const path = require('path');

// 要测试的网站
const website = 'https://playwright.dev/'; // 使用更简单的网站进行测试

/**
 * 运行完整测试（使用新的runFullTest函数）
 */
async function runCompleteTest() {
  console.log(`开始完整测试网站: ${website}`);
  
  try {
    // 使用新的runFullTest函数，它会自动创建基于URL的子目录并捕获截图
    const results = await runFullTest(website, {
      outputFormat: 'html',
      categories: ['performance', 'accessibility', 'best-practices', 'seo']
    });
    
    if (results && results.lighthouse) {
      console.log('\n完整测试结果摘要:');
      
      // 输出所有类别的分数
      Object.keys(results.lighthouse.scores).forEach(category => {
        console.log(`- ${category}得分: ${results.lighthouse.scores[category].toFixed(1)}`);
      });
      
      console.log(`- HTML报告: ${results.lighthouse.filePath}`);
      console.log(`- JSON摘要: ${results.lighthouse.summaryPath}`);
      console.log(`- 截图路径: ${results.screenshotPath}`);
    }
    
    console.log('\n完整测试完成!');
    return results;
  } catch (error) {
    console.error('完整测试过程中发生错误:', error);
  }
}

/**
 * 单独运行Lighthouse测试
 */
async function runLighthouseOnly() {
  console.log(`开始Lighthouse测试网站: ${website}`);
  
  try {
    // 创建网站特定的输出目录
    const siteName = new URL(website).hostname.replace('www.', '');
    const outputDir = path.join('./reports', siteName);
    
    // 运行Lighthouse测试
    const results = await runLighthouseTest(website, {
      outputDir,
      outputFormat: 'html',
      onlyCategories: ['performance', 'accessibility']
    });
    
    if (results) {
      console.log('\nLighthouse测试结果摘要:');
      
      // 输出所有类别的分数
      Object.keys(results.scores).forEach(category => {
        console.log(`- ${category}得分: ${results.scores[category].toFixed(1)}`);
      });
      
      console.log(`- 报告路径: ${results.filePath}`);
    }
    
    console.log('\nLighthouse测试完成!');
    return results;
  } catch (error) {
    console.error('Lighthouse测试过程中发生错误:', error);
  }
}

/**
 * 单独捕获网页截图
 */
async function takeScreenshot() {
  console.log(`开始捕获网站截图: ${website}`);
  
  try {
    // 创建网站特定的输出目录
    const siteName = new URL(website).hostname.replace('www.', '');
    const outputDir = path.join('./reports', siteName);
    
    // 捕获网页截图
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(outputDir, `screenshot-${timestamp}.png`);
    
    await captureScreenshot(website, screenshotPath, {
      fullPage: true,
      deviceScaleFactor: 2 // 高分辨率截图
    });
    
    console.log(`截图已保存至: ${screenshotPath}`);
    console.log('\n截图捕获完成!');
    return screenshotPath;
  } catch (error) {
    console.error('截图捕获过程中发生错误:', error);
  }
}

// 运行测试示例
(async () => {
  console.log('运行完整测试示例...');
  await runCompleteTest();
  
  // 取消下面的注释可以单独运行其他测试
  // console.log('\n运行单独的Lighthouse测试...');
  // await runLighthouseOnly();
  
  // console.log('\n运行单独的截图捕获...');
  // await takeScreenshot();
})();