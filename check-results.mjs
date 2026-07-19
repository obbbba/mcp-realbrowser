import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/CB911533B82B64AFBEDA5B343DD2AD43');
let msgId = 0;

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

ws.on('open', () => {
  send('Runtime.enable');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.id === 1) {
    // Extract search results text
    send('Runtime.evaluate', {
      expression: `
        (function() {
          const results = [];
          // B站 search result items
          document.querySelectorAll('.bili-video-card, .video-list-item, .search-result-item, .video-item, [class*="search"] [class*="card"]').forEach((el, i) => {
            if (i < 10) {
              const title = el.querySelector('[class*="title"], a[href*="video"], h3, h4')?.textContent?.trim() || '';
              const url = el.querySelector('a')?.href || '';
              results.push({ title, url });
            }
          });
          return JSON.stringify({
            pageTitle: document.title,
            currentUrl: window.location.href,
            resultsCount: document.querySelectorAll('.bili-video-card, .video-list-item, [class*="search"] [class*="card"]').length,
            topResults: results
          });
        })()
      `,
      returnByValue: true
    });
  }

  if (msg.result?.result?.value) {
    try {
      const info = JSON.parse(msg.result.result.value);
      console.log('页面标题:', info.pageTitle);
      console.log('当前URL:', info.currentUrl);
      console.log('找到结果数:', info.resultsCount);
      console.log('\n前几个结果:');
      info.topResults.forEach((r, i) => console.log(`  ${i + 1}. ${r.title.substring(0, 80)}`));
    } catch (e) {
      console.log('Raw result:', msg.result.result.value?.substring(0, 500));
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.error('Error:', e.message); process.exit(1); });
setTimeout(() => { ws.close(); process.exit(0); }, 8000);
