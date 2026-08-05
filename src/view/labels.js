export const financialLabels = {
    muito_baixa: 'Muito baixa',
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
};

export const genderLabels = {
    feminino: 'Feminino',
    masculino: 'Masculino',
};

export const formatBRL = (value) =>
    value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });

export const formatPercent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
