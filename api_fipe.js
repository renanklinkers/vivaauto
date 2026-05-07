// api/fipe.js — Vercel Serverless Function
// Intermediário entre o Viva Auto e a API FIPE (resolve problema de CORS)

const FIPE_BASE = 'https://fipe.parallelum.com.br/api/v2';

export default async function handler(req, res) {
  // CORS — permite chamadas do vivaauto.netlify.app e localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { action, brandCode, modelCode, year } = req.query;

  try {
    let url;

    // action=brands → lista todas as marcas
    if (action === 'brands') {
      url = `${FIPE_BASE}/cars/brands`;
    }
    // action=models → lista modelos de uma marca
    else if (action === 'models' && brandCode) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models`;
    }
    // action=years → lista anos de um modelo
    else if (action === 'years' && brandCode && modelCode) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models/${modelCode}/years`;
    }
    // action=price → busca preço FIPE de um modelo/ano específico
    else if (action === 'price' && brandCode && modelCode && year) {
      url = `${FIPE_BASE}/cars/brands/${brandCode}/models/${modelCode}/years/${year}`;
    }
    else {
      return res.status(400).json({ error: 'Parâmetros inválidos. Use: action=brands|models|years|price' });
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'VivaAuto/1.0',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `FIPE API error: ${response.status}` });
    }

    const data = await response.json();

    // Cache de 24h (preço FIPE atualiza mensalmente)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (err) {
    console.error('FIPE proxy error:', err);
    return res.status(500).json({ error: 'Erro ao consultar FIPE', detail: err.message });
  }
}
