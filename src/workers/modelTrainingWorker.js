import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';

let _globalCtx = {};
let _model = null;

// ====================================================================
// 🎯 O QUE ESTE MODELO FAZ
// --------------------------------------------------------------------
// Dado um PERFIL (idade, gênero, condição financeira), prever QUAL ESTILO
// de moto essa pessoa tem. O nome não entra: é identificador, não feature.
//
// A rede aprende sobre pares (pessoa, moto) e devolve uma nota de 0 a 1
// para cada par. Agregando as notas por estilo, chegamos no estilo previsto.
// ====================================================================

// Listas FIXAS (não derivadas da massa). Se viessem dos dados, um convidado
// com um perfil inédito geraria um vetor de tamanho diferente do treino.
const GENDERS = ['feminino', 'masculino'];
const FINANCIAL_STATUS = ['muito_baixa', 'baixa', 'media', 'alta'];

// Pesos aplicados a cada feature antes de entrar na rede. Servem para dizer
// "esta característica importa mais que aquela" — é um chute inicial nosso,
// e mexer aqui muda bastante o resultado.
const WEIGHTS = {
    // perfil da pessoa
    age: 0.35,
    gender: 0.15,
    financial: 0.40,
    // atributos da moto
    category: 0.40,
    price: 0.30,
    cilindrada: 0.20,
    ownerAge: 0.10,
};

// Ao resumir "o quanto esse estilo combina com a pessoa", usamos a média das
// N melhores motos do estilo — não a média de todas. Senão um estilo com muitas
// motos caríssimas seria punido injustamente para quem tem renda baixa.
const STYLE_TOP_N = 3;

// 🎯 NEGATIVE SAMPLING — quantas motos que a pessoa NÃO tem entram no treino
// para cada moto que ela tem. Ver o comentário em createTrainingData.
//
// Knob para brincar:
//   k = 4  → 20% de positivos  (recomendado)
//   k = 9  → 10% de positivos
//   k = 40 → praticamente o catálogo inteiro, volta o desbalanceamento
const NEGATIVES_PER_POSITIVE = 4;

// 🔢 Normaliza valores contínuos (preço, idade, cilindrada) para 0–1.
// Por quê? Mantém as features equilibradas para nenhuma dominar o treino.
// Fórmula: (val - min) / (max - min)
// Exemplo: preço=62000, minPreço=11500, maxPreço=280000 → 0.19
const normalize = (value, min, max) => (value - min) / ((max - min) || 1);

// One-hot com peso. Índice -1 (valor desconhecido) vira um vetor de zeros
// em vez de estourar o tf.oneHot.
const oneHotWeighted = (index, length, weight) =>
    index < 0
        ? tf.zeros([length])
        : tf.oneHot(index, length).cast('float32').mul(weight);

function makeContext(motos, users) {
    const ages = users.map(user => user.age);
    const prices = motos.map(moto => moto.price);
    const cilindradas = motos.map(moto => moto.cilindrada);

    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minCilindrada = Math.min(...cilindradas);
    const maxCilindrada = Math.max(...cilindradas);

    const categories = [...new Set(motos.map(moto => moto.category))];
    const categoriesIndex = Object.fromEntries(
        categories.map((category, index) => [category, index])
    );

    // Idade média de quem tem cada moto. É um sinal "colaborativo": diz ao
    // modelo que a Gold Wing vive em garagem de gente mais velha, coisa que
    // preço e cilindrada sozinhos não contam.
    const midAge = (minAge + maxAge) / 2;
    const ageSums = {};
    const ageCounts = {};

    users.forEach(user => {
        user.purchases.forEach(moto => {
            ageSums[moto.id] = (ageSums[moto.id] || 0) + user.age;
            ageCounts[moto.id] = (ageCounts[moto.id] || 0) + 1;
        });
    });

    const avgOwnerAgeNorm = Object.fromEntries(
        motos.map(moto => {
            const avg = ageCounts[moto.id]
                ? ageSums[moto.id] / ageCounts[moto.id]
                : midAge;

            return [moto.id, normalize(avg, minAge, maxAge)];
        })
    );

    return {
        motos,
        users,
        categories,
        categoriesIndex,
        avgOwnerAgeNorm,
        minAge,
        maxAge,
        minPrice,
        maxPrice,
        minCilindrada,
        maxCilindrada,
        numCategories: categories.length,
        // idade + gênero + condição financeira
        userDimensions: 1 + GENDERS.length + FINANCIAL_STATUS.length,
        // preço + cilindrada + idade média do dono + estilo
        motoDimensions: 3 + categories.length,
    };
}

// ====================================================================
// 📌 A pessoa ANTES da codificação:
//    { name: 'Otávio Prado', age: 19, gender: 'masculino', financialStatus: 'alta' }
//
// 📌 DEPOIS — o modelo não vê palavras, só números entre 0 e 1:
//    [
//      0.02,          // idade normalizada (19 numa escala de 18 a 70) × peso
//      0, 0.15,       // one-hot de gênero  [feminino, masculino]
//      0, 0, 0, 0.40  // one-hot de renda   [muito_baixa, baixa, media, alta]
//    ]
//
// Repare que o vetor da pessoa NÃO usa a garagem dela. É de propósito: o
// objetivo é prever o estilo a partir do perfil básico, então precisa
// funcionar para alguém que não tem moto nenhuma.
// ====================================================================
function encodeUser(user, context) {
    const age = tf.tensor1d([
        normalize(user.age, context.minAge, context.maxAge) * WEIGHTS.age
    ]);

    const gender = oneHotWeighted(
        GENDERS.indexOf(user.gender),
        GENDERS.length,
        WEIGHTS.gender
    );

    const financial = oneHotWeighted(
        FINANCIAL_STATUS.indexOf(user.financialStatus),
        FINANCIAL_STATUS.length,
        WEIGHTS.financial
    );

    return tf.concat1d([age, gender, financial]);
}

function encodeMoto(moto, context) {
    const price = tf.tensor1d([
        normalize(moto.price, context.minPrice, context.maxPrice) * WEIGHTS.price
    ]);

    const cilindrada = tf.tensor1d([
        normalize(moto.cilindrada, context.minCilindrada, context.maxCilindrada) * WEIGHTS.cilindrada
    ]);

    const ownerAge = tf.tensor1d([
        (context.avgOwnerAgeNorm[moto.id] ?? 0.5) * WEIGHTS.ownerAge
    ]);

    const category = oneHotWeighted(
        context.categoriesIndex[moto.category] ?? -1,
        context.numCategories,
        WEIGHTS.category
    );

    return tf.concat1d([price, cilindrada, ownerAge, category]);
}

/**
 * Sorteia `count` itens distintos de `pool`, sem repetição.
 *
 * Fisher-Yates parcial: embaralha só os primeiros `count` lugares em vez do
 * array inteiro. Para um pool de ~37 motos tanto faz, mas é o jeito certo de
 * escrever e não fica mais complicado que o errado.
 */
function sampleWithoutReplacement(pool, count) {
    const items = [...pool];
    const size = Math.min(count, items.length);

    for (let i = 0; i < size; i++) {
        const j = i + Math.floor(Math.random() * (items.length - i));
        [items[i], items[j]] = [items[j], items[i]];
    }

    return items.slice(0, size);
}

// ====================================================================
// 🏗️ Montagem dos exemplos de treino — com NEGATIVE SAMPLING
// --------------------------------------------------------------------
// A versão ingênua cruza cada pessoa com o catálogo INTEIRO: 91 pessoas ×
// 39 motos = 3.549 pares, dos quais só 175 são positivos (4,9%).
//
// Com esse desbalanceamento a rede encontra um atalho e para por ali:
// respondendo "não" para tudo ela já acerta 95,1% e chega a uma loss de
// ~0,20. Curvas lindas no tfjs-vis, modelo inútil. Pior: com batch de 32,
// uma em cada cinco batches não tem NENHUM positivo — nesses passos o único
// gradiente que existe diz "empurra tudo para zero", sem contraste algum
// para aprender.
//
// A saída é não usar todos os negativos. Para cada moto que a pessoa tem,
// sorteamos NEGATIVES_PER_POSITIVE motos que ela não tem.
//
// Por que isso é legítimo: os zeros não são fatos observados. "Ana não tem
// uma Gold Wing" não quer dizer "Ana rejeitou a Gold Wing" — é ausência de
// informação (implicit feedback). O conjunto de negativos é presumido e
// essencialmente infinito: cadastrar mais 5.000 motos geraria mais 5.000
// negativos por pessoa e zero informação nova. O que a rede precisa é do
// CONTRASTE entre o que a pessoa tem e uma amostra do que ela não tem — e
// uma amostra carrega esse contraste tão bem quanto o conjunto todo.
//
// O preço: o score de saída deixa de ser probabilidade calibrada (treinando
// com 20% de positivos num mundo de 4,9%, o modelo superestima). Não nos
// afeta porque só usamos a ORDEM dos scores e a média por estilo, e a
// subamostragem uniforme desloca todos eles pela mesma transformação
// monotônica. Se um dia precisar da probabilidade real, subtraia log(k) do
// logit antes da sigmoid.
//
// Variação que vale testar: em vez de sortear uniforme, enviesar por
// popularidade (sortear mais as motos que muita gente tem). Deixa a tarefa
// mais difícil e costuma render um modelo melhor.
// ====================================================================
function createTrainingData(context) {
    const inputs = [];
    const labels = [];

    const trainable = context.users.filter(user => user.purchases.length);

    trainable.forEach(user => {
        const userVector = encodeUser(user, context).dataSync();
        const ownedIds = new Set(user.purchases.map(moto => moto.id));

        // casamos pelo catálogo, não pelo snapshot guardado na garagem
        const owned = context.motoVectors.filter(moto => ownedIds.has(moto.id));
        const notOwned = context.motoVectors.filter(moto => !ownedIds.has(moto.id));

        // ⚠️ o pool exclui o que a pessoa tem: sortear de lá rotularia um
        // positivo como negativo e ensinaria exatamente o contrário
        const negatives = sampleWithoutReplacement(
            notOwned,
            owned.length * NEGATIVES_PER_POSITIVE
        );

        owned.forEach(({ vector }) => {
            inputs.push([...userVector, ...vector]);
            labels.push(1);
        });

        negatives.forEach(({ vector }) => {
            inputs.push([...userVector, ...vector]);
            labels.push(0);
        });
    });

    const positives = labels.reduce((total, label) => total + label, 0);

    return {
        xs: tf.tensor2d(inputs),
        ys: tf.tensor2d(labels, [labels.length, 1]),
        // tamanho = vetor da pessoa + vetor da moto
        inputDimention: context.userDimensions + context.motoDimensions,
        positives,
        total: labels.length,
        // quanto seria sem sampling, só para o painel mostrar a diferença
        allPairs: trainable.length * context.motoVectors.length,
    };
}

// ====================================================================
// 🧠 Configuração e treinamento da rede neural
// ====================================================================
async function configureNeuralNetAndTrain(trainData) {
    const model = tf.sequential();

    // Camada de entrada
    // - inputShape: número de features por exemplo (perfil + moto)
    // - units: 128 neurônios (muitos "olhos" para detectar padrões)
    // - activation: 'relu' (mantém só sinais positivos, aprende padrões não-lineares)
    model.add(
        tf.layers.dense({
            inputShape: [trainData.inputDimention],
            units: 128,
            activation: 'relu'
        })
    );

    // Camada oculta 1 — 64 neurônios, começa a comprimir a informação
    model.add(
        tf.layers.dense({
            units: 64,
            activation: 'relu'
        })
    );

    // Camada oculta 2 — 32 neurônios, destila só os padrões mais fortes
    model.add(
        tf.layers.dense({
            units: 32,
            activation: 'relu'
        })
    );

    // Camada de saída
    // - 1 neurônio: uma única nota de afinidade
    // - 'sigmoid' comprime o resultado entre 0 e 1
    //   Exemplo: 0.9 = combina muito, 0.1 = combina pouco
    model.add(
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
    );

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    let lastAccuracy = 0;
    let lastLoss = 0;

    await model.fit(trainData.xs, trainData.ys, {
        epochs: 100,
        batchSize: 32,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                lastAccuracy = logs.acc;
                lastLoss = logs.loss;

                postMessage({
                    type: workerEvents.trainingLog,
                    epoch,
                    loss: logs.loss,
                    accuracy: logs.acc
                });
            }
        }
    });

    return { model, lastAccuracy, lastLoss };
}

async function trainModel({ users }) {
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 1 } });

    const motos = await (await fetch('/data/motos.json')).json();
    const context = makeContext(motos, users);

    context.motoVectors = motos.map(moto => ({
        id: moto.id,
        name: moto.name,
        category: moto.category,
        meta: { ...moto },
        vector: encodeMoto(moto, context).dataSync()
    }));

    _globalCtx = context;

    const trainData = createTrainingData(context);
    const { model, lastAccuracy, lastLoss } = await configureNeuralNetAndTrain(trainData);
    _model = model;

    // precisa vir depois de _model, porque avalia rodando o próprio modelo
    const evaluation = evaluateStyleHitRate(context);

    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({
        type: workerEvents.trainingComplete,
        stats: {
            people: users.length,
            peopleWithMotos: users.filter(user => user.purchases.length).length,
            motos: motos.length,
            allPairs: trainData.allPairs,
            pairs: trainData.total,
            positives: trainData.positives,
            positiveRate: trainData.positives / trainData.total,
            negativesPerPositive: NEGATIVES_PER_POSITIVE,
            accuracy: lastAccuracy,
            loss: lastLoss,
            evaluation,
        }
    });
}

// ====================================================================
// 🔮 Predição
// ====================================================================

/**
 * Roda o modelo em todos os pares (pessoa, moto) do catálogo de uma vez e
 * devolve as motos ordenadas pela nota de afinidade.
 *
 * Em aplicações reais: guarde os vetores das motos num banco vetorial
 * (Postgres/pgvector, Pinecone), busque as N mais próximas do vetor da pessoa
 * e rode o predict só nessas — não no catálogo inteiro.
 */
function rankMotosFor(user, context) {
    // tidy() descarta os tensores intermediários. Sem isso, avaliar 91 pessoas
    // seguidas vazaria memória da GPU/WebGL.
    const scores = tf.tidy(() => {
        const userVector = encodeUser(user, context).dataSync();
        const inputs = context.motoVectors.map(({ vector }) => [...userVector, ...vector]);

        return _model.predict(tf.tensor2d(inputs)).dataSync();
    });

    return context.motoVectors
        .map((item, index) => ({ ...item.meta, score: scores[index] }))
        .sort((a, b) => b.score - a.score);
}

/**
 * A resposta que a gente quer não é "qual moto", é "qual ESTILO de moto".
 * Resume o ranking numa nota por estilo — média das STYLE_TOP_N melhores.
 */
function aggregateByStyle(ranking) {
    const scoresByStyle = ranking.reduce((acc, moto) => {
        (acc[moto.category] ??= []).push(moto.score);
        return acc;
    }, {});

    return Object.entries(scoresByStyle)
        .map(([style, styleScores]) => {
            const top = styleScores.slice(0, STYLE_TOP_N);

            return {
                style,
                score: top.reduce((sum, score) => sum + score, 0) / top.length,
                topMoto: ranking.find(moto => moto.category === style),
            };
        })
        .sort((a, b) => b.score - a.score);
}

// ====================================================================
// 📏 HIT-RATE DE ESTILO — a métrica que mede o que o app promete
// --------------------------------------------------------------------
// A accuracy que o model.fit reporta é sobre a tarefa de classificar PARES
// (esta pessoa tem ESTA moto?), e essa tarefa tem um teto baixíssimo: duas
// pessoas com o mesmo perfil são idênticas para o modelo, mas uma tem uma
// MT-07 e a outra uma Ninja 400. Medindo na massa, pessoas do mesmo balde
// de perfil concordam só 6,5% nas motos específicas — o rótulo por par é
// irredutivelmente ruidoso, e perseguir essa accuracy é perseguir ruído.
//
// O hit-rate abaixo mede a tarefa de verdade: para cada pessoa que tem moto,
// o estilo top-1 previsto está entre os estilos que ela realmente tem?
//
// ⚠️ É medido na PRÓPRIA massa de treino (in-sample), então é otimista. Serve
// para comparar regimes (mudou o k? mudou os pesos?) e para comparar com os
// baselines abaixo, não como estimativa de desempenho em gente nova. O passo
// seguinte natural seria separar um conjunto de teste.
// ====================================================================
function evaluateStyleHitRate(context) {
    const evaluated = context.users.filter(user => user.purchases.length);
    if (!evaluated.length) return null;

    const styleCounts = {};
    let hits = 0;

    evaluated.forEach(user => {
        const ownedStyles = new Set(user.purchases.map(moto => moto.category));
        ownedStyles.forEach(style => {
            styleCounts[style] = (styleCounts[style] || 0) + 1;
        });

        const [predicted] = aggregateByStyle(rankMotosFor(user, context));
        if (ownedStyles.has(predicted.style)) hits++;
    });

    return {
        hitRate: hits / evaluated.length,
        evaluated: evaluated.length,
        // chutar um estilo ao acaso
        randomBaseline: 1 / context.numCategories,
        // chutar sempre o estilo mais comum da massa
        majorityBaseline: Math.max(...Object.values(styleCounts)) / evaluated.length,
    };
}

function predictStyle({ user }) {
    if (!_model) return;

    const context = _globalCtx;
    const ranking = rankMotosFor(user, context);

    postMessage({
        type: workerEvents.recommend,
        user,
        recommendations: ranking,
        styles: aggregateByStyle(ranking),
    });
}

const handlers = {
    [workerEvents.trainModel]: trainModel,
    [workerEvents.recommend]: predictStyle,
};

self.onmessage = event => {
    const { action, ...data } = event.data;
    if (handlers[action]) handlers[action](data);
};
