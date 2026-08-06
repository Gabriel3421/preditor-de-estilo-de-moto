export class ProductController {
    #productView;
    #productService;
    #events;

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
        this.setupEventListeners();

        const motos = await this.#productService.getProducts();
        this.#productView.render(motos);
    }

    setupEventListeners() {
        // a única coisa que reordena o catálogo é uma predição nova
        this.#events.onRecommendationsReady(({ recommendations }) => {
            this.#productView.render(recommendations, { ranked: true });
        });
    }
}
