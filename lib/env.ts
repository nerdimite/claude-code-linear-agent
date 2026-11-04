function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get publicBaseUrl() {
    return required("PUBLIC_BASE_URL").replace(/\/$/, "");
  },
  get linearClientId() {
    return required("LINEAR_CLIENT_ID");
  },
  get linearClientSecret() {
    return required("LINEAR_CLIENT_SECRET");
  },
  get linearWebhookSecret() {
    return required("LINEAR_WEBHOOK_SECRET");
  },
  get signingSecret() {
    return required("BOT_SIGNING_SECRET");
  },
  /** Encrypts routine tokens at rest. Falls back to the signing secret if unset. */
  get encryptionKey() {
    return process.env.TOKEN_ENCRYPTION_KEY ?? required("BOT_SIGNING_SECRET");
  },
  get cronSecret() {
    return process.env.CRON_SECRET;
  },
  get routinesJson() {
    return process.env.ROUTINES_JSON ?? "{}";
  },
};
