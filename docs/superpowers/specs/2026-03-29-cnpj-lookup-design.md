# CNPJ Lookup Tool — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Overview

A Node.js CLI tool that reads an Excel file containing CNPJs (column A, first row = header), queries the public CNPJa API for each one, and saves all results to a new Excel file. Designed to handle 10–20k rows with a 5 requests/minute rate limit (~66 hours for 20k rows), with full resumability if interrupted.

---

## Usage

```bash
node index.js empresas.xlsx
```

**Input:** `.xlsx` file with CNPJs in column A (row 1 = header, data from row 2 onward).
**Output:** `<filename>_resultado.xlsx` saved in the same directory as the input.
**Resume state:** `<filename>.progress.json` alongside the input file — deleted automatically on completion.

---

## File Structure

```
localizador-cnpj/
├── index.js          # Entry point: parse args, orchestrate flow
├── src/
│   ├── reader.js     # Read input .xlsx, extract CNPJs from column A
│   ├── api.js        # CNPJa HTTP calls + rate limiter (5/min = 1 every 12s)
│   ├── writer.js     # Build & save output .xlsx with PT-BR columns
│   └── progress.js   # Resume state: tracks processed CNPJs in a .json file
├── package.json
└── .gitignore
```

---

## Data Flow

1. `reader.js` reads the input `.xlsx` and returns `[{ row: N, cnpj: "..." }, ...]`
2. `progress.js` loads `.progress.json` and filters out already-processed CNPJs
3. For each remaining CNPJ, `api.js`:
   - Waits until 12 seconds have elapsed since the last request
   - Calls `GET https://publica.cnpj.ws/cnpj/{cnpj}`
   - On success: returns mapped PT-BR fields
   - On error (404, 429, 5xx): returns `{ STATUS: "NÃO ENCONTRADO" }` or `{ STATUS: "ERRO API" }`
4. After each result, `progress.js` appends the CNPJ to `.progress.json` (flush to disk immediately)
5. `writer.js` accumulates all results and saves `_resultado.xlsx`:
   - Final save at completion
   - Incremental checkpoint save every 100 rows as safety net

---

## Output Columns

| Column              | Description                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CNPJ                | CNPJ consultado                                                                                                                          |
| STATUS              | `OK`, `NÃO ENCONTRADO`, ou `ERRO API`                                                                                                    |
| Razão Social        | Nome empresarial registrado                                                                                                              |
| Fantasia            | Nome fantasia                                                                                                                            |
| EMAIL               | E-mail de contato                                                                                                                        |
| FONE                | Telefone principal                                                                                                                       |
| RESP                | Campo `responsavel_federativo` da API                                                                                                    |
| SÓCIO ADMINISTRADOR | Nomes dos sócios do array `socios` cuja `qualificacao_socio.descricao` contenha "Administrador" — separados por `;` se houver mais de um |
| ENDEREÇO            | Logradouro e número                                                                                                                      |
| BAIRRO              | Bairro                                                                                                                                   |
| CEP                 | CEP formatado                                                                                                                            |
| CIDADE              | Município                                                                                                                                |
| ESTADO              | UF                                                                                                                                       |
| CNAE PRINCIPAL      | Descrição da atividade principal                                                                                                         |
| CNAES SECUNDÁRIOS   | Atividades secundárias separadas por `;` em uma única célula                                                                             |

All fields are empty on failure rows, except CNPJ and STATUS.

---

## Rate Limiting

- 5 requests/minute = 1 request every 12 seconds
- Implemented as a simple timestamp-based delay in `api.js`: after each request, `await sleep(remaining)` where `remaining = 12000 - (Date.now() - lastRequestTime)`
- Self-corrects if API calls take longer than 12s (no artificial extra wait)

---

## Resumability

- After each processed CNPJ, its value is appended to `<filename>.progress.json`
- On startup, the tool reads this file and skips those CNPJs
- On completion, the progress file is deleted automatically
- Progress file is flushed to disk immediately after each result (not batched)

---

## Terminal Progress Display

Uses `cli-progress` library:

```
Processando CNPJs...
█████████░░░░░░░░░░░░░░░░░░░░ 31% | 6.234/20.000 | ✓ 6.190 OK | ✗ 44 erros | ETA: 44h 12m
```

- Updates after each processed CNPJ
- Shows: percentage, count processed, OK count, error count, estimated time remaining
- ETA calculated from actual elapsed time per request (rolling average)

---

## Graceful Shutdown

On `SIGINT` (Ctrl+C):

1. Catch the signal
2. Flush current progress to `.progress.json`
3. Save partial `_resultado.xlsx` with all results collected so far
4. Print:
   ```
   Interrompido. Progresso salvo (6.234 CNPJs processados). Execute novamente para continuar.
   ```
5. Exit cleanly

---

## Error Handling

| Scenario                | Behavior                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| CNPJ not found (404)    | Row included with `STATUS = NÃO ENCONTRADO`, all data fields empty |
| API error (429, 5xx)    | Row included with `STATUS = ERRO API`, all data fields empty       |
| Network timeout         | Same as API error                                                  |
| Invalid CNPJ format     | Marked as `STATUS = CNPJ INVÁLIDO` without making an API call      |
| Input file not found    | Exit immediately with clear error message                          |
| Input file has no CNPJs | Exit immediately with clear error message                          |

---

## Dependencies

- `xlsx` or `exceljs` — Excel read/write
- `axios` — HTTP requests
- `cli-progress` — terminal progress bar

---

## Not In Scope

- Web UI (future enhancement)
- Parallel requests (would violate rate limit)
- Multiple input files in one run
- Filtering or deduplication of CNPJs in the input
