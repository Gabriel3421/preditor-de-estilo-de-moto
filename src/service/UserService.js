export class UserService {
    #storageKey = 'moto-style-people';

    /**
     * Carrega a massa de treino (data/users.json) e os perfis de teste
     * (data/convidados.json) para o sessionStorage.
     *
     * Os convidados vêm primeiro para aparecerem no topo do select. Eles não
     * têm moto nenhuma, então ficam de fora do treino automaticamente — são
     * exatamente os casos que queremos prever.
     */
    async seed() {
        const [people, guests] = await Promise.all([
            fetch('./data/users.json').then(response => response.json()),
            fetch('./data/convidados.json').then(response => response.json()),
        ]);

        const everyone = [...guests, ...people];
        this.#setStorage(everyone);

        return everyone;
    }

    async getUsers() {
        return this.#getStorage();
    }

    async getUserById(userId) {
        const users = this.#getStorage();
        return users.find(user => user.id === userId);
    }

    async updateUser(user) {
        const users = this.#getStorage();
        const userIndex = users.findIndex(candidate => candidate.id === user.id);

        users[userIndex] = { ...users[userIndex], ...user };
        this.#setStorage(users);

        return users[userIndex];
    }

    #getStorage() {
        const data = sessionStorage.getItem(this.#storageKey);
        return data ? JSON.parse(data) : [];
    }

    #setStorage(data) {
        sessionStorage.setItem(this.#storageKey, JSON.stringify(data));
    }
}
