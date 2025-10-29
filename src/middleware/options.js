import { preflightResponse } from '../core/cors.js';
export const handler = async (event) => preflightResponse(event);
