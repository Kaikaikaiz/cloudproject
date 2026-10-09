import { createServiceApp } from '../service-app.js';
import { register } from '../routes/listings.js';
import { createHandler } from '../handler.js';

// The listings Lambda also consumes the listings table stream. Keeping this
// small consumer in the same independently deployed service avoids creating a
// second business-logic package while still exercising an event-driven path.
async function processStream(event, context) {
  let processed = 0;
  for (const record of event.Records || []) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY' || record.eventName === 'REMOVE') {
      processed += 1;
      console.log(JSON.stringify({ event: 'listing_stream_record', eventName: record.eventName, keys: record.dynamodb?.Keys, requestId: context.awsRequestId }));
    }
  }
  console.log(JSON.stringify({ event: 'listing_stream_batch', processed, requestId: context.awsRequestId }));
  return { batchItemFailures: [] };
}

export const handler = createHandler(createServiceApp({ registrars: { listings: register } }), { streamProcessor: processStream });
