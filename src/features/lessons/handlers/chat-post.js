import { parse, ok, err } from '../../../core/http.js';
import { svcPostChat } from '../lessons.service.js';

export const handler = async (event) => {
  try {
    const ctx = event?.requestContext?.authorizer?.lambda || {};
    if (!ctx.userId) return err(event, 'UNAUTHORIZED', 401);
    const { courseId, lessonId } = event.pathParameters || {};
    const body = (() => { try { return parse(event) || {}; } catch { return {}; } })();
    const res = await svcPostChat({ userId: ctx.userId, courseId, lessonId, body });
    return ok(event, res, 202);
  } catch (e) {
    return err(event, e.message || 'ERROR', 400);
  }
};
