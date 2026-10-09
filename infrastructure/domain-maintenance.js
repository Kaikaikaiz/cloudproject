import { readFile, writeFile } from 'node:fs/promises';
import {
  GetFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
  DeleteFunctionConcurrencyCommand,
  GetFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { services } from './services.js';
import { lambda, projectFunctions, assertFrozen } from './lib/domain-maintenance.js';
import { readMarker, markerKey, tables } from './lib/domain-data.js';
import { region, expectedAccount, verifyAccount, reportError } from './config.js';
const path = new URL('./.domain-maintenance.json', import.meta.url);
try {
  if (!process.argv.includes('--apply'))
    throw Error('Maintenance changes require --apply.');
  await verifyAccount();
  const action = process.argv[2];
  if (!['freeze', 'resume'].includes(action)) throw Error('Use freeze or resume.');
  const client = new DynamoDBClient({ region });
  let saved = await readFile(path, 'utf8')
    .then(JSON.parse)
    .catch((e) => {
      if (e.code !== 'ENOENT') throw e;
      return null;
    });
  if (saved && (saved.account !== expectedAccount || saved.region !== region))
    throw Error('Maintenance manifest account mismatch.');
  if (action === 'freeze') {
    if (saved?.resumedAt)
      throw Error('Previous cutover completed; do not reuse this migration.');
    const marker = await readMarker(client);
    if (marker?.phase?.S === 'CUTOVER') throw Error('Cutover already completed.');
    if (!saved) {
      saved = { account: expectedAccount, region, functions: {} };
      for (const FunctionName of await projectFunctions()) {
        const c = await lambda.send(new GetFunctionConcurrencyCommand({ FunctionName }));
        saved.functions[FunctionName] = c.ReservedConcurrentExecutions ?? null;
      }
      await writeFile(path, JSON.stringify(saved, null, 2), { mode: 0o600, flag: 'wx' });
    }
    let maxTimeout = 0;
    for (const FunctionName of Object.keys(saved.functions)) {
      const config = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName }),
      );
      maxTimeout = Math.max(maxTimeout, config.Timeout || 3);
      await lambda.send(
        new PutFunctionConcurrencyCommand({
          FunctionName,
          ReservedConcurrentExecutions: 0,
        }),
      );
    }
    // Zero concurrency stops new invocations; allow existing invocations to drain.
    for (let left = maxTimeout + 5; left > 0; left -= 20) {
      console.log(`Draining requests: ${left}s remaining`);
      await new Promise((r) => setTimeout(r, Math.min(20, left) * 1000));
    }
    await assertFrozen();
    console.log(
      'All project Lambdas frozen. Stop any external database writers before copying.',
    );
  } else {
    if (!saved)
      throw Error('Original concurrency manifest is missing; do not guess its settings.');
    const marker = await readMarker(client);
    if (!['READY', 'CUTOVER'].includes(marker?.phase?.S))
      throw Error('Verified migration marker is missing.');
    for (const service of services) {
      const c = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: `relive-${service}` }),
      );
      if (
        c.State !== 'Active' ||
        c.LastUpdateStatus === 'Failed' ||
        c.Environment?.Variables?.STORAGE_SCHEMA !== 'domain-v2'
      )
        throw Error(`relive-${service} has not completed domain deployment.`);
      for (const [name, value] of Object.entries(tables))
        if (c.Environment.Variables[`${name.toUpperCase()}_TABLE`] !== value)
          throw Error(`Wrong ${name} table on ${service}`);
    }
    // Irreversible marker prevents a later migration rerun from overwriting live data.
    await client.send(
      new UpdateItemCommand({
        TableName: 'relive-migrations',
        Key: markerKey,
        UpdateExpression: 'SET #phase = :done',
        ConditionExpression: '#phase = :ready OR #phase = :done',
        ExpressionAttributeNames: { '#phase': 'phase' },
        ExpressionAttributeValues: {
          ':ready': { S: 'READY' },
          ':done': { S: 'CUTOVER' },
        },
      }),
    );
    for (const service of services) {
      const FunctionName = `relive-${service}`,
        original = saved.functions[FunctionName];
      await lambda.send(
        original == null
          ? new DeleteFunctionConcurrencyCommand({ FunctionName })
          : new PutFunctionConcurrencyCommand({
              FunctionName,
              ReservedConcurrentExecutions: original,
            }),
      );
    }
    saved.resumedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify(saved, null, 2), { mode: 0o600 });
    console.log(
      'Eight domain Lambdas resumed. Legacy relive-api remains frozen to prevent writes to old storage.',
    );
  }
} catch (error) {
  reportError(error);
}
