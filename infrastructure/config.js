import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export const region = 'us-east-1';
export const expectedAccount = '615663614353';
export const tableName = 'relive-listings';
export const buckets = ['relive-web-cloudproject', 'relive-images-cloudproject'];

export async function verifyAccount() {
  const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  if (identity.Account !== expectedAccount) {
    throw new Error(`Wrong AWS account: ${identity.Account}. Expected ${expectedAccount}. Check your AWS profile.`);
  }
  console.log(`Verified AWS account ${identity.Account}; region ${region}`);
}

export function reportError(error) {
  console.error(`${error.name}: ${error.message}`);
  console.error('If credentials expired, refresh all three Learner Lab credential values. If access is denied, retain the exact error for your lecturer.');
  process.exitCode = 1;
}
