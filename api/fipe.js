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
 
// Encontra o melhor modelo FIPE dado um nome e ano alvo
async function findBestModel(brandCode, modelName, targetYear) {
  const modelsData = await fipeFetch(`/cars/brands/${brandCode}/models`);
  const models = Array.isArray(modelsData) ? modelsData : (modelsData.models || []);
 
  const nameNorm = modelName.toUpperCase().trim();
  // Palavras relevantes (ignora artigos curtos)
  const words = nameNorm.split(/\s+/).filter(w => w.length >= 2);
 
  // Pontuar cada modelo
  const scored = models.map(m => {
    const mName = (m.name || m.nome || '').toUpperCase();
    const matchCount = words.filter(w => mName.includes(w)).length;
    const score = matchCount / Math.max(words.length, 1);
    return { model: m, score, name: mName };
  }).filter(x => x.score > 0);
 
  if (scored.length === 0) return null;
 
  // Agrupar por nome base (sem versão)
  // Para cada candidato, buscar os anos disponíveis e ver qual tem o targetYear
  // Ordenar por score desc, pegar os top 5 para verificar anos
  const topCandidates = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
 
  // Para cada candidato, buscar os anos e verificar se tem o targetYear
  for (const candidate of topCandidates) {
    const modelCode = candidate.model.code || candidate.model.codigo;
    try {
      const years = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years`);
      if (!years || years.length === 0) continue;
 
      // Verificar se algum ano corresponde ao targetYear
      const matchYear = years.find(y => {
        const code = String(y.code || y.codigo || '');
        return code.startsWith(String(targetYear));
      });
 
      if (matchYear) {
        return { modelCode, yearCode: matchYear.code || matchYear.codigo, modelName: candidate.name };
      }
    } catch (e) {
      continue;
    }
  }
 
  // Fallback: usar o candidato com maior score e o ano mais recente disponível
  const best = topCandidates[0];
  const modelCode = best.model.code || best.model.codigo;
  const years = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years`);
  const yearEntry = years[0]; // mais recente
  return {
    modelCode,
    yearCode: yearEntry.code || yearEntry.codigo,
    modelName: best.name,
    isFallback: true,
  };
}
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  const { action, brandCode, modelCode, year, modelName } = req.query;
 
  try {
    // 1. Lista de marcas
    if (action === 'brands') {
      const data = await fipeFetch('/cars/brands');
      return res.status(200).json(data);
    }
 
    // 2. Lista de modelos de uma marca
    if (action === 'models' && brandCode) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models`);
      const models = Array.isArray(data) ? data : (data.models || data);
      return res.status(200).json(models);
    }
 
    // 3. Anos de um modelo
    if (action === 'years' && brandCode && modelCode) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years`);
      return res.status(200).json(data);
    }
 
    // 4. Preço direto (brandCode + modelCode + year já conhecidos)
    if (action === 'price' && brandCode && modelCode && year) {
      const data = await fipeFetch(`/cars/brands/${brandCode}/models/${modelCode}/years/${year}`);
      return res.status(200).json(data);
    }
 
    // 5. Busca inteligente — recebe nome do modelo e ano, faz o match correto
    if (action === 'search' && brandCode && modelName) {
      const targetYear = parseInt(year) || new Date().getFullYear();
 
      const found = await findBestModel(brandCode, modelName, targetYear);
      if (!found) {
        return res.status(404).json({ error: `Modelo "${modelName}" não encontrado` });
      }
 
      // Buscar preço
      const priceData = await fipeFetch(
        `/cars/brands/${brandCode}/models/${found.modelCode}/years/${found.yearCode}`
      );
 
      // Converter "R$ 192.861,00" → 192861
      const priceStr = priceData.price || priceData.valor || '0';
      const priceNumber = parseFloat(
        priceStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
      );
 
      return res.status(200).json({
        modelFound: priceData.model || priceData.modelo || found.modelName,
        modelCode: found.modelCode,
        yearCode: found.yearCode,
        isFallback: found.isFallback || false,
        fipeCode: priceData.fipeCode || priceData.codigoFipe,
        price: priceData.price || priceData.valor,
        priceNumber,
        month: priceData.referenceMonth || priceData.mesReferencia,
        brand: priceData.brand || priceData.marca,
        modelYear: priceData.modelYear || priceData.anoModelo,
        fuel: priceData.fuel || priceData.combustivel,
      });
    }
 
    return res.status(400).json({
      error: 'Ação inválida',
      actions: ['brands', 'models', 'years', 'price', 'search'],
    });
 
  } catch (err) {
    console.error('FIPE error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
