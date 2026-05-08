// api/fipe.js — Vercel Serverless Function (CommonJS)
const FIPE_BASE = 'https://fipe.parallelum.com.br/api/v2';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, brandCode, modelCode, year } = req.query;

  try {
    let url;

    if (action === 'brands') {
      url = `${FIPE_BASE}/cars/brands`;
    } else if (action === 'models' && brandCode) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models`;
    } else if (action === 'years' && brandCode && modelCode) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models/${modelCode}/years`;
    } else if (action === 'price' && brandCode && modelCode && year) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models/${modelCode}/years/${year}`;
    } else {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.fipe.org.br/',
        'Origin': 'https://www.fipe.org.br',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `FIPE API ${response.status}` });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
