/**
 * Gerador da massa de treinamento — predição de estilo de moto por perfil.
 *
 * Rode com:  node scripts/generate-data.js
 *
 * Emite:
 *   data/motos.json  — catálogo de motos { id, name, category, price, cilindrada }
 *   data/users.json  — pessoas { id, name, age, gender, financialStatus, purchases[] }
 *
 * A massa é sintética e DETERMINÍSTICA (PRNG com semente fixa): rodar duas vezes
 * com o mesmo SEED produz exatamente os mesmos arquivos. Troque o SEED para gerar
 * uma massa diferente com as mesmas regras.
 *
 * Todos os knobs de tuning estão no bloco "PARÂMETROS" abaixo. Mexer neles e
 * reobservar a curva de loss/accuracy no tfjs-vis é o exercício.
 */

import { writeFileSync } from 'node:fs';

// ====================================================================
// PARÂMETROS
// ====================================================================

const SEED = 42;
const TOTAL_USERS = 120;

/**
 * Condição financeira: quantas motos a pessoa pode ter e em que faixa de preço.
 * Regra de negócio pedida:
 *   muito_baixa → nenhuma moto
 *   baixa       → no máximo 1, e barata
 *   media       → até 3
 *   alta        → quantas quiser (limitado a 4 aqui pra massa não desbalancear)
 *
 * priceRange também define um PISO, não só um teto: quem tem alta renda
 * dificilmente aparece com uma CG 160, e isso deixa o sinal de preço mais nítido.
 */
const FINANCIAL_TIERS = {
    muito_baixa: {
        priceRange: [0, 0],
        motoCount: { 0: 1 },
    },
    baixa: {
        priceRange: [0, 22_000],
        motoCount: { 0: 0.45, 1: 0.55 },
    },
    media: {
        priceRange: [12_000, 65_000],
        motoCount: { 1: 0.45, 2: 0.35, 3: 0.20 },
    },
    alta: {
        priceRange: [30_000, Infinity],
        motoCount: { 2: 0.35, 3: 0.40, 4: 0.25 },
    },
};

/** Faixas etárias — o modelo não vê o rótulo, só a idade normalizada. */
const AGE_BANDS = {
    jovem: [18, 25],
    jovemAdulto: [26, 35],
    adulto: [36, 50],
    maduro: [51, 70],
};

const AGE_BAND_SHARE = {
    jovem: 0.22,
    jovemAdulto: 0.32,
    adulto: 0.30,
    maduro: 0.16,
};

/**
 * Renda correlacionada com idade: mais velho tende a ter mais poder de compra.
 * Isso cria uma estrutura conjunta (idade × renda) que a rede precisa desembaraçar,
 * em vez de duas variáveis independentes.
 */
const FINANCIAL_BY_AGE_BAND = {
    jovem: { muito_baixa: 0.26, baixa: 0.40, media: 0.26, alta: 0.08 },
    jovemAdulto: { muito_baixa: 0.14, baixa: 0.30, media: 0.38, alta: 0.18 },
    adulto: { muito_baixa: 0.08, baixa: 0.22, media: 0.40, alta: 0.30 },
    maduro: { muito_baixa: 0.06, baixa: 0.18, media: 0.38, alta: 0.38 },
};

const GENDER_SHARE = { masculino: 0.58, feminino: 0.42 };

/**
 * Afinidade perfil × estilo. O peso final é age × money × gender (multiplicativo),
 * e o estilo é sorteado proporcionalmente a esse peso.
 *
 * Idade e renda são os sinais FORTES (spread de 0.05 a 5). Gênero é deliberadamente
 * um sinal FRACO (0.75 a 1.6) — existe pra rede ter o que aprender, mas sem que a
 * massa vire uma caricatura de estereótipo. Se quiser ver o efeito, empurre os
 * valores de `gender` pra perto de 1.0 e veja a accuracy praticamente não mudar.
 */
const AFFINITY = {
    scooter: {
        age: { jovem: 3.0, jovemAdulto: 2.0, adulto: 2.0, maduro: 3.0 },
        money: { baixa: 4.0, media: 2.0, alta: 0.5 },
        gender: { feminino: 1.60, masculino: 0.90 },
    },
    street: {
        age: { jovem: 3.0, jovemAdulto: 3.0, adulto: 2.0, maduro: 1.5 },
        money: { baixa: 5.0, media: 2.0, alta: 0.3 },
        gender: { feminino: 1.00, masculino: 1.10 },
    },
    naked: {
        age: { jovem: 2.0, jovemAdulto: 3.5, adulto: 2.0, maduro: 1.0 },
        money: { baixa: 0.5, media: 3.0, alta: 2.0 },
        gender: { feminino: 1.00, masculino: 1.10 },
    },
    esportiva: {
        age: { jovem: 4.0, jovemAdulto: 3.5, adulto: 1.2, maduro: 0.4 },
        money: { baixa: 0.3, media: 2.0, alta: 3.0 },
        gender: { feminino: 0.75, masculino: 1.25 },
    },
    custom: {
        age: { jovem: 0.5, jovemAdulto: 1.2, adulto: 3.0, maduro: 4.0 },
        money: { baixa: 0.5, media: 1.5, alta: 3.0 },
        gender: { feminino: 1.10, masculino: 1.05 },
    },
    trail: {
        age: { jovem: 2.0, jovemAdulto: 2.5, adulto: 2.5, maduro: 1.2 },
        money: { baixa: 1.5, media: 3.0, alta: 1.2 },
        gender: { feminino: 0.90, masculino: 1.10 },
    },
    'big trail': {
        age: { jovem: 0.6, jovemAdulto: 2.0, adulto: 3.5, maduro: 3.0 },
        money: { baixa: 0.1, media: 1.5, alta: 4.0 },
        gender: { feminino: 0.90, masculino: 1.10 },
    },
    touring: {
        age: { jovem: 0.2, jovemAdulto: 0.8, adulto: 2.5, maduro: 4.0 },
        money: { baixa: 0.05, media: 1.2, alta: 4.0 },
        gender: { feminino: 0.90, masculino: 1.10 },
    },
};

/**
 * Chance de uma moto adicional ser do MESMO estilo da primeira.
 * Alto demais (1.0) = garagens monotemáticas, padrão fácil demais.
 * Baixo demais (0.0) = garagens aleatórias, sem sinal nenhum.
 */
const SAME_STYLE_STICKINESS = 0.70;

// ====================================================================
// CATÁLOGO DE MOTOS
// ====================================================================

const MOTOS = [
    // scooter
    ['Honda Biz 125', 'scooter', 11_500, 125],
    ['Honda PCX 160', 'scooter', 19_500, 156],
    ['Yamaha NMax 160', 'scooter', 21_000, 155],
    ['Honda ADV 350', 'scooter', 39_000, 330],
    // street
    ['Honda CG 160 Start', 'street', 14_500, 162],
    ['Honda CG 160 Titan', 'street', 16_500, 162],
    ['Yamaha Factor 150', 'street', 17_000, 149],
    ['Honda CB 300F Twister', 'street', 24_000, 293],
    // naked
    ['Yamaha MT-03', 'naked', 33_000, 321],
    ['Kawasaki Z400', 'naked', 39_000, 399],
    ['Yamaha MT-07', 'naked', 52_000, 689],
    ['Honda CB 650R', 'naked', 62_000, 649],
    ['Kawasaki Z900', 'naked', 75_000, 948],
    ['Ducati Monster', 'naked', 95_000, 937],
    // esportiva
    ['Yamaha R3', 'esportiva', 36_000, 321],
    ['Kawasaki Ninja 400', 'esportiva', 42_000, 399],
    ['Yamaha R7', 'esportiva', 62_000, 689],
    ['Honda CBR 650R', 'esportiva', 65_000, 649],
    ['Kawasaki Ninja ZX-10R', 'esportiva', 145_000, 998],
    ['BMW S 1000 RR', 'esportiva', 175_000, 999],
    // custom
    ['Haojue Chopper Road 150', 'custom', 16_000, 150],
    ['Royal Enfield Meteor 350', 'custom', 32_000, 349],
    ['Harley-Davidson Iron 883', 'custom', 68_000, 883],
    ['Indian Scout', 'custom', 110_000, 1_133],
    ['Harley-Davidson Fat Boy', 'custom', 145_000, 1_868],
    // trail
    ['Honda NXR 160 Bros', 'trail', 20_000, 162],
    ['Yamaha Lander 250', 'trail', 27_000, 249],
    ['Honda XRE 300 Sahara', 'trail', 32_000, 291],
    // big trail
    ['Royal Enfield Himalayan 450', 'big trail', 42_000, 452],
    ['Honda NC 750X', 'big trail', 58_000, 745],
    ['Yamaha Ténéré 700', 'big trail', 75_000, 689],
    ['BMW F 850 GS', 'big trail', 92_000, 853],
    ['Honda Africa Twin', 'big trail', 120_000, 1_084],
    ['BMW R 1300 GS', 'big trail', 145_000, 1_300],
    // touring
    ['Kawasaki Versys 650', 'touring', 55_000, 649],
    ['Yamaha Tracer 7', 'touring', 58_000, 689],
    ['BMW R 1250 RT', 'touring', 160_000, 1_254],
    ['Harley-Davidson Road Glide', 'touring', 210_000, 1_923],
    ['Honda Gold Wing', 'touring', 280_000, 1_833],
].map(([name, category, price, cilindrada], index) => ({
    id: index + 1,
    name,
    category,
    price,
    cilindrada,
}));

// ====================================================================
// NOMES
// ====================================================================

const FIRST_NAMES = {
    feminino: [
        'Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela',
        'Helena', 'Isabela', 'Juliana', 'Karina', 'Larissa', 'Mariana', 'Natália',
        'Olívia', 'Patrícia', 'Rafaela', 'Sabrina', 'Tatiane', 'Vanessa',
        'Bruna', 'Carolina', 'Débora', 'Elaine', 'Flávia', 'Giovana', 'Ingrid',
        'Letícia', 'Michele', 'Priscila',
    ],
    masculino: [
        'André', 'Bruno', 'Carlos', 'Diego', 'Eduardo', 'Felipe', 'Gustavo',
        'Henrique', 'Igor', 'João', 'Kleber', 'Lucas', 'Marcelo', 'Nelson',
        'Otávio', 'Paulo', 'Rafael', 'Sérgio', 'Thiago', 'Vinícius',
        'Alexandre', 'Caio', 'Daniel', 'Fábio', 'Guilherme', 'Leandro',
        'Matheus', 'Rodrigo', 'Tiago', 'Wesley',
    ],
};

const SURNAMES = [
    'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
    'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
    'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
    'Rocha', 'Dias', 'Nunes', 'Moreira', 'Cardoso', 'Teixeira', 'Correia',
    'Mendes', 'Freitas', 'Araújo',
];

// ====================================================================
// UTILITÁRIOS
// ====================================================================

/** PRNG determinístico (mulberry32) — mesma semente, mesma massa. */
function mulberry32(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = mulberry32(SEED);

/** Sorteia uma chave proporcionalmente ao peso. entries: [[chave, peso], ...] */
function pickWeighted(entries) {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let ticket = rand() * total;

    for (const [key, weight] of entries) {
        ticket -= weight;
        if (ticket <= 0) return key;
    }

    return entries[entries.length - 1][0];
}

const pickFromObject = (weights) => pickWeighted(Object.entries(weights));

const randomInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

// ====================================================================
// GERAÇÃO
// ====================================================================

function makeName(gender, used) {
    const pool = FIRST_NAMES[gender];

    // tenta até achar uma combinação inédita; o espaço é grande o bastante
    // (30 nomes × 30 sobrenomes por gênero) pra isso nunca travar com 120 pessoas
    for (let attempt = 0; attempt < 200; attempt++) {
        const name = `${pool[randomInt(0, pool.length - 1)]} ${SURNAMES[randomInt(0, SURNAMES.length - 1)]}`;
        if (!used.has(name)) {
            used.add(name);
            return name;
        }
    }

    throw new Error('Não consegui gerar um nome único — aumente os pools de nomes.');
}

function makeProfile(used) {
    const ageBand = pickFromObject(AGE_BAND_SHARE);
    const [minAge, maxAge] = AGE_BANDS[ageBand];
    const gender = pickFromObject(GENDER_SHARE);
    const financialStatus = pickFromObject(FINANCIAL_BY_AGE_BAND[ageBand]);

    return {
        name: makeName(gender, used),
        age: randomInt(minAge, maxAge),
        gender,
        financialStatus,
        ageBand,
    };
}

/** Motos que cabem no bolso desse perfil. */
function affordableMotos(financialStatus) {
    const [floor, ceiling] = FINANCIAL_TIERS[financialStatus].priceRange;
    return MOTOS.filter((moto) => moto.price >= floor && moto.price <= ceiling);
}

/**
 * Peso de cada estilo pra esse perfil, já descartando estilos sem nenhuma
 * moto acessível (não adianta querer touring com renda baixa).
 */
function styleWeights(profile, affordable) {
    const availableStyles = new Set(affordable.map((moto) => moto.category));

    return Object.entries(AFFINITY)
        .filter(([style]) => availableStyles.has(style))
        .map(([style, affinity]) => [
            style,
            affinity.age[profile.ageBand] *
                affinity.money[profile.financialStatus] *
                affinity.gender[profile.gender],
        ])
        .filter(([, weight]) => weight > 0);
}

function makeGarage(profile) {
    const count = Number(pickFromObject(FINANCIAL_TIERS[profile.financialStatus].motoCount));
    if (count === 0) return [];

    const affordable = affordableMotos(profile.financialStatus);
    const weights = styleWeights(profile, affordable);
    if (!weights.length) return [];

    const primaryStyle = pickWeighted(weights);
    const garage = [];
    const takenIds = new Set();

    while (garage.length < count) {
        // a primeira moto define o estilo dominante; as seguintes em geral
        // repetem esse estilo, mas às vezes puxam um segundo (a scooter da
        // cidade ao lado da big trail de viagem)
        const style =
            garage.length === 0 || rand() < SAME_STYLE_STICKINESS
                ? primaryStyle
                : pickWeighted(weights);

        const candidates = affordable.filter(
            (moto) => moto.category === style && !takenIds.has(moto.id),
        );

        if (!candidates.length) {
            // estilo esgotado — tenta qualquer moto acessível que ainda não esteja na garagem
            const fallback = affordable.filter((moto) => !takenIds.has(moto.id));
            if (!fallback.length) break;

            const moto = fallback[randomInt(0, fallback.length - 1)];
            takenIds.add(moto.id);
            garage.push({ ...moto });
            continue;
        }

        const moto = candidates[randomInt(0, candidates.length - 1)];
        takenIds.add(moto.id);
        garage.push({ ...moto });
    }

    return garage;
}

function generateUsers() {
    const usedNames = new Set();

    return Array.from({ length: TOTAL_USERS }, (_, index) => {
        const { ageBand, ...profile } = makeProfile(usedNames);

        return {
            id: index + 1,
            ...profile,
            purchases: makeGarage({ ...profile, ageBand }),
        };
    });
}

// ====================================================================
// RELATÓRIO — o que a massa ficou sendo
// ====================================================================

function tally(items, keyOf) {
    return items.reduce((acc, item) => {
        const key = keyOf(item);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function report(users) {
    const withMotos = users.filter((user) => user.purchases.length);
    const allMotos = users.flatMap((user) => user.purchases);

    const byStyle = tally(allMotos, (moto) => moto.category);
    const byTier = tally(users, (user) => user.financialStatus);
    const byGender = tally(users, (user) => user.gender);
    const byCount = tally(users, (user) => user.purchases.length);

    const line = (label, obj, total) =>
        Object.entries(obj)
            .sort(([, a], [, b]) => b - a)
            .map(([key, value]) => `    ${key.padEnd(14)} ${String(value).padStart(4)}  ${((value / total) * 100).toFixed(1)}%`)
            .join('\n');

    console.log(`
Massa gerada (SEED=${SEED})
─────────────────────────────────────────────
  Pessoas                 ${users.length}
  Com ao menos 1 moto     ${withMotos.length}  ← estas viram pares de treino
  Sem moto (cold start)   ${users.length - withMotos.length}
  Motos no catálogo       ${MOTOS.length}
  Pares (usuário × moto)  ${withMotos.length * MOTOS.length}
  Motos atribuídas        ${allMotos.length}
  Rótulos positivos       ${((allMotos.length / (withMotos.length * MOTOS.length)) * 100).toFixed(1)}% dos pares

  Condição financeira
${line('tier', byTier, users.length)}

  Gênero
${line('gender', byGender, users.length)}

  Motos por pessoa
${line('count', byCount, users.length)}

  Estilos atribuídos
${line('style', byStyle, allMotos.length)}
`);
}

// ====================================================================
// MAIN
// ====================================================================

const users = generateUsers();

const dataDir = new URL('../data/', import.meta.url);
writeFileSync(new URL('motos.json', dataDir), `${JSON.stringify(MOTOS, null, 4)}\n`);
writeFileSync(new URL('users.json', dataDir), `${JSON.stringify(users, null, 4)}\n`);

report(users);
console.log('  → data/motos.json');
console.log('  → data/users.json\n');
