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
     * Diagnóstico do treino. A taxa de rótulos positivos é a métrica que
     * explica quase tudo: se ela é de ~5%, uma accuracy de 95% significa
     * apenas que o modelo aprendeu a responder "não" para tudo.
     */
    renderTrainingStats(stats) {
        if (!stats) return;

        const imbalanced = stats.positiveRate < 0.15;

        this.#trainingStats.innerHTML = `
            <table class="table table-sm training-stats mb-1">
                <tbody>
                    <tr><td>Pessoas na massa</td><td>${stats.people}</td></tr>
                    <tr><td>Com moto (viram treino)</td><td>${stats.peopleWithMotos}</td></tr>
                    <tr><td>Motos no catálogo</td><td>${stats.motos}</td></tr>
                    <tr><td>Pares pessoa × moto</td><td>${stats.pairs.toLocaleString('pt-BR')}</td></tr>
                    <tr class="${imbalanced ? 'table-danger' : ''}">
                        <td>Rótulos positivos</td>
                        <td>${stats.positives} <span class="text-muted">(${formatPercent(stats.positiveRate, 1)})</span></td>
                    </tr>
                    <tr><td>Accuracy final</td><td>${formatPercent(stats.accuracy ?? 0, 1)}</td></tr>
                    <tr><td>Loss final</td><td>${(stats.loss ?? 0).toFixed(4)}</td></tr>
                </tbody>
            </table>
            ${imbalanced ? `
                <div class="alert alert-warning py-2 px-2 small mb-0">
                    <i class="bi bi-exclamation-triangle"></i>
                    Só ${formatPercent(stats.positiveRate, 1)} dos exemplos são positivos.
                    Chutando "não" em tudo o modelo já acerta
                    ${formatPercent(1 - stats.positiveRate, 1)} — a accuracy acima está mentindo.
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
