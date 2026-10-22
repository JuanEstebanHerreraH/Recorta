// Worker de IA: corre los modelos en un hilo aparte para que la interfaz no se congele.
import { serveRpc, type Handlers } from '../workers/rpc';
import { handlers } from './handlers';

serveRpc(handlers as unknown as Handlers);
