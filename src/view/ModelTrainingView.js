import { View } from './View.js';
import { financialLabels, formatPercent } from './labels.js';

export class ModelView extends View {
    #trainModelBtn = document.querySelector('#trainModelBtn');
    #runPredictionBtn = document.querySelector('#runRecommendationBtn');
    #trainingStats = document.querySelector('#trainingStats');
    #purchasesArrow = document.querySelector('#purchasesArrow');
    #purchasesDiv = document.querySelector('#purchasesDiv');
    #everyonesGarageList = document.querySelector('#allUsersPurchasesList');

    #onTrainModel;
    #onRunPrediction;

    constructor() {
        super();
        this.attachEventListeners();
    }

    registerTrainModelCallback(callback) {
        this.#onTrainModel = callback;
    }

    registerRunRecommendationCallback(callback) {
        this.#onRunPrediction = callback;
    }

    attachEventListeners() {
        this.#trainModelBtn.addEventListener('click', () => this.#onTrainModel());
        this.#runPredictionBtn.addEventListener('click', () => this.#onRunPrediction());

        this.#purchasesDiv.addEventListener('click', () => {
            const list = this.#everyonesGarageList;
            const isHidden = window.getComputedStyle(list).display === 'none';

            list.style.display = isHidden ? 'block' : 'none';
            this.#purchasesArrow.classList.toggle('bi-chevron-down', !isHidden);
            this.#purchasesArrow.classList.toggle('bi-chevron-up', isHidden);
        });
    }

    enableRecommendButton() {
        this.#runPredictionBtn.disabled = false;
    }

    updateTrainingProgress(progress) {
        this.#trainModelBtn.disabled = true;
        this.#trainModelBtn.innerHTML =
            '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Treinando...';

        if (progress.progress === 100) {
            this.#trainModelBtn.disabled = false;
            this.#trainModelBtn.innerHTML = '<i class="bi bi-cpu"></i> Treinar modelo';
        }
    }

    /**
     * Diagnóstico do treino.
     *
     * A accuracy nunca aparece sozinha: ao lado dela fica sempre a acurácia do
     * "chute burro" — um modelo que responde não para tudo. A diferença entre
     * as duas é o único número que diz se a rede aprendeu alguma coisa.
     */
    renderTrainingStats(stats) {
        if (!stats) return;

        const accuracy = stats.accuracy ?? 0;
        const baseline = 1 - stats.positiveRate;   // acertos de quem chuta "não" sempre
        const gain = accuracy - baseline;

        const imbalanced = stats.positiveRate < 0.15;
        const sampled = stats.allPairs > stats.pairs;
        const gainTone = gain > 0.05 ? 'table-success' : gain > 0 ? '' : 'table-danger';

        this.#trainingStats.innerHTML = `
            <table class="table table-sm training-stats mb-1">
                <tbody>
                    <tr><td>Pessoas na massa</td><td>${stats.people}</td></tr>
                    <tr><td>Com moto (viram treino)</td><td>${stats.peopleWithMotos}</td></tr>
                    <tr><td>Motos no catálogo</td><td>${stats.motos}</td></tr>

                    <tr class="section"><td>Pares possíveis</td><td>${stats.allPairs.toLocaleString('pt-BR')}</td></tr>
                    <tr>
                        <td>Exemplos usados${sampled ? ` <span class="text-muted">(${stats.negativesPerPositive} neg./pos.)</span>` : ''}</td>
                        <td>${stats.pairs.toLocaleString('pt-BR')}</td>
                    </tr>
                    <tr class="${imbalanced ? 'table-danger' : ''}">
                        <td>Rótulos positivos</td>
                        <td>${stats.positives} <span class="text-muted">(${formatPercent(stats.positiveRate, 1)})</span></td>
                    </tr>

                    <tr class="section"><td>Accuracy final</td><td>${formatPercent(accuracy, 1)}</td></tr>
                    <tr><td>Chute burro ("não" em tudo)</td><td>${formatPercent(baseline, 1)}</td></tr>
                    <tr class="${gainTone}">
                        <td>Ganho sobre o chute</td>
                        <td>${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)} pp</td>
                    </tr>
                    <tr><td>Loss final</td><td>${(stats.loss ?? 0).toFixed(4)}</td></tr>
                </tbody>
            </table>
            ${imbalanced ? `
                <div class="alert alert-warning py-2 px-2 small mb-0">
                    <i class="bi bi-exclamation-triangle"></i>
                    Só ${formatPercent(stats.positiveRate, 1)} dos exemplos são positivos.
                    Chutando "não" em tudo o modelo já acerta
                    ${formatPercent(baseline, 1)} — a accuracy sozinha não diz nada.
                </div>` : ''}
        `;
    }

    renderEveryonesGarage(users) {
        this.#everyonesGarageList.innerHTML = users.map(user => {
            const motos = user.purchases
                .map(moto => `<span class="badge bg-light text-dark me-1 mb-1">${moto.category}: ${moto.name}</span>`)
                .join('');

            return `
                <div class="user-purchase-summary">
                    <h6>${user.name} <span class="text-muted fw-normal">· ${user.age} anos · ${financialLabels[user.financialStatus] ?? '—'}</span></h6>
                    <div class="purchases-badges">
                        ${motos || '<span class="text-muted small">Sem moto</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }
}
