// API Serverless na Vercel com Banco em Nuvem em Tempo Real (Sem necessidade de configurar tokens)
const POINTER_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a16490e8ad5ca9';
const BYTEBIN_POST = 'https://bytebin.lucko.me/post';
const BYTEBIN_BASE = 'https://bytebin.lucko.me/';
const GITHUB_FALLBACK = 'https://raw.githubusercontent.com/thiagoocruz5-oss/s--achado/main/data/products.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // 1. Ler ponteiro atual na nuvem
      const ptrRes = await fetch(POINTER_URL, {
        headers: { 'User-Agent': 'SoAchado/1.0' },
        cache: 'no-store'
      });
      if (ptrRes.ok) {
        const ptrJson = await ptrRes.json();
        const key = ptrJson && ptrJson.data && ptrJson.data.key;
        if (key) {
          const binRes = await fetch(`${BYTEBIN_BASE}${key}`, {
            headers: { 'User-Agent': 'SoAchado/1.0' },
            cache: 'no-store'
          });
          if (binRes.ok) {
            const data = await binRes.json();
            if (data && Array.isArray(data.products)) {
              return res.status(200).json(data);
            }
          }
        }
      }

      // 2. Fallback para o arquivo no GitHub
      const ghRes = await fetch(GITHUB_FALLBACK, { cache: 'no-store' });
      const ghData = await ghRes.json();
      return res.status(200).json(ghData);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!payload || !Array.isArray(payload.products)) {
        return res.status(400).json({ error: 'Formato de dados invalido' });
      }

      // 1. Salvar JSON completo no Bytebin
      const postRes = await fetch(BYTEBIN_POST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SoAchado/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (!postRes.ok) {
        throw new Error('Falha ao gravar dados na nuvem: ' + postRes.status);
      }

      const postJson = await postRes.json();
      const newKey = postJson.key;

      // 2. Atualizar ponteiro em tempo real
      const putRes = await fetch(POINTER_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SoAchado/1.0'
        },
        body: JSON.stringify({
          name: 'so_achado_store',
          data: {
            key: newKey,
            updatedAt: Date.now()
          }
        })
      });

      if (!putRes.ok) {
        throw new Error('Falha ao atualizar ponteiro na nuvem: ' + putRes.status);
      }

      return res.status(200).json({ ok: true, key: newKey });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Metodo nao permitido' });
}
