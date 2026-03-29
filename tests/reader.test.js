const path = require('path');
const ExcelJS = require('exceljs');
const os = require('os');
const fs = require('fs');
const { readCnpjs } = require('../src/reader');

async function createTempXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach(r => ws.addRow(r));
  const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);
  return tmpPath;
}

describe('readCnpjs', () => {
  it('returns CNPJs from column A, skipping header row', async () => {
    const file = await createTempXlsx([
      ['CNPJ'],
      ['11.222.333/0001-81'],
      ['22.333.444/0001-70'],
    ]);
    const result = await readCnpjs(file);
    expect(result).toEqual([
      { row: 2, cnpj: '11.222.333/0001-81' },
      { row: 3, cnpj: '22.333.444/0001-70' },
    ]);
    fs.unlinkSync(file);
  });

  it('throws if file does not exist', async () => {
    await expect(readCnpjs('/nonexistent/file.xlsx')).rejects.toThrow('Arquivo não encontrado');
  });

  it('throws if no CNPJs found after header', async () => {
    const file = await createTempXlsx([['CNPJ']]);
    await expect(readCnpjs(file)).rejects.toThrow('Nenhum CNPJ encontrado');
    fs.unlinkSync(file);
  });

  it('skips empty cells', async () => {
    const file = await createTempXlsx([
      ['CNPJ'],
      ['11.222.333/0001-81'],
      [null],
      ['22.333.444/0001-70'],
    ]);
    const result = await readCnpjs(file);
    expect(result).toHaveLength(2);
    fs.unlinkSync(file);
  });
});
