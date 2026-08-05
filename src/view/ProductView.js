import { View } from './View.js';
import { formatBRL, formatPercent } from './labels.js';

export class ProductView extends View {
    #motoList = document.querySelector('#productList');
    #motoListTitle = document.querySelector('#productListTitle');

    #buttons;
    #motoTemplate;
    #onBuyProduct;

    constructor() {
        super();
        this.init();
    }

    async init() {
        this.#motoTemplate = await this.loadTemplate('./src/view/templates/moto-card.html');
    }

    onUserSelected(user) {
        // Só dá para mexer na garagem de alguém depois de escolher a pessoa
        this.setButtonsState(user?.id ? false : true);
    }

    registerBuyProductCallback(callback) {
        this.#onBuyProduct = callback;
    }

    render(motos, { disableButtons = true, ranked = false } = {}) {
        if (!this.#motoTemplate) return;

        this.#motoListTitle.textContent = ranked
            ? 'Catálogo ordenado por afinidade'
            : 'Catálogo de motos';

        const html = motos.map(moto => {
            return this.replaceTemplate(this.#motoTemplate, {
                id: moto.id,
                name: moto.name,
                category: moto.category,
                cilindrada: moto.cilindrada,
                price: formatBRL(moto.price),
                scoreBadge: this.#scoreBadge(moto.score),
                product: JSON.stringify(moto),
            });
        }).join('');

        this.#motoList.innerHTML = html;
        this.attachBuyButtonListeners();
        this.setButtonsState(disableButtons);
    }

    /**
     * A nota crua do modelo, sem maquiagem. Se o modelo estiver mal treinado
     * é aqui que fica evidente: todas as motos com afinidade perto de 0%.
     */
    #scoreBadge(score) {
        if (score === undefined) return '';

        const percent = formatPercent(score);
        const tone = score >= 0.5 ? 'text-bg-success' : score >= 0.2 ? 'text-bg-warning' : 'text-bg-light';

        return `<div class="moto-score mb-2"><span class="badge ${tone}">afinidade ${percent}</span></div>`;
    }

    setButtonsState(disabled) {
        if (!this.#buttons) {
            this.#buttons = document.querySelectorAll('.buy-now-btn');
        }

        this.#buttons.forEach(button => {
            button.disabled = disabled;
        });
    }

    attachBuyButtonListeners() {
        this.#buttons = document.querySelectorAll('.buy-now-btn');

        this.#buttons.forEach(button => {
            button.addEventListener('click', () => {
                const moto = JSON.parse(button.dataset.product);
                const originalText = button.innerHTML;

                button.innerHTML = '<i class="bi bi-check-circle-fill"></i> Na garagem';
                button.classList.remove('btn-primary');
                button.classList.add('btn-success');

                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('btn-success');
                    button.classList.add('btn-primary');
                }, 500);

                this.#onBuyProduct(moto, button);
            });
        });
    }
}
