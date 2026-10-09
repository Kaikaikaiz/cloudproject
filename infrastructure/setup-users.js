console.log('Legacy setup command: running all pending database migrations.');
await import('./migrate.js');
