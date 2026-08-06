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
        this.#userView.registerUserSelectCallback(this.handleUserSelect.bind(this));

        this.#events.dispatchUsersUpdated({ users });
    }

    async handleUserSelect(userId) {
        const user = await this.#userService.getUserById(userId);

        this.#events.dispatchUserSelected(user);

        this.#userView.renderUserDetails(user);
        this.#userView.renderGarage(user.purchases);
    }

    getSelectedUserId() {
        return this.#userView.getSelectedUserId();
    }
}
