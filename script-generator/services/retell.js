const https = require('https');

async function pushScriptToRetell(agentId, script) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error('RETELL_API_KEY is not set');
  if (!agentId) throw new Error('Retell Agent ID is required');

  const body = JSON.stringify({ general_prompt: script });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.retellai.com',
        path: `/update-agent/${agentId}`,
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); }
          } else {
            reject(new Error(`Retell API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { pushScriptToRetell };
