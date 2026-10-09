export default {
  TableName:'relive-users', BillingMode:'PAY_PER_REQUEST',
  KeySchema:[{AttributeName:'PK',KeyType:'HASH'},{AttributeName:'SK',KeyType:'RANGE'}],
  AttributeDefinitions:['PK','SK'].map(AttributeName=>({AttributeName,AttributeType:'S'})),
};
