import { UserController } from './controller/UserController.js';
import { ProductController } from './controller/ProductController.js';
import { ModelController } from './controller/ModelTrainingController.js';
import { TFVisorController } from './controller/TFVisorController.js';
import { PredictionController } from './controller/PredictionController.js';
import { WorkerController } from './controller/WorkerController.js';
import { UserService } from './service/UserService.js';
import { ProductService } from './service/ProductService.js';
import { UserView } from './view/UserView.js';
import { ProductView } from './view/ProductView.js';
import { ModelView } from './view/ModelTrainingView.js';
import { TFVisorView } from './view/TFVisorView.js';
import { PredictionView } from './view/PredictionView.js';
import Events from './events/events.js';

// Serviços compartilhados
const userService = new UserService();
const productService = new ProductService();

// Views
const userView = new UserView();
const productView = new ProductView();
const modelView = new ModelView();
const tfVisorView = new TFVisorView();
const predictionView = new PredictionView();

// O treino roda numa thread separada para não travar a interface
const mlWorker = new Worker('/src/workers/modelTrainingWorker.js', { type: 'module' });
const worker = WorkerController.init({ worker: mlWorker, events: Events });

// Controllers primeiro: eles precisam estar ouvindo antes do primeiro dispatch
ModelController.init({ modelView, userService, events: Events });
TFVisorController.init({ tfVisorView, events: Events });
PredictionController.init({ predictionView, events: Events });
ProductController.init({ productView, productService, events: Events });

const userController = UserController.init({ userView, userService, events: Events });

// Massa de treino (data/users.json) + perfis de teste (data/convidados.json).
// Quer brincar com seus amigos? É só adicionar em data/convidados.json.
const everyone = await userService.seed();

await userController.renderUsers(everyone);
worker.triggerTrain(everyone);
