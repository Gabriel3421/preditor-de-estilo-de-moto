export class ProductController {
    #productView;
    #productService;
    #events;
    #currentUser = null;

    constructor({ productView, events, productService }) {
        this.#productView = productView;
        this.#productService = productService;
        this.#events = events;

        this.init();
    }

    static init(deps) {
        return new ProductController(deps);
    }

    async init() {
        this.setupCallbacks();
        this.setupEventListeners();

        const motos = await this.#productService.getProducts();
        this.#productView.render(motos, { disableButtons: true });
    }

    setupEventListeners() {
        this.#events.onUserSelected((user) => {
            this.#currentUser = user;
            this.#productView.onUserSelected(user);
        });

        this.#events.onRecommendationsReady(({ recommendations }) => {
            this.#productView.render(recommendations, { disableButtons: false, ranked: true });
        });
    }

    setupCallbacks() {
        this.#productView.registerBuyProductCallback(this.handleAddToGarage.bind(this));
    }

    async handleAddToGarage(moto) {
        this.#events.dispatchPurchaseAdded({ user: this.#currentUser, product: moto });
    }
}
