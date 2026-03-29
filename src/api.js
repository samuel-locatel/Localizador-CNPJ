const axios = require('axios');

function validateCnpj(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // all same digits

  function calcDigit(slice, weights) {
    const sum = slice.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(digits.slice(0, 12), w1);
  if (d1 !== parseInt(digits[12])) return false;

  const d2 = calcDigit(digits.slice(0, 13), w2);
  if (d2 !== parseInt(digits[13])) return false;

  return true;
}

let lastRequestTime = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatCep(cep) {
  if (!cep) return '';
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return String(cep);
}

function formatPhone(ddd, number) {
  if (!number) return '';
  if (ddd) return `(${ddd}) ${number}`;
  return String(number);
}

function mapApiResponse(cnpj, data) {
  const socios = data.socios || [];
  const adminSocios = socios
    .filter(s => s.qualificacao_socio && s.qualificacao_socio.descricao &&
      s.qualificacao_socio.descricao.toLowerCase().includes('administrador'))
    .map(s => s.nome_socio)
    .join('; ');

  const cnaesSecundarios = (data.cnaes_secundarios || [])
    .map(c => c.descricao)
    .join('; ');

  const endereco = [data.logradouro, data.numero].filter(Boolean).join(', ');

  return {
    'CNPJ': cnpj,
    'STATUS': 'OK',
    'Razão Social': data.razao_social || '',
    'Fantasia': data.nome_fantasia || '',
    'EMAIL': data.email || '',
    'FONE': formatPhone(data.ddd_telefone_1, data.telefone_1),
    'RESP': data.responsavel_federativo || '',
    'SÓCIO ADMINISTRADOR': adminSocios,
    'ENDEREÇO': endereco,
    'BAIRRO': data.bairro || '',
    'CEP': formatCep(data.cep),
    'CIDADE': data.municipio || '',
    'ESTADO': data.uf || '',
    'CNAE PRINCIPAL': data.cnae_fiscal_descricao || '',
    'CNAES SECUNDÁRIOS': cnaesSecundarios,
  };
}

const RATE_LIMIT_MS = 12000; // 5 per minute = 1 every 12s

function errorRow(cnpj, status) {
  return {
    'CNPJ': cnpj,
    'STATUS': status,
    'Razão Social': '', 'Fantasia': '', 'EMAIL': '', 'FONE': '',
    'RESP': '', 'SÓCIO ADMINISTRADOR': '', 'ENDEREÇO': '', 'BAIRRO': '',
    'CEP': '', 'CIDADE': '', 'ESTADO': '', 'CNAE PRINCIPAL': '', 'CNAES SECUNDÁRIOS': '',
  };
}

async function lookupCnpj(cnpj) {
  if (!validateCnpj(cnpj)) {
    return errorRow(cnpj, 'CNPJ INVÁLIDO');
  }

  // Rate limiting: wait until 12s have passed since last request
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const digits = cnpj.replace(/\D/g, '');
  try {
    const response = await axios.get(`https://publica.cnpj.ws/cnpj/${digits}`, {
      timeout: 30000,
      headers: { 'Accept': 'application/json' },
    });
    return mapApiResponse(cnpj, response.data);
  } catch (err) {
    const status = err.response && err.response.status === 404
      ? 'NÃO ENCONTRADO'
      : 'ERRO API';
    return errorRow(cnpj, status);
  }
}

module.exports = { validateCnpj, mapApiResponse, lookupCnpj, sleep };
