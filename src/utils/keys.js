import { readFileSync } from 'fs';

let keys = {};
try {
    const data = readFileSync('./keys.json', 'utf8');
    keys = JSON.parse(data);
} catch (err) {
    console.warn('keys.json not found. Defaulting to environment variables.'); // still works with local models
}

export function getKey(name) {
    let key = keys[name];
    if (!key) {
        key = process.env[name];
    }
    // Return a dummy key instead of throwing an error if it's missing,
    // to allow offline bots to run in manual_only mode without needing an API key.
    if (!key) {
        console.warn(`API key "${name}" not found. Returning a mock key for manual_only mode.`);
        return "mock-key-for-manual-mode";
    }
    return key;
}

export function hasKey(name) {
    return keys[name] || process.env[name];
}
