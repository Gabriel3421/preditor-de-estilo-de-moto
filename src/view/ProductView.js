import { View } from './View.js';
import { formatBRL, formatPercent } from './labels.js';

/**
 * O catálogo é somente leitura. A garagem das pessoas é massa de treino e
 * mora nos JSON de data/ — não se edita pela interface, porque editar ali
 * não muda previsão nenhuma até o modelo ser retreinado.
 */
export class ProductView extends View {
    #motoList = document.querySelector('#productList');
    #motoListTitle = document.querySelector('#productListTitle');

    #motoTemplate;

    constructor() {
        super();
        this.init();
    }

    async init() {
        this.#motoTemplate = await this.loadTemplate('./src/view/templates/moto-card.html');
    }

    render(motos, { ranked = false } = {}) {
        if (!this.#motoTemplate) return;

        this.#motoListTitle.textContent = ranked
            ? 'Catálogo ordenado por afinidade'
            : 'Catálogo de motos';

        this.#motoList.innerHTML = motos.map(moto => {
            return this.replaceTemplate(this.#motoTemplate, {
                id: moto.id,
                name: moto.name,
                category: moto.category,
                cilindrada: moto.cilindrada,
                price: formatBRL(moto.price),
                scoreBadge: this.#scoreBadge(moto.score),
            });
        }).join('');
    }

    /**
     * A nota crua do modelo, sem maquiagem. Se o modelo estiver mal treinado
     * é aqui que fica evidente: todas as motos com afinidade perto de 0%.
     */
    #scoreBadge(score) {
        if (score === undefined) return '';

        const percent = formatPercent(score);
        const tone = score >= 0.5 ? 'text-bg-success' : score >= 0.2 ? 'text-bg-warning' : 'text-bg-light';

        return `<div class="moto-score"><span class="badge ${tone}">afinidade ${percent}</span></div>`;
    }
}
