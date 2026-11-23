const http = require('http');

function post(endpoint, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9876,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9876${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function evalInGame(code) {
  return post('/eval', { code });
}

async function runChain(steps) {
  return post('/chain', { steps });
}

module.exports = { post, get, evalInGame, runChain };

if (require.main === module) {
  const code = process.argv[2] || 'document.title';
  evalInGame(code).then(res => console.log(JSON.stringify(res, null, 2)));
}
