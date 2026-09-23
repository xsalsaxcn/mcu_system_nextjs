import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from "crypto";

export type OnsitePushSummary = {
  configured: boolean;
  subscriptions: number;
  sent: number;
  failed: number;
  disabled: number;
  error?: string;
};

type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

type SubscriptionRow = {
  id: number;
  entry_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function b64urlDecode(value: string) {
  return Buffer.from(clean(value), "base64url");
}

function b64urlEncode(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

export function getOnsitePushConfig(): PushConfig | null {
  const publicKey = clean(process.env.VACCINATION_WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VACCINATION_WEB_PUSH_VAPID_PRIVATE_KEY);
  const subject = clean(process.env.VACCINATION_WEB_PUSH_VAPID_SUBJECT);
  if (!publicKey || !privateKey || !subject) return null;

  try {
    const rawPublic = b64urlDecode(publicKey);
    const rawPrivate = b64urlDecode(privateKey);
    if (rawPublic.length !== 65 || rawPublic[0] !== 4 || rawPrivate.length !== 32) return null;
    const subjectOk = subject.startsWith("mailto:") || /^https?:\/\//i.test(subject);
    if (!subjectOk) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const blocks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;
  let total = 0;

  while (total < length) {
    const hmac = createHmac("sha256", prk);
    hmac.update(previous);
    hmac.update(info);
    hmac.update(Buffer.from([counter]));
    previous = hmac.digest();
    blocks.push(previous);
    total += previous.length;
    counter += 1;
  }

  return Buffer.concat(blocks).subarray(0, length);
}

function vapidPrivateKey(config: PushConfig) {
  const rawPublic = b64urlDecode(config.publicKey);
  const x = rawPublic.subarray(1, 33);
  const y = rawPublic.subarray(33, 65);
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64urlEncode(x),
      y: b64urlEncode(y),
      d: config.privateKey,
    },
    format: "jwk",
  });
}

function makeVapidJwt(endpoint: string, config: PushConfig) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(Buffer.from(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: config.subject,
  })));
  const unsigned = `${header}.${payload}`;
  const signature = cryptoSign("sha256", Buffer.from(unsigned), {
    key: vapidPrivateKey(config),
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${b64urlEncode(signature)}`;
}

function encryptWebPushPayload(subscription: SubscriptionRow, payloadText: string) {
  const uaPublic = b64urlDecode(subscription.p256dh);
  const authSecret = b64urlDecode(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("Subscription p256dh tidak valid.");
  if (!authSecret.length) throw new Error("Subscription auth tidak valid.");

  const ecdh = createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const prkKey = createHmac("sha256", authSecret).update(sharedSecret).digest();
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublic,
    asPublic,
  ]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([Buffer.from(payloadText, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const idLength = Buffer.from([asPublic.length]);

  return Buffer.concat([
    salt,
    rs,
    idLength,
    asPublic,
    ciphertext,
    tag,
  ]);
}

async function sendOne(subscription: SubscriptionRow, payload: Record<string, unknown>, config: PushConfig) {
  const body = encryptWebPushPayload(subscription, JSON.stringify(payload));
  const jwt = makeVapidJwt(subscription.endpoint, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "300",
        Urgency: "high",
      },
      body: body as any,
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    return {
      ok: response.status === 201 || response.status === 202,
      expired: response.status === 404 || response.status === 410,
      status: response.status,
      message: text.slice(0, 500),
    };
  } catch (error: any) {
    return {
      ok: false,
      expired: false,
      status: 0,
      message: error?.name === "AbortError" ? "Push timeout" : clean(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendOnsiteQueueCalledPush(
  supabase: any,
  entry: any,
): Promise<OnsitePushSummary> {
  const config = getOnsitePushConfig();
  if (!config) {
    return { configured: false, subscriptions: 0, sent: 0, failed: 0, disabled: 0 };
  }

  const entryId = Number(entry?.id || 0);
  const queueNumber = clean(entry?.queue_number) || "Nomor Anda";
  const ticketToken = clean(entry?.public_token);
  if (!entryId) {
    return { configured: true, subscriptions: 0, sent: 0, failed: 0, disabled: 0, error: "entry id tidak valid" };
  }

  const subscriptionsResult = await supabase
    .from("vaccination_onsite_push_subscriptions")
    .select("id,entry_id,endpoint,p256dh,auth,enabled")
    .eq("entry_id", entryId)
    .eq("enabled", true);

  if (subscriptionsResult.error) {
    return {
      configured: true,
      subscriptions: 0,
      sent: 0,
      failed: 0,
      disabled: 0,
      error: subscriptionsResult.error.message,
    };
  }

  const subscriptions = (subscriptionsResult.data || []) as SubscriptionRow[];
  if (!subscriptions.length) {
    return { configured: true, subscriptions: 0, sent: 0, failed: 0, disabled: 0 };
  }

  const payload = {
    title: `Giliran Anda — ${queueNumber}`,
    body: `${queueNumber} dipanggil. Silakan menuju area vaksinasi sekarang.`,
    tag: `vaccination-onsite-called-${entryId}`,
    url: ticketToken
      ? `/vaccination/public/onsite-ticket/${encodeURIComponent(ticketToken)}`
      : "/vaccination",
    queueNumber,
    status: "CALLED",
  };

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      result: await sendOne(subscription, payload, config),
    })),
  );

  let sent = 0;
  let failed = 0;
  let disabled = 0;

  await Promise.all(results.map(async ({ subscription, result }) => {
    const now = new Date().toISOString();
    if (result.ok) {
      sent += 1;
      await supabase
        .from("vaccination_onsite_push_subscriptions")
        .update({
          last_success_at: now,
          last_error: null,
          last_error_at: null,
          updated_at: now,
        })
        .eq("id", subscription.id);
      return;
    }

    failed += 1;
    if (result.expired) disabled += 1;
    await supabase
      .from("vaccination_onsite_push_subscriptions")
      .update({
        enabled: result.expired ? false : true,
        last_error: `HTTP ${result.status}: ${result.message || "Push gagal"}`.slice(0, 1000),
        last_error_at: now,
        updated_at: now,
      })
      .eq("id", subscription.id);
  }));

  return {
    configured: true,
    subscriptions: subscriptions.length,
    sent,
    failed,
    disabled,
  };
}

export function onsitePushMessageSuffix(summary: OnsitePushSummary | null | undefined) {
  if (!summary) return "";
  if (!summary.configured) return " Background push belum dikonfigurasi di Vercel.";
  if (summary.error) return ` Background push belum siap: ${summary.error}`;
  if (!summary.subscriptions) return " Peserta belum mengaktifkan notifikasi background.";
  if (summary.sent > 0 && summary.failed === 0) return ` Push background terkirim ke ${summary.sent} device.`;
  if (summary.sent > 0) return ` Push background terkirim ${summary.sent}, gagal ${summary.failed}.`;
  return ` Push background gagal terkirim ke ${summary.failed} device.`;
}
