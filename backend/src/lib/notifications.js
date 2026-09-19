export function notify(database, userId, type, message, link = null) {
  return database.notification.create({ data: { userId, type, message, link } });
}
