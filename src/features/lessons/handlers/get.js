import { ok, err } from '../../../core/http.js';
import { svcGetLesson } from '../lessons.service.js';

export const handler = async (event) => {
  try {
    const ctx = event?.requestContext?.authorizer?.lambda || {};
    if (!ctx.userId) return err(event, 'UNAUTHORIZED', 401);
    const { courseId, lessonId } = event.pathParameters || {};
    const res = await svcGetLesson({ userId: ctx.userId, courseId, lessonId });
    return ok(event, res);
  } catch (e) {
    const map = { UNAUTHORIZED: 401, NOT_FOUND: 404 };
    return err(event, e.message || 'ERROR', map[e.message] || 400);
  }
};
