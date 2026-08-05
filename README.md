# Preditor de Estilo de Moto

A partir de informações básicas de uma pessoa — **idade**, **gênero** e **condição
financeira** — uma rede neural treinada no browser com TensorFlow.js tenta prever
**qual estilo de moto** ela tem.

O nome não entra no modelo: é identificador, não característica.

## Rodar

```
npm install
npm start
```

Abre em `http://localhost:3000`.

## Estrutura

```
data/
  motos.json        catálogo — 39 motos em 8 estilos
  users.json        massa de treino — 120 pessoas (gerada)
  convidados.json   perfis de teste, sem moto  ← edite aqui pra brincar
scripts/
  generate-data.js  gerador determinístico da massa
src/
  view/             DOM e templates
  controller/       liga views e services
  service/          acesso aos dados
  workers/          treino e predição (thread separada)
  events/           event bus via CustomEvent
```

## Massa de treinamento

```
node scripts/generate-data.js
```

Gera `data/motos.json` e `data/users.json`. É determinístico: mesma `SEED`, mesma
massa. Todos os parâmetros de tuning ficam no bloco `PARÂMETROS` no topo do script.

Regras de negócio da geração:

| condição financeira | motos | teto de preço |
| --- | --- | --- |
| `muito_baixa` | 0 | — |
| `baixa` | 0 a 1 | R$ 22.000 |
| `media` | 1 a 3 | R$ 65.000 |
| `alta` | 2 a 4 | sem teto |

Idade e condição financeira são os sinais fortes. Gênero é deliberadamente um
sinal fraco — está lá pra rede ter o que aprender sem que a massa vire caricatura.

## Perfis de teste

`data/convidados.json` é uma lista de pessoas **sem moto nenhuma**. Elas aparecem
no topo do select, ficam de fora do treino (o modelo só treina com quem tem moto)
e são exatamente os casos que queremos prever.

Pra adicionar alguém, basta acrescentar um objeto:

```json
{
    "id": 909,
    "name": "Fulano de Tal",
    "age": 33,
    "gender": "masculino",
    "financialStatus": "alta",
    "purchases": []
}
```

Valores aceitos — `gender`: `feminino`, `masculino`. `financialStatus`:
`muito_baixa`, `baixa`, `media`, `alta`. Use `id` a partir de 900 pra não
colidir com a massa de treino.

## Como o modelo funciona

O treino é sobre **pares (pessoa, moto)**. Para cada pessoa que tem moto, cruzamos
o perfil dela com todas as 39 motos do catálogo: rótulo 1 se a moto está na
garagem, 0 caso contrário. A rede (`128 → 64 → 32 → 1 sigmoid`) aprende a dar uma
nota de afinidade de 0 a 1 para cada par.

Na predição, agregamos as notas por estilo (média das 3 melhores motos do estilo)
e o estilo com a maior nota é a resposta.

Vetores de entrada:

- **pessoa** (7 números): idade normalizada + one-hot de gênero + one-hot de renda
- **moto** (11 números): preço + cilindrada + idade média de quem tem + one-hot de estilo

## Problema conhecido: desbalanceamento

Com 39 motos e ~2 por garagem, só **~5% dos pares de treino são positivos**. Com
`binaryCrossentropy` puro, a rede aprende que responder "não" para tudo já acerta
95% — a accuracy no tfjs-vis fica ótima e o modelo, inútil.

O painel **Modelo** mostra a taxa de positivos justamente pra deixar isso visível.

Correção pendente: **negative sampling** na montagem dos exemplos
(`createTrainingData` em `src/workers/modelTrainingWorker.js`) — amostrar 3 a 5
motos que a pessoa não tem para cada moto que ela tem, em vez de usar o catálogo
inteiro. Isso leva os positivos para ~20% e ainda acelera o treino.
