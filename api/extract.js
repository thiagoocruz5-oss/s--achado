// Função Serverless automática para hospedagem gratuita na Vercel
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL ausente' });
  }

  const result = {
    title: '',
    price: 0,
    oldPrice: 0,
    image: '',
    rating: '4.8',
    resolvedUrl: url
  };

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });

    result.resolvedUrl = response.url || url;
    const html = await response.text();

    // 1. Check for Mercado Livre Affiliate Social Landing ("card-featured" polycard JSON)
    const featIdx = html.indexOf('"id":"card-featured"');
    if (featIdx !== -1) {
      const featChunk = html.slice(featIdx, featIdx + 10000);
      const mTitle = featChunk.match(/"type"\s*:\s*"title".*?"text"\s*:\s*"([^"]+)"/);
      if (mTitle) result.title = mTitle[1];

      const mCurr = featChunk.match(/"current_price"\s*:\s*\{\s*"value"\s*:\s*(\d+(?:\.\d+)?)/);
      if (mCurr) result.price = parseFloat(mCurr[1]);

      const mPrev = featChunk.match(/"previous_price"\s*:\s*\{\s*"value"\s*:\s*(\d+(?:\.\d+)?)/);
      if (mPrev) result.oldPrice = parseFloat(mPrev[1]);

      const mPic = featChunk.match(/"pictures"\s*:\s*\[\s*\{\s*"id"\s*:\s*"([^"]+)"/);
      if (mPic) result.image = `https://http2.mlstatic.com/D_NQ_NP_2X_${mPic[1]}-F.webp`;
    }

    // 2. Fallback to OpenGraph & JSON-LD
    if (!result.title) {
      const titleMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      if (titleMatch) {
        result.title = titleMatch[1]
          .replace(/\s*\|\s*Mercado\s*Livre.*$/i, '')
          .replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, '')
          .trim();
      }
    }

    if (!result.image) {
      const imgMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (imgMatch) {
        result.image = imgMatch[1];
      }
    }

    if (result.price <= 0) {
      const priceMatch = html.match(/["']price["']\s*:\s*(\d+(?:\.\d{1,2})?)/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[1]);
      }
    }

    if (result.oldPrice <= 0) {
      const origMatch = html.match(/["']original_price["']\s*:\s*(\d+(?:\.\d{1,2})?)/);
      if (origMatch) {
        result.oldPrice = parseFloat(origMatch[1]);
      }
    }
  } catch (err) {
    // Fallback handled by client
  }

  return res.status(200).json(result);
}
