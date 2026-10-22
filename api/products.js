// API Serverless na Vercel para ler e salvar produtos em tempo real
const REPO = 'thiagoocruz5-oss/s--achado';
const FILE_PATH = 'data/products.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gh-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = process.env.GITHUB_TOKEN || req.headers['x-gh-token'] || '';
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  if (req.method === 'GET') {
    try {
      const headers = {
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'SoAchado-Vercel'
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const ghRes = await fetch(apiUrl, { headers, cache: 'no-store' });
      if (!ghRes.ok) {
        throw new Error('Falha ao ler dados da nuvem: ' + ghRes.status);
      }
      const data = await ghRes.json();
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    if (!token) {
      return res.status(401).json({
        error: 'Configure o GITHUB_TOKEN nas variaveis da Vercel ou use o painel local para sincronizar.'
      });
    }

    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!payload || !Array.isArray(payload.products)) {
        return res.status(400).json({ error: 'Formato de dados invalido' });
      }

      const metaRes = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'SoAchado-Vercel'
        },
        cache: 'no-store'
      });
      let sha = undefined;
      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        sha = metaJson.sha;
      }

      const contentBase64 = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8').toString('base64');
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SoAchado-Vercel'
        },
        body: JSON.stringify({
          message: 'Atualizacao automatica de produtos via Painel Online So Achado',
          content: contentBase64,
          sha
        })
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        return res.status(500).json({ error: 'Erro ao salvar na nuvem: ' + errText });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Metodo nao permitido' });
}
