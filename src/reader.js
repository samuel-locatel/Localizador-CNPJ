const ExcelJS = require('exceljs');
const fs = require('fs');

async function readCnpjs(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  const entries = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell(1).value;
    if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
      entries.push({ row: rowNumber, cnpj: String(cell).trim() });
    }
  });

  if (entries.length === 0) {
    throw new Error('Nenhum CNPJ encontrado no arquivo (coluna A, a partir da linha 2)');
  }

  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    if (!seen.has(entry.cnpj)) {
      seen.add(entry.cnpj);
      deduped.push(entry);
    }
  }

  return deduped;
}

module.exports = { readCnpjs };
