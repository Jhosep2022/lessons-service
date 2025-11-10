import { corsHeaders } from './cors.js';

export function parse(event) {
  if (!event || !event.body) return {};
  return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
}

export function ok(event, body, statusCode = 200, extra = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event), ...(extra.headers || {}) },
    body: JSON.stringify(body)
  };
}

export function err(event, message, status = 400, extra = {}) {
  return ok(event, { error: message }, status, extra);
}
