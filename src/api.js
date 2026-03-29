const { CnpjaOpen } = require('@cnpja/sdk');

const cnpja = new CnpjaOpen();

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

function formatCep(zip) {
  if (!zip) return '';
  const digits = String(zip).replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return String(zip);
}

function formatPhone(area, number) {
  if (!number) return '';
  if (area) return `(${area}) ${number}`;
  return String(number);
}

function mapApiResponse(cnpj, data) {
  const members = (data.company && data.company.members) || [];
  const adminSocios = members
    .filter(m => m.role && m.role.text && m.role.text.toLowerCase().includes('administrador'))
    .map(m => m.person && m.person.name)
    .filter(Boolean)
    .join('; ');

  const sideActivities = (data.sideActivities || [])
    .map(a => a.text)
    .join('; ');

  const address = data.address || {};
  const phones = data.phones || [];
  const emails = data.emails || [];

  const endereco = [address.street, address.number].filter(Boolean).join(', ');

  return {
    'CNPJ': cnpj,
    'STATUS': 'OK',
    'Razão Social': (data.company && data.company.name) || '',
    'Fantasia': data.alias || '',
    'EMAIL': (emails[0] && emails[0].address) || '',
    'FONE': formatPhone(phones[0] && phones[0].area, phones[0] && phones[0].number),
    'RESP': (data.company && data.company.jurisdiction) || '',
    'SÓCIO ADMINISTRADOR': adminSocios,
    'ENDEREÇO': endereco,
    'BAIRRO': address.district || '',
    'CEP': formatCep(address.zip),
    'CIDADE': address.city || '',
    'ESTADO': address.state || '',
    'CNAE PRINCIPAL': (data.mainActivity && data.mainActivity.text) || '',
    'CNAES SECUNDÁRIOS': sideActivities,
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
    const office = await cnpja.office.read({ taxId: digits });
    return mapApiResponse(cnpj, office);
  } catch (err) {
    const status = err.code === 404 ? 'NÃO ENCONTRADO' : 'ERRO API';
    return errorRow(cnpj, status);
  }
}

module.exports = { validateCnpj, mapApiResponse, lookupCnpj, sleep };
