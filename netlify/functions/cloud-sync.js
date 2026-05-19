const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function getAppsScriptUrl(input) {
  const raw = String(input || '').trim();
  if (raw) return raw;
  return '';
}

async function forwardReadAll(appsScriptUrl, query = {}) {
  const url = new URL(appsScriptUrl);
  url.searchParams.set('action', query.action || 'readAll');
  if (query.sheet) url.searchParams.set('sheet', query.sheet);
  const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    return { statusCode: 502, body: { ok: false, error: 'Apps Script returned non-JSON response', raw: text.slice(0, 200) } };
  }
  return { statusCode: res.status, body: payload };
}

async function forwardSaveAll(appsScriptUrl, data) {
  const res = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'saveAll', data: data || {} }),
    redirect: 'follow',
  });
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    return { statusCode: 502, body: { ok: false, error: 'Apps Script returned non-JSON response', raw: text.slice(0, 200) } };
  }
  return { statusCode: res.status, body: payload };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const qs = event.queryStringParameters || {};
    const body = event.httpMethod === 'POST' && event.body ? JSON.parse(event.body) : {};
    const action = String(qs.action || body.action || 'readAll');
    const appsScriptUrl = getAppsScriptUrl(qs.appsScriptUrl || qs.apps_script_url || body.appsScriptUrl || body.apps_script_url);

    if (!appsScriptUrl) {
      return json(400, { ok: false, error: 'Missing appsScriptUrl' });
    }

    if (action === 'ping') {
      const result = await forwardReadAll(appsScriptUrl, { action: 'ping' });
      return json(result.statusCode, result.body);
    }

    if (action === 'readAll') {
      const result = await forwardReadAll(appsScriptUrl, { action: 'readAll', sheet: qs.sheet || body.sheet || '' });
      return json(result.statusCode, result.body);
    }

    if (action === 'readSheet') {
      const sheet = String(qs.sheet || body.sheet || '').trim();
      if (!sheet) return json(400, { ok: false, error: 'Missing sheet' });
      const result = await forwardReadAll(appsScriptUrl, { action: 'readSheet', sheet });
      return json(result.statusCode, result.body);
    }

    if (action === 'saveAll') {
      const result = await forwardSaveAll(appsScriptUrl, body.data || {});
      return json(result.statusCode, result.body);
    }

    return json(400, { ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    return json(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
};
