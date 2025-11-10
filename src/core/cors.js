export function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '*';
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS === '*' ? '*' : origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Max-Age': '600'
  };
}
export const preflightResponse = (event) => ({ statusCode: 204, headers: corsHeaders(event) });
