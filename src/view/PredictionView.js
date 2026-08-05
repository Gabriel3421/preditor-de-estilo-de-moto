import { View } from './View.js';
import { formatPercent, formatBRL } from './labels.js';

export class PredictionView extends View {
    #container = document.querySelector('#stylePrediction');

    reset(message = 'Escolha uma pessoa e clique em <strong>Prever estilo</strong>.') {
        this.#container.innerHTML = `<p class="text-muted small mb-0">${message}</p>`;
    }

    render({ user, styles }) {
        if (!styles?.length) return this.reset();

        const [winner] = styles;

        // A nota é mostrada crua, sem normalizar entre os estilos. Se o modelo
        // estiver ruim, a barra do campeão fica minúscula — e é isso que a
        // gente quer enxergar.
        const bars = styles.map(({ style, score, topMoto }) => `
            <div class="style-row">
                <div class="d-flex justify-content-between small">
                    <span class="fw-semibold">${style}</span>
                    <span class="text-muted">${formatPercent(score, 2)}</span>
                </div>
                <div class="progress style-bar">
                    <div class="progress-bar" style="width: ${Math.max(score * 100, 0.5)}%"></div>
                </div>
                <div class="text-muted style-hint">${topMoto.name} · ${formatBRL(topMoto.price)}</div>
            </div>
        `).join('');

        this.#container.innerHTML = `
            <div class="prediction-winner">
                <div class="text-muted small">Estilo previsto para ${user.name}</div>
                <div class="prediction-style">${winner.style}</div>
                <div class="small text-muted">confiança do modelo: ${formatPercent(winner.score, 2)}</div>
            </div>
            <div class="style-list">${bars}</div>
        `;
    }
}
