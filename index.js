const { chromium } = require('playwright');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 由于Lighthouse是ES模块，我们需要创建一个包装函数来使用它
async function getLighthouse() {
  try {
    const lighthouseModule = await import('lighthouse');
    return lighthouseModule.default;
  } catch (error) {
    console.error('加载Lighthouse模块失败:', error);
    return null;
  }
}

/**
 * 使用Playwright和Lighthouse衡量网页性能和识别可访问性问题
 * @param {string} url - 要测试的网页URL
 * @param {object} options - 配置选项
 */
async function runLighthouseTest(testUrl, options = {}) {
  console.log(`开始测试网页: ${testUrl}`);
  
  // 设置默认选项
  const defaultOptions = {
    outputDir: './reports',
    outputFormat: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    port: 9222,
    createUrlSubDir: true
  };
  
  const config = { ...defaultOptions, ...options };
  
  // 创建基于URL的子目录
  let outputDir = config.outputDir;
  if (config.createUrlSubDir) {
    try {
      const parsedUrl = new URL(testUrl);
      const siteName = parsedUrl.hostname.replace('www.', '');
      outputDir = path.join(config.outputDir, siteName);
    } catch (error) {
      console.warn(`无法解析URL创建子目录: ${error.message}，将使用默认输出目录`);
    }
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let chrome;
  try {
    // 启动Chrome
    console.log('启动Chrome浏览器...');
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ],
      logLevel: 'error',
      connectionPollInterval: 500,
      maxConnectionRetries: 10,
      startingPort: config.port
    });
    
    // 确保Chrome已完全启动
    console.log(`Chrome已启动，调试端口: ${chrome.port}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 获取Lighthouse模块
    const lighthouse = await getLighthouse();
    if (!lighthouse) {
      throw new Error('无法加载Lighthouse模块');
    }
    
    // 配置Lighthouse选项
    const lighthouseOptions = {
      logLevel: 'info',
      output: config.outputFormat,
      onlyCategories: config.onlyCategories,
      port: chrome.port,
      disableStorageReset: true,
      throttlingMethod: 'simulate'
    };
    
    // 运行Lighthouse审计
    console.log('运行Lighthouse审计...');
    console.log(`使用端口 ${chrome.port} 连接到Chrome...`);
    const runnerResult = await lighthouse(testUrl, lighthouseOptions);
    
    // 处理报告
    if (runnerResult && runnerResult.report) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `lighthouse-${timestamp}`;
      const filePath = path.join(outputDir, `${fileName}.${config.outputFormat}`);
      
      fs.writeFileSync(filePath, runnerResult.report);
      console.log(`报告已保存至: ${filePath}`);
      
      // 输出性能和可访问性得分
      const scores = {};
      const categories = runnerResult.lhr.categories;
      
      // 收集所有类别的分数
      Object.keys(categories).forEach(key => {
        scores[key] = categories[key].score * 100;
        console.log(`${categories[key].title}评分: ${scores[key].toFixed(1)}`);
      });
      
      // 输出性能指标
      console.log('\n主要性能指标:');
      const metrics = runnerResult.lhr.audits;
      const keyMetrics = [
        'first-contentful-paint',
        'largest-contentful-paint',
        'speed-index',
        'total-blocking-time',
        'cumulative-layout-shift',
        'interactive',
        'server-response-time',
        'max-potential-fid'
      ];
      
      const metricsData = {};
      keyMetrics.forEach(metric => {
        if (metrics[metric]) {
          metricsData[metric] = {
            title: metrics[metric].title,
            value: metrics[metric].displayValue,
            score: metrics[metric].score,
            description: metrics[metric].description
          };
          console.log(`- ${metrics[metric].title}: ${metrics[metric].displayValue}`);
          if (metrics[metric].score < 0.9) {
            console.log(`  改进建议: ${metrics[metric].description}`);
          }
        }
      });
      
      // 输出可访问性问题
      console.log('\n可访问性问题:');
      const accessibilityIssues = Object.values(runnerResult.lhr.audits)
        .filter(audit => audit.group === 'accessibility' && audit.score !== 1);
      
      if (accessibilityIssues.length > 0) {
        console.log(`发现 ${accessibilityIssues.length} 个可访问性问题:`);
        accessibilityIssues.forEach(issue => {
          console.log(`- ${issue.title}`);
          console.log(`  问题描述: ${issue.description}`);
          if (issue.details && issue.details.items) {
            console.log(`  影响元素: ${issue.details.items.length} 个`);
          }
        });
      } else {
        console.log('未发现可访问性问题');
      }
      
      // 创建JSON摘要报告
      const summaryData = {
        url: testUrl,
        timestamp,
        scores,
        metrics: metricsData,
        accessibilityIssues: accessibilityIssues.map(issue => ({
          title: issue.title,
          description: issue.description,
          impact: issue.details?.items?.length || 0
        }))
      };
      
      const summaryPath = path.join(outputDir, `summary-${timestamp}.json`);
      fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
      console.log(`摘要报告已保存至: ${summaryPath}`);
      
      return {
        filePath,
        summaryPath,
        scores,
        metrics: metricsData,
        accessibilityIssues
      };
    } else {
      throw new Error('Lighthouse未能生成报告');
    }
  } catch (error) {
    console.error('Lighthouse测试失败:', error);
    throw error; // 重新抛出错误以便调用者处理
  } finally {
    // 关闭Chrome
    if (chrome) {
      try {
        await chrome.kill();
        console.log('Chrome浏览器已关闭');
      } catch (error) {
        console.error('关闭Chrome时出错:', error);
      }
    }
  }
}

/**
 * 使用Playwright捕获网页截图
 * @param {string} url - 要截图的网页URL
 * @param {string} outputPath - 截图保存路径
 * @param {object} options - 截图选项
 * @returns {Promise<string>} 截图保存路径
 */
async function captureScreenshot(url, outputPath, options = {}) {
  console.log(`开始捕获网页截图: ${url}`);
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const defaultOptions = {
    fullPage: true,
    timeout: 30000,
    waitUntil: 'networkidle',
    deviceScaleFactor: 1
  };
  
  const screenshotOptions = { ...defaultOptions, ...options };
  
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      deviceScaleFactor: screenshotOptions.deviceScaleFactor
    });
    const page = await context.newPage();
    
    // 设置超时
    page.setDefaultTimeout(screenshotOptions.timeout);
    
    // 导航到页面
    await page.goto(url, { 
      waitUntil: screenshotOptions.waitUntil,
      timeout: screenshotOptions.timeout 
    });
    
    // 等待页面稳定
    await page.waitForLoadState('networkidle');
    
    // 捕获截图
    await page.screenshot({ 
      path: outputPath, 
      fullPage: screenshotOptions.fullPage 
    });
    
    console.log(`截图已保存至: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('截图捕获失败:', error);
    throw error; // 重新抛出错误以便调用者处理
  } finally {
    await browser.close();
  }
}

/**
 * 运行完整的网页测试，包括截图和Lighthouse性能分析
 * @param {string} testUrl - 要测试的网页URL
 * @param {object} options - 测试选项
 * @returns {Promise<object>} 测试结果
 */
async function runFullTest(testUrl, options = {}) {
  console.log(`开始对 ${testUrl} 进行完整测试...`);
  
  const defaultOptions = {
    outputDir: './reports',
    outputFormat: 'html',
    createUrlSubDir: true,
    categories: ['performance', 'accessibility', 'best-practices', 'seo'],
    captureScreenshot: true
  };
  
  const config = { ...defaultOptions, ...options };
  
  // 创建基于URL的子目录
  let outputDir = config.outputDir;
  if (config.createUrlSubDir) {
    try {
      const parsedUrl = new URL(testUrl);
      const siteName = parsedUrl.hostname.replace('www.', '');
      outputDir = path.join(config.outputDir, siteName);
    } catch (error) {
      console.warn(`无法解析URL创建子目录: ${error.message}，将使用默认输出目录`);
    }
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const results = {};
    
    // 捕获截图
    if (config.captureScreenshot) {
      const screenshotPath = path.join(outputDir, `screenshot-${timestamp}.png`);
      results.screenshotPath = await captureScreenshot(testUrl, screenshotPath);
    }
    
    // 运行Lighthouse测试
    results.lighthouse = await runLighthouseTest(testUrl, {
      outputDir,
      outputFormat: config.outputFormat,
      onlyCategories: config.categories,
      createUrlSubDir: false // 已经创建了子目录
    });
    
    console.log('\n测试完成!');
    return results;
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  // 默认测试URL
  const testUrl = process.argv[2] || 'https://www.example.com';
  
  // 运行测试
  (async () => {
    try {
      await runFullTest(testUrl);
    } catch (error) {
      console.error('测试失败:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  runLighthouseTest,
  captureScreenshot,
  runFullTest,
  getLighthouse
};