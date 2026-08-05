export class ModelController {
    #modelView;
    #userService;
    #events;
    #currentUser = null;
    #alreadyTrained = false;

    constructor({ modelView, userService, events }) {
        this.#modelView = modelView;
        this.#userService = userService;
        this.#events = events;

        this.init();
    }

    static init(deps) {
        return new ModelController(deps);
    }

    init() {
        this.setupCallbacks();
    }

    setupCallbacks() {
        this.#modelView.registerTrainModelCallback(this.handleTrainModel.bind(this));
        this.#modelView.registerRunRecommendationCallback(this.handleRunPrediction.bind(this));

        this.#events.onUserSelected((user) => {
            this.#currentUser = user;
            if (!this.#alreadyTrained) return;

            this.#modelView.enableRecommendButton();
        });

        this.#events.onTrainingComplete((data) => {
            this.#alreadyTrained = true;
            this.#modelView.renderTrainingStats(data?.stats);

            if (!this.#currentUser) return;
            this.#modelView.enableRecommendButton();
        });

        this.#events.onUsersUpdated(async (...data) => this.refreshEveryonesGarage(...data));

        this.#events.onProgressUpdate((progress) => {
            this.#modelView.updateTrainingProgress(progress);
        });
    }

    async handleTrainModel() {
        const users = await this.#userService.getUsers();
        this.#events.dispatchTrainModel(users);
    }

    async handleRunPrediction() {
        const updatedUser = await this.#userService.getUserById(this.#currentUser.id);
        this.#events.dispatchRecommend(updatedUser);
    }

    async refreshEveryonesGarage({ users }) {
        this.#modelView.renderEveryonesGarage(users);
    }
}
