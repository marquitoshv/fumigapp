const fs = require("fs");
const path = require("path");

// --- Helpers Upstash (robusto) ---
async function redisGet(baseUrl, token, key) {
  const url = `${baseUrl}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Upstash GET failed (${res.status}): ${text.slice(0, 200)}`);
  }

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Upstash GET non-JSON: ${text.slice(0, 200)}`); }

  return data.result ?? null;
}

async function redisSet(baseUrl, token, key, value) {
  const url = `${baseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Upstash SET failed (${res.status}): ${text.slice(0, 200)}`);
  }

  // Upstash responde JSON; pero no lo necesitamos para seguir
  return true;
}

// --- Load codes (robusto) ---
function loadCodes() {
  // raíz del repo: ../../codes.json
  const p = path.join(__dirname, "..", "..", "codes.json");

  if (!fs.existsSync(p)) {
    throw new Error(`No encuentro codes.json en: ${p}`);
  }

  const raw = fs.readFileSync(p, "utf8");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("codes.json no es JSON válido"); }

  if (!Array.isArray(parsed.codes)) {
    throw new Error("codes.json debe tener { \"codes\": [ ... ] }");
  }

  return parsed.codes;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const code = (body.code || "").trim();
    const deviceId = (body.deviceId || "").trim();

    if (!code || !deviceId) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Datos incompletos" }) };
    }

    const codes = loadCodes();
    if (!codes.includes(code)) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Código inválido" }) };
    }

    const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!baseUrl || !token) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Servidor no configurado (env vars)" }) };
    }

    // 1 code -> 1 device
    const usedBy = await redisGet(baseUrl, token, `code:${code}`);
    if (usedBy && usedBy !== deviceId) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Código ya usado" }) };
    }

    // 1 device -> 1 code
    const already = await redisGet(baseUrl, token, `device:${deviceId}`);
    if (already && already !== code) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Dispositivo ya activado" }) };
    }

    await redisSet(baseUrl, token, `code:${code}`, deviceId);
    await redisSet(baseUrl, token, `device:${deviceId}`, code);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    // 👇 DEBUG: devolvemos el error real para que lo puedas ver en consola
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        reason: `DEBUG: ${err?.message || String(err)}`
      })
    };
  }
};
