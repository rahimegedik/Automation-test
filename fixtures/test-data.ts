export const TEST_PREFIX = 'TEST-';

export const stampedName = (label: string): string =>
  `${TEST_PREFIX}${label}-${Date.now()}`;

export const isTestRecord = (text: string | null | undefined): boolean =>
  !!text && text.toUpperCase().includes(TEST_PREFIX);

export const TEST_ADDRESS = {
  title: 'TEST-adres',
  firstName: 'Test',
  lastName: 'Kullanici',
  phone: '5551234567',
  tcNo: '11111111110',
  city: 'İstanbul',
  district: 'Şişli',
  neighborhood: 'Mecidiyeköy',
  postalCode: '34000',
  fullAddress: 'TEST-Mahallesi Test Cad. No:1 D:1',
};

export const TEST_IBAN = {
  validIban: 'TR330006100519786457841326',
  invalidIban: 'TR99INVALID',
  bankName: 'Ziraat Bankası',
  title: 'TEST-iban',
};

export const TEST_NOTIFICATION = {
  smsChannel: 'sms' as const,
  emailChannel: 'email' as const,
};
