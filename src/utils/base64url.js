// src/utils/base64url.js

// Base64URL-safe helpers (works with URL-encoded and missing padding cases)

export function base64UrlEncode(input) {
  const str = typeof input === "string" ? input : JSON.stringify(input);

  // UTF-8 safe btoa
  const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );

  const b64 = btoa(utf8);

  // Convert to Base64URL (no padding)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeToString(input) {
  if (!input || typeof input !== "string") {
    throw new Error("base64url_decode: empty input");
  }

  // Some providers/redirects double-encode query params
  const raw = safeDecodeURIComponent(input);

  // Convert Base64URL -> Base64
  let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");

  // Restore padding
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad !== 0) {
    // If pad==1, it's invalid base64; still try but likely fails
  }

  // atob -> bytes -> UTF-8
  const bytes = atob(b64);
  let percentEncoded = "";
  for (let i = 0; i < bytes.length; i++) {
    percentEncoded += "%" + bytes.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return decodeURIComponent(percentEncoded);
}

export function base64UrlDecodeToJson(input) {
  const s = base64UrlDecodeToString(input);
  return JSON.parse(s);
}

export function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // If it wasn't encoded, return as-is
  }
}
