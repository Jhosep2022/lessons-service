// src/features/lessons/lessons.repo.js
import {
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import { doc } from '../../core/ddb.js';
import { env } from '../../core/env.js';

const userCoursePK = (userId, courseId) => `UC#${userId}#${courseId}`;
const enrollKey = (userId, courseId) => ({ PK: `USER#${userId}`, SK: `COURSE#${courseId}` });

export async function getLesson(userId, courseId, lessonId) {
  const pk = userCoursePK(userId, courseId);

  const q = await doc.send(new QueryCommand({
    TableName: env.tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    FilterExpression: 'lessonId = :lid',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':p': 'LESSON#',
      ':lid': lessonId
    },
    ScanIndexForward: true
  }));
  const lesson = (q.Items || []).find(i => i.lessonId === lessonId);
  if (!lesson) return null;

  // Progreso (si existe)
  const p = await doc.send(new GetCommand({
    TableName: env.tableName,
    Key: { PK: pk, SK: `PROGRESS#LESSON#${lessonId}` }
  }));

  // Notas (si existen)
  const n = await doc.send(new GetCommand({
    TableName: env.tableName,
    Key: { PK: pk, SK: `NOTES#LESSON#${lessonId}` }
  }));

  return {
    lesson: {
      lessonId: lesson.lessonId,
      moduleId: lesson.moduleId,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      contentMD: lesson.contentMD,
      contentUrl: lesson.contentUrl,
      summary: lesson.summary,
      tips: lesson.tips || [],
      miniChallenge: lesson.miniChallenge || null
    },
    progress: p.Item ? {
      status: p.Item.status,
      progressPercent: p.Item.progressPercent ?? 0,
      score: p.Item.score,
      lastViewedAt: p.Item.lastViewedAt,
      completedAt: p.Item.completedAt
    } : { status: 'not_started', progressPercent: 0 },
    notes: n.Item?.content || ''
  };
}

/** Leer enrolment + meta del curso para calcular porcentaje */
export async function readEnrollmentAndMeta(userId, courseId) {
  const [enroll, meta] = await Promise.all([
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: enrollKey(userId, courseId)
    })),
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: { PK: userCoursePK(userId, courseId), SK: 'COURSE#METADATA' }
    }))
  ]);
  return { enroll: enroll.Item || null, meta: meta.Item || null };
}

export async function setLessonProgress({ userId, courseId, lessonId, nextStatus, progressPercent, score }) {
  const pk = userCoursePK(userId, courseId);

  // 1) Leer progreso previo + enrolment/meta
  const [prevProg, { enroll, meta }] = await Promise.all([
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: { PK: pk, SK: `PROGRESS#LESSON#${lessonId}` }
    })),
    readEnrollmentAndMeta(userId, courseId)
  ]);

  if (!enroll || !meta) throw new Error('COURSE_NOT_FOUND');
  const prevStatus = prevProg.Item?.status || 'not_started';

  // 2) Calcular delta de completados para la barra del curso
  let delta = 0;
  if (prevStatus !== 'completed' && nextStatus === 'completed') delta = +1;
  if (prevStatus === 'completed' && nextStatus !== 'completed') delta = -1;

  const now = new Date().toISOString();
  const newCompleted = Math.max(0, (enroll.completedLessons || 0) + delta);
  const total = meta.totalLessons || enroll.totalLessons || 0;

  const pct = total > 0
    ? Math.round((newCompleted / total) * 10000) / 100
    : 0;

  const newCourseStatus = pct === 100 ? 'completed' : 'active';
  const newGSI2SK = `STATUS#${newCourseStatus}#${now}`;

  // 3) Transacción: (a) progreso (con % opcional), (b) enrolment agregado
  const tx = new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: env.tableName,
          Item: {
            PK: pk,
            SK: `PROGRESS#LESSON#${lessonId}`,
            etype: 'PROGRESS',
            lessonId,
            status: nextStatus,
            progressPercent: progressPercent !== undefined ? Number(progressPercent) : (prevProg.Item?.progressPercent ?? 0),
            score,
            lastViewedAt: now,
            completedAt: nextStatus === 'completed' ? now : prevProg.Item?.completedAt
          }
        }
      },
      {
        Update: {
          TableName: env.tableName,
          Key: enrollKey(userId, courseId),
          UpdateExpression: 'SET completedLessons = :cl, progressPercent = :pp, updatedAt = :now, #st = :cs, GSI2PK = :gpk, GSI2SK = :gsk, totalLessons = if_not_exists(totalLessons, :tot)',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':cl': newCompleted,
            ':pp': pct,
            ':now': now,
            ':cs': newCourseStatus,
            ':gpk': `USER#${userId}`,
            ':gsk': newGSI2SK,
            ':tot': total
          }
        }
      }
    ]
  });
  await doc.send(tx);

  // 4) Log de actividad para el dashboard (semanal)
  await doc.send(new PutCommand({
    TableName: env.tableName,
    Item: {
      PK: `UA#${userId}`,
      SK: `ACT#${now}`,
      etype: 'USER_ACTIVITY',
      activityType: 'study',
      courseId,
      lessonId,
      minutes: nextStatus === 'completed' ? 15 : 5
    }
  }));

  return {
    completedLessons: newCompleted,
    totalLessons: total,
    progressPercent: pct,
    status: newCourseStatus,
    updatedAt: now
  };
}

/** Guardar/actualizar notas personales de la lección */
export async function setLessonNotes({ userId, courseId, lessonId, content }) {
  const pk = userCoursePK(userId, courseId);
  const now = new Date().toISOString();

  await doc.send(new PutCommand({
    TableName: env.tableName,
    Item: {
      PK: pk,
      SK: `NOTES#LESSON#${lessonId}`,
      etype: 'LESSON_NOTES',
      content: content || '',
      updatedAt: now
    }
  }));

  // Log ligero para actividad semanal
  await doc.send(new PutCommand({
    TableName: env.tableName,
    Item: {
      PK: `UA#${userId}`,
      SK: `ACT#${now}`,
      etype: 'USER_ACTIVITY',
      activityType: 'notes',
      courseId,
      lessonId,
      minutes: 3
    }
  }));

  return { ok: true, updatedAt: now };
}

/** Agregar mensaje al chat contextual de una lección (worker IA lo consumirá) */
export async function appendLessonChatMessage({ userId, courseId, lessonId, message }) {
  const pk = userCoursePK(userId, courseId);
  const now = new Date().toISOString();
  const threadId = `t_${courseId}_${lessonId}`; // estable para encadenar

  await doc.send(new PutCommand({
    TableName: env.tableName,
    Item: {
      PK: pk,
      SK: `CHAT#LESSON#${lessonId}#${now}`,
      etype: 'LESSON_CHAT_MSG',
      threadId,
      role: 'user',
      content: message || '',
      createdAt: now
    }
  }));

  // (Opcional) marcador de thread (idempotente)
  await doc.send(new PutCommand({
    TableName: env.tableName,
    Item: {
      PK: pk,
      SK: `CHAT#LESSON#${lessonId}#THREAD`,
      etype: 'LESSON_CHAT_THREAD',
      threadId,
      lastMessageAt: now
    }
  }));

  return { threadId, queued: true };
}

/** Resumen de progreso del curso (para la barra del header) */
export async function getCourseProgress(userId, courseId) {
  const r = await doc.send(new GetCommand({
    TableName: env.tableName,
    Key: enrollKey(userId, courseId)
  }));
  const it = r.Item || {};
  return {
    completedLessons: it.completedLessons || 0,
    totalLessons: it.totalLessons || 0,
    progressPercent: it.progressPercent || 0,
    status: it.status || 'active',
    updatedAt: it.updatedAt
  };
}
