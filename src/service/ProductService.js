export class ProductService {
    async getProducts() {
        const response = await fetch('./data/motos.json');
        return await response.json();
    }

    async getProductById(id) {
        const motos = await this.getProducts();
        return motos.find(moto => moto.id === id);
    }
}
