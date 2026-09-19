import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

test('history migration preserves earlier purchases and agreement prices', async () => {
  const database = new DatabaseSync(':memory:');
  const migrationsDirectory = new URL('../prisma/migrations/', import.meta.url);
  const historyMigration = '20260919030000_transaction_reviews';

  try {
    for (const migration of (await readdir(migrationsDirectory)).sort()) {
      if (migration !== 'migration_lock.toml' && migration < historyMigration) {
        database.exec(
          await readFile(
            new URL(migration + '/migration.sql', migrationsDirectory),
            'utf8',
          ),
        );
      }
    }

    database.exec(`
      INSERT INTO "User" (id, email, name, passwordHash, updatedAt)
      VALUES ('buyer', 'buyer@test.local', 'Buyer', 'unused-test-hash', CURRENT_TIMESTAMP),
             ('seller', 'seller@test.local', 'Seller', 'unused-test-hash', CURRENT_TIMESTAMP);

      INSERT INTO "Listing" (id, sellerId, title, description, price, category, condition, state, city, status, updatedAt)
      VALUES ('item', 'seller', 'Desk', 'A wooden desk', 10000, 'Others', 'Good', 'Johor', 'Johor Bahru', 'SOLD', CURRENT_TIMESTAMP);

      INSERT INTO "Offer" (id, listingId, buyerId, sellerId, originalPrice, currentAmount, agreedPrice, status, updatedAt)
      VALUES ('offer', 'item', 'buyer', 'seller', 12000, 8000, 8000, 'COMPLETED', CURRENT_TIMESTAMP);

      INSERT INTO "Purchase" (id, listingId, buyerId, sellerId, offerId, listingTitle, amount, reference, requestKey)
      VALUES ('receipt', 'item', 'buyer', 'seller', 'offer', 'Desk', 8000, 'old-reference', 'old-request');
    `);

    database.exec(
      await readFile(
        new URL(historyMigration + '/migration.sql', migrationsDirectory),
        'utf8',
      ),
    );
    const transaction = database.prepare('SELECT * FROM "Transaction"').get();
    assert.equal(transaction.purchaseId, 'receipt');
    assert.equal(transaction.originalPrice, 12000);
    assert.equal(transaction.finalPrice, 8000);
    assert.equal(transaction.status, 'COMPLETED');
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM "Purchase"').get().count,
      1,
    );
    const users = database
      .prepare('SELECT completedTransactions, averageRating, totalReviews FROM "User"')
      .all();
    assert.ok(
      users.every(
        (user) =>
          user.completedTransactions === 1 &&
          user.averageRating === 0 &&
          user.totalReviews === 0,
      ),
    );
    assert.equal(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'Offer_one_agreement_per_listing'",
        )
        .all().length,
      1,
    );
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    database.close();
  }
});
