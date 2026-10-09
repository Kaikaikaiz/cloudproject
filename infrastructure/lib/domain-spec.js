export function domainSpec(name, indexes = []) {
  const attributes = [
    'PK',
    'SK',
    ...indexes.flatMap(([prefix]) => [`${prefix}PK`, `${prefix}SK`]),
  ];
  return {
    TableName: `relive-${name}`,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: attributes.map((AttributeName) => ({
      AttributeName,
      AttributeType: 'S',
    })),
    ...(indexes.length
      ? {
          GlobalSecondaryIndexes: indexes.map(([prefix, IndexName]) => ({
            IndexName,
            KeySchema: [
              { AttributeName: `${prefix}PK`, KeyType: 'HASH' },
              { AttributeName: `${prefix}SK`, KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          })),
        }
      : {}),
  };
}
