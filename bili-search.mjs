import WebSocket from 'ws';
import fs from 'fs';

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/CB911533B82B64AFBEDA5B343DD2AD43');
let msgId = 0;

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

ws.on('open', () => {
  // Navigate directly to B站 search results
  send('Page.enable');
  send('Page.navigate', { url: 'https://search.bilibili.com/all?keyword=claude' });
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.id === 2 && msg.result?.frameId) {
    console.log('Navigation started, frameId:', msg.result.frameId);
  }

  if (msg.method === 'Page.loadEventFired') {
    console.log('Page loaded, taking screenshot...');
    setTimeout(() => send('Page.captureScreenshot', { format: 'png' }), 1500);
  }

  if (msg.result?.data) {
    fs.writeFileSync('D:/claude-work/bilibili_claude_search.png', Buffer.from(msg.result.data, 'base64'));
    console.log('Screenshot saved!');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.error('WS Error:', e.message); process.exit(1); });
setTimeout(() => { console.log('Timeout'); ws.close(); process.exit(1); }, 15000);
