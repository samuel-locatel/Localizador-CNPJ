const axios = require("axios");

function validateCnpj(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  function calcDigit(slice, weights) {
    const sum = slice
      .split("")
      .reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCep(zip) {
  if (!zip) return "";
  const digits = String(zip).replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return String(zip);
}

function formatPhone(area, number) {
  if (!number) return "";
  if (area) return `(${area}) ${number}`;
  return String(number);
}

function mapApiResponse(cnpj, data) {
  const estab = data.estabelecimento || {};

  const adminSocios = (data.socios || [])
    .filter(
      (s) =>
        s.qualificacao_socio &&
        s.qualificacao_socio.descricao &&
        s.qualificacao_socio.descricao.toLowerCase().includes("administrador"),
    )
    .map((s) => s.nome)
    .filter(Boolean)
    .join("; ");

  const sideActivities = (estab.atividades_secundarias || [])
    .map((a) => a.descricao)
    .join("; ");

  const endereco = [estab.tipo_logradouro, estab.logradouro, estab.numero]
    .filter(Boolean)
    .join(" ");

  return {
    CNPJ: cnpj,
    STATUS: "OK",
    "Razão Social": data.razao_social || "",
    Fantasia: estab.nome_fantasia || "",
    EMAIL: estab.email || "",
    FONE: formatPhone(estab.ddd1, estab.telefone1),
    RESP: data.responsavel_federativo || "",
    "SÓCIO ADMINISTRADOR": adminSocios,
    ENDEREÇO: endereco,
    BAIRRO: estab.bairro || "",
    CEP: formatCep(estab.cep),
    CIDADE: (estab.cidade && estab.cidade.nome) || "",
    ESTADO: (estab.estado && estab.estado.sigla) || "",
    "CNAE PRINCIPAL":
      (estab.atividade_principal && estab.atividade_principal.descricao) || "",
    "CNAES SECUNDÁRIOS": sideActivities,
  };
}

const RATE_LIMIT_MS = 20000;

function errorRow(cnpj, status) {
  return {
    CNPJ: cnpj,
    STATUS: status,
    "Razão Social": "",
    Fantasia: "",
    EMAIL: "",
    FONE: "",
    RESP: "",
    "SÓCIO ADMINISTRADOR": "",
    ENDEREÇO: "",
    BAIRRO: "",
    CEP: "",
    CIDADE: "",
    ESTADO: "",
    "CNAE PRINCIPAL": "",
    "CNAES SECUNDÁRIOS": "",
  };
}

async function lookupCnpj(cnpj) {
  if (!validateCnpj(cnpj)) {
    return errorRow(cnpj, "CNPJ INVÁLIDO");
  }

  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const digits = cnpj.replace(/\D/g, "");
  try {
    const { data } = await axios.get(
      `https://publica.cnpj.ws/cnpj/${digits}`,
    );
    return mapApiResponse(cnpj, data);
  } catch (err) {
    console.error(`Erro ao consultar CNPJ ${cnpj}:`, err.message || err);
    const status =
      err.response && err.response.status === 404
        ? "NÃO ENCONTRADO"
        : "ERRO API";
    return errorRow(cnpj, status);
  }
}

module.exports = { validateCnpj, mapApiResponse, lookupCnpj, sleep };
