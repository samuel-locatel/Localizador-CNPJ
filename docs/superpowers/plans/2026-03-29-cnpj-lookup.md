# CNPJ Lookup Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI tool that reads CNPJs from an Excel file, queries the CNPJa public API at 5 req/min, and saves all results to a new Excel file — with resumability, progress display, and graceful shutdown.

**Architecture:** Four focused modules (`reader`, `progress`, `api`, `writer`) orchestrated by `index.js`. Each module has one responsibility and a clean interface. Resume state is persisted to a `.progress.json` file after every processed row, enabling restart at any point.

**Tech Stack:** Node.js, exceljs (Excel I/O), axios (HTTP), cli-progress (terminal bar), Jest (tests)

---

## File Map

| File                     | Responsibility                                                               |
| ------------------------ | ---------------------------------------------------------------------------- |
| `index.js`               | Entry point: parse CLI args, orchestrate flow, progress bar, SIGINT handler  |
| `src/reader.js`          | Read input `.xlsx`, extract CNPJs from column A (skip header row 1)          |
| `src/progress.js`        | Load/append/clear `.progress.json` resume state                              |
| `src/api.js`             | Validate CNPJ format, call CNPJa API, rate limit, map response to output row |
| `src/writer.js`          | Build output rows with PT-BR headers, save/update `_resultado.xlsx`          |
| `tests/reader.test.js`   | Unit tests for reader                                                        |
| `tests/progress.test.js` | Unit tests for progress state                                                |
| `tests/api.test.js`      | Unit tests for CNPJ validation, field mapping, rate limiter                  |
| `tests/writer.test.js`   | Unit tests for row building and header                                       |

---

## Task 1: Project Setup

**Files:**

- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git and npm**

```bash
cd /Users/samuellocatel/Documents/Localizador-CNPJ
git init
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install exceljs axios cli-progress
npm install --save-dev jest
```

- [ ] **Step 3: Configure package.json scripts**

Edit `package.json` to add:

```json
{
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest --verbose"
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
*.progress.json
*_resultado.xlsx
```

- [ ] **Step 5: Create src and tests directories**

```bash
mkdir -p src tests
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: project setup with dependencies"
```

---

## Task 2: reader.js — Read CNPJs from Excel

**Files:**

- Create: `src/reader.js`
- Create: `tests/reader.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/reader.test.js`:

```js
const path = require("path");
const ExcelJS = require("exceljs");
const os = require("os");
const fs = require("fs");
const { readCnpjs } = require("../src/reader");

async function createTempXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);
  return tmpPath;
}

describe("readCnpjs", () => {
  it("returns CNPJs from column A, skipping header row", async () => {
    const file = await createTempXlsx([
      ["CNPJ"],
      ["11.222.333/0001-81"],
      ["22.333.444/0001-70"],
    ]);
    const result = await readCnpjs(file);
    expect(result).toEqual([
      { row: 2, cnpj: "11.222.333/0001-81" },
      { row: 3, cnpj: "22.333.444/0001-70" },
    ]);
    fs.unlinkSync(file);
  });

  it("throws if file does not exist", async () => {
    await expect(readCnpjs("/nonexistent/file.xlsx")).rejects.toThrow(
      "Arquivo não encontrado",
    );
  });

  it("throws if no CNPJs found after header", async () => {
    const file = await createTempXlsx([["CNPJ"]]);
    await expect(readCnpjs(file)).rejects.toThrow("Nenhum CNPJ encontrado");
    fs.unlinkSync(file);
  });

  it("skips empty cells", async () => {
    const file = await createTempXlsx([
      ["CNPJ"],
      ["11.222.333/0001-81"],
      [null],
      ["22.333.444/0001-70"],
    ]);
    const result = await readCnpjs(file);
    expect(result).toHaveLength(2);
    fs.unlinkSync(file);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/reader.test.js --verbose
```

Expected: FAIL — "Cannot find module '../src/reader'"

- [ ] **Step 3: Implement src/reader.js**

```js
const ExcelJS = require("exceljs");
const fs = require("fs");

async function readCnpjs(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  const entries = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const cell = row.getCell(1).value;
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") {
      entries.push({ row: rowNumber, cnpj: String(cell).trim() });
    }
  });

  if (entries.length === 0) {
    throw new Error(
      "Nenhum CNPJ encontrado no arquivo (coluna A, a partir da linha 2)",
    );
  }

  return entries;
}

module.exports = { readCnpjs };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/reader.test.js --verbose
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/reader.js tests/reader.test.js
git commit -m "feat: reader — extract CNPJs from Excel column A"
```

---

## Task 3: progress.js — Resume State

**Files:**

- Create: `src/progress.js`
- Create: `tests/progress.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/progress.test.js`:

```js
const path = require("path");
const os = require("os");
const fs = require("fs");
const { loadProgress, markDone, clearProgress } = require("../src/progress");

function tempProgressPath() {
  return path.join(os.tmpdir(), `progress-test-${Date.now()}.progress.json`);
}

describe("loadProgress", () => {
  it("returns empty set if file does not exist", () => {
    const result = loadProgress("/nonexistent/file.progress.json");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns set of previously processed CNPJs", () => {
    const p = tempProgressPath();
    fs.writeFileSync(p, JSON.stringify(["11111111000100", "22222222000100"]));
    const result = loadProgress(p);
    expect(result.has("11111111000100")).toBe(true);
    expect(result.has("22222222000100")).toBe(true);
    fs.unlinkSync(p);
  });
});

describe("markDone", () => {
  it("appends CNPJ to progress file", () => {
    const p = tempProgressPath();
    markDone(p, "11111111000100");
    markDone(p, "22222222000100");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    expect(data).toContain("11111111000100");
    expect(data).toContain("22222222000100");
    fs.unlinkSync(p);
  });
});

describe("clearProgress", () => {
  it("deletes the progress file", () => {
    const p = tempProgressPath();
    fs.writeFileSync(p, JSON.stringify(["11111111000100"]));
    clearProgress(p);
    expect(fs.existsSync(p)).toBe(false);
  });

  it("does nothing if file does not exist", () => {
    expect(() => clearProgress("/nonexistent/file.json")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/progress.test.js --verbose
```

Expected: FAIL — "Cannot find module '../src/progress'"

- [ ] **Step 3: Implement src/progress.js**

```js
const fs = require("fs");

function loadProgress(progressPath) {
  if (!fs.existsSync(progressPath)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    return new Set(data);
  } catch {
    return new Set();
  }
}

function markDone(progressPath, cnpj) {
  let existing = [];
  if (fs.existsSync(progressPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    } catch {
      existing = [];
    }
  }
  existing.push(cnpj);
  fs.writeFileSync(progressPath, JSON.stringify(existing), "utf8");
}

function clearProgress(progressPath) {
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
}

module.exports = { loadProgress, markDone, clearProgress };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/progress.test.js --verbose
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/progress.js tests/progress.test.js
git commit -m "feat: progress — resume state persistence"
```

---

## Task 4: api.js — CNPJ Validation

**Files:**

- Create: `src/api.js` (partial — validation only)
- Create: `tests/api.test.js` (partial)

- [ ] **Step 1: Write the failing tests for CNPJ validation**

Create `tests/api.test.js`:

```js
const { validateCnpj } = require("../src/api");

describe("validateCnpj", () => {
  it("accepts valid formatted CNPJ", () => {
    expect(validateCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("accepts valid unformatted CNPJ", () => {
    expect(validateCnpj("11222333000181")).toBe(true);
  });

  it("rejects all-same-digits CNPJ", () => {
    expect(validateCnpj("00.000.000/0000-00")).toBe(false);
    expect(validateCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateCnpj("1234")).toBe(false);
    expect(validateCnpj("")).toBe(false);
  });

  it("rejects bad check digits", () => {
    expect(validateCnpj("11.222.333/0001-00")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/api.test.js --verbose
```

Expected: FAIL — "Cannot find module '../src/api'"

- [ ] **Step 3: Implement validateCnpj in src/api.js**

```js
const axios = require("axios");

function validateCnpj(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // all same digits

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

module.exports = { validateCnpj, sleep };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/api.test.js --verbose
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: api — CNPJ checksum validation"
```

---

## Task 5: api.js — Field Mapper

**Files:**

- Modify: `src/api.js`
- Modify: `tests/api.test.js`

The CNPJa public API (`https://open.cnpja.com/office/:cnpj`) returns:

```json
{
  "updated": "2025-01-03T20:40:19.000Z",
  "taxId": "07526557011659",
  "alias": "Filial Manaus",
  "founded": "2023-07-31",
  "head": false,
  "company": {
    "members": [
      {
        "since": "2022-12-26",
        "person": {
          "id": "04c3a1f8-359f-429d-9240-dad8c46451d9",
          "type": "NATURAL",
          "name": "Felipe Moreira Haddad Baruque",
          "taxId": "***787888**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2022-02-15",
        "person": {
          "id": "0563028c-26ce-4098-baeb-65e9781e2014",
          "type": "NATURAL",
          "name": "Valdecir Duarte",
          "taxId": "***748919**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2017-12-08",
        "person": {
          "id": "298afc92-361e-487d-9048-d3a329bb007f",
          "type": "NATURAL",
          "name": "Eduardo Braga Cavalcanti de Lacerda",
          "taxId": "***401457**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2019-01-01",
        "person": {
          "id": "53cd618f-c4a4-4e81-bb82-433e0c8acf0d",
          "type": "NATURAL",
          "name": "Jean Jereissati Neto",
          "taxId": "***224813**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2021-01-12",
        "person": {
          "id": "6be3aa9d-8c11-41f6-b21c-2967365819ae",
          "type": "NATURAL",
          "name": "Daniel Wakswaser Cordeiro",
          "taxId": "***638588**",
          "age": "31-40"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2022-02-15",
        "person": {
          "id": "82f76c94-71ef-4f31-8791-fbd133e1dec1",
          "type": "NATURAL",
          "name": "Daniela Gavranic Cachich",
          "taxId": "***189168**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2020-06-17",
        "person": {
          "id": "c642c541-24fb-4f9c-9fd3-a90b028d1ac3",
          "type": "NATURAL",
          "name": "Lucas Machado Lira",
          "taxId": "***585176**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2022-06-13",
        "person": {
          "id": "cc98f4e6-0d7d-429a-9c5d-219c83082e33",
          "type": "NATURAL",
          "name": "Carla Smith de Vasconcellos Crippa Prado",
          "taxId": "***485688**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2020-01-15",
        "person": {
          "id": "e0fdcab6-f081-48f6-b206-4d308802b0da",
          "type": "NATURAL",
          "name": "Eduardo Eiji Horai",
          "taxId": "***022918**",
          "age": "31-40"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2023-09-15",
        "person": {
          "id": "e2d73359-2d0a-4915-9c1c-af5b43f43088",
          "type": "NATURAL",
          "name": "Joao Coelho Rua Derbli de Carvalho",
          "taxId": "***035737**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2016-01-06",
        "person": {
          "id": "ea9dbeac-b5ec-4bca-bd5b-8f61f4b5a2f6",
          "type": "NATURAL",
          "name": "Ricardo Morais Pereira de Melo",
          "taxId": "***157884**",
          "age": "51-60"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2019-01-01",
        "person": {
          "id": "f4490d83-096c-4c86-8055-acd0782acf13",
          "type": "NATURAL",
          "name": "Paulo Andre Zagman",
          "taxId": "***343527**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      },
      {
        "since": "2019-01-01",
        "person": {
          "id": "f6329851-d940-414b-9ee6-5c55bb4e1943",
          "type": "NATURAL",
          "name": "Leticia Rudge Barbosa Kina",
          "taxId": "***726488**",
          "age": "41-50"
        },
        "role": {
          "id": 10,
          "text": "Diretor"
        }
      }
    ],
    "id": 7526557,
    "name": "AMBEV S.A.",
    "equity": 58226035176.01,
    "nature": {
      "id": 2046,
      "text": "Sociedade Anônima Aberta"
    },
    "size": {
      "id": 5,
      "acronym": "DEMAIS",
      "text": "Demais"
    },
    "simples": {
      "optant": false,
      "since": null
    },
    "simei": {
      "optant": false,
      "since": null
    }
  },
  "statusDate": "2023-07-31",
  "status": {
    "id": 2,
    "text": "Ativa"
  },
  "address": {
    "municipality": 1302603,
    "street": "Avenida Constantino Nery",
    "number": "2575",
    "district": "Flores",
    "city": "Manaus",
    "state": "AM",
    "details": null,
    "zip": "69058795",
    "country": {
      "id": 76,
      "name": "Brasil"
    }
  },
  "mainActivity": {
    "id": 1113502,
    "text": "Fabricação de cervejas e chopes"
  },
  "phones": [
    {
      "type": "LANDLINE",
      "area": "19",
      "number": "33135680"
    }
  ],
  "emails": [
    {
      "ownership": "CORPORATE",
      "address": "opobrigaces@ambev.com.br",
      "domain": "ambev.com.br"
    }
  ],
  "sideActivities": [
    {
      "id": 1122401,
      "text": "Fabricação de refrigerantes"
    }
  ],
  "registrations": [
    {
      "number": "054591406",
      "state": "AM",
      "enabled": true,
      "statusDate": "2024-04-03",
      "status": {
        "id": 1,
        "text": "Sem restrição"
      },
      "type": {
        "id": 1,
        "text": "IE Normal"
      }
    },
    {
      "number": "240519525",
      "state": "RR",
      "enabled": true,
      "statusDate": "2023-10-20",
      "status": {
        "id": 1,
        "text": "Sem restrição"
      },
      "type": {
        "id": 2,
        "text": "IE Substituto Tributário"
      }
    },
    {
      "number": "159195853",
      "state": "PA",
      "enabled": true,
      "statusDate": "2023-10-03",
      "status": {
        "id": 3,
        "text": "Vedada operação como Destinatário na UF"
      },
      "type": {
        "id": 2,
        "text": "IE Substituto Tributário"
      }
    },
    {
      "number": "0108826400193",
      "state": "AC",
      "enabled": true,
      "statusDate": "2024-05-29",
      "status": {
        "id": 2,
        "text": "Bloqueado como Destinatário na UF"
      },
      "type": {
        "id": 2,
        "text": "IE Substituto Tributário"
      }
    }
  ],
  "suframa": [
    {
      "number": "220120838",
      "since": "2024-04-12",
      "approved": true,
      "approvalDate": "1987-09-24",
      "status": {
        "id": 1,
        "text": "Ativa"
      },
      "incentives": [
        {
          "tribute": "IPI",
          "benefit": "Isenção",
          "purpose": "Consumo Interno, Industrialização e Utilização",
          "basis": "Decreto 7.212 de 2010 (Art. 81)"
        },
        {
          "tribute": "ICMS",
          "benefit": "Isenção",
          "purpose": "Industrialização e Comercialização",
          "basis": "Convênio ICMS n° 65 de 1988"
        }
      ]
    }
  ]
}
```

- [ ] **Step 1: Add failing tests for mapApiResponse**

Append to `tests/api.test.js`:

```js
const { mapApiResponse } = require("../src/api");

describe("mapApiResponse", () => {
  const mockResponse = {
    cnpj: "11222333000181",
    razao_social: "EMPRESA LTDA",
    nome_fantasia: "EMPRESA",
    email: "contato@empresa.com.br",
    ddd_telefone_1: "11",
    telefone_1: "999999999",
    responsavel_federativo: "JOAO DA SILVA",
    socios: [
      {
        nome_socio: "JOAO DA SILVA",
        qualificacao_socio: { descricao: "Sócio-Administrador" },
      },
      { nome_socio: "MARIA SILVA", qualificacao_socio: { descricao: "Sócio" } },
    ],
    logradouro: "RUA EXEMPLO",
    numero: "100",
    bairro: "CENTRO",
    cep: "01310100",
    municipio: "SAO PAULO",
    uf: "SP",
    cnae_fiscal_descricao: "Desenvolvimento de programas de computador",
    cnaes_secundarios: [
      { descricao: "Consultoria em TI" },
      { descricao: "Suporte técnico" },
    ],
  };

  it("maps all fields to PT-BR columns", () => {
    const row = mapApiResponse("11.222.333/0001-81", mockResponse);
    expect(row["CNPJ"]).toBe("11.222.333/0001-81");
    expect(row["STATUS"]).toBe("OK");
    expect(row["Razão Social"]).toBe("EMPRESA LTDA");
    expect(row["Fantasia"]).toBe("EMPRESA");
    expect(row["EMAIL"]).toBe("contato@empresa.com.br");
    expect(row["FONE"]).toBe("(11) 999999999");
    expect(row["RESP"]).toBe("JOAO DA SILVA");
    expect(row["SÓCIO ADMINISTRADOR"]).toBe("JOAO DA SILVA");
    expect(row["ENDEREÇO"]).toBe("RUA EXEMPLO, 100");
    expect(row["BAIRRO"]).toBe("CENTRO");
    expect(row["CEP"]).toBe("01310-100");
    expect(row["CIDADE"]).toBe("SAO PAULO");
    expect(row["ESTADO"]).toBe("SP");
    expect(row["CNAE PRINCIPAL"]).toBe(
      "Desenvolvimento de programas de computador",
    );
    expect(row["CNAES SECUNDÁRIOS"]).toBe("Consultoria em TI; Suporte técnico");
  });

  it("joins multiple admin socios with semicolon", () => {
    const data = {
      ...mockResponse,
      socios: [
        {
          nome_socio: "A",
          qualificacao_socio: { descricao: "Sócio-Administrador" },
        },
        {
          nome_socio: "B",
          qualificacao_socio: { descricao: "Sócio-Administrador" },
        },
      ],
    };
    const row = mapApiResponse("11.222.333/0001-81", data);
    expect(row["SÓCIO ADMINISTRADOR"]).toBe("A; B");
  });

  it("formats CEP with hyphen", () => {
    const row = mapApiResponse("11.222.333/0001-81", {
      ...mockResponse,
      cep: "01310100",
    });
    expect(row["CEP"]).toBe("01310-100");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      cnpj: "11222333000181",
      razao_social: "EMPRESA LTDA",
    };
    const row = mapApiResponse("11.222.333/0001-81", minimal);
    expect(row["STATUS"]).toBe("OK");
    expect(row["EMAIL"]).toBe("");
    expect(row["SÓCIO ADMINISTRADOR"]).toBe("");
    expect(row["CNAES SECUNDÁRIOS"]).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/api.test.js --verbose
```

Expected: FAIL on `mapApiResponse` tests

- [ ] **Step 3: Add mapApiResponse to src/api.js**

Add the following to `src/api.js` (before `module.exports`):

```js
function formatCep(cep) {
  if (!cep) return "";
  const digits = String(cep).replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return String(cep);
}

function formatPhone(ddd, number) {
  if (!number) return "";
  if (ddd) return `(${ddd}) ${number}`;
  return String(number);
}

function mapApiResponse(cnpj, data) {
  const socios = data.socios || [];
  const adminSocios = socios
    .filter(
      (s) =>
        s.qualificacao_socio &&
        s.qualificacao_socio.descricao &&
        s.qualificacao_socio.descricao.toLowerCase().includes("administrador"),
    )
    .map((s) => s.nome_socio)
    .join("; ");

  const cnaesSecundarios = (data.cnaes_secundarios || [])
    .map((c) => c.descricao)
    .join("; ");

  const endereco = [data.logradouro, data.numero].filter(Boolean).join(", ");

  return {
    CNPJ: cnpj,
    STATUS: "OK",
    "Razão Social": data.razao_social || "",
    Fantasia: data.nome_fantasia || "",
    EMAIL: data.email || "",
    FONE: formatPhone(data.ddd_telefone_1, data.telefone_1),
    RESP: data.responsavel_federativo || "",
    "SÓCIO ADMINISTRADOR": adminSocios,
    ENDEREÇO: endereco,
    BAIRRO: data.bairro || "",
    CEP: formatCep(data.cep),
    CIDADE: data.municipio || "",
    ESTADO: data.uf || "",
    "CNAE PRINCIPAL": data.cnae_fiscal_descricao || "",
    "CNAES SECUNDÁRIOS": cnaesSecundarios,
  };
}
```

Update `module.exports` at the bottom of `src/api.js`:

```js
module.exports = { validateCnpj, mapApiResponse, sleep };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/api.test.js --verbose
```

Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: api — PT-BR field mapper for CNPJa response"
```

---

## Task 6: api.js — Rate Limiter and HTTP Call

**Files:**

- Modify: `src/api.js`
- Modify: `tests/api.test.js`

- [ ] **Step 1: Add failing tests for lookupCnpj**

Append to `tests/api.test.js`:

```js
const axios = require("axios");
jest.mock("axios");

describe("lookupCnpj", () => {
  const { lookupCnpj } = require("../src/api");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns mapped row on success", async () => {
    axios.get.mockResolvedValue({
      data: {
        cnpj: "11222333000181",
        razao_social: "EMPRESA LTDA",
        ddd_telefone_1: "11",
        telefone_1: "999999999",
        socios: [],
        cnaes_secundarios: [],
      },
    });
    const row = await lookupCnpj("11.222.333/0001-81");
    expect(row["STATUS"]).toBe("OK");
    expect(row["Razão Social"]).toBe("EMPRESA LTDA");
    expect(axios.get).toHaveBeenCalledWith(
      "https://publica.cnpj.ws/cnpj/11222333000181",
      expect.any(Object),
    );
  });

  it("returns CNPJ INVÁLIDO for invalid CNPJ without calling API", async () => {
    const row = await lookupCnpj("00.000.000/0000-00");
    expect(row["STATUS"]).toBe("CNPJ INVÁLIDO");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("returns NÃO ENCONTRADO on 404", async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });
    const row = await lookupCnpj("11.222.333/0001-81");
    expect(row["STATUS"]).toBe("NÃO ENCONTRADO");
  });

  it("returns ERRO API on 5xx", async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } });
    const row = await lookupCnpj("11.222.333/0001-81");
    expect(row["STATUS"]).toBe("ERRO API");
  });

  it("returns ERRO API on network timeout", async () => {
    axios.get.mockRejectedValue({ code: "ECONNABORTED" });
    const row = await lookupCnpj("11.222.333/0001-81");
    expect(row["STATUS"]).toBe("ERRO API");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/api.test.js --verbose
```

Expected: FAIL on `lookupCnpj` tests

- [ ] **Step 3: Add lookupCnpj to src/api.js**

Add before `module.exports` in `src/api.js`:

```js
const RATE_LIMIT_MS = 12000; // 5 per minute = 1 every 12s

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

  // Rate limiting: wait until 12s have passed since last request
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const digits = cnpj.replace(/\D/g, "");
  try {
    const response = await axios.get(`https://publica.cnpj.ws/cnpj/${digits}`, {
      timeout: 30000,
      headers: { Accept: "application/json" },
    });
    return mapApiResponse(cnpj, response.data);
  } catch (err) {
    const status =
      err.response && err.response.status === 404
        ? "NÃO ENCONTRADO"
        : "ERRO API";
    return errorRow(cnpj, status);
  }
}
```

Update `module.exports`:

```js
module.exports = { validateCnpj, mapApiResponse, lookupCnpj, sleep };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/api.test.js --verbose
```

Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add src/api.js tests/api.test.js
git commit -m "feat: api — rate-limited CNPJa HTTP lookup"
```

---

## Task 7: writer.js — Build and Save Output Excel

**Files:**

- Create: `src/writer.js`
- Create: `tests/writer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/writer.test.js`:

```js
const path = require("path");
const os = require("os");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { buildOutputPath, saveResults } = require("../src/writer");

const COLUMNS = [
  "CNPJ",
  "STATUS",
  "Razão Social",
  "Fantasia",
  "EMAIL",
  "FONE",
  "RESP",
  "SÓCIO ADMINISTRADOR",
  "ENDEREÇO",
  "BAIRRO",
  "CEP",
  "CIDADE",
  "ESTADO",
  "CNAE PRINCIPAL",
  "CNAES SECUNDÁRIOS",
];

describe("buildOutputPath", () => {
  it("returns path with _resultado suffix", () => {
    const out = buildOutputPath("/data/empresas.xlsx");
    expect(out).toBe("/data/empresas_resultado.xlsx");
  });

  it("handles nested paths", () => {
    const out = buildOutputPath("/a/b/c/lista.xlsx");
    expect(out).toBe("/a/b/c/lista_resultado.xlsx");
  });
});

describe("saveResults", () => {
  it("creates xlsx with correct headers and data rows", async () => {
    const outPath = path.join(os.tmpdir(), `result-test-${Date.now()}.xlsx`);
    const rows = [
      {
        CNPJ: "11.222.333/0001-81",
        STATUS: "OK",
        "Razão Social": "EMPRESA LTDA",
        Fantasia: "EMPRESA",
        EMAIL: "a@b.com",
        FONE: "(11) 9999",
        RESP: "JOSE",
        "SÓCIO ADMINISTRADOR": "JOSE",
        ENDEREÇO: "RUA A, 1",
        BAIRRO: "CENTRO",
        CEP: "01310-100",
        CIDADE: "SP",
        ESTADO: "SP",
        "CNAE PRINCIPAL": "TI",
        "CNAES SECUNDÁRIOS": "",
      },
    ];

    await saveResults(outPath, rows);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outPath);
    const ws = wb.worksheets[0];

    // Check headers
    const headerRow = ws.getRow(1).values.slice(1); // exceljs row values are 1-indexed, index 0 is empty
    expect(headerRow).toEqual(COLUMNS);

    // Check data row
    const dataRow = ws.getRow(2).values.slice(1);
    expect(dataRow[0]).toBe("11.222.333/0001-81");
    expect(dataRow[1]).toBe("OK");
    expect(dataRow[2]).toBe("EMPRESA LTDA");

    fs.unlinkSync(outPath);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/writer.test.js --verbose
```

Expected: FAIL — "Cannot find module '../src/writer'"

- [ ] **Step 3: Implement src/writer.js**

```js
const ExcelJS = require("exceljs");
const path = require("path");

const COLUMNS = [
  "CNPJ",
  "STATUS",
  "Razão Social",
  "Fantasia",
  "EMAIL",
  "FONE",
  "RESP",
  "SÓCIO ADMINISTRADOR",
  "ENDEREÇO",
  "BAIRRO",
  "CEP",
  "CIDADE",
  "ESTADO",
  "CNAE PRINCIPAL",
  "CNAES SECUNDÁRIOS",
];

function buildOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, ".xlsx");
  return path.join(dir, `${base}_resultado.xlsx`);
}

async function saveResults(outputPath, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Resultado");

  // Header row
  worksheet.addRow(COLUMNS);

  // Style header
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD3D3D3" },
  };

  // Data rows
  for (const row of rows) {
    worksheet.addRow(
      COLUMNS.map((col) => (row[col] !== undefined ? row[col] : "")),
    );
  }

  // Auto-fit column widths (approximate)
  worksheet.columns.forEach((col) => {
    col.width = 20;
  });

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = { buildOutputPath, saveResults, COLUMNS };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/writer.test.js --verbose
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/writer.js tests/writer.test.js
git commit -m "feat: writer — build and save PT-BR output Excel"
```

---

## Task 8: index.js — Main Orchestration

**Files:**

- Create: `index.js`

- [ ] **Step 1: Implement index.js**

```js
const path = require("path");
const cliProgress = require("cli-progress");
const { readCnpjs } = require("./src/reader");
const { loadProgress, markDone, clearProgress } = require("./src/progress");
const { lookupCnpj } = require("./src/api");
const { buildOutputPath, saveResults } = require("./src/writer");

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Uso: node index.js <arquivo.xlsx>");
    process.exit(1);
  }

  const absInput = path.resolve(inputPath);
  const progressPath = absInput.replace(/\.xlsx$/i, ".progress.json");
  const outputPath = buildOutputPath(absInput);

  // Read all CNPJs from input file
  let entries;
  try {
    entries = await readCnpjs(absInput);
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }

  const total = entries.length;
  const done = loadProgress(progressPath);

  const pending = entries.filter((e) => !done.has(e.cnpj));
  const results = [];
  let okCount = 0;
  let errCount = 0;
  let interrupted = false;

  console.log(`\nArquivo: ${path.basename(absInput)}`);
  console.log(`Total de CNPJs: ${total}`);
  if (done.size > 0) {
    console.log(
      `Retomando: ${done.size} já processados, ${pending.length} restantes\n`,
    );
  } else {
    console.log(`Iniciando processamento...\n`);
  }

  const startTime = Date.now();

  const bar = new cliProgress.SingleBar({
    format:
      "Processando |{bar}| {percentage}% | {value}/{total} | ✓ {ok} OK | ✗ {errors} erros | ETA: {eta_formatted}",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
  });

  bar.start(total, done.size, { ok: 0, errors: 0, eta_formatted: "--" });

  // SIGINT handler for graceful shutdown
  process.on("SIGINT", async () => {
    interrupted = true;
    bar.stop();
    console.log("\n\nInterrompendo...");
    if (results.length > 0) {
      await saveResults(outputPath, results);
    }
    console.log(
      `Interrompido. Progresso salvo (${done.size + results.length} CNPJs processados). Execute novamente para continuar.`,
    );
    process.exit(0);
  });

  for (const entry of pending) {
    if (interrupted) break;

    const row = await lookupCnpj(entry.cnpj);
    results.push(row);
    markDone(progressPath, entry.cnpj);

    if (row["STATUS"] === "OK") {
      okCount++;
    } else {
      errCount++;
    }

    const processed = done.size + results.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = results.length / elapsed; // rows per second
    const remaining = pending.length - results.length;
    const etaSec = rate > 0 ? remaining / rate : 0;
    const etaFormatted = formatEta(etaSec);

    bar.update(processed, {
      ok: okCount,
      errors: errCount,
      eta_formatted: etaFormatted,
    });

    // Incremental save every 100 rows
    if (results.length % 100 === 0) {
      await saveResults(outputPath, results);
    }
  }

  bar.stop();

  if (!interrupted) {
    await saveResults(outputPath, results);
    clearProgress(progressPath);
    console.log(`\nConcluído! ${total} CNPJs processados.`);
    console.log(
      `✓ ${okCount} encontrados | ✗ ${errCount} erros/não encontrados`,
    );
    console.log(`Resultado salvo em: ${outputPath}`);
  }
}

function formatEta(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

main().catch((err) => {
  console.error("Erro inesperado:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run all tests to ensure nothing broke**

```bash
npx jest --verbose
```

Expected: PASS — all tests across all test files

- [ ] **Step 3: Smoke test with a real small file (manual)**

Create a test file `test-pequeno.xlsx` with 3 CNPJs in column A (row 1 = header "CNPJ", rows 2–4 with real CNPJs). Run:

```bash
node index.js test-pequeno.xlsx
```

Expected:

- Progress bar appears
- After ~36 seconds (3 CNPJs × 12s), completes
- `test-pequeno_resultado.xlsx` created with results
- `test-pequeno.progress.json` deleted on completion

- [ ] **Step 4: Test resume (manual)**

Run again with a larger file. After 2–3 CNPJs, press `Ctrl+C`. Verify:

- A `.progress.json` file exists with processed CNPJs
- A partial `_resultado.xlsx` exists
- Running `node index.js <file>` again skips already-processed rows

- [ ] **Step 5: Commit**

```bash
git add index.js
git commit -m "feat: index — main orchestration with progress bar and graceful shutdown"
```

---

## Task 9: Final Wiring and README

**Files:**

- Create: `README.md`

- [ ] **Step 1: Write README.md**

````markdown
# Localizador CNPJ

Ferramenta CLI em Node.js para consultar CNPJs em lote via API CNPJa pública.

## Instalação

```bash
npm install
```
````

## Uso

```bash
node index.js arquivo.xlsx
```

**Entrada:** Arquivo `.xlsx` com CNPJs na coluna A (linha 1 = cabeçalho).
**Saída:** `arquivo_resultado.xlsx` com todos os dados da empresa.

## Retomada automática

Se o processo for interrompido (`Ctrl+C`), execute novamente o mesmo comando — os CNPJs já processados serão ignorados.

## Limite de requisições

A API CNPJa pública permite 5 consultas por minuto. Para 20.000 CNPJs, o processamento leva aproximadamente 66 horas.

## Colunas do arquivo de resultado

| Coluna              | Descrição                                      |
| ------------------- | ---------------------------------------------- |
| CNPJ                | CNPJ consultado                                |
| STATUS              | OK / NÃO ENCONTRADO / ERRO API / CNPJ INVÁLIDO |
| Razão Social        | Nome empresarial                               |
| Fantasia            | Nome fantasia                                  |
| EMAIL               | E-mail                                         |
| FONE                | Telefone                                       |
| RESP                | Responsável federativo                         |
| SÓCIO ADMINISTRADOR | Sócios administradores (separados por ;)       |
| ENDEREÇO            | Logradouro e número                            |
| BAIRRO              | Bairro                                         |
| CEP                 | CEP formatado                                  |
| CIDADE              | Município                                      |
| ESTADO              | UF                                             |
| CNAE PRINCIPAL      | Atividade econômica principal                  |
| CNAES SECUNDÁRIOS   | Atividades secundárias (separadas por ;)       |

````

- [ ] **Step 2: Run all tests one final time**

```bash
npx jest --verbose
````

Expected: PASS — all tests

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: add README with usage instructions"
```

---

## Self-Review

**Spec coverage check:**

- ✅ CLI entry point (`index.js`)
- ✅ Excel reading — column A, skip header (`reader.js`)
- ✅ Rate limiting — 12s between requests (`api.js`)
- ✅ CNPJa API call with error handling (`api.js`)
- ✅ CNPJ validation before API call (`api.js`)
- ✅ All 15 PT-BR output columns (`writer.js`)
- ✅ Resume state — skip processed CNPJs (`progress.js`)
- ✅ Progress bar with ETA (`index.js`)
- ✅ Graceful SIGINT shutdown (`index.js`)
- ✅ Incremental save every 100 rows (`index.js`)
- ✅ Final output file + cleanup of progress file (`index.js`)
- ✅ Error rows: NÃO ENCONTRADO, ERRO API, CNPJ INVÁLIDO (`api.js`)

**No placeholders detected.**

**Type/name consistency:**

- `lookupCnpj` used consistently in `api.js` and `index.js`
- `saveResults(path, rows)` consistent between `writer.js` and `index.js`
- `markDone(progressPath, cnpj)` consistent between `progress.js` and `index.js`
- Row object keys (column names) consistent across `api.js`, `writer.js`, and `tests`
