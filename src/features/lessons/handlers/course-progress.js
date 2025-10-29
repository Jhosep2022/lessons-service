import { ok, err } from '../../../core/http.js';
import { svcCourseProgress } from '../lessons.service.js';

export const handler = async (event) => {
  try {
    const ctx = event?.requestContext?.authorizer?.lambda || {};
    if (!ctx.userId) return err(event, 'UNAUTHORIZED', 401);
    const { courseId } = event.pathParameters || {};
    const res = await svcCourseProgress({ userId: ctx.userId, courseId });
    return ok(event, res);
  } catch (e) {
    const map = { UNAUTHORIZED: 401 };
    return err(event, e.message || 'ERROR', map[e.message] || 400);
  }
};
