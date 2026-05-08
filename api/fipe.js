// api/fipe.js — Vercel Serverless Function (CommonJS)
const FIPE_BASE = 'https://fipe.parallelum.com.br/api/v2';
 
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.fipe.org.br/',
  'Origin': 'https://www.fipe.org.br',
};
 
async function fipeFetch(path) {
  const res = await fetch(`${FIPE_BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`FIPE ${res.status}: ${path}`);
  return res.json();
}
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  const { action, brandCode, modelCode, year } = req.query;
 
  try {
    // 1. Lista de marcas
    if (action === 'brands') {
      const data = await fipeFetch('/cars/brands');
      return res.status(200).json(data);
    }
 
    // 2. Lista de modelos de uma marca
    if (action === 'models' && brandCode) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models`);
      // A API retorna { models: [...], years: [...] }
      // Normalizar para sempre retornar array de modelos
      const models = Array.isArray(data) ? data : (data.models || data);
      return res.status(200).json(models);
    }
 
    // 3. Anos de um modelo específico
    if (action === 'years' && brandCode && modelCode) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years`);
      return res.status(200).json(data);
    }
 
    // 4. Preço de um modelo/ano específico
    if (action === 'price' && brandCode && modelCode && year) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years/${year}`);
      return res.status(200).json(data);
    }
 
    // 5. Busca completa por nome — recebe marca e nome do modelo,
    //    faz o match automático e retorna o preço mais recente
    if (action === 'search' && brandCode && req.query.modelName) {
      const modelName = req.query.modelName.toUpperCase();
 
      // Buscar lista de modelos
      const modelsData = await fipeFetch(`/cars/brands/${brandCode}/models`);
      const models = Array.isArray(modelsData) ? modelsData : (modelsData.models || modelsData);
 
      // Encontrar o modelo por nome (match parcial, mais longo vence)
      let bestMatch = null;
      let bestScore = 0;
 
      for (const m of models) {
        const name = (m.name || m.nome || '').toUpperCase();
        // Score: quantas palavras do modelName estão no nome FIPE
        const words = modelName.split(' ').filter(w => w.length > 2);
        const matches = words.filter(w => name.includes(w)).length;
        const score = matches / Math.max(words.length, 1);
 
        if (score > bestScore || (score === bestScore && name.length < (bestMatch?.name || '').length)) {
          bestScore = score;
          bestMatch = m;
        }
      }
 
      if (!bestMatch || bestScore === 0) {
        return res.status(404).json({ error: `Modelo "${req.query.modelName}" não encontrado para marca ${brandCode}` });
      }
 
      const modelCode = bestMatch.code || bestMatch.codigo;
 
      // Buscar anos disponíveis
      const years = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years`);
 
      if (!years || years.length === 0) {
        return res.status(404).json({ error: 'Nenhum ano encontrado para este modelo' });
      }
 
      // Pegar o ano solicitado ou o mais recente
      const targetYear = req.query.year;
      let yearEntry = null;
 
      if (targetYear) {
        // Buscar ano específico — FIPE usa formato "2023-1" (gasolina), "2023-3" (diesel), "32000-0" (0km)
        yearEntry = years.find(y => {
          const code = String(y.code || y.codigo || '');
          return code.startsWith(String(targetYear));
        });
      }
 
      // Fallback: ano mais recente (primeiro da lista — FIPE retorna em ordem decrescente)
      if (!yearEntry) yearEntry = years[0];
 
      const yearCode = yearEntry.code || yearEntry.codigo;
 
      // Buscar preço
      const priceData = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years/${yearCode}`);
 
      return res.status(200).json({
        modelFound: bestMatch.name || bestMatch.nome,
        modelCode,
        yearCode,
        fipeCode: priceData.fipeCode || priceData.codigoFipe,
        price: priceData.price || priceData.valor,
        priceNumber: parseFloat(
          (priceData.price || priceData.valor || '0')
            .replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
        ),
        month: priceData.referenceMonth || priceData.mesReferencia,
        brand: priceData.brand || priceData.marca,
        model: priceData.model || priceData.modelo,
        modelYear: priceData.modelYear || priceData.anoModelo,
        fuel: priceData.fuel || priceData.combustivel,
      });
    }
 
    return res.status(400).json({
      error: 'Ação inválida',
      actions: ['brands', 'models?brandCode=X', 'years?brandCode=X&modelCode=Y', 'price?brandCode=X&modelCode=Y&year=Z', 'search?brandCode=X&modelName=Y&year=Z']
    });
 
  } catch (err) {
    console.error('FIPE error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
