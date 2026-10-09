export const services = ['auth', 'users', 'listings', 'favourites', 'images'];
export const routes = [
 ['auth','/api/health',['GET']],
 ...['register','login','logout','forgot-password'].map(x=>['auth',`/api/auth/${x}`,['POST']]),
 ['auth','/api/auth/me',['GET']],
 ['users','/api/profile',['PATCH']], ['users','/api/profile/image',['PUT']], ['users','/api/users/{id}',['GET']],
 ['listings','/api/listings',['GET','POST']], ['listings','/api/listings/mine',['GET']],
 ['listings','/api/listings/{id}',['GET','PUT','PATCH','DELETE']], ['listings','/api/listings/{id}/withdraw',['POST']],
 ['favourites','/api/favourites',['GET']], ['favourites','/api/favourites/{id}',['GET','PUT','DELETE']],
 ['images','/api/uploads',['POST']],
];
