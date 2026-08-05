export class UserController {
    #userService;
    #userView;
    #events;

    constructor({ userView, userService, events }) {
        this.#userView = userView;
        this.#userService = userService;
        this.#events = events;
    }

    static init(deps) {
        return new UserController(deps);
    }

    async renderUsers(users) {
        this.#userView.renderUserOptions(users);
        this.setupCallbacks();
        this.setupGarageObserver();

        this.#events.dispatchUsersUpdated({ users });
    }

    setupCallbacks() {
        this.#userView.registerUserSelectCallback(this.handleUserSelect.bind(this));
        this.#userView.registerPurchaseRemoveCallback(this.handleGarageRemove.bind(this));
    }

    setupGarageObserver() {
        this.#events.onPurchaseAdded(async (...data) => this.handleGarageAdd(...data));
    }

    async handleUserSelect(userId) {
        const user = await this.#userService.getUserById(userId);

        this.#events.dispatchUserSelected(user);

        this.#userView.renderUserDetails(user);
        this.#userView.renderGarage(user.purchases);
    }

    async handleGarageAdd({ user, product }) {
        const updatedUser = await this.#userService.getUserById(user.id);

        // não deixa a mesma moto entrar duas vezes na garagem
        if (updatedUser.purchases.some(moto => moto.id === product.id)) return;

        updatedUser.purchases.push({ ...product });
        await this.#userService.updateUser(updatedUser);

        this.#userView.addToGarage(product);
        this.#events.dispatchUsersUpdated({ users: await this.#userService.getUsers() });
    }

    async handleGarageRemove({ userId, product }) {
        const user = await this.#userService.getUserById(userId);
        const index = user.purchases.findIndex(moto => moto.id === product.id);

        if (index === -1) return;

        user.purchases.splice(index, 1);
        await this.#userService.updateUser(user);

        this.#events.dispatchUsersUpdated({ users: await this.#userService.getUsers() });
    }

    getSelectedUserId() {
        return this.#userView.getSelectedUserId();
    }
}
