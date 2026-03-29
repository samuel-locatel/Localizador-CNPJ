const ExcelJS = require('exceljs');
const path = require('path');

const COLUMNS = [
  'CNPJ', 'STATUS', 'Razão Social', 'Fantasia', 'EMAIL', 'FONE',
  'RESP', 'SÓCIO ADMINISTRADOR', 'ENDEREÇO', 'BAIRRO', 'CEP',
  'CIDADE', 'ESTADO', 'CNAE PRINCIPAL', 'CNAES SECUNDÁRIOS',
];

function buildOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, '.xlsx');
  return path.join(dir, `${base}_resultado.xlsx`);
}

async function saveResults(outputPath, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Resultado');

  // Header row
  worksheet.addRow(COLUMNS);

  // Style header
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  };

  // Data rows
  for (const row of rows) {
    worksheet.addRow(COLUMNS.map(col => row[col] !== undefined ? row[col] : ''));
  }

  // Auto-fit column widths (approximate)
  worksheet.columns.forEach(col => {
    col.width = 20;
  });

  await workbook.xlsx.writeFile(outputPath);
}

module.exports = { buildOutputPath, saveResults, COLUMNS };
