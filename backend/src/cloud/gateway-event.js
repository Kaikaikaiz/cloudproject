// The adapter prefers pathParameters.proxy over event.path. Our greedy resource
// is nested under /api, so use the complete REST API path instead.
export function normalizeGatewayEvent(event) {
  if (event.resource !== '/api/{proxy+}' || !event.pathParameters?.proxy) return event;
  const { proxy, ...pathParameters } = event.pathParameters;
  return { ...event, pathParameters };
}
