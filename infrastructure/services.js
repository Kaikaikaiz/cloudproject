export const services = ['auth', 'users', 'listings', 'favourites', 'images', 'offers', 'payments', 'dashboard', 'moderation'];
export const routes = [
 ['moderation','/api/reports',['POST']], ['moderation','/api/admin/reports',['GET']], ['moderation','/api/admin/reports/{id}',['GET']], ['moderation','/api/admin/reports/{id}/actions',['POST']],
 ['auth','/api/health',['GET']],
 ...['register','login','logout','forgot-password'].map(x=>['auth',`/api/auth/${x}`,['POST']]),
 ['auth','/api/auth/me',['GET']],
 ['users','/api/profile',['PATCH']], ['users','/api/profile/image',['PUT']], ['users','/api/users/{id}',['GET']],
 ['listings','/api/listings',['GET','POST']], ['listings','/api/listings/mine',['GET']],
 ['listings','/api/listings/{id}',['GET','PUT','PATCH','DELETE']], ['listings','/api/listings/{id}/withdraw',['POST']],
 ['favourites','/api/favourites',['GET']], ['favourites','/api/favourites/{id}',['GET','PUT','DELETE']],
 ['images','/api/uploads',['POST']],
 ['offers','/api/offers',['GET','POST']], ['offers','/api/offers/{id}',['GET']], ['offers','/api/offers/{id}/actions',['POST']],
 ['dashboard','/api/dashboard',['GET']], ['dashboard','/api/dashboard/notifications/read',['POST']],
 ['payments','/api/wallet',['GET']], ['payments','/api/wallet/top-ups',['POST']],
 ['payments','/api/wallet/top-ups/{id}',['GET']], ['payments','/api/wallet/top-ups/{id}/confirm',['POST']], ['payments','/api/wallet/top-ups/{id}/cancel',['POST']],
 ['payments','/api/purchases',['POST']], ['payments','/api/purchases/quote',['GET']], ['payments','/api/purchases/{id}',['GET']],
 ['payments','/api/transactions',['GET']], ['payments','/api/transactions/{id}',['GET']], ['payments','/api/transactions/{id}/reviews',['POST']],
];
