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
    taxId: '11222333000181',
    alias: 'EMPRESA',
    company: {
      name: 'EMPRESA LTDA',
      jurisdiction: 'JOAO DA SILVA',
      members: [
        {
          person: { name: 'JOAO DA SILVA' },
          role: { text: 'Sócio-Administrador' },
        },
        {
          person: { name: 'MARIA SILVA' },
          role: { text: 'Sócio' },
        },
      ],
    },
    phones: [{ area: '11', number: '999999999' }],
    emails: [{ address: 'contato@empresa.com.br' }],
    address: {
      street: 'RUA EXEMPLO',
      number: '100',
      district: 'CENTRO',
      zip: '01310100',
      city: 'SAO PAULO',
      state: 'SP',
    },
    mainActivity: { text: 'Desenvolvimento de programas de computador' },
    sideActivities: [
      { text: 'Consultoria em TI' },
      { text: 'Suporte técnico' },
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
      company: {
        ...mockResponse.company,
        members: [
          { person: { name: 'A' }, role: { text: 'Sócio-Administrador' } },
          { person: { name: 'B' }, role: { text: 'Sócio-Administrador' } },
        ],
      },
    };
    const row = mapApiResponse('11.222.333/0001-81', data);
    expect(row['SÓCIO ADMINISTRADOR']).toBe('A; B');
  });

  it('formats CEP with hyphen', () => {
    const data = { ...mockResponse, address: { ...mockResponse.address, zip: '01310100' } };
    const row = mapApiResponse('11.222.333/0001-81', data);
    expect(row['CEP']).toBe('01310-100');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal = { company: { name: 'EMPRESA LTDA', members: [] } };
    const row = mapApiResponse('11.222.333/0001-81', minimal);
    expect(row['STATUS']).toBe('OK');
    expect(row['EMAIL']).toBe('');
    expect(row['SÓCIO ADMINISTRADOR']).toBe('');
    expect(row['CNAES SECUNDÁRIOS']).toBe('');
  });
});

describe('lookupCnpj', () => {
  let lookupCnpj;
  let mockRead;

  beforeEach(() => {
    jest.resetModules();
    mockRead = jest.fn();
    jest.doMock('@cnpja/sdk', () => ({
      CnpjaOpen: jest.fn().mockImplementation(() => ({
        office: { read: mockRead },
      })),
    }));
    lookupCnpj = require('../src/api').lookupCnpj;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped row on success', async () => {
    mockRead.mockResolvedValue({
      taxId: '11222333000181',
      alias: 'EMPRESA',
      company: { name: 'EMPRESA LTDA', jurisdiction: '', members: [] },
      phones: [{ area: '11', number: '999999999' }],
      emails: [],
      address: { street: 'RUA A', number: '1', district: 'CENTRO', zip: '01310100', city: 'SP', state: 'SP' },
      mainActivity: { text: 'TI' },
      sideActivities: [],
    });
    const row = await lookupCnpj('11.222.333/0001-81');
    expect(row['STATUS']).toBe('OK');
    expect(row['Razão Social']).toBe('EMPRESA LTDA');
    expect(mockRead).toHaveBeenCalledWith({ taxId: '11222333000181' });
  });

  it('returns CNPJ INVÁLIDO for invalid CNPJ without calling API', async () => {
    const row = await lookupCnpj('00.000.000/0000-00');
    expect(row['STATUS']).toBe('CNPJ INVÁLIDO');
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('returns NÃO ENCONTRADO on 404', async () => {
    mockRead.mockRejectedValue({ code: 404 });
    const row = await lookupCnpj('11.222.333/0001-81');
    expect(row['STATUS']).toBe('NÃO ENCONTRADO');
  });

  it('returns ERRO API on 5xx', async () => {
    mockRead.mockRejectedValue({ code: 500 });
    const row = await lookupCnpj('11.222.333/0001-81');
    expect(row['STATUS']).toBe('ERRO API');
  });

  it('returns ERRO API on network error', async () => {
    mockRead.mockRejectedValue(new Error('network failure'));
    const row = await lookupCnpj('11.222.333/0001-81');
    expect(row['STATUS']).toBe('ERRO API');
  });
});
