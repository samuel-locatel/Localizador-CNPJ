const path = require('path');
const cliProgress = require('cli-progress');
const { readCnpjs } = require('./src/reader');
const { loadProgress, markDone, clearProgress } = require('./src/progress');
const { lookupCnpj } = require('./src/api');
const { buildOutputPath, saveResults } = require('./src/writer');

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Uso: node index.js <arquivo.xlsx>');
    process.exit(1);
  }

  const absInput = path.resolve(inputPath);
  const progressPath = absInput.replace(/\.xlsx$/i, '.progress.json');
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

  const pending = entries.filter(e => !done.has(e.cnpj));
  const results = [];
  let okCount = 0;
  let errCount = 0;
  let interrupted = false;

  console.log(`\nArquivo: ${path.basename(absInput)}`);
  console.log(`Total de CNPJs: ${total}`);
  if (done.size > 0) {
    console.log(`Retomando: ${done.size} já processados, ${pending.length} restantes\n`);
  } else {
    console.log(`Iniciando processamento...\n`);
  }

  const startTime = Date.now();

  const bar = new cliProgress.SingleBar({
    format: 'Processando |{bar}| {percentage}% | {value}/{total} | ✓ {ok} OK | ✗ {errors} erros | ETA: {eta_formatted}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });

  bar.start(total, done.size, { ok: 0, errors: 0, eta_formatted: '--' });

  // SIGINT handler for graceful shutdown
  process.on('SIGINT', async () => {
    interrupted = true;
    bar.stop();
    console.log('\n\nInterrompendo...');
    if (results.length > 0) {
      await saveResults(outputPath, results);
    }
    console.log(`Interrompido. Progresso salvo (${done.size + results.length} CNPJs processados). Execute novamente para continuar.`);
    process.exit(0);
  });

  for (const entry of pending) {
    if (interrupted) break;

    const row = await lookupCnpj(entry.cnpj);
    results.push(row);
    markDone(progressPath, entry.cnpj);

    if (row['STATUS'] === 'OK') {
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

    bar.update(processed, { ok: okCount, errors: errCount, eta_formatted: etaFormatted });

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
    console.log(`✓ ${okCount} encontrados | ✗ ${errCount} erros/não encontrados`);
    console.log(`Resultado salvo em: ${outputPath}`);
  }
}

function formatEta(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

main().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
