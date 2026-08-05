export class View {
    constructor() {
        this.loadTemplate = this.loadTemplate.bind(this);
    }

    async loadTemplate(templatePath) {
        const response = await fetch(templatePath);
        return await response.text();
    }

    replaceTemplate(template, data) {
        let result = template;

        for (const [key, value] of Object.entries(data)) {
            // O replacer é uma função de propósito: valores como "R$ 62.000"
            // ou JSON com $ seriam interpretados como padrões especiais ($&, $1...)
            // se passados como string.
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), () => value);
        }

        return result;
    }
}
