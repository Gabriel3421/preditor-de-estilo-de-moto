export class PredictionController {
    #predictionView;
    #events;

    constructor({ predictionView, events }) {
        this.#predictionView = predictionView;
        this.#events = events;

        this.init();
    }

    static init(deps) {
        return new PredictionController(deps);
    }

    init() {
        this.#predictionView.reset();
        this.setupCallbacks();
    }

    setupCallbacks() {
        this.#events.onRecommendationsReady((data) => {
            this.#predictionView.render(data);
        });

        this.#events.onTrainModel(() => {
            this.#predictionView.reset('Treinando o modelo…');
        });

        this.#events.onUserSelected((user) => {
            this.#predictionView.reset(
                `Clique em <strong>Prever estilo</strong> para ver o palpite do modelo sobre ${user.name}.`
            );
        });
    }
}
