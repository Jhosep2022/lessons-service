// src/features/lessons/lessons.service.js
import {
  getLesson,
  setLessonProgress,
  getCourseProgress,
  setLessonNotes,
  appendLessonChatMessage
} from './lessons.repo.js';

/** Util: asegura string no vacío */
const s = (v) => (typeof v === 'string' ? v.trim() : '');

/** GET detalle de lección */
export async function svcGetLesson({ userId, courseId, lessonId }) {
  if (!s(userId) || !s(courseId) || !s(lessonId)) throw new Error('BAD_INPUT');
  const res = await getLesson(userId, courseId, lessonId);
  if (!res) throw new Error('NOT_FOUND');
  return res;
}

/** PUT progreso de lección */
export async function svcSetProgress({ userId, courseId, lessonId, body }) {
  if (!s(userId) || !s(courseId) || !s(lessonId)) throw new Error('BAD_INPUT');

  const status = s(body?.status).toLowerCase();
  if (!['not_started', 'in_progress', 'completed'].includes(status)) {
    throw new Error('BAD_STATUS');
  }

  let progressPercent = body?.progressPercent;
  if (progressPercent !== undefined) {
    const n = Number(progressPercent);
    if (Number.isNaN(n)) throw new Error('BAD_PROGRESS');
    progressPercent = Math.max(0, Math.min(100, n));
  }

  if (status === 'completed') progressPercent = 100;

  const score = typeof body?.score === 'number' ? body.score : undefined;

  return await setLessonProgress({
    userId,
    courseId,
    lessonId,
    nextStatus: status,
    progressPercent,
    score
  });
}

/** GET progreso agregado del curso (para barra/resumen) */
export async function svcCourseProgress({ userId, courseId }) {
  if (!s(userId) || !s(courseId)) throw new Error('BAD_INPUT');
  return await getCourseProgress(userId, courseId);
}

/** PUT notas personales de la lección */
export async function svcSetNotes({ userId, courseId, lessonId, body }) {
  if (!s(userId) || !s(courseId) || !s(lessonId)) throw new Error('BAD_INPUT');
  const content = s(body?.content || '');
  return await setLessonNotes({ userId, courseId, lessonId, content });
}

/** POST mensaje al chat contextual de la lección */
export async function svcPostChat({ userId, courseId, lessonId, body }) {
  if (!s(userId) || !s(courseId) || !s(lessonId)) throw new Error('BAD_INPUT');
  const message = s(body?.message || '');
  if (!message) throw new Error('EMPTY_MESSAGE');

  return await appendLessonChatMessage({ userId, courseId, lessonId, message });
}
