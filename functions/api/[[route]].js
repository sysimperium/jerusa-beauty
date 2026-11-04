import { despachar } from '../_lib/router.js';
import '../_lib/licenca.js';
import '../_lib/demo-auth.js';
import '../_lib/rotas-publicas.js';
import '../_lib/rotas-admin.js';

export const onRequest = (context) => despachar(context);
