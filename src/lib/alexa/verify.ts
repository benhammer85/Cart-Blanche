import "server-only";
import { X509Certificate, verify as cryptoVerify } from "node:crypto";
import { rootCertificates } from "node:tls";

// Alexa request verification for skills hosted outside Lambda (signature,
// certificate URL, certificate chain to a trusted root, SAN, validity).

const certCache = new Map<string, { certs: X509Certificate[]; until: number }>();
const roots = rootCertificates
  .map((pem) => {
    try {
      return new X509Certificate(pem);
    } catch {
      return null;
    }
  })
  .filter(Boolean) as X509Certificate[];

export function validCertUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === "s3.amazonaws.com" &&
      (u.port === "" || u.port === "443") &&
      u.pathname.startsWith("/echo.api/") // URL() already resolves "../"
    );
  } catch {
    return false;
  }
}

async function loadChain(url: string): Promise<X509Certificate[]> {
  const hit = certCache.get(url);
  if (hit && hit.until > Date.now()) return hit.certs;
  const pem = await (await fetch(url, { cache: "no-store" })).text();
  const certs = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((c) => new X509Certificate(c));
  certCache.set(url, { certs, until: Date.now() + 3600_000 });
  return certs;
}

/** Returns null when valid, otherwise a short reason. */
export async function verifyAlexaRequest(headers: Headers, body: string): Promise<string | null> {
  const certUrl = headers.get("signaturecertchainurl");
  const sig256 = headers.get("signature-256");
  if (!certUrl || !sig256) return "missing signature headers";
  if (!validCertUrl(certUrl)) return "bad cert url";
  const chain = await loadChain(certUrl);
  const leaf = chain[0];
  if (!leaf) return "no certificate";
  const now = Date.now();
  if (now < Date.parse(leaf.validFrom) || now > Date.parse(leaf.validTo)) return "certificate expired";
  if (!(leaf.subjectAltName ?? "").split(/,\s*/).includes("DNS:echo-api.amazon.com")) return "wrong certificate subject";
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) return "broken certificate chain";
  }
  const top = chain[chain.length - 1];
  const trusted = roots.some((r) => r.fingerprint256 === top.fingerprint256 || (top.checkIssued(r) && top.verify(r.publicKey)));
  if (!trusted) return "untrusted certificate";
  const ok = cryptoVerify("sha256", Buffer.from(body, "utf8"), leaf.publicKey, Buffer.from(sig256, "base64"));
  return ok ? null : "bad signature";
}
