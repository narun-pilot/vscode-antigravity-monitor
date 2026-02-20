
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
// @ts-ignore
const initSqlJs = require('sql.js');

export async function getUserEmailFromDB(): Promise<string | null> {
    try {
        const homeDir = os.homedir();
        // Candidate paths for VS Code / Antigravity global state DB
        // Prioritize Antigravity as requested by user
        const candidatePaths = [
            path.join(homeDir, 'Library/Application Support/Antigravity/User/globalStorage/state.vscdb'),
            path.join(homeDir, 'Library/Application Support/Code/User/globalStorage/state.vscdb'),
            path.join(homeDir, 'Library/Application Support/Code - Insiders/User/globalStorage/state.vscdb'),
            path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb'),
            // Windows
            path.join(homeDir, 'AppData/Roaming/Antigravity/User/globalStorage/state.vscdb'),
            path.join(homeDir, 'AppData/Roaming/Code/User/globalStorage/state.vscdb'),
            // Linux
            path.join(homeDir, '.config/antigravity/User/globalStorage/state.vscdb'),
            path.join(homeDir, '.config/Code/User/globalStorage/state.vscdb'),
        ];

        let dbPath = '';
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                dbPath = p;
                break;
            }
        }

        if (!dbPath) {
            console.log('Antigravity Monitor: Could not find state.vscdb');
            return null;
        }

        console.log(`Antigravity Monitor: Reading DB from ${dbPath}`);
        
        // Initialize sql.js
        const SQL = await initSqlJs();
        
        // Read DB file
        const filebuffer = fs.readFileSync(dbPath);
        
        // Load the db
        const db = new SQL.Database(filebuffer);
        
        // Query for keys. User saw 'thStatus' in the file.
        // We'll search for typical auth keys and the one observed by user.
        
        // Check tables first
        try {
            /*
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            if (tables.length > 0 && tables[0].values) {
                console.log('Antigravity Monitor: Tables in DB:', tables[0].values.flat());
            }
            */

            // Search for specific known keys AND keys ending in thStatus that might contain the email
            const stmt = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%thStatus' OR key IN ('antigravityUnifiedStateSync.oauthToken', 'jetskiStateSync.agentManagerInitState')");
            // stmt.bind(keysToCheck); // Not binding for this broad search
            
            let foundEmail: string | null = null;

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const key = row.key as string;
                const value = row.value as string;
                
                // Debug log
                // console.log(`Antigravity Monitor: Found key: ${key}`);
                
                if (value) {
                    try {
                        const parsed = JSON.parse(value);
                        // console.log(`Antigravity Monitor: Parsed value for ${key}:`, JSON.stringify(parsed, null, 2).slice(0, 200) + '...');

                        // Case 1: antigravityUnifiedStateSync.oauthToken
                        if (key === 'antigravityUnifiedStateSync.oauthToken') {
                             // Logic to extract email from oauth token structure
                             // Often it has 'email' or 'user' field
                             if (parsed.email) foundEmail = parsed.email;
                             else if (parsed.user && parsed.user.email) foundEmail = parsed.user.email;
                             else if (parsed.accessToken) {
                                // Sometimes access token is JWT, maybe decode it? 
                                // Or look for other fields like 'account'
                                if (parsed.account && parsed.account.label) foundEmail = parsed.account.label;
                             }
                             // Log if found
                             if (foundEmail) console.log(`Antigravity Monitor: Found email in ${key}: ${foundEmail}`);
                        }
                        // Case 2: jetskiStateSync.agentManagerInitState
                        else if (key === 'jetskiStateSync.agentManagerInitState') {
                            if (parsed.user && parsed.user.email) foundEmail = parsed.user.email;
                            else if (parsed.email) foundEmail = parsed.email;
                            // Log if found
                            if (foundEmail) console.log(`Antigravity Monitor: Found email in ${key}: ${foundEmail}`);
                        }
                        // Case 3: Keys ending in 'thStatus' (e.g. observed by user)
                        if (key.endsWith('thStatus')) {
                            if (parsed.email) foundEmail = parsed.email;
                            if (foundEmail) console.log(`Antigravity Monitor: Found email in ${key}: ${foundEmail}`);
                        }
                    } catch (e) {
                         // Some values might not be JSON, ignore errors
                        // console.log(`Antigravity Monitor: Error parsing JSON for key ${key}`, e);
                    }
                }
                if (foundEmail) break;
            }
            if (stmt) stmt.free();
            db.close();

            return foundEmail;

        } catch (e) {
            console.log('Antigravity Monitor: Error querying ItemTable', e);
            db.close();
            return null;
        }

    } catch (err: any) {
        console.error('Antigravity Monitor: DB read error:', err.message);
        return null;
    }
}
