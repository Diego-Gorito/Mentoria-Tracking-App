import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetAuthCache, loadServiceAccountKey } from '../auth';
import { GtmAuthError } from '../errors';

describe('gtm/auth.ts loadServiceAccountKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GTM_SA_KEY_JSON;
    delete process.env.GTM_SA_KEY_PATH;
    _resetAuthCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetAuthCache();
  });

  it('lança GtmAuthError quando nenhuma env var setada', () => {
    expect(() => loadServiceAccountKey()).toThrow(GtmAuthError);
  });

  it('carrega de GTM_SA_KEY_JSON quando válido', () => {
    process.env.GTM_SA_KEY_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'test',
      private_key_id: 'k',
      private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
      client_email: 'sa@test.iam.gserviceaccount.com',
      client_id: '1',
      auth_uri: 'x',
      token_uri: 'y',
      auth_provider_x509_cert_url: 'z',
      client_x509_cert_url: 'w',
    });
    const key = loadServiceAccountKey();
    expect(key.client_email).toBe('sa@test.iam.gserviceaccount.com');
    expect(key.type).toBe('service_account');
  });

  it('lança GtmAuthError quando GTM_SA_KEY_JSON tem type errado', () => {
    process.env.GTM_SA_KEY_JSON = JSON.stringify({
      type: 'authorized_user', // tipo errado
      client_email: 'x',
      private_key: 'y',
    });
    expect(() => loadServiceAccountKey()).toThrow(/Invalid SA key/);
  });

  it('lança GtmAuthError quando GTM_SA_KEY_JSON falta campos required', () => {
    process.env.GTM_SA_KEY_JSON = JSON.stringify({
      type: 'service_account',
      // missing client_email + private_key
    });
    expect(() => loadServiceAccountKey()).toThrow(/missing client_email or private_key/);
  });

  it('lança GtmAuthError quando GTM_SA_KEY_JSON não é JSON válido', () => {
    process.env.GTM_SA_KEY_JSON = 'not-json-at-all';
    expect(() => loadServiceAccountKey()).toThrow(/Failed to parse GTM_SA_KEY_JSON/);
  });

  it('cacheia resultado (idempotente em chamadas subsequentes)', () => {
    process.env.GTM_SA_KEY_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'p',
      private_key_id: 'k',
      private_key: 'pk',
      client_email: 'a@b.iam',
      client_id: '1',
      auth_uri: 'x',
      token_uri: 'y',
      auth_provider_x509_cert_url: 'z',
      client_x509_cert_url: 'w',
    });
    const k1 = loadServiceAccountKey();
    // Mudar env não deve afetar 2ª chamada (cache)
    process.env.GTM_SA_KEY_JSON = JSON.stringify({
      type: 'service_account',
      client_email: 'OUTRO@b.iam',
      private_key: 'pk',
      project_id: 'p',
      private_key_id: 'k',
      client_id: '1',
      auth_uri: 'x',
      token_uri: 'y',
      auth_provider_x509_cert_url: 'z',
      client_x509_cert_url: 'w',
    });
    const k2 = loadServiceAccountKey();
    expect(k2.client_email).toBe(k1.client_email); // veio do cache
  });
});
