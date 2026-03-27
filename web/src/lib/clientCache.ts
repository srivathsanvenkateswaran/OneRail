/**
 * Lightweight vanilla IndexedDB wrapper for caching large JSON responses 
 * locally in the browser to prevent repetitive heavy DB queries.
 */

export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OneRailAtlas', 1);
        request.onupgradeneeded = (event) => {
            const db = request.result;
            if (!db.objectStoreNames.contains('payloads')) {
                db.createObjectStore('payloads');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const getCachedData = async (key: string): Promise<any | null> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction('payloads', 'readonly');
            const store = tx.objectStore('payloads');
            const req = store.get(key);
            req.onsuccess = () => {
                // Return data if found, but check timestamp to expire cache after e.g. 24h
                const result = req.result;
                if (!result) return resolve(null);
                
                // Cache valid for 24 hours
                if (Date.now() - result.timestamp > 86400000) {
                    resolve(null);
                } else {
                    resolve(result.data);
                }
            };
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
};

export const setCachedData = async (key: string, data: any): Promise<void> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction('payloads', 'readwrite');
            const store = tx.objectStore('payloads');
            
            // We store the data with a timestamp to manage expiration
            const req = store.put({ data, timestamp: Date.now() }, key);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    } catch {
        // Silently fails if IDB blocked
    }
};
