import { Cluster } from "puppeteer-cluster";

let clusterInstance: Cluster<any, any> | null = null;

const getClusterInstance = async () => {
    if (!clusterInstance) {
        clusterInstance = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: 3,
            timeout: 30000, 
            puppeteerOptions: {
                headless: 'new',
                args: [
                    '--use-fake-ui-for-media-stream', // Bypass location access dialog
                    '--disable-infobars', //disable inforbar : chrome is being controlled by a software
                    '--disable-gpu',
                    '--no-sandbox', // Avoids sandboxing for performance
                    '--disable-setuid-sandbox', // Same as above, avoids user namespace errors
                    '--disable-dev-shm-usage', // Prevents crashes in environments with low shared memory
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--mute-audio', // Disables audio for minimal resource usage
                    '--disable-extensions', // Prevents loading unnecessary Chrome extensions
                ],
            },
        });

        // Log errors for all tasks in the cluster
        clusterInstance.on('taskerror', (err, data) => {
            console.error(`Error in cluster task for ${data}:`, err);
        });
    }
    return clusterInstance;
};

export default getClusterInstance;
