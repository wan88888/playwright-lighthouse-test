/**
 * 版本对比脚本：测试特定网站的性能并与历史版本进行对比
 * 基于example.js扩展，增加历史记录保存和版本对比分析功能
 */
const { runFullTest, runLighthouseTest, captureScreenshot } = require('./index.js');
const fs = require('fs');
const path = require('path');

// 要测试的网站（可以根据需要修改）
const website = 'https://playwright.dev/';

// 历史记录存储目录
const historyDir = path.join('./reports', new URL(website).hostname.replace('www.', ''), 'history');

/**
 * 保存测试结果到历史记录
 * @param {object} results - 测试结果对象
 * @returns {string} 保存的历史记录文件路径
 */
async function saveToHistory(results) {
  console.log('保存测试结果到历史记录...');
  
  // 确保历史记录目录存在
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  
  // 创建历史记录对象
  const timestamp = new Date().toISOString();
  const historyRecord = {
    timestamp,
    url: website,
    date: new Date().toLocaleString('zh-CN'),
    scores: results.lighthouse.scores,
    metrics: {}
  };
  
  // 从JSON摘要文件中提取详细指标
  try {
    const summaryData = JSON.parse(fs.readFileSync(results.lighthouse.summaryPath, 'utf8'));
    historyRecord.metrics = summaryData.metrics;
  } catch (error) {
    console.error('读取摘要文件失败:', error.message);
  }
  
  // 保存历史记录
  const historyFilePath = path.join(historyDir, `history-${timestamp.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(historyFilePath, JSON.stringify(historyRecord, null, 2));
  console.log(`历史记录已保存至: ${historyFilePath}`);
  
  return historyFilePath;
}

/**
 * 获取最近的历史记录
 * @param {number} count - 要获取的记录数量
 * @returns {Array} 历史记录数组
 */
function getRecentHistory(count = 1) {
  console.log(`获取最近 ${count} 条历史记录...`);
  
  if (!fs.existsSync(historyDir)) {
    console.log('历史记录目录不存在，尚无历史数据');
    return [];
  }
  
  try {
    // 读取所有历史记录文件
    const files = fs.readdirSync(historyDir)
      .filter(file => file.startsWith('history-') && file.endsWith('.json'))
      .map(file => ({
        file,
        path: path.join(historyDir, file),
        time: fs.statSync(path.join(historyDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // 按时间降序排序
    
    // 获取指定数量的最近记录
    const recentFiles = files.slice(0, count);
    
    if (recentFiles.length === 0) {
      console.log('未找到历史记录');
      return [];
    }
    
    // 读取历史记录内容
    return recentFiles.map(file => {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        return data;
      } catch (error) {
        console.error(`读取历史记录 ${file.file} 失败:`, error.message);
        return null;
      }
    }).filter(record => record !== null);
  } catch (error) {
    console.error('获取历史记录失败:', error.message);
    return [];
  }
}

/**
 * 比较两次测试结果并生成对比报告
 * @param {object} currentResult - 当前测试结果
 * @param {object} previousResult - 上次测试结果
 * @returns {object} 对比结果
 */
function compareResults(currentResult, previousResult) {
  console.log('比较当前结果与历史结果...');
  
  const comparison = {
    url: website,
    currentDate: currentResult.date,
    previousDate: previousResult.date,
    scores: {},
    metrics: {},
    improved: [],
    degraded: [],
    unchanged: []
  };
  
  // 比较性能得分
  Object.keys(currentResult.scores).forEach(category => {
    const current = currentResult.scores[category];
    const previous = previousResult.scores[category] || 0;
    const diff = current - previous;
    
    comparison.scores[category] = {
      current,
      previous,
      diff,
      percentChange: previous > 0 ? (diff / previous) * 100 : 0
    };
    
    // 根据变化幅度分类
    if (diff > 1) { // 提升超过1分
      comparison.improved.push({
        category,
        diff,
        percentChange: comparison.scores[category].percentChange
      });
    } else if (diff < -1) { // 下降超过1分
      comparison.degraded.push({
        category,
        diff,
        percentChange: comparison.scores[category].percentChange
      });
    } else {
      comparison.unchanged.push({
        category,
        diff,
        percentChange: comparison.scores[category].percentChange
      });
    }
  });
  
  // 比较关键性能指标
  if (currentResult.metrics && previousResult.metrics) {
    Object.keys(currentResult.metrics).forEach(metricKey => {
      const currentMetric = currentResult.metrics[metricKey];
      const previousMetric = previousResult.metrics[metricKey];
      
      if (currentMetric && previousMetric) {
        // 提取数值进行比较（移除单位）
        const extractNumber = (value) => {
          if (!value) return null;
          const match = value.value.match(/([\d\.]+)/);
          return match ? parseFloat(match[1]) : null;
        };
        
        const currentValue = extractNumber(currentMetric);
        const previousValue = extractNumber(previousMetric);
        
        if (currentValue !== null && previousValue !== null) {
          const diff = currentValue - previousValue;
          const percentChange = previousValue > 0 ? (diff / previousValue) * 100 : 0;
          
          // 判断性能变化状态
          let status = 'unchanged';
          if (Math.abs(diff) > 0.001) { // 添加一个小的阈值，避免浮点数精度问题
            if (metricKey.includes('layout-shift') || metricKey.includes('time')) {
              status = diff < 0 ? 'improved' : 'degraded';
            } else {
              status = diff > 0 ? 'improved' : 'degraded';
            }
          } else {
            // 当差异非常小时，确保状态为unchanged
            status = 'unchanged';
          }
          
          comparison.metrics[metricKey] = {
            name: currentMetric.title,
            current: currentMetric.value,
            previous: previousMetric.value,
            diff,
            percentChange,
            status: status,
            improved: status === 'improved'
          };
        }
      }
    });
  }
  
  return comparison;
}

/**
 * 生成对比报告并保存
 * @param {object} comparison - 对比结果
 * @returns {string} 报告文件路径
 */
function generateComparisonReport(comparison) {
  console.log('生成对比报告...');
  
  // 创建报告目录
  const reportsDir = path.join('./reports', new URL(website).hostname.replace('www.', ''), 'comparisons');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // 生成HTML报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `comparison-${timestamp}.html`);
  
  // 创建HTML内容
  let html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>网站性能对比报告 - ${comparison.url}</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
      h1, h2, h3 { color: #2c3e50; }
      .container { max-width: 1200px; margin: 0 auto; }
      .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
      .summary { display: flex; justify-content: space-between; flex-wrap: wrap; }
      .summary-card { background: white; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 15px; margin-bottom: 20px; flex: 1; min-width: 250px; margin-right: 15px; }
      .summary-card:last-child { margin-right: 0; }
      .score-table, .metrics-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .score-table th, .score-table td, .metrics-table th, .metrics-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e1e1; }
      .score-table th, .metrics-table th { background-color: #f8f9fa; }
      .improved { color: #28a745; }
      .degraded { color: #dc3545; }
      .unchanged { color: #6c757d; font-weight: normal; }
      .diff-value { font-weight: bold; }
      .diff-percent { font-size: 0.9em; opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>网站性能对比报告</h1>
        <p><strong>网站:</strong> ${comparison.url}</p>
        <p><strong>当前测试时间:</strong> ${comparison.currentDate}</p>
        <p><strong>对比测试时间:</strong> ${comparison.previousDate}</p>
      </div>
      
      <h2>性能得分对比</h2>
      <div class="summary">
        <div class="summary-card">
          <h3>改进项 (${comparison.improved.length})</h3>
          <p>${comparison.improved.length > 0 ? comparison.improved.map(item => 
            `${item.category}: <span class="improved">+${item.diff.toFixed(1)} (${item.percentChange.toFixed(1)}%)</span>`
          ).join('<br>') : '无明显改进项'}</p>
        </div>
        <div class="summary-card">
          <h3>退步项 (${comparison.degraded.length})</h3>
          <p>${comparison.degraded.length > 0 ? comparison.degraded.map(item => 
            `${item.category}: <span class="degraded">${item.diff.toFixed(1)} (${item.percentChange.toFixed(1)}%)</span>`
          ).join('<br>') : '无明显退步项'}</p>
        </div>
        <div class="summary-card">
          <h3>基本不变 (${comparison.unchanged.length})</h3>
          <p>${comparison.unchanged.length > 0 ? comparison.unchanged.map(item => 
            `${item.category}: <span class="unchanged">${item.diff > 0 ? '+' : ''}${item.diff.toFixed(1)} (${item.percentChange.toFixed(1)}%)</span>`
          ).join('<br>') : '无基本不变项'}</p>
        </div>
      </div>
      
      <h2>详细得分对比</h2>
      <table class="score-table">
        <thead>
          <tr>
            <th>类别</th>
            <th>当前得分</th>
            <th>上次得分</th>
            <th>变化</th>
          </tr>
        </thead>
        <tbody>
          ${Object.keys(comparison.scores).map(category => {
            const score = comparison.scores[category];
            const changeClass = score.diff > 1 ? 'improved' : (score.diff < -1 ? 'degraded' : 'unchanged');
            return `
              <tr>
                <td>${category}</td>
                <td>${score.current.toFixed(1)}</td>
                <td>${score.previous.toFixed(1)}</td>
                <td class="${changeClass}">
                  <span class="diff-value">${score.diff > 0 ? '+' : ''}${score.diff.toFixed(1)}</span>
                  <span class="diff-percent">(${score.percentChange.toFixed(1)}%)</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <h2>关键性能指标对比</h2>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>指标</th>
            <th>当前值</th>
            <th>上次值</th>
            <th>变化</th>
          </tr>
        </thead>
        <tbody>
          ${Object.keys(comparison.metrics).map(metric => {
            const data = comparison.metrics[metric];
            // 判断是否为不变状态（差异非常小或为零）
            const isUnchanged = Math.abs(data.diff) <= 0.001;
            const changeClass = isUnchanged ? 'unchanged' : (data.improved ? 'improved' : 'degraded');
            return `
              <tr>
                <td>${data.name}</td>
                <td>${data.current}</td>
                <td>${data.previous}</td>
                <td class="${changeClass}">
                  <span class="${changeClass}">${isUnchanged ? '=' : (data.improved ? '↑' : '↓')}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      
      <div class="footer">
        <p>报告生成时间: ${new Date().toLocaleString('zh-CN')}</p>
      </div>
    </div>
  </body>
  </html>
  `;
  
  // 保存HTML报告
  fs.writeFileSync(reportPath, html);
  console.log(`对比报告已保存至: ${reportPath}`);
  
  // 同时保存JSON格式的对比数据
  const jsonPath = path.join(reportsDir, `comparison-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(comparison, null, 2));
  console.log(`对比数据已保存至: ${jsonPath}`);
  
  return reportPath;
}

/**
 * 运行测试并与历史版本对比
 */
async function runVersionCompare() {
  console.log(`开始对网站 ${website} 进行版本对比测试...`);
  
  try {
    // 1. 运行完整测试
    console.log('\n1. 运行完整测试...');
    const results = await runFullTest(website, {
      outputFormat: 'html',
      categories: ['performance', 'accessibility', 'best-practices', 'seo']
    });
    
    if (!results || !results.lighthouse) {
      throw new Error('测试未返回有效结果');
    }
    
    // 输出当前测试结果摘要
    console.log('\n当前测试结果摘要:');
    Object.keys(results.lighthouse.scores).forEach(category => {
      console.log(`- ${category}得分: ${results.lighthouse.scores[category].toFixed(1)}`);
    });
    
    // 2. 保存结果到历史记录
    console.log('\n2. 保存结果到历史记录...');
    const historyPath = await saveToHistory(results);
    
    // 3. 获取上一次的测试结果
    console.log('\n3. 获取历史测试结果...');
    const historyRecords = getRecentHistory(2); // 获取最近2条记录（包括刚保存的）
    
    // 如果只有一条记录（当前测试），则无法进行对比
    if (historyRecords.length < 2) {
      console.log('没有找到历史记录进行对比，这可能是首次测试');
      console.log('测试结果已保存，下次测试时将自动进行对比');
      return {
        currentTest: results,
        historyPath,
        comparisonAvailable: false
      };
    }
    
    // 当前测试结果（刚保存的）和上一次测试结果
    const currentResult = historyRecords[0];
    const previousResult = historyRecords[1];
    
    // 4. 比较结果并生成报告
    console.log('\n4. 比较结果并生成报告...');
    const comparison = compareResults(currentResult, previousResult);
    const reportPath = generateComparisonReport(comparison);
    
    // 5. 输出对比摘要
    console.log('\n版本对比摘要:');
    console.log(`- 当前测试时间: ${currentResult.date}`);
    console.log(`- 对比测试时间: ${previousResult.date}`);
    console.log(`- 改进项数量: ${comparison.improved.length}`);
    console.log(`- 退步项数量: ${comparison.degraded.length}`);
    console.log(`- 对比报告: ${reportPath}`);
    
    // 输出主要变化
    if (comparison.improved.length > 0) {
      console.log('\n主要改进项:');
      comparison.improved.forEach(item => {
        console.log(`- ${item.category}: +${item.diff.toFixed(1)} (${item.percentChange.toFixed(1)}%)`);
      });
    }
    
    if (comparison.degraded.length > 0) {
      console.log('\n主要退步项:');
      comparison.degraded.forEach(item => {
        console.log(`- ${item.category}: ${item.diff.toFixed(1)} (${item.percentChange.toFixed(1)}%)`);
      });
    }
    
    console.log('\n版本对比测试完成!');
    return {
      currentTest: results,
      historyPath,
      comparison,
      reportPath,
      comparisonAvailable: true
    };
  } catch (error) {
    console.error('版本对比测试过程中发生错误:', error);
  }
}

// 运行版本对比测试
(async () => {
  console.log('开始运行版本对比测试...');
  await runVersionCompare();
})();

module.exports = {
  runVersionCompare,
  saveToHistory,
  getRecentHistory,
  compareResults,
  generateComparisonReport
};