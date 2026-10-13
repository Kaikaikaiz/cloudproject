import serverlessExpress from '@codegenie/serverless-express';
import { signToken } from '../lib/jwt.js';
import { normalizeGatewayEvent } from './gateway-event.js';
export function createHandler(app, { streamProcessor } = {}) {
  signToken('startup-config-check');
  const proxy = serverlessExpress({ app });
  return async (event, context) => {
    if (event?.Records?.[0]?.eventSource === 'aws:dynamodb') {
      if (!streamProcessor) return { batchItemFailures: [] };
      return streamProcessor(event, context);
    }
    const started = Date.now();
    const response = await proxy(
      normalizeGatewayEvent(event), 
      context);
    console.log(JSON.stringify({ 
      event: 'http_request', 
      requestId: context.awsRequestId, 
      method: event.httpMethod, 
      path: event.resource, 
      status: response.statusCode, 
      durationMs: Date.now() - started 
    }));
    return response;
  };
}

