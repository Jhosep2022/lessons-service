export const env = {
  tableName: process.env.COURSES_TABLE_NAME,
  lessonsTableName: process.env.LESSONS_TABLE_NAME,
  stage: process.env.STAGE || 'dev',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*'
};
