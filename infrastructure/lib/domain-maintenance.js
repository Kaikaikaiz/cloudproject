import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionConcurrencyCommand,
} from '@aws-sdk/client-lambda';
import { services } from '../services.js';
import { region } from '../config.js';
export const lambda = new LambdaClient({ region });
export async function projectFunctions() {
  const names = [];
  let Marker;
  do {
    const page = await lambda.send(new ListFunctionsCommand({ Marker }));
    names.push(...(page.Functions || []).map((f) => f.FunctionName));
    Marker = page.NextMarker;
  } while (Marker);
  const known = new Set(['relive-api', ...services.map((s) => `relive-${s}`)]);
  return names.filter((n) => known.has(n));
}
export async function assertFrozen() {
  const names = await projectFunctions();
  for (const FunctionName of names) {
    const result = await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName }));
    if (result.ReservedConcurrentExecutions !== 0)
      throw Error(
        `${FunctionName} is not frozen. Run domain-maintenance.js freeze --apply first.`,
      );
  }
}
