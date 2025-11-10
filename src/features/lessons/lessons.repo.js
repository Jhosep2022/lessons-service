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
import { title } from 'process';

const coursePK = (courseId) => `COURSE#${courseId}`;
const lessonsTable = env.lessonsTableName;

export async function getLesson(userId, courseId, lessonId) {
  const qr = await doc.send(new QueryCommand({
    TableName: lessonsTable,
    IndexName: 'byCourse',                 
    KeyConditionExpression: '#gpk = :gpk', 
    FilterExpression: '#lid = :lid',
    ExpressionAttributeNames: {
      '#gpk': 'GSI1PK',
      '#lid': 'lessonId',
    },
    ExpressionAttributeValues: {
      ':gpk': `COURSE#${courseId}`,
      ':lid': lessonId,
    },
    ScanIndexForward: true,
    Limit: 2,
  }));

  const lesson = (qr.Items || [])[0];
  if (!lesson) return null;

  const pk = `COURSE#${courseId}`;
  const [p, n] = await Promise.all([
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: { PK: pk, SK: `PROGRESS#LESSON#${lessonId}` }
    })),
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: { PK: pk, SK: `NOTES#LESSON#${lessonId}` }
    }))
  ]);

  return {
    lesson: {
      lessonId: lesson.lessonId,
      moduleId: lesson.moduleId,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      order: lesson.order,
      contentMD: lesson.contentMD || '',
      contentUrl: lesson.contentUrl || '',
      summary: lesson.summary || '',
      tips: lesson.tips || [],
      miniChallenges: lesson.miniChallenges || null,
    },
    progress: p.Item ? {
      status: p.Item?.status,
      progressPercent: p.Item?.progressPercent || 0,
      score: p.Item?.score || null,
      lastViewedAt: p.Item?.lastViewedAt || null,
      completedAt: p.Item?.completedAt || null
    } : { status: 'not_started', progressPercent: 0 },
    notes: n.Item?.content || ''
  };
}

/** Leer enrolment + meta del curso para calcular porcentaje */
export async function readCourseMeta(courseId) {
  const r = await doc.send(new GetCommand({
    TableName: env.tableName,
    Key: { PK: coursePK(courseId), SK: 'METADATA' }
  }));
  return r.Item || null;
}


export async function setLessonProgress({ userId, courseId, lessonId, nextStatus, progressPercent, score }) {
  const pk = coursePK(courseId);

  const [ prevProg, meta ] = await Promise.all([
    doc.send(new GetCommand({
      TableName: env.tableName,
      Key: { PK: pk, SK: `PROGRESS#LESSON#${lessonId}` }
    })),
    readCourseMeta(courseId)
  ]);

  if (!meta) throw new Error('COURSE_NOT_FOUND');

  const previousStatus = prevProg.Item?.status || 'not_started';
  let delta = 0;
  if (previousStatus !== 'completed' && nextStatus === 'completed') delta = +1;
  if (previousStatus === 'completed' && nextStatus !== 'completed') delta = -1;

  const now = new Date().toISOString();
  const currentCompleted = Number(meta.completedLessons || 0);
  const newCompleted = Math.max(0, currentCompleted + delta);
  const total = Number(meta.totalLessons || 0);

  const pct = total > 0 ? Math.round((newCompleted / total) * 10000) / 100 : 0;
  const newCourseStatus = pct === 100 ? 'completed' : 'active';

  await doc.send(new TransactWriteCommand({
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
            progressPercent: (progressPercent !== undefined)
              ? Number(progressPercent)
              : (prevProg.Item?.progressPercent ?? 0),
            score,
            lastViewedAt: now,
            completedAt: nextStatus === 'completed' ? now : prevProg.Item?.completedAt
          }
        }
      },
      {
        Update: {
          TableName: env.tableName,
          Key: { PK: pk, SK: 'METADATA' },
          UpdateExpression: 'SET completedLessons = :cl, progressPercent = :pp, updatedAt = :now, #st = :cs',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':cl': newCompleted,
            ':pp': pct,
            ':now': now,
            ':cs': newCourseStatus
          }
        }
      }
    ]
  }));

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

  return { completedLessons: newCompleted, totalLessons: total, progressPercent: pct, status: newCourseStatus, updatedAt: now };
}


export async function setLessonNotes({ userId, courseId, lessonId, content }) {
  const pk = coursePK(courseId);
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

  // (opcional) actividad
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

export async function appendLessonChatMessage({ userId, courseId, lessonId, message }) {
  const pk = coursePK(courseId);
  const now = new Date().toISOString();
  const threadId = `t_${courseId}_${lessonId}`;

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


export async function getCourseProgress(userId, courseId) {
  const meta = await readCourseMeta(courseId);
  const it = meta || {};
  return {
    completedLessons: it.completedLessons || 0,
    totalLessons: it.totalLessons || 0,
    progressPercent: it.progressPercent || 0,
    status: it.status || 'active',
    updatedAt: it.updatedAt
  };
}
