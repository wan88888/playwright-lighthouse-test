/**
 * 批量网站性能与可访问性测试脚本
 * 从配置文件读取网站列表并执行测试
 */
const { runFullTest, runLighthouseTest, captureScreenshot } = require('./index.js');
const fs = require('fs');
const path = require('path');

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
 * 批量测试多个网站
 * @param {string} configPath - 配置文件路径
 */
async function batchTest(configPath = './websites.json') {
  console.log(`开始批量网站测试，配置文件: ${configPath}`);
  
  // 加载配置
  const config = loadConfig(configPath);
  
  if (!config.websites || config.websites.length === 0) {
    console.error('配置文件中未找到网站列表或列表为空');
    return;
  }
  
  console.log(`找到 ${config.websites.length} 个网站需要测试`);
  
  // 创建汇总报告目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryDir = path.join('./reports', `batch-summary-${timestamp}`);
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }
  
  // 汇总结果
  const batchResults = [];
  
  // 对每个网站执行测试
  for (let i = 0; i < config.websites.length; i++) {
    const website = config.websites[i];
    console.log(`\n[${i+1}/${config.websites.length}] 测试网站: ${website}`);
    
    try {
      // 使用配置文件中的选项或默认选项
      const testOptions = config.testOptions || {
        outputFormat: 'html',
        categories: ['performance', 'accessibility', 'best-practices', 'seo']
      };
      
      // 执行完整测试
      const results = await runFullTest(website, testOptions);
      
      if (results && results.lighthouse) {
        console.log('测试完成，结果摘要:');
        
        // 输出所有类别的分数
        Object.keys(results.lighthouse.scores).forEach(category => {
          console.log(`- ${category}得分: ${results.lighthouse.scores[category].toFixed(1)}`);
        });
        
        // 添加到批量结果
        batchResults.push({
          url: website,
          scores: results.lighthouse.scores,
          reportPath: results.lighthouse.filePath,
          screenshotPath: results.screenshotPath
        });
      }
    } catch (error) {
      console.error(`测试网站 ${website} 时发生错误:`, error);
      batchResults.push({
        url: website,
        error: error.message
      });
    }
  }
  
  // 生成汇总报告
  await generateSummaryReport(batchResults, summaryDir);
  
  console.log(`\n批量测试完成! 共测试 ${config.websites.length} 个网站`);
  console.log(`汇总报告保存在: ${summaryDir}`);
  
  return {
    totalWebsites: config.websites.length,
    results: batchResults,
    summaryDir
  };
}

/**
 * 生成汇总报告
 * @param {Array} results - 批量测试结果
 * @param {string} outputDir - 输出目录
 */
async function generateSummaryReport(results, outputDir) {
  console.log('\n生成汇总报告...');
  
  // 创建JSON汇总报告
  const summaryData = {
    timestamp: new Date().toISOString(),
    totalWebsites: results.length,
    successfulTests: results.filter(r => !r.error).length,
    failedTests: results.filter(r => r.error).length,
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
  
  // 生成平均分数行
  const generateAverageRow = () => {
    if (!data.averageScores) return '';
    
    const averageColumns = ['performance', 'accessibility', 'best-practices', 'seo']
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
        <td colspan="2"><strong>平均分数</strong></td>
        ${averageColumns}
      </tr>
    `;
  };
  
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>网站性能与可访问性批量测试报告</title>
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
          border-left: 5px solid #4285f4;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          padding: 12px 15px;
          border: 1px solid #ddd;
          text-align: left;
        }
        th {
          background-color: #4285f4;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f2f2f2;
        }
        .score-good {
          background-color: #d4edda;
          color: #155724;
        }
        .score-average {
          background-color: #fff3cd;
          color: #856404;
        }
        .score-poor {
          background-color: #f8d7da;
          color: #721c24;
        }
        .error-row {
          background-color: #f8d7da;
        }
        .error-message {
          color: #721c24;
        }
        .average-row {
          background-color: #e2e3e5;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>网站性能与可访问性批量测试报告</h1>
      
      <div class="summary-box">
        <h2>测试摘要</h2>
        <p><strong>测试时间:</strong> ${formatDate(data.timestamp)}</p>
        <p><strong>测试网站总数:</strong> ${data.totalWebsites}</p>
        <p><strong>成功测试:</strong> ${data.successfulTests}</p>
        <p><strong>失败测试:</strong> ${data.failedTests}</p>
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
          ${generateAverageRow()}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// 如果直接运行此脚本，执行批量测试
if (require.main === module) {
  batchTest('./websites.json').catch(error => {
    console.error('批量测试失败:', error);
  });
}

module.exports = {
  batchTest,
  loadConfig,
  generateSummaryReport
};