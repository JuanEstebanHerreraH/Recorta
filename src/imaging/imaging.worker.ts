// Worker de procesamiento de imagen: bordes, halo, recorte, cambio de tamaño y exportación.
import { serveRpc, type Handlers } from '../workers/rpc';
import { handlers } from './handlers';

serveRpc(handlers as unknown as Handlers);
