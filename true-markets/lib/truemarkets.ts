import { createPrivateKey, randomUUID, sign } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

export const TRUEMARKETS_DEFI_BASE_URL = "https://api.truemarkets.co";

const TRUEMARKETS_BASE_ENV_NAMES = [
  "TRUEMARKETS_DEFI_BASE_URL",
  "TRUEMARKETS_API_BASE_URL",
  "TRUEMARKETS_BASE_URL",
];

const TRUEMARKETS_BEARER_ENV_NAMES = [
  "TRUEMARKETS_DEFI_BEARER_TOKEN",
  "TRUEMARKETS_BEARER_TOKEN",
  "TRUEMARKETS_API_TOKEN",
  "TRUEMARKETS_JWT",
];

const TRUEMARKETS_OPENAPI_VERSION_ENV_NAMES = [
  "TRUEMARKETS_OPENAPI_VERSION",
  "TRUEMARKETS_DEFI_OPENAPI_VERSION",
];

const TRUEMARKETS_APP_PLATFORM_ENV_NAMES = [
  "TRUEMARKETS_APP_PLATFORM",
  "TRUEMARKETS_PLATFORM",
];

const TRUEMARKETS_APP_VERSION_ENV_NAMES = [
  "TRUEMARKETS_APP_VERSION",
  "TRUEMARKETS_VERSION",
];

const TRUEMARKETS_USER_AGENT_ENV_NAMES = [
  "TRUEMARKETS_USER_AGENT",
  "TRUEMARKETS_HTTP_USER_AGENT",
];

const TRUEMARKETS_ACCEPT_LANGUAGE_ENV_NAMES = [
  "TRUEMARKETS_ACCEPT_LANGUAGE",
  "TRUEMARKETS_LANG",
];

const TRUEMARKETS_BAGGAGE_ENV_NAMES = ["TRUEMARKETS_BAGGAGE"];

const TRUEMARKETS_SENTRY_TRACE_ENV_NAMES = ["TRUEMARKETS_SENTRY_TRACE"];

const TRUEMARKETS_API_KEY_FILE_ENV_NAMES = [
  "TRUEMARKETS_API_KEY_FILE",
  "TRUEMARKETS_API_KEY_PATH",
];

interface TrueMarketsApiKeyFile {
  key_id?: string;
  private_key?: Record<string, unknown>;
  algorithm?: string;
}

function firstEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function resolveTrueMarketsBaseUrl() {
  const explicit = firstEnvValue(TRUEMARKETS_BASE_ENV_NAMES);
  return explicit || TRUEMARKETS_DEFI_BASE_URL;
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function resolveApiKeyFilePath() {
  const configuredPath = firstEnvValue(TRUEMARKETS_API_KEY_FILE_ENV_NAMES);
  if (configuredPath) {
    const absolutePath = configuredPath.startsWith("/")
      ? configuredPath
      : resolve(process.cwd(), configuredPath);
    return existsSync(absolutePath) ? absolutePath : undefined;
  }

  try {
    const cwd = process.cwd();
    const matches = readdirSync(cwd)
      .filter((name) => /^truemarkets-api-key-.*\.json$/i.test(name))
      .sort();

    if (matches.length === 0) return undefined;
    return join(cwd, matches[0]);
  } catch {
    return undefined;
  }
}

function createSignedBearerToken(filePath: string): string | undefined {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as TrueMarketsApiKeyFile;
    const keyId = parsed.key_id?.trim();
    const privateKeyJwk = parsed.private_key;
    const algorithm = parsed.algorithm || "ES256";

    if (!keyId || !privateKeyJwk || algorithm !== "ES256") {
      return undefined;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: "ES256",
      typ: "JWT",
      kid: keyId,
    };
    const payload = {
      iss: keyId,
      sub: keyId,
      iat: now - 5,
      exp: now + 5 * 60,
      jti: randomUUID(),
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const privateKey = createPrivateKey({
      key: privateKeyJwk,
      format: "jwk",
    });
    const signature = sign("sha256", Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });

    return `${signingInput}.${toBase64Url(signature)}`;
  } catch {
    return undefined;
  }
}

export function getTrueMarketsServerConfig() {
  const baseUrl = resolveTrueMarketsBaseUrl();
  const envBearerToken = firstEnvValue(TRUEMARKETS_BEARER_ENV_NAMES);
  const keyFilePath = resolveApiKeyFilePath();
  const bearerToken =
    (envBearerToken ? normalizeBearerToken(envBearerToken) : undefined) ||
    (keyFilePath ? createSignedBearerToken(keyFilePath) : undefined);
  const openApiVersion =
    firstEnvValue(TRUEMARKETS_OPENAPI_VERSION_ENV_NAMES) || "2025-11-17";
  const appPlatform =
    firstEnvValue(TRUEMARKETS_APP_PLATFORM_ENV_NAMES) || "iOS";
  const appVersion =
    firstEnvValue(TRUEMARKETS_APP_VERSION_ENV_NAMES) || "1.12.0";
  const userAgent =
    firstEnvValue(TRUEMARKETS_USER_AGENT_ENV_NAMES) ||
    "TruexMarkets/55 CFNetwork/3826.500.131 Darwin/24.5.0";
  const acceptLanguage =
    firstEnvValue(TRUEMARKETS_ACCEPT_LANGUAGE_ENV_NAMES) || "en-US,en;q=0.9";
  const baggage = firstEnvValue(TRUEMARKETS_BAGGAGE_ENV_NAMES);
  const sentryTrace = firstEnvValue(TRUEMARKETS_SENTRY_TRACE_ENV_NAMES);

  return {
    baseUrl,
    bearerToken,
    keyFilePath,
    openApiVersion,
    appPlatform,
    appVersion,
    userAgent,
    acceptLanguage,
    baggage,
    sentryTrace,
  };
}
