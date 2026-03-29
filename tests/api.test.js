const { validateCnpj, mapApiResponse } = require('../src/api');

describe('validateCnpj', () => {
  it('accepts valid formatted CNPJ', () => {
    expect(validateCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('accepts valid unformatted CNPJ', () => {
    expect(validateCnpj('11222333000181')).toBe(true);
  });

  it('rejects all-same-digits CNPJ', () => {
    expect(validateCnpj('00.000.000/0000-00')).toBe(false);
    expect(validateCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(validateCnpj('1234')).toBe(false);
    expect(validateCnpj('')).toBe(false);
  });

  it('rejects bad check digits', () => {
    expect(validateCnpj('11.222.333/0001-00')).toBe(false);
  });
});

describe('mapApiResponse', () => {
  const mockResponse = {
    cnpj: '11222333000181',
    razao_social: 'EMPRESA LTDA',
    nome_fantasia: 'EMPRESA',
    email: 'contato@empresa.com.br',
    ddd_telefone_1: '11',
    telefone_1: '999999999',
    responsavel_federativo: 'JOAO DA SILVA',
    socios: [
      { nome_socio: 'JOAO DA SILVA', qualificacao_socio: { descricao: 'Sócio-Administrador' } },
      { nome_socio: 'MARIA SILVA', qualificacao_socio: { descricao: 'Sócio' } },
    ],
    logradouro: 'RUA EXEMPLO',
    numero: '100',
    bairro: 'CENTRO',
    cep: '01310100',
    municipio: 'SAO PAULO',
    uf: 'SP',
    cnae_fiscal_descricao: 'Desenvolvimento de programas de computador',
    cnaes_secundarios: [
      { descricao: 'Consultoria em TI' },
      { descricao: 'Suporte técnico' },
    ],
  };

  it('maps all fields to PT-BR columns', () => {
    const row = mapApiResponse('11.222.333/0001-81', mockResponse);
    expect(row['CNPJ']).toBe('11.222.333/0001-81');
    expect(row['STATUS']).toBe('OK');
    expect(row['Razão Social']).toBe('EMPRESA LTDA');
    expect(row['Fantasia']).toBe('EMPRESA');
    expect(row['EMAIL']).toBe('contato@empresa.com.br');
    expect(row['FONE']).toBe('(11) 999999999');
    expect(row['RESP']).toBe('JOAO DA SILVA');
    expect(row['SÓCIO ADMINISTRADOR']).toBe('JOAO DA SILVA');
    expect(row['ENDEREÇO']).toBe('RUA EXEMPLO, 100');
    expect(row['BAIRRO']).toBe('CENTRO');
    expect(row['CEP']).toBe('01310-100');
    expect(row['CIDADE']).toBe('SAO PAULO');
    expect(row['ESTADO']).toBe('SP');
    expect(row['CNAE PRINCIPAL']).toBe('Desenvolvimento de programas de computador');
    expect(row['CNAES SECUNDÁRIOS']).toBe('Consultoria em TI; Suporte técnico');
  });

  it('joins multiple admin socios with semicolon', () => {
    const data = {
      ...mockResponse,
      socios: [
        { nome_socio: 'A', qualificacao_socio: { descricao: 'Sócio-Administrador' } },
        { nome_socio: 'B', qualificacao_socio: { descricao: 'Sócio-Administrador' } },
      ],
    };
    const row = mapApiResponse('11.222.333/0001-81', data);
    expect(row['SÓCIO ADMINISTRADOR']).toBe('A; B');
  });

  it('formats CEP with hyphen', () => {
    const row = mapApiResponse('11.222.333/0001-81', { ...mockResponse, cep: '01310100' });
    expect(row['CEP']).toBe('01310-100');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal = {
      cnpj: '11222333000181',
      razao_social: 'EMPRESA LTDA',
    };
    const row = mapApiResponse('11.222.333/0001-81', minimal);
    expect(row['STATUS']).toBe('OK');
    expect(row['EMAIL']).toBe('');
    expect(row['SÓCIO ADMINISTRADOR']).toBe('');
    expect(row['CNAES SECUNDÁRIOS']).toBe('');
  });
});
