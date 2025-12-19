// netlify/functions/activate.js
const fs = require("fs");
const path = require("path");

// ---- Upstash helpers (robustos) ----
async function redisGet(baseUrl, token, key) {
  const url = `${baseUrl}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upstash GET failed (${res.status}): ${text.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Upstash GET non-JSON: ${text.slice(0, 200)}`);
  }

  return data.result ?? null;
}

async function redisSet(baseUrl, token, key, value) {
  const url = `${baseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upstash SET failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return true;
}

// ---- Cargar códigos (Netlify-safe) ----
function loadCodes() {
  // Netlify runtime root (donde quedan tus archivos del deploy)
  const root = process.env.LAMBDA_TASK_ROOT || process.cwd();
  const p = path.join(root, "codes.json");

  if (!fs.existsSync(p)) {
    throw new Error(`No encuentro codes.json en: ${p}`);
  }

  const raw = fs.readFileSync(p, "utf8");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("codes.json no es JSON válido");
  }

  if (!Array.isArray(parsed.codes)) {
    throw new Error('codes.json debe tener { "codes": [ ... ] }');
  }

  return parsed.codes;
}

// ---- Netlify handler ----
exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const code = (body.code || "").trim();
    const deviceId = (body.deviceId || "").trim();

    if (!code || !deviceId) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: "Datos incompletos" }),
      };
    }

    const codes = loadCodes();
    if (!codes.includes(code)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: "Código inválido" }),
      };
    }

    const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!baseUrl || !token) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: "Servidor no configurado (env vars)" }),
      };
    }

    // 1 código -> 1 dispositivo
    const usedBy = await redisGet(baseUrl, token, `code:${code}`);
    if (usedBy && usedBy !== deviceId) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: "Código ya usado" }),
      };
    }

    // 1 dispositivo -> 1 código
    const already = await redisGet(baseUrl, token, `device:${deviceId}`);
    if (already && already !== code) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, reason: "Dispositivo ya activado" }),
      };
    }

    await redisSet(baseUrl, token, `code:${code}`, deviceId);
    await redisSet(baseUrl, token, `device:${deviceId}`, code);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    // ⚠️ DEBUG TEMPORAL (para que veas el motivo real si falla)
    // Cuando esté todo OK, podés volver a "Error interno".
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        reason: `DEBUG: ${err?.message || String(err)}`,
      }),
    };
  }
};
