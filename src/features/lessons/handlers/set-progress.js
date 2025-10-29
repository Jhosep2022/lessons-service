import { parse, ok, err } from '../../../core/http.js';
import { svcSetProgress } from '../lessons.service.js';

export const handler = async (event) => {
  try {
    const ctx = event?.requestContext?.authorizer?.lambda || {};
    if (!ctx.userId) return err(event, 'UNAUTHORIZED', 401);
    const { courseId, lessonId } = event.pathParameters || {};
    const body = (() => { try { return parse(event) || {}; } catch { return {}; } })();

    const res = await svcSetProgress({ userId: ctx.userId, courseId, lessonId, body });
    return ok(event, res); // { completedLessons, totalLessons, progressPercent, status, updatedAt }
  } catch (e) {
    const map = { UNAUTHORIZED: 401, BAD_STATUS: 400, COURSE_NOT_FOUND: 404 };
    return err(event, e.message || 'ERROR', map[e.message] || 400);
  }
};
