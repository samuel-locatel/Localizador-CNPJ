const { validateCnpj } = require('../src/api');

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
