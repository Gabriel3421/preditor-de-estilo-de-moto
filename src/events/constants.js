export const events = {
    userSelected: 'user:selected',
    usersUpdated: 'users:updated',
    modelTrain: 'training:train',
    trainingComplete: 'training:complete',

    modelProgressUpdate: 'model:progress-update',
    recommendationsReady: 'recommendations:ready',
    recommend: 'recommend',

    tfvisLogs: 'tfvis:logs',
    tfvisData: 'tfvis:data',
}

export const workerEvents = {
    trainingComplete: 'training:complete',
    trainModel: 'train:model',
    recommend: 'recommend',
    trainingLog: 'training:log',
    progressUpdate: 'progress:update',
    tfVisData: 'tfvis:data',
    tfVisLogs: 'tfvis:logs',
}
