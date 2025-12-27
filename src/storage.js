// IndexedDB storage for recordings
const DB_NAME = 'ScribeDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

let db = null;

export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

export async function saveRecording(id, blob, text, timestamp) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        store.put({ id, blob, text, timestamp });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadRecordings() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const recordings = request.result || [];
            recordings.sort((a, b) => b.id - a.id);
            resolve(recordings);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function updateRecordingText(id, text) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const recording = getRequest.result;
            if (recording) {
                recording.text = text;
                store.put(recording);
            }
        };
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteRecording(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
