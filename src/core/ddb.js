import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
const ddb = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(ddb, { marshallOptions: { removeUndefinedValues: true }});
