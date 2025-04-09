/**
 * 优化版批量网站性能与可访问性测试脚本
 * 实现并行测试、资源管理、结果缓存、报告优化和重试机制
 */
const { runFullTest, runLighthouseTest, captureScreenshot } = require('./index.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const zlib = require('zlib');

// 压缩工具
const gzip = util.promisify(zlib.gzip);

// 读取配置文件
function loadConfig(configPath = './websites.json') {
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`读取配置文件失败: ${error.message}`);
    return { websites: [] };
  }
}

/**
 * 资源管理器 - 控制并发浏览器实例数量
 */
class ResourceManager {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return true;
    }
    
    // 等待资源释放
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    if (this.queue.length > 0) {
      // 从队列中取出下一个等待的任务并执行
      const next = this.queue.shift();
      next(true);
    } else {
      this.running--;
    }
  }
}

/**
 * 结果缓存管理器 - 避免短时间内重复测试
 */
class ResultCache {
  constructor(cacheDuration = 3600000) { // 默认缓存1小时
    this.cache = new Map();
    this.cacheDuration = cacheDuration;
    this.cacheDir = path.join('./cache');
    
    // 确保缓存目录存在
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // 加载持久化缓存
    this.loadCache();
  }

  // 生成缓存键
  generateKey(url, options) {
    const data = JSON.stringify({ url, options });
    return crypto.createHash('md5').update(data).digest('hex');
  }

  // 检查是否有有效缓存
  has(url, options) {
    const key = this.generateKey(url, options);
    if (!this.cache.has(key)) return false;
    
    const { timestamp } = this.cache.get(key);
    const isValid = (Date.now() - timestamp) < this.cacheDuration;
    
    // 如果缓存无效，删除它
    if (!isValid) {
      this.cache.delete(key);
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    }
    
    return isValid;
  }

  // 获取缓存结果
  get(url, options) {
    const key = this.generateKey(url, options);
    if (!this.has(url, options)) return null;
    
    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      if (fs.existsSync(cacheFile)) {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`使用缓存结果: ${url}`);
        return data.result;
      }
    } catch (error) {
      console.error(`读取缓存失败: ${error.message}`);
    }
    
    return null;
  }

  // 设置缓存结果
  async set(url, options, result) {
    const key = this.generateKey(url, options);
    const cacheData = {
      timestamp: Date.now(),
      result
    };
    
    this.cache.set(key, { timestamp: cacheData.timestamp });
    
    try {
      // 将结果写入文件
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData));
    } catch (error) {
      console.error(`保存缓存失败: ${error.message}`);
    }
  }

  // 加载持久化缓存
  loadCache() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const key = file.replace('.json', '');
          const cacheFile = path.join(this.cacheDir, file);
          const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          this.cache.set(key, { timestamp: data.timestamp });
        }
      }
      console.log(`已加载 ${this.cache.size} 个缓存项`);
    } catch (error) {
      console.error(`加载缓存失败: ${error.message}`);
    }
  }

  // 清理过期缓存
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, { timestamp }] of this.cache.entries()) {
      if ((now - timestamp) >= this.cacheDuration) {
        this.cache.delete(key);
        const cacheFile = path.join(this.cacheDir, `${key}.json`);
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`已清理 ${cleaned} 个过期缓存项`);
    }
  }
}

/**
 * 测试单个网站，包含重试逻辑
 * @param {string} website - 网站URL
 * @param {object} options - 测试选项
 * @param {ResourceManager} resourceManager - 资源管理器
 * @param {ResultCache} resultCache - 结果缓存
 * @param {number} maxRetries - 最大重试次数
 */
async function testWebsite(website, options, resourceManager, resultCache, maxRetries = 3) {
  // 检查缓存
  if (resultCache.has(website, options)) {
    return resultCache.get(website, options);
  }
  
  // 获取资源许可
  await resourceManager.acquire();
  
  let retries = 0;
  let lastError = null;
  
  // 增强测试选项，处理导航和超时问题
  const enhancedOptions = { ...options };
  
  // 设置更可靠的导航等待条件和更长的超时时间
  enhancedOptions.screenshotOptions = {
    ...enhancedOptions.screenshotOptions,
    waitUntil: 'domcontentloaded', // 改为更可靠的导航完成条件
    timeout: 60000, // 增加超时时间到60秒
  };
  
  while (retries <= maxRetries) {
    try {
      console.log(`测试网站: ${website}${retries > 0 ? ` (重试 ${retries}/${maxRetries})` : ''}`);
      
      // 根据重试次数调整策略
      if (retries > 0) {
        // 每次重试增加超时时间
        enhancedOptions.screenshotOptions.timeout = 60000 + (retries * 30000);
        
        // 第二次重试时切换到更基本的导航等待条件
        if (retries >= 2) {
          enhancedOptions.screenshotOptions.waitUntil = 'load';
          console.log(`使用基本导航等待条件: 'load'`);
        }
      }
      
      // 执行完整测试前添加预热步骤
      if (retries > 0) {
        try {
          // 预热连接，使用简单的fetch请求
          console.log(`预热连接到 ${website}...`);
          await new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const client = website.startsWith('https') ? https : http;
            
            const req = client.get(website, (res) => {
              res.on('data', () => {}); // 忽略数据
              res.on('end', resolve);
            });
            
            req.on('error', (err) => {
              console.log(`预热连接失败: ${err.message}，继续测试...`);
              resolve(); // 即使预热失败也继续
            });
            
            req.setTimeout(10000, () => {
              req.destroy();
              console.log('预热连接超时，继续测试...');
              resolve(); // 超时后继续
            });
          });
          
          // 预热后等待一段时间
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (warmupError) {
          console.log(`预热过程出错: ${warmupError.message}，继续测试...`);
          // 预热失败不影响主测试
        }
      }
      
      // 执行完整测试
      const results = await runFullTest(website, enhancedOptions);
      
      if (results && results.lighthouse) {
        console.log('测试完成，结果摘要:');
        
        // 输出所有类别的分数
        Object.keys(results.lighthouse.scores).forEach(category => {
          console.log(`- ${category}得分: ${results.lighthouse.scores[category].toFixed(1)}`);
        });
        
        // 缓存结果
        await resultCache.set(website, options, results);
        
        // 释放资源
        resourceManager.release();
        
        return results;
      }
      
      throw new Error('测试未返回有效结果');
    } catch (error) {
      lastError = error;
      console.error(`测试网站 ${website} 时发生错误:`, error.message);
      
      // 特殊处理Lighthouse导航标记错误
      if (error.message.includes('start lh:driver:navigate') && retries < maxRetries) {
        console.log('检测到Lighthouse导航标记问题，尝试使用替代方法...');
        // 下次重试时使用不同的导航策略
        enhancedOptions.screenshotOptions.waitUntil = 'load';
      }
      
      if (retries < maxRetries) {
        retries++;
        // 指数退避策略，每次重试等待时间增加
        const waitTime = retries * 5000;
        console.log(`等待 ${waitTime/1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        break;
      }
    }
  }
  
  // 释放资源
  resourceManager.release();
  
  // 所有重试都失败
  return {
    url: website,
    error: lastError ? lastError.message : '未知错误'
  };
}

/**
 * 压缩报告文件
 * @param {string} filePath - 文件路径
 */
async function compressFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const compressed = await gzip(content);
    const gzipPath = `${filePath}.gz`;
    fs.writeFileSync(gzipPath, compressed);
    console.log(`已压缩文件: ${gzipPath}`);
    return gzipPath;
  } catch (error) {
    console.error(`压缩文件失败: ${error.message}`);
    return null;
  }
}

/**
 * 清理旧报告
 * @param {string} reportsDir - 报告目录
 * @param {number} maxAgeDays - 最大保留天数
 */
async function cleanupOldReports(reportsDir = './reports', maxAgeDays = 30) {
  try {
    if (!fs.existsSync(reportsDir)) return;
    
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    
    // 读取报告目录
    const items = fs.readdirSync(reportsDir);
    
    for (const item of items) {
      const itemPath = path.join(reportsDir, item);
      const stats = fs.statSync(itemPath);
      
      // 检查是否是批量报告目录
      if (stats.isDirectory() && item.startsWith('batch-summary-')) {
        const age = now - stats.mtimeMs;
        
        if (age > maxAgeMs) {
          // 删除整个目录
          fs.rmSync(itemPath, { recursive: true, force: true });
          removed++;
        }
      }
    }
    
    if (removed > 0) {
      console.log(`已清理 ${removed} 个旧报告目录`);
    }
  } catch (error) {
    console.error(`清理旧报告失败: ${error.message}`);
  }
}

/**
 * 优化版批量测试多个网站
 * @param {string} configPath - 配置文件路径
 * @param {object} options - 批量测试选项
 */
async function optimizedBatchTest(configPath = './websites.json', options = {}) {
  console.log(`开始优化版批量网站测试，配置文件: ${configPath}`);
  
  // 默认选项
  const defaultOptions = {
    maxConcurrent: 3,         // 最大并发数
    maxRetries: 2,            // 最大重试次数
    cacheDuration: 3600000,   // 缓存时间 (1小时)
    compressReports: true,    // 是否压缩报告
    cleanupOldReports: true,  // 是否清理旧报告
    maxReportAgeDays: 30      // 报告最大保留天数
  };
  
  const batchOptions = { ...defaultOptions, ...options };
  
  // 加载配置
  const config = loadConfig(configPath);
  
  if (!config.websites || config.websites.length === 0) {
    console.error('配置文件中未找到网站列表或列表为空');
    return;
  }
  
  console.log(`找到 ${config.websites.length} 个网站需要测试`);
  console.log(`最大并发数: ${batchOptions.maxConcurrent}`);
  
  // 创建汇总报告目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryDir = path.join('./reports', `batch-summary-${timestamp}`);
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }
  
  // 初始化资源管理器和缓存
  const resourceManager = new ResourceManager(batchOptions.maxConcurrent);
  const resultCache = new ResultCache(batchOptions.cacheDuration);
  
  // 清理过期缓存
  resultCache.cleanup();
  
  // 清理旧报告
  if (batchOptions.cleanupOldReports) {
    await cleanupOldReports('./reports', batchOptions.maxReportAgeDays);
  }
  
  // 汇总结果
  const batchResults = [];
  const startTime = Date.now();
  
  // 并行测试所有网站
  const testPromises = config.websites.map(async (website, index) => {
    try {
      // 使用配置文件中的选项或默认选项
      const testOptions = config.testOptions || {
        outputFormat: 'html',
        categories: ['performance', 'accessibility', 'best-practices', 'seo']
      };
      
      // 执行测试
      const results = await testWebsite(
        website, 
        testOptions, 
        resourceManager, 
        resultCache,
        batchOptions.maxRetries
      );
      
      // 添加到批量结果
      if (results.error) {
        batchResults.push({
          url: website,
          error: results.error
        });
      } else {
        batchResults.push({
          url: website,
          scores: results.lighthouse.scores,
          reportPath: results.lighthouse.filePath,
          screenshotPath: results.screenshotPath
        });
        
        // 压缩报告
        if (batchOptions.compressReports) {
          await compressFile(results.lighthouse.filePath);
          if (results.lighthouse.summaryPath) {
            await compressFile(results.lighthouse.summaryPath);
          }
        }
      }
      
      console.log(`完成 [${index+1}/${config.websites.length}] ${website}`);
    } catch (error) {
      console.error(`处理网站 ${website} 时发生错误:`, error);
      batchResults.push({
        url: website,
        error: error.message
      });
    }
  });
  
  // 等待所有测试完成
  await Promise.all(testPromises);
  
  // 计算总耗时
  const totalTime = (Date.now() - startTime) / 1000;
  
  // 生成汇总报告
  await generateSummaryReport(batchResults, summaryDir, totalTime);
  
  console.log(`\n批量测试完成! 共测试 ${config.websites.length} 个网站，总耗时: ${totalTime.toFixed(1)}秒`);
  console.log(`汇总报告保存在: ${summaryDir}`);
  
  return {
    totalWebsites: config.websites.length,
    results: batchResults,
    summaryDir,
    totalTime
  };
}

/**
 * 生成汇总报告
 * @param {Array} results - 批量测试结果
 * @param {string} outputDir - 输出目录
 * @param {number} totalTime - 总耗时(秒)
 */
async function generateSummaryReport(results, outputDir, totalTime) {
  console.log('\n生成汇总报告...');
  
  // 创建JSON汇总报告
  const summaryData = {
    timestamp: new Date().toISOString(),
    totalWebsites: results.length,
    successfulTests: results.filter(r => !r.error).length,
    failedTests: results.filter(r => r.error).length,
    totalTime,
    results: results
  };
  
  // 计算平均分数
  const averageScores = {};
  const successfulResults = results.filter(r => r.scores);
  
  if (successfulResults.length > 0) {
    // 获取所有可能的类别
    const categories = new Set();
    successfulResults.forEach(result => {
      Object.keys(result.scores).forEach(category => categories.add(category));
    });
    
    // 计算每个类别的平均分数
    categories.forEach(category => {
      const sum = successfulResults
        .filter(r => r.scores[category] !== undefined)
        .reduce((acc, r) => acc + r.scores[category], 0);
      
      const count = successfulResults.filter(r => r.scores[category] !== undefined).length;
      averageScores[category] = count > 0 ? sum / count : 0;
    });
    
    summaryData.averageScores = averageScores;
  }
  
  // 保存JSON汇总报告
  const jsonPath = path.join(outputDir, 'batch-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summaryData, null, 2));
  
  // 生成HTML汇总报告
  const htmlReport = generateHtmlReport(summaryData);
  const htmlPath = path.join(outputDir, 'batch-summary.html');
  fs.writeFileSync(htmlPath, htmlReport);
  
  console.log(`汇总JSON报告: ${jsonPath}`);
  console.log(`汇总HTML报告: ${htmlPath}`);
  
  // 压缩汇总报告
  await compressFile(jsonPath);
}

/**
 * 生成HTML格式的汇总报告
 * @param {Object} data - 汇总数据
 * @returns {string} HTML报告内容
 */
function generateHtmlReport(data) {
  // 格式化日期
  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };
  
  // 生成网站结果表格行
  const generateResultRows = () => {
    return data.results.map((result, index) => {
      if (result.error) {
        return `
          <tr class="error-row">
            <td>${index + 1}</td>
            <td>${result.url}</td>
            <td colspan="4" class="error-message">测试失败: ${result.error}</td>
          </tr>
        `;
      }
      
      // 生成分数单元格
      const scoreColumns = ['performance', 'accessibility', 'best-practices', 'seo']
        .map(category => {
          const score = result.scores[category];
          if (score === undefined) return '<td>N/A</td>';
          
          let colorClass = '';
          if (score >= 90) colorClass = 'score-good';
          else if (score >= 50) colorClass = 'score-average';
          else colorClass = 'score-poor';
          
          return `<td class="${colorClass}">${score.toFixed(1)}</td>`;
        })
        .join('');
      
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${result.url}</td>
          ${scoreColumns}
        </tr>
      `;
    }).join('');
  };
  
  // 生成平均分数表格行
  const generateAverageScoreRow = () => {
    if (!data.averageScores) return '';
    
    const scoreColumns = ['performance', 'accessibility', 'best-practices', 'seo']
      .map(category => {
        const score = data.averageScores[category];
        if (score === undefined) return '<td>N/A</td>';
        
        let colorClass = '';
        if (score >= 90) colorClass = 'score-good';
        else if (score >= 50) colorClass = 'score-average';
        else colorClass = 'score-poor';
        
        return `<td class="${colorClass}">${score.toFixed(1)}</td>`;
      })
      .join('');
    
    return `
      <tr class="average-row">
        <td colspan="2">平均分数</td>
        ${scoreColumns}
      </tr>
    `;
  };
  
  // 生成HTML报告
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>批量网站测试汇总报告</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        h1, h2 {
          color: #2c3e50;
        }
        .summary-box {
          background-color: #f8f9fa;
          border-radius: 5px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .summary-item {
          margin-bottom: 10px;
        }
        .summary-label {
          font-weight: bold;
          display: inline-block;
          width: 180px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th, td {
          padding: 12px 15px;
          border: 1px solid #ddd;
          text-align: left;
        }
        th {
          background-color: #4CAF50;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f2f2f2;
        }
        .error-row {
          background-color: #ffebee;
        }
        .error-message {
          color: #d32f2f;
        }
        .score-good {
          background-color: #c8e6c9;
          color: #2e7d32;
          font-weight: bold;
        }
        .score-average {
          background-color: #fff9c4;
          color: #f57f17;
          font-weight: bold;
        }
        .score-poor {
          background-color: #ffcdd2;
          color: #c62828;
          font-weight: bold;
        }
        .average-row {
          background-color: #e8eaf6;
          font-weight: bold;
        }
        .performance-chart {
          margin-top: 30px;
        }
      </style>
    </head>
    <body>
      <h1>批量网站测试汇总报告</h1>
      
      <div class="summary-box">
        <div class="summary-item">
          <span class="summary-label">测试时间:</span>
          <span>${formatDate(data.timestamp)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">测试网站总数:</span>
          <span>${data.totalWebsites}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">成功测试数:</span>
          <span>${data.successfulTests}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">失败测试数:</span>
          <span>${data.failedTests}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">总耗时:</span>
          <span>${data.totalTime ? data.totalTime.toFixed(1) + '秒' : 'N/A'}</span>
        </div>
      </div>
      
      <h2>测试结果</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>网站</th>
            <th>性能</th>
            <th>可访问性</th>
            <th>最佳实践</th>
            <th>SEO</th>
          </tr>
        </thead>
        <tbody>
          ${generateResultRows()}
          ${generateAverageScoreRow()}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// 如果直接运行此脚本
if (require.main === module) {
  // 默认配置文件路径
  const configPath = process.argv[2] || './websites.json';
  
  // 运行批量测试
  (async () => {
    try {
      await optimizedBatchTest(configPath);
    } catch (error) {
      console.error('批量测试失败:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  optimizedBatchTest,
  testWebsite,
  ResourceManager,
  ResultCache,
  compressFile,
  cleanupOldReports
};