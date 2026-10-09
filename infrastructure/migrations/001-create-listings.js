export default {
  TableName: 'relive-listings', BillingMode: 'PAY_PER_REQUEST',
  KeySchema: [{AttributeName:'PK',KeyType:'HASH'},{AttributeName:'SK',KeyType:'RANGE'}],
  AttributeDefinitions: ['PK','SK','sellerPK','sellerSK','statusPK','statusSK'].map(AttributeName=>({AttributeName,AttributeType:'S'})),
  GlobalSecondaryIndexes: [
    {IndexName:'SellerIndex',KeySchema:[{AttributeName:'sellerPK',KeyType:'HASH'},{AttributeName:'sellerSK',KeyType:'RANGE'}],Projection:{ProjectionType:'ALL'}},
    {IndexName:'StatusIndex',KeySchema:[{AttributeName:'statusPK',KeyType:'HASH'},{AttributeName:'statusSK',KeyType:'RANGE'}],Projection:{ProjectionType:'ALL'}},
  ],
  StreamSpecification:{StreamEnabled:true,StreamViewType:'NEW_AND_OLD_IMAGES'},
};
