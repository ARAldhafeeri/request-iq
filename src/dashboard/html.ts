export const getDashboardHTML = (dashboardPath: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RequestIQ Dashboard</title>
  <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
      .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
      .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
      .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .stat-value { font-size: 2em; font-weight: bold; color: #2563eb; }
      .stat-label { color: #6b7280; margin-top: 5px; }
      .chart-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
      .table-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
      th { background: #f9fafb; font-weight: 600; }
      .status-ok { color: #059669; }
      .status-error { color: #dc2626; }
      .loading { text-align: center; padding: 40px; color: #6b7280; }
      .refresh-btn { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; }
      .refresh-btn:hover { background: #1d4ed8; }
      .time-filter { margin-left: 20px; }
      .time-filter select { padding: 8px; border-radius: 4px; border: 1px solid #d1d5db; }
  </style>
</head>
<body>
  <div class="container">
      <div class="header">
          <h1>RequestIQ Dashboard</h1>
          <p>Real-time API endpoint monitoring and analytics</p>
          <button class="refresh-btn" onclick="loadDashboard()">Refresh</button>
          <span class="time-filter">
              <select id="timeFilter" onchange="loadDashboard()">
                  <option value="1">Last 1 hour</option>
                  <option value="6">Last 6 hours</option>
                  <option value="24" selected>Last 24 hours</option>
                  <option value="168">Last 7 days</option>
              </select>
          </span>
      </div>

      <div class="stats-grid">
          <div class="stat-card">
              <div class="stat-value" id="totalRequests">-</div>
              <div class="stat-label">Total Requests</div>
          </div>
          <div class="stat-card">
              <div class="stat-value" id="averageLatency">-</div>
              <div class="stat-label">Average Latency (ms)</div>
          </div>
          <div class="stat-card">
              <div class="stat-value" id="slowRequests">-</div>
              <div class="stat-label">Slow Requests</div>
          </div>
          <div class="stat-card">
              <div class="stat-value" id="errorRate">-</div>
              <div class="stat-label">Error Rate (%)</div>
          </div>
      </div>

      <div class="chart-container">
          <h3>Latency Percentiles</h3>
          <div id="latencyChart"></div>
      </div>

      <div class="table-container">
          <h3 style="padding: 20px; margin: 0;">Recent Requests</h3>
          <table>
              <thead>
                  <tr>
                      <th>Time</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>IP</th>
                  </tr>
              </thead>
              <tbody id="requestsTable">
                  <tr><td colspan="6" class="loading">Loading...</td></tr>
              </tbody>
          </table>
      </div>
  </div>

  <script>
      async function loadDashboard() {
          const hours = document.getElementById('timeFilter').value;
          try {
              const response = await fetch(\`${dashboardPath}?action=dashboard-data&hours=\${hours}\`);
              const data = await response.json();
              
              document.getElementById('totalRequests').textContent = data.totalRequests.toLocaleString();
              document.getElementById('averageLatency').textContent = Math.round(data.averageLatency);
              document.getElementById('slowRequests').textContent = data.slowRequests.toLocaleString();
              document.getElementById('errorRate').textContent = (data.errorRate * 100).toFixed(2);
              
              // Update latency chart
              const latencyChart = document.getElementById('latencyChart');
              latencyChart.innerHTML = \`
                  <div style="display: flex; justify-content: space-around; margin: 20px 0;">
                      <div style="text-align: center;">
                          <div style="font-size: 1.5em; font-weight: bold;">\${data.latencyPercentiles.p50}ms</div>
                          <div style="color: #6b7280;">P50</div>
                      </div>
                      <div style="text-align: center;">
                          <div style="font-size: 1.5em; font-weight: bold;">\${data.latencyPercentiles.p90}ms</div>
                          <div style="color: #6b7280;">P90</div>
                      </div>
                      <div style="text-align: center;">
                          <div style="font-size: 1.5em; font-weight: bold;">\${data.latencyPercentiles.p95}ms</div>
                          <div style="color: #6b7280;">P95</div>
                      </div>
                      <div style="text-align: center;">
                          <div style="font-size: 1.5em; font-weight: bold;">\${data.latencyPercentiles.p99}ms</div>
                          <div style="color: #6b7280;">P99</div>
                      </div>
                  </div>
              \`;
              
              // Update requests table
              const tbody = document.getElementById('requestsTable');
              tbody.innerHTML = data.recentRequests.map(req => \`
                  <tr>
                      <td>\${new Date(req.timestamp).toLocaleString()}</td>
                      <td>\${req.method}</td>
                      <td>\${req.path}</td>
                      <td class="\${req.statusCode >= 400 ? 'status-error' : 'status-ok'}">\${req.statusCode}</td>
                      <td>\${req.duration}ms</td>
                      <td>\${req.ip || '-'}</td>
                  </tr>
              \`).join('');
              
          } catch (error) {
              console.error('Failed to load dashboard data:', error);
          }
      }
      
      // Load dashboard on page load
      loadDashboard();
      
      // Auto-refresh every 30 seconds
      setInterval(loadDashboard, 30000);
  </script>
</body>
</html>
  `;
};
