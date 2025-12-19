const fs = require("fs");
const path = require("path");

async function redisGet(baseUrl, token, key) {
  const res = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function redisSet(baseUrl, token, key, value) {
  await fetch(`${baseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function loadCodes() {
  // robust path to project root
  const p = path.join(__dirname, "..", "..", "codes.json");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.codes) ? parsed.codes : [];
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { code, deviceId } = JSON.parse(event.body || "{}");

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

    // prevent multiple codes per device
    const already = await redisGet(baseUrl, token, `device:${deviceId}`);
    if (already && already !== code) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Dispositivo ya activado" }) };
    }

    await redisSet(baseUrl, token, `code:${code}`, deviceId);
    await redisSet(baseUrl, token, `device:${deviceId}`, code);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, reason: "Error interno" }) };
  }
};
