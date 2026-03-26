const roundSpeed = (bandwidth) => {
    return Math.round(bandwidth / 1250) / 100;
};

const calculateJitter = (latencyMeasurements) => {
    if (!latencyMeasurements || latencyMeasurements.length < 2) return null;
    let totalDiff = 0;
    for (let i = 1; i < latencyMeasurements.length; i++) {
        totalDiff += Math.abs(latencyMeasurements[i] - latencyMeasurements[i - 1]);
    }
    return parseFloat((totalDiff / (latencyMeasurements.length - 1)).toFixed(2));
};

export const parseOokla = (test) => {
    let ping = Math.round(test.ping.latency);
    let jitter = test.ping.jitter ? parseFloat(test.ping.jitter.toFixed(2)) : null;
    let download = roundSpeed(test.download.bandwidth);
    let upload = roundSpeed(test.upload.bandwidth);
    let time = Math.round((test.download.elapsed + test.upload.elapsed) / 1000);

    return {ping, jitter, download, upload, time, resultId: test.result?.id};
};

export const parseLibre = (test) => ({...test, ping: Math.round(test.ping), 
    jitter: test.jitter ? parseFloat(parseFloat(test.jitter).toFixed(2)) : null,
    time: Math.round(test.elapsed / 1000), resultId: null});

export const parseCloudflare = (test) => {
    if (test && test.latency_measurement && test.speed_measurements) {
        const downloadTests = test.speed_measurements.filter(t => t.test_type === "Download");
        const uploadTests = test.speed_measurements.filter(t => t.test_type === "Upload");

        const downloadSpeeds = downloadTests.map(t => t.max || t.median || 0);
        const download = downloadSpeeds.length > 0 ? Math.max(...downloadSpeeds) : 0;

        const uploadSpeeds = uploadTests.map(t => t.max || t.median || 0);
        const upload = uploadSpeeds.length > 0 ? Math.max(...uploadSpeeds) : 0;

        const ping = Math.round(test.latency_measurement.avg_latency_ms || 0);
        const jitter = calculateJitter(test.latency_measurement.latency_measurements);

        const time = Math.round((test.elapsed || 30000) / 1000);
        
        return {ping, jitter, download: parseFloat(download.toFixed(2)),
            upload: parseFloat(upload.toFixed(2)), time, resultId: null};
    }

    return {ping: 0, jitter: null, download: 0, upload: 0, time: 0, resultId: null};
};

export const parseGuizhou = (test) => ({
    ping: Math.round(test.ping),
    jitter: null,
    download: parseFloat(test.download.toFixed(2)),
    upload: parseFloat(test.upload.toFixed(2)),
    time: test.time || Math.round((test.elapsed || 0) / 1000),
    resultId: null
});

export const parseData = (provider, data) => {
    switch (provider) {
        case "ookla":
            return parseOokla(data);
        case "libre":
            return parseLibre(data);
        case "cloudflare":
            return parseCloudflare(data);
        case "guizhou":
            return parseGuizhou(data);
        default:
            throw {message: "Invalid provider"};
    }
};