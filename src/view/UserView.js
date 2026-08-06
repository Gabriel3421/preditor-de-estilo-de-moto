import { View } from './View.js';
import { financialLabels, genderLabels, formatBRL } from './labels.js';

export class UserView extends View {
    #userSelect = document.querySelector('#userSelect');
    #userAge = document.querySelector('#userAge');
    #userGender = document.querySelector('#userGender');
    #userFinancial = document.querySelector('#userFinancial');
    #garageList = document.querySelector('#pastPurchasesList');

    #garageTemplate;
    #onUserSelect;

    constructor() {
        super();
        this.init();
    }

    async init() {
        this.#garageTemplate = await this.loadTemplate('./src/view/templates/garage-item.html');
        this.attachUserSelectListener();
    }

    registerUserSelectCallback(callback) {
        this.#onUserSelect = callback;
    }

    /**
     * Convidados (sem moto) vão para um grupo separado no topo — são os
     * perfis de teste. A massa de treino fica no grupo de baixo.
     */
    renderUserOptions(users) {
        const guests = users.filter(user => !user.purchases.length);
        const trained = users.filter(user => user.purchases.length);

        const option = user =>
            `<option value="${user.id}">${user.name} — ${user.age} anos, ${financialLabels[user.financialStatus]}</option>`;

        this.#userSelect.innerHTML = `
            <option value="">-- Escolha uma pessoa --</option>
            <optgroup label="Convidados (sem moto — para prever)">
                ${guests.map(option).join('')}
            </optgroup>
            <optgroup label="Massa de treino (já tem moto)">
                ${trained.map(option).join('')}
            </optgroup>
        `;
    }

    renderUserDetails(user) {
        this.#userAge.value = user.age;
        this.#userGender.value = genderLabels[user.gender] ?? '—';
        this.#userFinancial.value = financialLabels[user.financialStatus] ?? '—';
    }

    clearUserDetails() {
        this.#userAge.value = '';
        this.#userGender.value = '';
        this.#userFinancial.value = '';
        this.#garageList.innerHTML = '';
    }

    /**
     * A garagem é só exibição. Ela alimenta o TREINO, não a previsão — o
     * vetor da pessoa é montado apenas com idade, gênero e renda. Por isso
     * não há como editá-la aqui: mexer nela sem retreinar não mudaria nada,
     * e a interface estaria mentindo.
     */
    renderGarage(motos) {
        if (!this.#garageTemplate) return;

        if (!motos || motos.length === 0) {
            this.#garageList.innerHTML =
                '<p class="text-muted small mb-0">Garagem vazia — é justamente aqui que o modelo tem que adivinhar.</p>';
            return;
        }

        this.#garageList.innerHTML = motos.map(moto =>
            this.replaceTemplate(this.#garageTemplate, {
                name: moto.name,
                category: moto.category,
                cilindrada: moto.cilindrada,
                price: formatBRL(moto.price),
            })
        ).join('');
    }

    attachUserSelectListener() {
        this.#userSelect.addEventListener('change', (event) => {
            const userId = event.target.value ? Number(event.target.value) : null;

            if (!userId) {
                this.clearUserDetails();
                return;
            }

            if (this.#onUserSelect) {
                this.#onUserSelect(userId);
            }
        });
    }

    getSelectedUserId() {
        return this.#userSelect.value ? Number(this.#userSelect.value) : null;
    }
}
