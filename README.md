# Localizador CNPJ

Ferramenta CLI em Node.js para consultar CNPJs em lote via API CNPJa pública.

## Instalação

```bash
npm install
```

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

| Coluna | Descrição |
|--------|-----------|
| CNPJ | CNPJ consultado |
| STATUS | OK / NÃO ENCONTRADO / ERRO API / CNPJ INVÁLIDO |
| Razão Social | Nome empresarial |
| Fantasia | Nome fantasia |
| EMAIL | E-mail |
| FONE | Telefone |
| RESP | Responsável federativo |
| SÓCIO ADMINISTRADOR | Sócios administradores (separados por ;) |
| ENDEREÇO | Logradouro e número |
| BAIRRO | Bairro |
| CEP | CEP formatado |
| CIDADE | Município |
| ESTADO | UF |
| CNAE PRINCIPAL | Atividade econômica principal |
| CNAES SECUNDÁRIOS | Atividades secundárias (separadas por ;) |
