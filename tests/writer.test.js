const path = require('path');
const os = require('os');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { buildOutputPath, saveResults } = require('../src/writer');

const COLUMNS = [
  'CNPJ', 'STATUS', 'Razão Social', 'Fantasia', 'EMAIL', 'FONE',
  'RESP', 'SÓCIO ADMINISTRADOR', 'ENDEREÇO', 'BAIRRO', 'CEP',
  'CIDADE', 'ESTADO', 'CNAE PRINCIPAL', 'CNAES SECUNDÁRIOS',
];

describe('buildOutputPath', () => {
  it('returns path with _resultado suffix', () => {
    const out = buildOutputPath('/data/empresas.xlsx');
    expect(out).toBe('/data/empresas_resultado.xlsx');
  });

  it('handles nested paths', () => {
    const out = buildOutputPath('/a/b/c/lista.xlsx');
    expect(out).toBe('/a/b/c/lista_resultado.xlsx');
  });
});

describe('saveResults', () => {
  it('creates xlsx with correct headers and data rows', async () => {
    const outPath = path.join(os.tmpdir(), `result-test-${Date.now()}.xlsx`);
    const rows = [
      {
        'CNPJ': '11.222.333/0001-81', 'STATUS': 'OK',
        'Razão Social': 'EMPRESA LTDA', 'Fantasia': 'EMPRESA',
        'EMAIL': 'a@b.com', 'FONE': '(11) 9999', 'RESP': 'JOSE',
        'SÓCIO ADMINISTRADOR': 'JOSE', 'ENDEREÇO': 'RUA A, 1',
        'BAIRRO': 'CENTRO', 'CEP': '01310-100', 'CIDADE': 'SP',
        'ESTADO': 'SP', 'CNAE PRINCIPAL': 'TI', 'CNAES SECUNDÁRIOS': '',
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
    expect(dataRow[0]).toBe('11.222.333/0001-81');
    expect(dataRow[1]).toBe('OK');
    expect(dataRow[2]).toBe('EMPRESA LTDA');

    fs.unlinkSync(outPath);
  });
});
