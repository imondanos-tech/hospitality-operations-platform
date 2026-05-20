// Netlify Function: netlify/functions/cloud-sync.js
// Proxies requests between the Netlify app and Google Apps Script
// This solves the CORS issue — browser → Netlify Function → Google Apps Script

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function jsonResponse(statusCode, body) {
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

// The Apps Script URL — hardcoded as backup, but also accepts it from request
const DEFAULT_SCRIPT_URL = 'https://script.google.com/a/macros/ebay.com/s/AKfycbx-VbAhLH-dh_MqXZelzRUPmG5OvZnx7r_5z11LaGIyxUAj6ICB15xeb58sj3l9p83UjA/exec';

exports.handler = async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const qs = event.queryStringParameters || {};
    let body = {};
    if (event.httpMethod === 'POST' && event.body) {
      try { body = JSON.parse(event.body); } catch(e) { body = {}; }
    }

    const action = String(qs.action || body.action || 'readAll');
    // Accept URL from request or use hardcoded default
    const appsScriptUrl = String(
      qs.appsScriptUrl || qs.apps_script_url ||
      body.appsScriptUrl || body.apps_script_url ||
      DEFAULT_SCRIPT_URL
    ).trim();

    if (!appsScriptUrl) {
      return jsonResponse(400, { ok: false, error: 'Missing Apps Script URL' });
    }

    // ── PING ──
    if (action === 'ping') {
      const url = new URL(appsScriptUrl);
      url.searchParams.set('action', 'ping');
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
      const text = await res.text();
      try { return jsonResponse(200, JSON.parse(text)); }
      catch(e) { return jsonResponse(200, { ok: true, raw: text.slice(0,200) }); }
    }

    // ── READ ALL ──
    if (action === 'readAll') {
      const url = new URL(appsScriptUrl);
      url.searchParams.set('action', 'readAll');
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
      const text = await res.text();
      try { return jsonResponse(200, JSON.parse(text)); }
      catch(e) { return jsonResponse(502, { ok: false, error: 'Apps Script returned non-JSON', raw: text.slice(0,300) }); }
    }

    // ── READ SHEET ──
    if (action === 'readSheet') {
      const sheet = String(qs.sheet || body.sheet || '').trim();
      if (!sheet) return jsonResponse(400, { ok: false, error: 'Missing sheet name' });
      const url = new URL(appsScriptUrl);
      url.searchParams.set('action', 'readSheet');
      url.searchParams.set('sheet', sheet);
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
      const text = await res.text();
      try { return jsonResponse(200, JSON.parse(text)); }
      catch(e) { return jsonResponse(502, { ok: false, error: 'Apps Script returned non-JSON', raw: text.slice(0,300) }); }
    }

    // ── SAVE ALL ──
    if (action === 'saveAll') {
      const res = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action: 'saveAll', data: body.data || {} }),
        redirect: 'follow',
      });
      const text = await res.text();
      try { return jsonResponse(200, JSON.parse(text)); }
      catch(e) {
        // Apps Script POST with no-cors returns opaque response — treat empty as success
        if (!text || text.trim() === '') {
          return jsonResponse(200, { ok: true, saved: true, note: 'Empty response treated as success' });
        }
        return jsonResponse(502, { ok: false, error: 'Apps Script returned non-JSON', raw: text.slice(0,300) });
      }
    }

    return jsonResponse(400, { ok: false, error: `Unknown action: ${action}` });

  } catch (err) {
    return jsonResponse(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
};
